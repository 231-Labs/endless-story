/**
 * Batch founding induction (mode B) — weave a WHOLE founding cast in one pass.
 *
 * Unlike per-character induction (runOnce), this sees every founding member at
 * once and writes, in a single LLM call:
 *   · each member's own self memories, and
 *   · the full pairwise relationship web (undirected, prior by default), with a
 *     shared founding scene written ONCE as a symmetric dual memory instead of
 *     each member independently inventing their own (mismatched) version.
 *
 * Why this matters: per-character genesis can't coordinate across people, so two
 * founders may each invent the same scene with reversed roles. Seeing the whole
 * ensemble lets the model anchor shared history on a single, agreed event.
 *
 * Pure generation. The CALLER persists self memories into each MemWal and seeds
 * the symmetric director ties on chain (same web/runtime split as runOnce).
 */

import { text as llmText } from '@endless-story/llm';
import { roleHint } from '@endless-story/shared';
import { RELATIONSHIP_TONES, type RelationshipToneValue } from '../relationship-assess/prompt.js';

export interface FoundingMember {
    id: string;
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    /** Public description (primary basis for the persona). */
    description: string;
    /** Private secret — feeds this member's self memories only, never another's. */
    secret?: string;
    /** Self-memory count. Omit → derived from age. */
    count?: number;
}

export interface BatchSelfResult {
    id: string;
    selfMemories: string[];
}

export interface BatchTie {
    aId: string;
    bId: string;
    tone: RelationshipToneValue;
    /** true = pre-acquainted (prior); false = first meeting (first_impression). */
    priorPast: boolean;
    /** First-person memory from A's POV. */
    aMemory: string;
    /** First-person memory from B's POV (symmetric — same event/relationship). */
    bMemory: string;
    importance: number;
}

export interface RunBatchInput {
    members: FoundingMember[];
    saga?: { name?: string; premise?: string; nature?: string; rhythm?: string };
    model?: string;
}

export interface RunBatchResult {
    self: BatchSelfResult[];
    ties: BatchTie[];
}

const TONE_ZH: Record<RelationshipToneValue, string> = {
    affection: '親近',
    romance: '戀慕',
    mentorship: '師徒',
    rivalry: '競爭',
    wary: '戒備',
    tension: '緊張',
    estrangement: '隔閡',
    acquaintance: '故舊',
    neutral: '平淡',
};

function normalizeGenderLabel(raw: string): string {
    const value = raw.trim().toLowerCase();
    if (value === 'female' || raw.includes('女')) return '女';
    if (value === 'male' || raw.includes('男')) return '男';
    if (value === 'neutral' || value === 'other' || raw.includes('中性')) return '中性';
    return raw.trim() || '中性';
}

/** Self-memory count from age (8–11); same tightened curve as runOnce — keeps a
 *  small age signal without the old 8–14 spread that read as uneven seeding. */
function deriveCount(ageYears: number): number {
    if (!Number.isFinite(ageYears) || ageYears <= 0) return 9;
    return Math.min(11, Math.max(8, Math.round(ageYears / 4)));
}

export async function runBatchFounding(input: RunBatchInput): Promise<RunBatchResult> {
    const members = input.members.filter((m) => m.id && m.name);
    if (members.length === 0) return { self: [], ties: [] };

    const llm = llmText.createTextClient({ kind: 'primary' });
    const modelId = input.model ?? llm.defaultModel;
    const system = buildBatchSystemPrompt();
    const user = buildBatchUserPrompt(members, input.saga);
    const maxTokens = Math.min(16000, 1800 + members.length * 1400);

    // A parse miss here used to SILENTLY drop EVERY character's genesis/self memories
    // (the founding "succeeds" with no 此生記憶, so LIFE_QUERY recall is empty and POV
    // reads thin). That was the live symptom on a flaky provider (truncated/invalid JSON).
    // Retry once on an empty parse, and LOG it so a real failure is visible, not silent.
    for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await llm.chat({ model: modelId, system, messages: [{ role: 'user', content: user }], maxTokens, temperature: 0.95 });
        const parsed = parseBatch(response.text, members);
        const gotMemories = parsed.self.some((s) => s.selfMemories.length > 0);
        if (gotMemories || attempt === 2) {
            if (!gotMemories) {
                console.warn(
                    `[induction] runBatchFounding produced NO self-memories after ${attempt} attempt(s) ` +
                        `(${members.length} members, model=${modelId}) — genesis memories will be empty. ` +
                        `First 200 chars of last response: ${response.text.slice(0, 200)}`,
                );
            }
            return parsed;
        }
        console.warn(`[induction] runBatchFounding attempt ${attempt} parsed 0 self-memories — retrying once…`);
    }
    return { self: [], ties: [] };
}

