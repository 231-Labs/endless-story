/**
 * Character Agent — WANT GENESIS: derive a character's initial wants from who
 * they are (persona + secret + canon), once at induction. Resistance is derived
 * from world facts (taboo/livelihood/station), never a free knob (§2.42–2.43).
 * Pure LLM; the caller validates, clamps and persists.
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { extractJsonLoose, wasTruncated } from '../../infra/json-loose.ts';
import { parseGenesisWants, type GenesisWant } from './want-genesis-parse.ts';

// 形狀與解析住在 node-clean 的葉 `want-genesis-parse.ts`（見該檔檔頭）；
// 這裡原樣再匯出，套件外緣不變。
export * from './want-genesis-parse.ts';

export interface DeriveWantsInput {
    name: string;
    role: string;
    gender?: string;
    ageYears?: number;
    /** Public persona / bio. */
    description: string;
    /** Private secret (never shown to others; wants may grow from it). */
    secret?: string;
    /** Saga premise for context (world facts that set resistance). */
    sagaPremise?: string;
    /** Other cast names, so targets resolve to real people. */
    castNames?: string[];
    /** 檯面上的爭奪 — the saga's contested stakes. A want that IS the pursuit of
     *  one carries its exact label; whether this person aches for any is judged
     *  here from the persona, once (single demand source, G1). */
    contestedResources?: Array<{ label: string; statement?: string }>;
}

export function buildSystemPrompt(): string {
    return [
        '你是「角色內心的建檔師」。給你一個戲園角色的公開人設與私密心事,你要替 TA 寫下',
        '此刻心裡真正掛著的幾件事(wants)——這些會成為 TA 往後每一天行動的內在驅力。',
        '',
        '**鐵則**:',
        '1. **從這個人身上長出來**,不是你替劇情安排。每條 want 用 TA 自己的口吻寫(≤30字),',
        '   讀起來像 TA 心裡的話,不是任務清單。',
        '2. **3 到 5 條,層次要雜**:感情、志向、班務、身體、日常都可以;**至少一條與事業無關**',
        '   (人不會只為一件事活;全是搶位子的人是工具人不是人)。',
        '   **暗處的也算數**:妒意、舊帳、虧欠、不敢問出口的疑心(「她跟那人那些年到底怎樣」),',
        '   若人設或私密心事裡有這樣的舊人舊事,就該有一條 want 掛在那裡——見不得光的渴望',
        '   也是渴望,層可寫「愛/妒」「虧欠」之類;沒有這種底色的人別硬加。',
        '3. **resistance(1-10)從事實推導,不是隨手填**:這件事說破/做成的門檻有多高?',
        '   禁忌之情、飯碗攸關、身分懸殊=高(7-9);日常小願=低(2-3)。`why` 一句寫清是哪些',
        '   事實撐起這個數。',
        '4. `weight`(0-1)=這件事佔 TA 多少心;`sat`(0-1)=此刻已滿足多少(多數 0.2-0.4)。',
        '5. `target` 只在 want 指向具體某人時填,且必須是名冊裡的名字。',
        '6. **不要替 TA 決定結局**:want 是渴望不是計畫,別寫成「將要如何如何」。',
        '7. 若題目附「檯面上的爭奪」清單:當某條 want 就是在爭那個東西時,加 `resource` 填**清單原文**。',
        '   **爭=想把它本人拿到手**。只是關心它、報導它、看熱鬧、或自家別處的同名事物',
        '   (歌廳的頭牌≠戲班的頭牌名額)都**不算**;圈外人、志不在此者一律不標。多數 want 沒有 resource。',
        '',
        '**輸出**:嚴格只輸出 JSON:',
        '`{"wants":[{"layer":"愛","desc":"…","target":"某某","weight":0.9,"sat":0.3,"resistance":8,"why":"…"}]}`',
        '不要 markdown、不要多餘文字。',
    ].join('\n');
}

