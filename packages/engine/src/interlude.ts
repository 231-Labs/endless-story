/**
 * 折子 (interlude) —— 拍與拍之間，由外來刺激喚起的單角色有界演繹。
 *
 * 大拍（正戲）是晝夜基礎律：全員場景、weave、POV、判官，一日六拍照常開鑼。
 * 折子是幕間小戲：一兩個角色、受限動詞集（聽見／回話／記一筆心事），落款在真實
 * 毫秒時戳上，**不動 currentTick**——鏈上心跳仍是曆法的自述，折子是拍與拍之間的事。
 * 見 docs/narrative/AGENT_WAKE_LAYER.md。
 *
 * 這個模組是機制本體：零鏈、零 LLM 判斷、`now` 全由呼叫端傳入（本檔絕不取牆鐘），
 * 所以 lab 的「錄時重播」讀錄下的 realMs 就能重現同一次折子，確定性不破。
 *
 * 兩道成本閘門，兩者都**只延後、不丟棄**：
 *   · debounce —— 同一人窗內的捎話合併成一次折子（讀者連戳十下 = 一次演繹聽見十句）。
 *   · 預算 —— 每人每日上限；超出者留在佇列，退化為下一個大拍聽見（即今日行為）。
 * 由此得到關鍵的優雅退化性質：**預算設 0 ≡ 完全等於現制**，關掉即回到六拍世界。
 */

import type { InterludeInput, InterludeStimulus, PartOfDay, RecallPort, SceneAgentPort } from './ports.ts';
import type { WorldState } from './world-state.ts';

/** 合併窗預設一分鐘：戳完到聽見的體感是「幾十秒」，不是「幾秒」也不是「下一拍」。 */
export const DEFAULT_INTERLUDE_DEBOUNCE_MS = 60_000;
/** 每人每日折子預設上限（設計建議 4–6）。0 = 關閉喚醒層。 */
export const DEFAULT_INTERLUDE_DAILY_BUDGET = 6;

/** percept 摘要的節制長度——大拍只是「聽說」幕間，不該被幕間的原文淹掉。 */
const STIMULUS_CLIP = 24;
const RESPONSE_CLIP = 40;
const PERCEPT_CLIP = 240;

/** 一次演過的折子。落款 day/partOfDay/tick 取自**演繹當下**的 `w.clock`
 *  （與大拍同構），realMs 是它在真實時間裡的位置——重播的唯一憑據。 */
export interface InterludeRecord {
    id: string;
    characterId: string;
    name: string;
    /** 這一次折子合併聽見的全部捎話。 */
    stimuli: InterludeStimulus[];
    response: string;
    memoryNote?: string;
    realMs: number;
    day: number;
    partOfDay: PartOfDay;
    tick: number;
}

export interface InterludeOpts {
    /** 此刻的真實毫秒。呼叫端給，本模組不取牆鐘。 */
    nowMs: number;
    /** 合併窗（預設 60s）：**最老**的一則刺激滿齡，這一組才算 due。 */
    debounceMs?: number;
    /** 每人每日折子上限（預設 6）。 */
    dailyBudget?: number;
    /** mirror 世界的日期標籤（民國十五年八月五日）；tick 世界不給。 */
    dateLabel?: string;
    /** 行當節律「此刻本該在哪」——零 LLM 推得的存在形狀，有則附給座席。 */
    activityHint?: (characterId: string) => string | undefined;
}

/**
 * 巡一次佇列，把 due 的捎話演成折子。
 *
 * 留下的比演掉的更要緊：未滿齡、超預算、座席缺席、座席沒答上、演繹拋錯——五種
 * 情形一律**原封留在佇列**，等下一次巡或下一個大拍。成局的那一組才移出佇列。
 */