export function buildBatchSystemPrompt(): string {
    const toneList = RELATIONSHIP_TONES.map((t) => `${TONE_ZH[t]}(${t})`).join('、');
    return [
        '你是一個 saga 的「創世編劇」。一批角色要被一起立進這個戲班 —— 他們是**一同把這個班子撐起來的人**,',
        '彼此早已相識。你要一次看著整個班底,寫好兩件事:(A) 每個人的自身記憶;(B) 他們**彼此之間**的關係。',
        '同一顆腦袋看著整個合奏寫,才能讓共同的過往對得上、關係網彼此自洽。',
        '',
        '═══ (A) 每個人的自身記憶 selfMemories ═══',
        '這是該角色的長期記憶基底,日後言行都從這裡長出來,必須**像一個真實的人活過的痕跡**,非宣傳冊。',
        '  · **時間縱深**:橫跨一生、依年齡分配 —— 童年(家世/故鄉/父母)、少年入行(怎麼走上這行/啟蒙/初次登台或挫敗)、',
        '    近年(當下牽掛/慾望/未癒的傷)。年紀越大近年層次越多。',
        '  · **真有其事**:每條釘住可考的錨點(地名/年份節氣/具體物事/數字/人名),像真被記下來的事。',
        '  · **年齡一致**:所有記憶吻合該角色現在的歲數;童年以「如今回望」口吻記起。',
        '  · **身份不可漂移**:每個人的性別、年齡、行當必須嚴格跟名冊一致。女小生/坤生/女武生是「女性演員扮小生或武生」,',
        '    生命經驗仍是女性;不可因小生、公子、男裝就把她寫成男性,也不可把任何人的性別改掉。',
        '  · 第一人稱、有畫面有感官有情緒;每條約 40–110 字;民初戲園時代語感,避免現代詞與翻譯腔。',
        '  · **因果連貫**:家世與入行途徑要接得起來 —— 若寫了疼愛的家庭,入行就需有合理變故橋接(家道中落/天災/喪親),',
        '    不可無故「被賣」。',
        '  · **心底秘密是根**:若該角色有「心底秘密」,讓 2–3 條記憶從它長出來、隱微、有牽掛、有刺,但不必黑暗;',
        '    **某人的秘密只能進該角色自己的 selfMemories,絕不可寫進別人的記憶、也不可寫進 ties。**',
        '  · **秘密調性邊界**:優先寫藝術、名聲、契約、分成、身體限制、感情不敢說、怕被取代、欠人情、舊班名聲等正常壓力;',
        '    不要自動加仇家追殺、黑幫、重傷垂死、殺人、血債、性暴力、被賣、綁架、復仇等狗血黑暗橋段,除非輸入明寫。',
        '  · **反模板 · 爛梗黑名單**:嚴禁千人一面,尤其避免這些被用爛的橋段 ——',
        '    「X 歲被賣進科班/戲班」「初次登台腿肚子直轉筋」「《樓台會》當開蒙戲」「卸妝對鏡看見細紋」',
        '    「被師父拿戒尺/煙桿打手心」。每個人的童年、入行、創傷都要獨一無二。',
        '',
        '═══ (B) 彼此的關係 ties ═══',
        '這批人是創世班底 —— **預設彼此早已相識**(至少同班共事的故舊),關係 kind 多為 `prior`。',
        '描述若明示更深的共同過往(同科班、舊情、師承、血緣、舊仇)就寫深;只有當兩人實在不該認識時才用 `first_impression`。',
        '  · 為**每一對理應有關係**的人寫一條(無向:A↔B 只寫一條,不要 A→B 又 B→A)。寧缺勿濫,但創世班底彼此關係通常較密。',
        '  · **覆蓋要求**:每位成員至少要出現在 2 條 ties 裡(名冊僅兩人時至少 1 條)——同班撐起一個班子的人',
        '    不可能有人對所有同伴都毫無關係;關係最薄的人也至少有「同班共事的故舊」這層。',
        '  · **共同場景只寫一次**:兩人的共同往事,寫成這條 tie 的**雙向對稱記憶** ——',
        '    `aMemory`(A 視角)+`bMemory`(B 視角)指向**同一件事/同一個場景**,立場情緒不同但事實一致(誰給誰、誰先到、發生什麼,兩邊要對得上,不可矛盾)。',
        '    **不要**讓這段共同往事又各自出現在兩人的 selfMemories 裡(避免重複、避免兩版打架)。',
        '  · **點名**:aMemory 點 B 的姓名、bMemory 點 A 的姓名,不可通篇「他/她」。',
        `  · **tone** 從詞表擇一最貼切:${toneList}。「故舊(acquaintance)」=明顯認識很久但情感色彩未定。`,
        '  · 每段約 40–120 字,同樣時代語感。importance 1–10(越核心的關係越高)。',
        '',
        '**輸出格式**:嚴格只輸出一個 JSON 物件,不要 markdown、不要前言:',
        '`{"members":[{"id":"0x…","selfMemories":["…"]}],"ties":[{"aId":"0x…","bId":"0x…","tone":"acquaintance","kind":"prior","aMemory":"…","bMemory":"…","importance":8}]}`',
        'members 的 id 與 ties 的 aId/bId 必須**原樣**取自下方名冊(不可自創)。沒有合理關係的人不用硬連。',
    ].join('\n');
}

