/**
 * Genesis memory — prompt builder.
 *
 * At character creation we distill the character's description into a
 * handful of first-person "opening memories". These get written into
 * MemWal so the very first POV chapters have something to anchor the
 * persona against — without them, early chapters drift into generic
 * voice. (Old repo did this via an admin genesis-memory route.)
 */

import { roleHint } from '@endless-story/shared';

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
        '你是一位寫人物前傳的小說家。要為一個角色寫下 TA「此生至今」的若干段第一人稱記憶 —— 這是 TA 的長期記憶基底，',
        'TA 日後的一切言行、章回都從這裡長出來。所以這些記憶必須**像一個真實的人活過的痕跡**，而非戲班宣傳冊。',
        '',
        '**第一鐵則：時間縱深。** 記憶必須橫跨 TA 的一生，依年齡分配，不可全擠在「入行受訓」這一段。大致：',
        '  · **童年（記事～約十歲）**：家世、父母、故鄉、第一次的恐懼或歡喜、一件影響一生的小事。至少 1–2 條。',
        '  · **少年／入行（約十歲～成年）**：怎麼走上這條路、啟蒙的人、第一次登台或第一次挫敗、暗自立下的志。',
        '  · **近年（成年至今）**：當下的牽掛、未償的慾望、一段關係、一個秘密、一道還在痛的傷。',
        '  年紀越大，近年層次越多；年紀越小，童年比重越高。',
        '',
        '**第二鐵則：差異化，反模板。** 嚴禁千人一面。特別**避免**讓「被師父責打／罰站樁／練功受苦」成為主旋律 ——',
        '  那是最廉價的戲班套路。一個人的記憶該有喜有悲、有光有暗：初戀、嫉妒、一頓難忘的飯、一個謊、一場病、',
        '  一次僥倖、一個只有自己知道的癖好、對某人的虧欠或恨。讓**這一個角色**和別人徹底不同。',
        '',
        '**第三鐵則：扣緊設定，並合理補完。** 玩家的描述是最高依據；其中沒寫到的人生空白（尤其童年），',
        '  你要依 TA 的性別、行當、外形、年齡、時代**合情合理地虛構補完**，但不得與描述矛盾。',
        '',
        '**質感要求**：',
        '  · 第一人稱。每條是一個**有畫面、有感官、有情緒**的具體場景或習慣，不是抽象評語。',
        '  · 每條約 40–110 字，可長可短；寧可深一條，不要淺三條，要有「人味」與餘韻。',
        '  · 時代語感：民初戲園 → 舊白話為主、間以文言意象；避免現代詞彙與翻譯腔。',
        '  · 彼此不重複、分屬不同人生階段、不同情緒色彩；連起來能拼出一個立體的人。',
        '',
        '**輸出格式**：嚴格只輸出一個 JSON 字串陣列，例如 `["…", "…"]`。不要 markdown、不要前言、不要鍵值物件。',
    ].join('\n');
}

export function buildUserPrompt(input: GenesisMemoryInput): string {
    const count = input.count ?? 6;
    // life-stage budget hint so the model spreads memories across a lifetime, weighted by age
    const age = input.ageYears;
    const childhood = age <= 16 ? Math.max(2, Math.ceil(count * 0.4)) : Math.max(1, Math.round(count * 0.3));
    const youth = Math.max(1, Math.round(count * 0.35));
    const recent = Math.max(1, count - childhood - youth);
    return [
        `# 角色設定`,
        `- 姓名：${input.name}`,
        `- 行當：${input.role}`,
        `- 行當聲口：${roleHint(input.role)}`,
        `- 性別：${input.gender} · 年齡：${input.ageYears} 歲`,
        `- 外形：${input.physicalFacts}`,
        `- 所屬：${input.sagaName}`,
        '',
        `## 玩家寫下的描述（最高人設依據；其餘人生空白由你合理補完）`,
        input.description || '（無描述 — 請依性別、行當、外形、年齡與時代，合理虛構一個完整的人）',
        '',
        `## 本次要求`,
        `請輸出 **${count}** 條第一人稱記憶，橫跨 TA 的一生，建議分配：`,
        `  · 童年約 ${childhood} 條（家世／故鄉／父母／幼時一件難忘的事）`,
        `  · 少年入行約 ${youth} 條（如何走上這行／啟蒙者／初次登台或挫敗／暗中立的志）`,
        `  · 近年約 ${recent} 條（當下的牽掛／慾望／關係／秘密／未癒的傷）`,
        `切記反模板、求差異化，讓「${input.name}」成為獨一無二的這個人。只輸出 JSON 字串陣列。`,
    ].join('\n');
}