export async function runInterludes(
    world: WorldState,
    deps: { agent: SceneAgentPort; recall: RecallPort },
    opts: InterludeOpts,
): Promise<InterludeRecord[]> {
    const w = world.data;
    const queue = w.pendingStimuli;
    if (!queue?.length) return [];
    const { agent, recall } = deps;
    // 座席缺席（未實作 interlude 的 adapter）⇒ 一律不消化：喚醒層是純增量，
    // 沒有座席的世界就該原封回到六拍。
    if (!agent.interlude) return [];

    const debounceMs = opts.debounceMs ?? DEFAULT_INTERLUDE_DEBOUNCE_MS;
    const dailyBudget = opts.dailyBudget ?? DEFAULT_INTERLUDE_DAILY_BUDGET;
    // 落款與預算都鍵在**演繹當下**的世界鐘（day/時辰與大拍同構），不是事後那一拍的。
    const clock = w.clock;
    const played: InterludeRecord[] = [];
    const consumed = new Set<string>();

    // 按角色分組，組內保留佇列原序（先來的話先被聽見）。
    const byChar = new Map<string, InterludeStimulus[]>();
    for (const stimulus of queue) {
        const group = byChar.get(stimulus.characterId);
        if (group) group.push(stimulus);
        else byChar.set(stimulus.characterId, [stimulus]);
    }

    for (const [characterId, stimuli] of byChar) {
        const member = world.castById(characterId);
        if (!member) continue; // 查無此人：留在佇列，由拍首的 drain 一併清出
        const oldestMs = stimuli.reduce((oldest, s) => Math.min(oldest, s.atRealMs), Infinity);
        if (opts.nowMs - oldestMs < debounceMs) continue; // 未滿齡：讓後續的話併進來
        const entry = w.interludeLedger?.[characterId];
        const spent = entry && entry.day === clock.day ? entry.count : 0; // day 一變即歸零
        if (spent >= dailyBudget) continue; // 超預算：留給下一個大拍

        const activityHint = opts.activityHint?.(characterId);
        let reply;
        try {
            const input: InterludeInput = {
                characterId,
                name: member.name,
                stimuli: [...stimuli],
                clock,
                sagaId: w.sagaId,
                persona: member.persona,
                ...(opts.dateLabel ? { dateLabel: opts.dateLabel } : {}),
                ...(activityHint ? { activityHint } : {}),
            };
            reply = await agent.interlude(input);
        } catch {
            continue; // 座席失手不是刺激的錯：這一組原封留著
        }
        const response = reply?.response.trim();
        if (!response) continue; // 沒答上：同樣留給大拍

        (w.interludeLedger ??= {})[characterId] = { day: clock.day, count: spent + 1 };
        for (const stimulus of stimuli) consumed.add(stimulus.id);
        const memoryNote = reply?.memoryNote?.trim();
        const record: InterludeRecord = {
            // 折子的落款 id（設計稿 §三）：日、時辰序、真實毫秒，再綴角色——
            // 同一毫秒兩個人各自被戳也不會撞號。確定性，重播可復現。
            id: `${w.sagaId}:d${clock.day}:b${clock.tickOfDay}:w${opts.nowMs}:${characterId}`,
            characterId,
            name: member.name,
            stimuli: [...stimuli],
            response,
            ...(memoryNote ? { memoryNote } : {}),
            realMs: opts.nowMs,
            day: clock.day,
            partOfDay: clock.partOfDay,
            tick: clock.currentTick,
        };
        // 心事入長期記憶（折子與大拍歸於同一筆日終反思，見設計稿 §七）。
        if (memoryNote) {
            await recall.remember(characterId, memoryNote, { kind: 'reflection', importance: 6, day: clock.day });
        }
        (w.interludesSinceLastTick ??= []).push(record);
        played.push(record);
    }

    if (consumed.size) w.pendingStimuli = queue.filter((stimulus) => !consumed.has(stimulus.id));
    return played;
}

/**
 * 拍首匯入：把上一個大拍以來的幕間收成「每人一行」的世情 percept，並清空兩個佇列。
 *
 * 大拍**聽說**折子，不重演它——所以這裡產出的只是 percept（世情一行），不是導演
 * 指令。連同**滯留未答**的刺激（超預算或座席缺席而留下的）一併說給本人聽：捎話
 * 只會晚到，不會失蹤；預算設 0 時，這一行就退化成今日的「下一拍才聽見」。
 */
export function drainInterludePercepts(world: WorldState): Record<string, string> {
    const w = world.data;
    const records = w.interludesSinceLastTick ?? [];
    const stale = w.pendingStimuli ?? [];
    if (!records.length && !stale.length) return {};

    const answered = new Map<string, string[]>();
    const unanswered = new Map<string, string[]>();
    const push = (map: Map<string, string[]>, id: string, line: string) => {
        const lines = map.get(id);
        if (lines) lines.push(line);
        else map.set(id, [line]);
    };
    for (const record of records) {
        const said = record.stimuli.map((s) => `${voiceOf(s)}捎話「${clip(s.text, STIMULUS_CLIP)}」`).join('、');
        push(answered, record.characterId, `${said}，你答：「${clip(record.response, RESPONSE_CLIP)}」`);
    }
    for (const stimulus of stale) {
        push(unanswered, stimulus.characterId, `${voiceOf(stimulus)}道「${clip(stimulus.text, STIMULUS_CLIP)}」`);
    }

    const percepts: Record<string, string> = {};
    for (const id of new Set([...answered.keys(), ...unanswered.keys()])) {
        const parts: string[] = [];
        const said = answered.get(id);
        if (said?.length) parts.push(`幕間：${said.join('；')}。`);
        const missed = unanswered.get(id);
        if (missed?.length) parts.push(`幕間有人捎話你未及回：${missed.join('；')}。`);
        percepts[id] = clip(parts.join(''), PERCEPT_CLIP);
    }
    w.interludesSinceLastTick = [];
    w.pendingStimuli = [];
    return percepts;
}

/** 捎話的來路：留言是東家的話，戳世界是街面上不知哪來的一句。 */
function voiceOf(stimulus: InterludeStimulus): string {
    return stimulus.kind === 'note' ? '東家' : '外頭有人';
}

function clip(text: string, limit: number): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}
