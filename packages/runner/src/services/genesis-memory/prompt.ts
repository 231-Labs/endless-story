/**
 * Genesis memory — prompt builder.
 *
 * At character creation we distill the character's description into a
 * handful of first-person "opening memories". These get written into
 * MemWal so the very first POV chapters have something to anchor the
 * persona against — without them, early chapters drift into generic
 * voice. (Old repo did this via an admin genesis-memory route.)
 */

export interface GenesisMemoryInput {
    name: string;
    role: string;
    gender: string;
    ageYears: number;
    sagaName: string;
    /** Chain physical_facts (species / body). */
    physicalFacts: string;
    /** The free-form description the player wrote at recruitment. This is
     *  the richest persona source. */
    description: string;
    /** How many memories to generate. Default 4. */
    count?: number;
}

export function buildSystemPrompt(): string {
    return [
        '你要為一個**剛入戲班**的角色寫幾條「開場記憶」。這些記憶之後會成為她的長期記憶基底，',
        '讓她日後寫的章回不會人設飄移。',
        '',
        '**鐵則**：',
        '1. **第一人稱**。每一條都是「我」的一段過往片段、一個習慣、一個放不下的人或事、一個身體記得的細節。',
        '2. **具體、感官、可被回憶命中**。不要抽象形容詞（如「我很堅強」），要場景（如「師父罰我頂著水碗站樁，膝蓋現在陰雨還疼」）。',
        '3. 緊扣我給你的**設定描述** — 把描述裡的線索展開成有畫面的記憶，不要無中生有跟設定矛盾的東西。',
        '4. 風格：所屬 saga 的時代（民初戲園 → 舊白話 + 文言意象）。避免現代詞彙。',
        '5. 每條 30–80 字。彼此不重複，覆蓋不同面向（出身 / 技藝 / 關係 / 隱痛 / 慾望）。',
        '',
        '**輸出格式**：嚴格只輸出一個 JSON 字串陣列，例如 `["我記得…", "那年…", …]`。',
        '不要 markdown、不要前言、不要鍵值物件，就是一個 array of strings。',
    ].join('\n');
}

export function buildUserPrompt(input: GenesisMemoryInput): string {
    const count = input.count ?? 4;
    return [
        `# 角色設定`,
        `- 姓名：${input.name}`,
        `- 行當：${input.role}`,
        `- 性別：${input.gender} · 年齡：${input.ageYears}`,
        `- 外形：${input.physicalFacts}`,
        `- 所屬：${input.sagaName}`,
        '',
        `## 玩家寫下的描述（最重要的人設來源）`,
        input.description || '（無描述 — 請依行當與外形合理發揮，但保守）',
        '',
        `請輸出 ${count} 條第一人稱開場記憶（JSON 字串陣列）。`,
    ].join('\n');
}
