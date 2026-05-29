/**
 * Role (行當) voice traits — used to differentiate generated prose by the
 * character's recruitment specialty so a 武小生 doesn't sound like a
 * 小報記者. Consumed by runner prompts (POV / reflection / genesis).
 *
 * `role` is a free-form off-chain string (recruitment.specialty), so we
 * match a handful of known 行當 and fall back to a generic instruction.
 * The hint is injected into prompts as guidance, not a hard template —
 * the LLM already knows what these archetypes sound like; we just point
 * it hard at the role so it stops drifting to a generic stage voice.
 */

interface RoleTrait {
    /** Substrings that map to this trait (matched against the role string). */
    match: string[];
    /** One-line voice/concern guidance, in-world (民初戲園). */
    hint: string;
}

const ROLE_TRAITS: RoleTrait[] = [
    {
        match: ['武小生', '武生', '武旦', '刀馬'],
        hint: '聲口剛硬、帶江湖氣；在意身段、筋骨、輸贏與面子；意象多刀槍、汗、台毯、跌打。',
    },
    {
        match: ['小生', '文小生'],
        hint: '聲口清雅多情、易感；在意眼神、唱腔、台上台下的曖昧；意象多水袖、燈、月、未說出口的話。',
    },
    {
        match: ['花旦', '旦', '青衣', '名伶', '坤伶'],
        hint: '聲口婉轉而有心機底；在意妝、戲份、恩客與班主的眼色；意象多胭脂、鏡、簾、被看與不被看。',
    },
    {
        match: ['老生', '鬚生', '老旦'],
        hint: '聲口沉、認命又執拗；在意規矩、輩分、戲班存續；意象多茶、賬、舊傷、年歲。',
    },
    {
        match: ['小報', '記者', '筆', '文人', '報館'],
        hint: '聲口世故、愛觀察、話裡有鈎；在意消息、人情虛實、誰能寫誰不能；意象多墨、紙、街談、版面。',
    },
    {
        match: ['富商', '商', '老闆', '東家', '金主'],
        hint: '聲口精明、習慣算計與排場；在意銀錢、人脈、誰欠誰；意象多賬本、酒席、地契、抽水煙。',
    },
    {
        match: ['琴師', '樂師', '鼓', '場面', '文武場'],
        hint: '聲口寡言、靠耳朵活；在意板眼、配合、台上一個錯音；意象多絃、鼓點、手繭、暗處。',
    },
];

/**
 * Returns a one-line voice hint for a role, or a generic instruction when
 * the role is unknown / placeholder ('—'). Always returns something the
 * prompt can lean on.
 */
export function roleHint(role: string | undefined): string {
    const r = (role ?? '').trim();
    if (!r || r === '—') {
        return '依姓名、外形、屬性與你的描述，建構一個自洽且有辨識度的聲口 — 不要落入泛泛的「戲子」通用腔。';
    }
    for (const t of ROLE_TRAITS) {
        if (t.match.some((m) => r.includes(m))) return t.hint;
    }
    // Unknown but non-empty role: tell the LLM to commit to it hard.
    return `你的行當是「${r}」。讓這個行當徹底決定你的聲口、用詞、關注的事與慣用意象，每一句都要像「${r}」的人，而不是泛泛的戲子。`;
}
