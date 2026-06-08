/**
 * Induction — prompt builder (merges genesis-memory + relationship-assess).
 *
 * Inducts a new character into the troupe in one shot: emits both their own self
 * memories (selfMemories) and their relationships to existing members (ties: tone
 * + symmetric dual memories + prior/first_impression). More coherent than the old
 * two passes (genesis self + assess relationships) — one mind, looking at the
 * whole troupe at once, arranging memories and ties together.
 *
 * `mode` sets the default relationship premise:
 *   · founding — creation-time cast that founded this world together; assume they
 *     already know each other (prior); write deeper when the description says so.
 *   · newcomer — a later arrival; assume strangers, write first_impression only;
 *     only write prior when the newcomer's own description names a prior tie.
 *
 * Public data only (description/role/scene/existing tone) + the character's own
 * private secret (which feeds self memories only).
 */

import { roleHint } from '@endless-story/shared';
import type { GenesisRosterEntry } from '../genesis-memory/prompt.js';
import { RELATIONSHIP_TONES, type RelationshipToneValue } from '../relationship-assess/prompt.js';

export type { GenesisRosterEntry };
export type InductionMode = 'founding' | 'newcomer';

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

/** Tone of an existing tie between two members (by name); gives the LLM the current relationship web as context. */
export interface ExistingTieHint {
    aName: string;
    bName: string;
    tone: string;
}

export interface InductionPromptInput {
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    physicalFacts: string;
    /** Public description (the primary basis for the persona). */
    description: string;
    /** Private secret — feeds self memories only; never leaked, never written into ties. Empty string = none. */
    privateBackstory?: string;
    recruitmentRoleIntent?: string;
    mode: InductionMode;
    /** Number of self memories. */
    count: number;
    /** Existing same-saga members (self already excluded). */
    roster: GenesisRosterEntry[];
    /** Existing public ties between members (so the newcomer fits the current web). */
    existingTies?: ExistingTieHint[];
    /** Saga flavour / rhythm / premise (public). */
    sagaPremise?: string;
    sagaNature?: string;
    sagaRhythm?: string;
}

export function buildSystemPrompt(mode: InductionMode): string {
    const toneList = RELATIONSHIP_TONES.map((t) => `${TONE_ZH[t]}(${t})`).join('、');
    const modeRule =
        mode === 'founding'
            ? [
                  '**本次模式：創世班底（founding）。** 這些人是一同把這個戲班立起來的人 —— 預設**彼此早已相識**',
                  '（至少同班共事的故舊交情）。描述若明示更深的共同過往（同科班、舊情、師承、血緣、舊仇）就寫深；',
                  '沒明示也可給「同班相識」這種淺舊識。關係 kind 多為 `prior`。',
              ]
            : [
                  '**本次模式：後加新人（newcomer）。** TA 是後來才進這個戲班的 —— 對既有成員**預設是陌生的**,',
                  '關係 kind 預設 `first_impression`（入班/此刻第一次照面的觀感）。**唯一例外**:新人自己的公開描述',
                  '**明確點名**了與名冊中某人的舊關係（如「師姐某某、自小同科班」「與某某是舊識」）→ 那一對才寫 `prior`。',
                  '不得替 newcomer 憑空捏造與既有成員的共同過去。',
              ];
    return [
        '你是一個 saga 的「入科編劇」。一個角色要被種進這個戲班 —— 你要一次寫好兩件事:',
        '(A) TA「此生至今」的自身記憶;(B) TA 與既有成員的關係。同一顆腦袋、看著整個戲班現況一次安排,',
        '讓記憶與關係彼此自洽、且鑲進現有的人與關係網,而非憑空。',
        '',
        '═══ (A) 自身記憶 selfMemories ═══',
        '這是 TA 的長期記憶基底,日後言行章回都從這裡長出來,必須**像一個真實的人活過的痕跡**,非宣傳冊。',
        '  · **時間縱深**:橫跨一生、依年齡分配 —— 童年(家世/故鄉/父母/幼時難忘事)、少年入行(怎麼走上這行/',
        '    啟蒙者/初次登台或挫敗)、近年(當下牽掛/慾望/關係/秘密/未癒的傷)。年紀越大近年層次越多。',
        '  · **反模板**:嚴禁千人一面;特別避免「被師父責打/罰站樁」當主旋律。有喜有悲有光有暗,讓這一個人獨一無二。',
        '  · **真有其事**:每條釘住可考的錨點(地名/年份節氣/具體物事/數字/人名),像真被記下來的事,非籠統感想。',
        `  · **年齡一致**:所有記憶吻合 TA 現在的歲數,最近一條落在接近當下;童年以「如今回望」的口吻記起。`,
        '  · 第一人稱、有畫面有感官有情緒;出現別人首次就點名;每條約 40–110 字;民初戲園時代語感,避免現代詞與翻譯腔。',
        '  · **心底秘密是記憶的根**:若提供「心底秘密」,要讓 2–3 條記憶從它長出來(初見/轉折/無法挽回的一刻…),',
        '    寫得隱微而痛、是 TA 從不對人說的;不整段複述、化進場景。**秘密絕不可寫進關係 ties、也不可外洩。**',
        '',
        '═══ (B) 關係 ties ═══',
        'TA 不是憑空誕生,而是「從人生的一半被拉進來」。只憑各人**公開描述**判斷 TA 與名冊中哪些人理應有關係,',
        '為每一對寫關係。注意現有的「成員間既有關係」,讓新關係鑲進這張網、別與之矛盾。',
        '  · 只在雙方描述有**實質文本依據**時才連(同鄉/同師門/舊情暗示/行當宿敵/名字互提/明顯互補對立…)。',
        '    沒依據不要硬連,寧缺勿濫:通常 0–4 條、最多 6 條;沒有合理對象就空陣列。',
        '  · **kind**:`prior`(故事前就認識,可寫共同過去)或 `first_impression`(此前不認識,初次照面觀感)。',
        ...modeRule,
        '  · **雙向對稱**:每對寫兩段第一人稱記憶 —— `selfMemory`(新角色視角)+`otherMemory`(對方視角),',
        '    指向同一段關係、彼此不矛盾;prior 記同一往事(立場情緒不同),first_impression 記同一次照面。',
        '  · **點名**:selfMemory 點對方姓名、otherMemory 點新角色姓名,不可通篇「他/她」。',
        `  · **tone** 從詞表擇一最貼切:${toneList}。「故舊(acquaintance)」=明顯認識很久但情感色彩未定。`,
        '  · 每段約 40–120 字,同樣的時代語感。',
        '',
        '**輸出格式**:嚴格只輸出一個 JSON 物件,不要 markdown、不要前言:',
        '`{"selfMemories":["…"],"ties":[{"otherId":"0x…","otherName":"某人","tone":"acquaintance","kind":"prior","selfMemory":"…","otherMemory":"…","importance":8}]}`',
        'selfMemories 為字串陣列;ties 的 otherId 必須**原樣**取自下方名冊(不可自創),最多 6 條,沒有就 `"ties":[]`。',
    ].join('\n');
}