export function buildBatchUserPrompt(
    members: FoundingMember[],
    saga?: RunBatchInput['saga'],
): string {
    const sagaBlock = [
        saga?.name ? `# 戲班:${saga.name}` : '# 戲班',
        saga?.premise ? `## 前提\n${saga.premise}` : '',
        saga?.nature ? `## 事件氣質\n${saga.nature}` : '',
        saga?.rhythm ? `## 自然節律\n${saga.rhythm}` : '',
    ].filter(Boolean);

    const roster = members.map((m, i) => {
        const count = m.count ?? deriveCount(m.ageYears);
        const lines = [
            `### 成員 ${i + 1} — id=${m.id}`,
            `- 姓名:${m.name}`,
            `- 行當:${m.role || '—'}(聲口:${roleHint(m.role)})`,
            `- 性別:${normalizeGenderLabel(m.gender)} · 年齡:${m.ageYears} 歲`,
            `- 公開描述:${m.description || '（無）'}`,
            m.secret && m.secret.trim()
                ? `- 心底秘密（只 ${m.name} 自己知道,只長該角色自己的 selfMemories,絕不外洩、不寫進別人的記憶或 ties）:${m.secret.trim()}`
                : '',
            `- 要求:輸出 ${count} 條 selfMemories(童年/少年入行/近年橫跨一生)。`,
        ].filter(Boolean);
        return lines.join('\n');
    });

    return [
        ...sagaBlock,
        '',
        '# 創世班底名冊（彼此早已相識）',
        ...roster,
        '',
        '# 本次要求',
        '(A) 為**每一位**成員輸出其 selfMemories(條數見各自要求)。',
        '    性別/行當照名冊硬守:女小生/坤生/女武生仍是女性;秘密可有刺,但不要自動寫成追殺、血債、重傷垂死。',
        '(B) 判斷成員兩兩之間理應有的關係,以 prior 為主,**共同場景只寫進 ties 一次(雙向對稱)**,不要在 selfMemories 重複。',
        '只輸出 JSON 物件。',
    ].join('\n');
}

const TONE_SET = new Set<string>(RELATIONSHIP_TONES);

function parseBatch(raw: string, members: FoundingMember[]): RunBatchResult {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { self: [], ties: [] };
    let obj: { members?: unknown; ties?: unknown };
    try {
        obj = JSON.parse(match[0]);
    } catch {
        return { self: [], ties: [] };
    }

    const idSet = new Set(members.map((m) => m.id));
    const countById = new Map(members.map((m) => [m.id, m.count ?? deriveCount(m.ageYears)]));

    const self: BatchSelfResult[] = [];
    if (Array.isArray(obj.members)) {
        for (const raw of obj.members) {
            if (!raw || typeof raw !== 'object') continue;
            const m = raw as Record<string, unknown>;
            const id = typeof m.id === 'string' ? m.id.trim() : '';
            if (!idSet.has(id)) continue;
            const cap = countById.get(id) ?? 12;
            const mems = Array.isArray(m.selfMemories)
                ? m.selfMemories
                      .filter((x): x is string => typeof x === 'string')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, cap)
                : [];
            self.push({ id, selfMemories: mems });
        }
    }

    const ties: BatchTie[] = [];
    const seenPair = new Set<string>();
    if (Array.isArray(obj.ties)) {
        for (const raw of obj.ties) {
            if (!raw || typeof raw !== 'object') continue;
            const t = raw as Record<string, unknown>;
            const aId = typeof t.aId === 'string' ? t.aId.trim() : '';
            const bId = typeof t.bId === 'string' ? t.bId.trim() : '';
            if (!idSet.has(aId) || !idSet.has(bId) || aId === bId) continue;
            const key = aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
            if (seenPair.has(key)) continue;
            const aMemory = typeof t.aMemory === 'string' ? t.aMemory.trim() : '';
            const bMemory = typeof t.bMemory === 'string' ? t.bMemory.trim() : '';
            if (!aMemory || !bMemory) continue;
            const tone =
                typeof t.tone === 'string' && TONE_SET.has(t.tone)
                    ? (t.tone as RelationshipToneValue)
                    : 'acquaintance';
            const impRaw = Number(t.importance);
            const importance = Number.isFinite(impRaw) ? Math.max(1, Math.min(10, Math.round(impRaw))) : 7;
            ties.push({
                aId,
                bId,
                tone,
                priorPast: t.kind !== 'first_impression',
                aMemory,
                bMemory,
                importance,
            });
            seenPair.add(key);
        }
    }

    return { self, ties };
}
