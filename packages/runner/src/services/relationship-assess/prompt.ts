/**
 * Relationship assessment — prompt builder.
 *
 * After a character is minted we ask the LLM to judge, from the public
 * DESCRIPTIONS alone, which existing saga members this character plausibly
 * already has a tie with — INCLUDING pre-existing acquaintance (故舊), since a
 * character is pulled into the saga "from the middle of their life" and may
 * carry old ties, not just first impressions.
 *
 * Unlike genesis memory (which is forbidden to invent shared past in a
 * character's PRIVATE memory), these ties become DIRECTOR-seeded public
 * `RelationshipSeeded` events — symmetric, consensual-by-construction, the
 * source of truth for the relationship graph. So shared past IS allowed here.
 */

import { roleHint } from '@endless-story/shared';
import type { GenesisRosterEntry } from '../genesis-memory/prompt.js';

export type { GenesisRosterEntry };

/** Mirrors `RelationshipTone` in @endless-story/shared (kept as a literal list
 *  so the runner doesn't depend on the web/shared tone enum at runtime). */
export const RELATIONSHIP_TONES = [
    'affection', // 親近
    'romance', // 戀慕
    'mentorship', // 師徒
    'rivalry', // 競爭
    'wary', // 戒備
    'tension', // 緊張
    'estrangement', // 隔閡
    'acquaintance', // 故舊（故事前就認識，當下情感色彩未定）
    'neutral', // 平淡
] as const;
export type RelationshipToneValue = (typeof RELATIONSHIP_TONES)[number];

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

export interface RelationshipAssessInput {
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    physicalFacts: string;
    description: string;
    recruitmentRoleIntent?: string;
    /** Existing same-saga members (excludes the new character itself). */
    roster: GenesisRosterEntry[];
}

export function buildSystemPrompt(): string {
    const toneList = RELATIONSHIP_TONES.map((t) => `${TONE_ZH[t]}(${t})`).join('、');
    return [
        '你是一個 saga 的「關係編劇」。一個角色剛被寫進這個世界 —— 但 TA 不是憑空誕生，而是',
        '「從人生的一半被拉進來」：可能早就認識班裡某些人，帶著故事開始前就形成的舊識、舊情、',
        '師承、競爭或恩怨。你的工作：只憑各人**公開描述**，判斷這個新角色與名冊中哪些人',
        '**理應已有關係**，或**初見就會立刻產生的張力**，並為每一對寫下關係。',
        '',
        '**判準鐵則**：',
        '  · 只在雙方描述有**實質文本依據**時才連線（同鄉、同師門、舊情暗示、行當宿敵、',
        '    名字互相提及、明顯互補或對立的人設…）。沒有依據就**不要硬連**。寧缺勿濫。',
        '  · 一個新角色通常 0–4 條關係就夠；最多 6 條。完全沒有合理對象時輸出空陣列。',
        '',
        '**kind 兩種**：',
        '  · `prior`：故事開始前就認識（故舊/舊識/師承/舊情/舊仇）。可以、也應該寫共同過去。',
        '  · `first_impression`：此前不認識，入班/此刻第一次照面產生的觀感。',
        '',
        '**雙向對稱鐵則**：每一對都要寫兩段第一人稱記憶 —— `selfMemory`（新角色視角）與',
        '  `otherMemory`（對方視角）。兩段必須**指向同一段關係、彼此不矛盾**：若 prior，兩人',
        '  記得同一件往事，只是各自立場/情緒不同；若 first_impression，兩人記同一次照面。',
        '  不可一邊熱一邊不認識（除非你刻意寫「一方記得、一方早忘」並在兩段裡都自洽交代）。',
        '',
        `**tone**：從固定詞表選一個最貼切的：${toneList}。`,
        '  「故舊(acquaintance)」用於「明顯認識很久、但當下情感色彩尚未定調」。',
        '',
        '**點名鐵則**：每段記憶都要**至少出現一次對方的姓名** —— selfMemory 點出對方姓名，',
        '  otherMemory 點出這個新角色的姓名。**不可通篇只用「他/她」**：這些記憶日後會被單獨',
        '  讀取、沒有上下文，認不出在說誰就失去意義。點名後再用代名詞接續沒問題。',
        '',
        '**質感**：第一人稱、有畫面有情緒、每段約 40–120 字；民初戲園時代語感，避免現代詞與翻譯腔。',
        '',
        '**輸出格式**：嚴格只輸出一個 JSON 物件，不要 markdown、不要前言：',
        '`{"ties":[{"otherId":"0x…","otherName":"某人","tone":"acquaintance","kind":"prior","selfMemory":"…","otherMemory":"…","importance":8}]}`',
        'otherId 必須**原樣**取自下方名冊（不可自創）；ties 最多 6 條；沒有就輸出 `{"ties":[]}`。',
    ].join('\n');
}

export function buildUserPrompt(input: RelationshipAssessInput): string {
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
            : ['（名冊為空 —— 直接輸出 {"ties":[]}）'];
    return [
        `# 新角色`,
        `- 姓名：${input.name}`,
        `- 行當：${input.role}（聲口：${roleHint(input.role)}）`,
        `- 性別：${input.gender} · 年齡：${input.ageYears} 歲`,
        `- 外形：${input.physicalFacts}`,
        `- 所屬：${input.sagaName}`,
        '',
        `## 新角色描述（判斷關係的最高依據）`,
        input.description || '（無描述）',
        input.recruitmentRoleIntent
            ? `\n## 招募意圖（公開職缺語境）\n${input.recruitmentRoleIntent}`
            : '',
        '',
        `## 同 saga 名冊（只能連這些人；otherId 原樣引用）`,
        ...rosterBlock,
        '',
        `## 本次要求`,
        `判斷「${input.name}」與名冊中哪些人理應已有關係或初見即生張力，為每一對輸出 tie。`,
        `prior 要寫雙向對稱的共同過去；first_impression 寫雙向初見。寧缺勿濫，最多 6 條，只輸出 JSON 物件。`,
    ].join('\n');
}
