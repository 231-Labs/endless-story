/**
 * Reflection — prompt builder.
 *
 * Two modes:
 *   - **active**: owner asked a specific question; LLM answers in the
 *     character's interior voice. Question is a sealed-envelope thing —
 *     the character may answer obliquely, evade, or contradict, but
 *     must reference the question's emotional core.
 *   - **passive**: no question; LLM writes free-form interior monologue
 *     about the character's recent experience. Usually surfaces what
 *     the public POV chapters didn't say.
 *
 * Both modes share the same "off-stage, mask removed" framing — this
 * is the character ALONE, late at night, no audience.
 */

import { roleHint } from '@endless-story/shared';

export interface CharacterSnapshot {
    id: string;
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    /** Plain physical description (chain `physical_facts`). */
    physicalFacts: string;
    /** Chain attributes. */
    attributes: {
        appearance?: number;
        constitution?: number;
        acuity?: number;
        disposition?: number;
    };
}

export interface ReflectionPromptInput {
    character: CharacterSnapshot;
    mode: 'active' | 'passive';
    /** Active mode: owner's question. Empty for passive. */
    ownerQuestion?: string;
    /** Optional: last POV chapter snippets to give the reflection
     *  recent context. */
    recentChapterSnippets: string[];
    /** Optional: last reflection snippet (avoid repetition). */
    previousReflection?: string;
    /** Optional: MemWal-recalled long-term memories (semantic) for deeper
     *  continuity beyond the last chapter/reflection. */
    recalledMemories?: string[];
}

export function buildSystemPrompt(): string {
    return [
        '你正在以角色的內在獨白寫一段「反思」。**第一人稱**、私密、不為任何人表演。',
        '',
        '**鐵則 — 內在 vs 對外的分裂**：',
        '1. 這段不是給戲班看的、不是給觀眾看的。是角色**獨自一人、卸了妝、燈也滅了**之後寫給自己的句子。',
        '2. **可以、應該、甚至必須**跟她公開的 POV 章回**有出入**。公開時的從容，私下可能是慌；公開時的剛硬，私下可能是悔。',
        '3. **嚴禁第三人稱**。即使「角色」欄位是「—」也要用「我」。',
        '4. 不寫場景敘述（時間地點）— 反思是純粹的心境流動，不是日記體。',
        '5. 字數 150–500 字。短而密、不要灌水。',
        '6. 風格：所在 saga 的時代設定（如「春雪社」是民初戲園 → 舊白話 + 文言意象）。避免現代詞彙。',
        '',
        '**active 模式（有問句）特別注意**：',
        '- 不要正面複述問題（「你問我...」太呆）',
        '- 把問題的情緒核心當成一個「鈎子」, 然後讓內心圍著這個鈎子流動',
        '- 可以迴避、可以說謊（對自己說謊也算）、可以給一個跟問題不直接相關但情緒對位的回答',
        '',
        '**passive 模式（無問句）**：',
        '- 寫她近期經歷後此刻最強的一個情緒、一個畫面、一個沒說出口的句子',
        '- 不要交代「我剛剛在什麼場景做了什麼」— 公報跟章回都記過了',
        '',
        '**輸出格式**：純散文。不要 markdown 標題、不要前言「以下是我的反思」之類。第一個字就是「我」或一個感官 / 內心動詞。',
    ].join('\n');
}

export function buildUserPrompt(input: ReflectionPromptInput): string {
    const { character, mode, ownerQuestion, recentChapterSnippets, previousReflection, recalledMemories } = input;
    const chaptersBlock =
        recentChapterSnippets.length > 0
            ? '\n## 最近你寫下的章回（公開版本）\n' +
              recentChapterSnippets
                  .map((s, i) => `${i + 1}. ${s.slice(0, 200)}${s.length > 200 ? '…' : ''}`)
                  .join('\n')
            : '';
    const memoryBlock =
        recalledMemories && recalledMemories.length > 0
            ? '\n## 你心底翻起的舊記憶（讓它們滲進此刻的心境，不要逐條複述）\n' +
              recalledMemories
                  .map((s, i) => `${i + 1}. ${s.slice(0, 160)}${s.length > 160 ? '…' : ''}`)
                  .join('\n')
            : '';
    const prevBlock = previousReflection
        ? `\n## 你上次反思的片段（避免重複，往新的方向走）\n${previousReflection.slice(0, 200)}${previousReflection.length > 200 ? '…' : ''}`
        : '';
    const questionBlock =
        mode === 'active' && ownerQuestion
            ? `\n## 班主問你的問題（不要直接回答，但要讓內心被它觸動）\n${ownerQuestion}`
            : '';

    return [
        `# 你的身份`,
        `- 姓名：${character.name}`,
        `- 行當：${character.role}`,
        `- 性別：${character.gender} · 年齡：${character.ageYears}`,
        `- 外形：${character.physicalFacts}`,
        attrLine(character.attributes),
        `- 所屬：${character.sagaName}`,
        `- 行當聲口：${roleHint(character.role)}`,
        chaptersBlock,
        memoryBlock,
        prevBlock,
        questionBlock,
        '',
        `## 模式`,
        mode === 'active' ? '主動 (active) — 你正在回應一個問題的情緒，但不需要直接回答。' : '被動 (passive) — 沒人在問，這是你獨自醒著的時候。',
        '',
        '請以你的內在獨白寫一段反思。',
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
