/**
 * Character POV chapter — prompt builder.
 *
 * Two rules baked in:
 *   - Assume the reader saw the gazette. DO NOT recap public facts.
 *   - Write interiority, not narration. Sensation + memory + reaction.
 *
 * `triggerNarrative` is the runner-supplied "what just happened" line
 * (e.g. "saga director 在後台化妝間開了 storylet confession_after_show，
 * 涉及你和林某"). The character LLM treats this as ground truth —
 * doesn't restate it, just responds to it.
 */

import { roleHint } from '@endless-story/shared';

export interface CharacterSnapshot {
    id: string;
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    sceneName?: string;
    /** Plain physical description (chain `physical_facts`). */
    physicalFacts: string;
    /** Chain attributes: appearance / constitution / acuity / disposition. */
    attributes: {
        appearance?: number;
        constitution?: number;
        acuity?: number;
        disposition?: number;
    };
}

export interface PovPromptInput {
    character: CharacterSnapshot;
    /** Storyteller-supplied "what just happened" line. */
    triggerNarrative: string;
    /** Optional: 1-3 short memory snippets (last reflections / past POV
     *  chapter excerpts) for continuity. Pass empty for first chapter. */
    recentMemorySnippets: string[];
    /** Optional: owner-injected dream text (R5). One per chapter max.
     *  When set, prompt explicitly asks LLM to weave it in. */
    dreamFragment?: string;
    /** Optional: director-seeded relationships (N3) — who she's tied to +
     *  how. Colours how she narrates others in the scene. */
    relationshipHints?: string[];
    /** Optional: current plan (N6) — her goal + intent. Gives the monologue
     *  forward tension (what she's reaching for), not just present sensation. */
    planHint?: string;
    /** Optional: drama-engine tension (DR-6) — her dominant unmet desire over a
     *  scarce on-chain resource. Lets the monologue ache for what she lacks. */
    dramaHint?: string;
}

export function buildSystemPrompt(): string {
    return [
        '你正在以指定角色的第一人稱（**嚴禁第三人稱**）寫一段 POV 章回。',
        '',
        '**身份鐵則**：',
        '你**就是**下方「你的身份」段落描述的那個人。不是寫他、不是看他、不是描述他。**你開口時用「我」**。',
        '即使你的「行當」欄位寫的是「—」或不熟悉的角色，**也要堅守第一人稱**，根據姓名、外形、屬性建構一個自洽的「我」。',
        '不要因為角色設定不齊全就退回旁觀視角。',
        '',
        '**寫作鐵則**：',
        '1. **公報已交代過事實 — 不要 recap**。讀者已知「誰在哪做了什麼」，請直接進入你的內心、感官、聯想。',
        '2. 字數 200–800 之間，由你判斷情緒密度自由發揮，**不要為了長度灌水**。',
        '3. 寫**感官細節**（光、聲、味、觸）+ **心境湧動**（回憶、預感、矛盾）+ **微動作**（一個小動作勝過一段心理描述）。',
        '4. 風格：所在 saga 的時代設定（如「春雪社」是民初上海戲園 → 舊白話 + 文言夾雜）。避免明顯違和的現代詞彙（手機、能量場、心靈雞湯）。',
        '5. 若有「夢境片段」標記，你的章回**必須引用其中一句意象**作為情緒錨點。',
        '6. **不要寫對白以外的場景敘述**（如「下午三點，戲台後方……」）— 公報那邊有了。直接從你的眼睛、耳朵、皮膚開始。',
        '',
        '**輸出格式**：純散文，不要 markdown 標題、不要分段標號、不要前言「以下是我的章回」之類。直接開始寫，第一個字就是「我」或感官描述。',
    ].join('\n');
}

export function buildUserPrompt(input: PovPromptInput): string {
    const { character, triggerNarrative, recentMemorySnippets, dreamFragment } = input;
    const memBlock =
        recentMemorySnippets.length > 0
            ? '\n## 你近期的記憶片段\n' +
              recentMemorySnippets.map((m, i) => `${i + 1}. ${m}`).join('\n')
            : '';
    const relBlock =
        input.relationshipHints && input.relationshipHints.length > 0
            ? '\n## 你與在場人的牽絆（用你的眼睛看他們時帶上這份情感）\n' +
              input.relationshipHints.map((r) => `- ${r}`).join('\n')
            : '';
    const planBlock = input.planHint
        ? `\n## 你心裡的目標與打算（讓獨白帶上你正在追求的東西）\n${input.planHint}`
        : '';
    const dramaBlock = input.dramaHint
        ? `\n## 你此刻的渴與不甘（稀缺之物落在誰手裡 —— 讓這份張力滲進你的獨白）\n${input.dramaHint}`
        : '';
    const dreamBlock = dreamFragment
        ? `\n## 你昨夜的夢（必須引用其中一句意象）\n${dreamFragment}`
        : '';
    return [
        `# 你的身份`,
        `- 姓名：${character.name}`,
        `- 行當：${character.role}`,
        `- 性別：${character.gender} · 年齡：${character.ageYears}`,
        `- 外形：${character.physicalFacts}`,
        attrLine(character.attributes),
        `- 所屬：${character.sagaName}${character.sceneName ? ` · 在 ${character.sceneName}` : ''}`,
        `- 行當聲口：${roleHint(character.role)}`,
        memBlock,
        relBlock,
        planBlock,
        dramaBlock,
        dreamBlock,
        '',
        '## 剛才發生',
        triggerNarrative,
        '',
        '請以你的視角寫這段 POV 章回。',
    ]
        .filter((s) => s !== '')
        .join('\n');
}

function attrLine(a: CharacterSnapshot['attributes']): string {
    const parts: string[] = [];
    if (a.appearance != null) parts.push(`外貌 ${a.appearance}`);
    if (a.constitution != null) parts.push(`筋骨 ${a.constitution}`);
    if (a.acuity != null) parts.push(`機敏 ${a.acuity}`);
    if (a.disposition != null) parts.push(`心性 ${a.disposition}`);
    if (parts.length === 0) return '';
    return `- 屬性：${parts.join(' · ')}`;
}