export function buildUserPrompt(input: DeriveWantsInput): string {
    const cast = input.castNames?.length ? `\n## 班中名冊\n${input.castNames.join('、')}` : '';
    const secret = input.secret ? `\n## TA 的私密心事(外人不知)\n${input.secret}` : '';
    const premise = input.sagaPremise ? `\n## 這個班子\n${input.sagaPremise}` : '';
    const stakes = input.contestedResources?.length
        ? `\n## 檯面上的爭奪(resource 只能填這些原文)\n${input.contestedResources
              .map((r) => `- ${r.label}${r.statement ? `（${r.statement}）` : ''}`)
              .join('\n')}`
        : '';
    return [
        `# 這個人`,
        `- ${input.name}（${input.role}${input.gender ? '·' + input.gender : ''}${input.ageYears ? '·' + input.ageYears + '歲' : ''}）`,
        `- 行當聲口:${roleHint(input.role)}`,
        `- 人設:${input.description}`,
        secret,
        premise,
        cast,
        stakes,
        '',
        `寫下 ${input.name} 此刻心裡掛著的 3-5 件事。`,
    ].join('\n');
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Derive genesis wants for one character. Returns [] on any failure (caller
 * may retry next tick; a character without wants simply idles).
 *
 * 空手不是合法答案：題目就寫著 3-5 件，一件都沒有必然是解析或回話出事。
 * 這裡一定喊出聲——沒有心事的角色無事可做，滿場 `action noop`，世界靜止，
 * 而呼叫端只看得見一個空陣列（實錄：12 個角色 0 genesis、liveWants 0）。
 */
export async function deriveGenesisWants(input: DeriveWantsInput): Promise<GenesisWant[]> {
    try {
        // **primary，不要改成 cheap。** 這一步看起來像結構化填表（layer/desc/target/
        // weight…），很容易被當成便宜檔的活兒，2026-08-10 試過，實測退回：
        // 同一題各跑三次，cheap（GLM-4.7-FlashX）穩定地
        //   ① 憑空編事實 —— 「去留自便」的信、『春桃』這齣戲、被罷黜的老師傅，輸入裡都沒有；
        //   ② 弄錯身分 —— 兩次把戲班花旦寫成接「恩客」的人；
        //   ③ 違反鐵則 5 —— target 填 `報上照片`、`頭牌名額` 這種不在名冊裡的東西。
        // primary（glm-5.1）同一題全數守規矩、一律第一人稱、字數也守。
        // genesis 是整卷的地基，錯的心事會污染之後每一拍，省那幾秒不划算。
        // 開卷太慢的解法在呼叫端（tick.ts 的 genesis 併發取材），不是降檔。
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system: buildSystemPrompt(),
            messages: [{ role: 'user', content: buildUserPrompt(input) }],
            // 3-5 件心事，每件都要 layer/desc/target/resource/weight/sat/resistance
            // ＋一句 why；中文一字常吃一到兩個 token，700 幾乎必然剪在第三、四件
            // 中途。寬到五件連 why 都寫得完為止（一角一生只跑一次，貴得起）。
            maxTokens: 1600,
            temperature: 0.7,
        });
        const wants = parseGenesisWants(
            res.text,
            input.castNames,
            input.contestedResources?.map((r) => r.label),
            input.name,
        );
        if (wants.length === 0) {
            // 附上回話開頭：冷讀時要一眼分得出「模型交白卷」「不是 JSON」「配額打回」。
            console.warn(
                `[want-genesis] ${input.name} 一件心事都沒長出來（回話開頭：${res.text.slice(0, 120).replace(/\s+/g, ' ')}）`,
            );
        }
        return wants;
    } catch (err) {
        console.warn('[want-genesis] derive failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

export interface AffinityInput {
    name: string;
    role: string;
    description: string;
    /** The character's live wants, in display order (ties come back by index). */
    wants: Array<{ layer: string; desc: string }>;
    contestedResources: Array<{ label: string; statement?: string }>;
}

/**
 * One-time affinity pass for a cast whose wants pre-date the stake list: which
 * of TA's existing wants IS the pursuit of a contested stake? Index-based ties,
 * exact labels, empty result is a valid answer (a patron aches for none).
 */
export async function assessResourceAffinity(input: AffinityInput): Promise<Map<number, string>> {
    const ties = new Map<number, string>();
    if (input.wants.length === 0 || input.contestedResources.length === 0) return ties;
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '判斷一個角色心裡掛著的事,哪些**就是**在爭檯面上的某個東西。\n' +
                '鐵則:①**爭=想把它本人拿到手**。只是關心它、報導它、看熱鬧、或自家別處的同名事物\n' +
                '(歌廳的頭牌≠戲班的頭牌名額)都不算;圈外人、志不在此者一律不算;\n' +
                '②resource 必須抄清單**原文**;③多數心事跟爭奪無關,空結果完全合法。\n' +
                '輸出 JSON:{"ties":[{"want":1,"resource":"…"}]}(want=心事編號)。不要 markdown。',
            messages: [
                {
                    role: 'user',
                    content:
                        `# 這個人\n${input.name}（${input.role}）:${input.description.slice(0, 200)}\n\n` +
                        `# TA 心裡掛著的事\n${input.wants.map((w, i) => `${i + 1}. [${w.layer}] ${w.desc}`).join('\n')}\n\n` +
                        `# 檯面上的爭奪\n${input.contestedResources
                            .map((r) => `- ${r.label}${r.statement ? `（${r.statement}）` : ''}`)
                            .join('\n')}`,
                },
            ],
            // 只回索引＋抄回的清單原文，沒有一句散文；300 綽綽有餘，不必放寬。
            maxTokens: 300,
            temperature: 0.2,
        });
        const obj = extractJsonLoose(res.text);
        if (wasTruncated(obj)) {
            console.warn(`[want-genesis] 回話被剪斷，已撿回可用的部分（${input.name} 的爭奪歸屬）`);
        }
        const arr = Array.isArray(obj?.ties) ? (obj!.ties as unknown[]) : [];
        const labels = new Set(input.contestedResources.map((r) => r.label));
        for (const item of arr) {
            const e = item as Record<string, unknown>;
            const idx = typeof e.want === 'number' ? Math.floor(e.want) - 1 : -1;
            const label = s(e.resource);
            if (idx >= 0 && idx < input.wants.length && labels.has(label)) ties.set(idx, label);
        }
        return ties;
    } catch (err) {
        console.warn('[want-genesis] affinity failed:', err instanceof Error ? err.message : err);
        return ties;
    }
}