export function buildUserPrompt(input: InductionPromptInput): string {
    const count = input.count;
    const age = input.ageYears;
    const childhood = age <= 16 ? Math.max(2, Math.ceil(count * 0.4)) : Math.max(1, Math.round(count * 0.3));
    const youth = Math.max(1, Math.round(count * 0.35));
    const recent = Math.max(1, count - childhood - youth);

    const rosterBlock =
        input.roster.length > 0
            ? input.roster.slice(0, 24).map((r) => {
                  const bits = [
                      `otherId=${r.id}`,
                      `姓名=${r.name}`,
                      `行當=${r.role || '—'}`,
                      r.gender ? `性別=${r.gender}` : '',
                      r.ageYears ? `年齡=${r.ageYears}` : '',
                      r.currentSceneName ? `所在=${r.currentSceneName}` : '',
                  ].filter(Boolean);
                  const brief = r.brief ? `；簡述=${r.brief.slice(0, 120)}` : '';
                  return `- ${bits.join(' / ')}${brief}`;
              })
            : ['（名冊為空 —— ties 直接輸出空陣列）'];

    const tiesBlock =
        input.existingTies && input.existingTies.length > 0
            ? [
                  '',
                  '## 成員間既有的公開關係(讓新關係鑲進這張網、勿矛盾)',
                  ...input.existingTies
                      .slice(0, 30)
                      .map((t) => `- ${t.aName} ─ ${t.bName}：${TONE_ZH[t.tone as RelationshipToneValue] ?? t.tone}`),
              ]
            : [];

    const sagaBlock = [
        input.sagaPremise ? `## 戲班前提\n${input.sagaPremise}` : '',
        input.sagaNature ? `## 事件氣質\n${input.sagaNature}` : '',
        input.sagaRhythm ? `## 自然節律\n${input.sagaRhythm}` : '',
    ].filter(Boolean);

    return [
        `# 角色設定`,
        `- 姓名：${input.name}`,
        `- 行當：${input.role}（聲口：${roleHint(input.role)}）`,
        `- 性別：${input.gender} · 年齡：${input.ageYears} 歲`,
        `- 外形：${input.physicalFacts}`,
        `- 所屬：${input.sagaName}`,
        '',
        `## 公開描述（最高人設依據；人生空白由你依性別/行當/外形/年齡/時代合理補完）`,
        input.description || '（無描述）',
        input.recruitmentRoleIntent ? `\n## 招募意圖（公開職缺語境）\n${input.recruitmentRoleIntent}` : '',
        input.privateBackstory && input.privateBackstory.trim()
            ? `\n## 心底秘密（只 ${input.name} 自己知道,對外絕不明說；只長自身記憶,不可寫進 ties）\n${input.privateBackstory.trim()}`
            : '',
        ...(sagaBlock.length ? ['', ...sagaBlock] : []),
        '',
        `## 同 saga 名冊（ties 只能連這些人；otherId 原樣引用）`,
        ...rosterBlock,
        ...tiesBlock,
        '',
        `## 本次要求`,
        `(A) 輸出 **${count}** 條 selfMemories,橫跨一生,建議:童年約 ${childhood}、少年入行約 ${youth}、近年約 ${recent}。`,
        input.privateBackstory && input.privateBackstory.trim()
            ? `   其中 2–3 條須從「心底秘密」長出來,隱微而痛、化進場景,不整段複述。`
            : '',
        `(B) 判斷「${input.name}」與名冊中哪些人理應有關係,依本次模式決定 prior/first_impression,雙向對稱、寧缺勿濫(最多 6)。`,
        `只輸出 JSON 物件。`,
    ]
        .filter((line) => line !== '')
        .join('\n');
}