export interface AftermathInput {
    name: string;
    persona: string;
    /** The want that just resolved, and how. */
    resolvedDesc: string;
    resolvedNote?: string;
    /** The scene beats that resolved it. */
    beats: string[];
}

/** §2.31/§2.32: a resolution opens a NEW central question grown from the answer —
 *  fed with the character + what actually happened, so aftermath never drifts into
 *  stock plots. Returns null when nothing genuine grows. */
export async function deriveAftermathWant(input: AftermathInput): Promise<GenesisWant | null> {
    try {
        const client = llmText.createTextClient({ kind: 'primary' });
        const res = await client.chat({
            model: client.defaultModel,
            system:
                '一件懸了很久的心事剛被當事人自己了結了。判斷這個「答案」會不會在 TA 心裡長出' +
                '**一件新的心事**（answered 不是 ended：了結會重塑生活，新的問題從答案裡長出來）。\n' +
                '鐵則：①新心事必須從「這個人＋剛發生的事」長出來，禁止嫁接套路（密函、舊帳、黑市、尋仇）；' +
                '②用 TA 的口吻寫（≤30字）；③若這個答案就是乾淨的收束、沒長出新東西，回 {"wants":[]}。\n' +
                '輸出 JSON：{"wants":[{"layer":"…","desc":"…","weight":0.7,"sat":0.2,"resistance":5,"why":"…"}]}（至多一條）。不要 markdown。',
            messages: [
                {
                    role: 'user',
                    content:
                        `# 這個人\n${input.name}：${input.persona}\n\n# 剛了結的心事\n「${input.resolvedDesc}」` +
                        (input.resolvedNote ? `\n了結方式：${input.resolvedNote}` : '') +
                        `\n\n# 那場戲\n${input.beats.join('\n')}`,
                },
            ],
            // 至多一條，但那條照樣要 layer/desc/weight/sat/resistance ＋一句 why；
            // 300 剛好卡在 why 上（撿得回來，但每次都撿等於每次都少一半）。
            maxTokens: 600,
            temperature: 0.8,
        });
        // 這裡空手是合法答案（乾淨收束就不該硬長新心事），所以不喊；
        // 只有截斷會由 parseGenesisWants 自己喊。
        const wants = parseGenesisWants(res.text, undefined, undefined, input.name);
        return wants[0] ?? null;
    } catch (err) {
        console.warn('[want-genesis] aftermath failed:', err instanceof Error ? err.message : err);
        return null;
    }
}
