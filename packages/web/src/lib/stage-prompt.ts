// Structured builder for the 戲妝 (stage-makeup) image prompts — a typed slot
// template, NOT a raw find/replace DSL. Empty slots are omitted (no "頭面要求：。"
// noise), and role-aware defaults fill makeup/headpiece/costume so the panel
// stays generic (泛用): the caller only needs styleMode + roleType + whatever the
// LLM curator could infer from the free-text occasion (play / scene / pose…).
//
// Plain module (NOT 'use server') so the server action AND any prompt-lab can
// share one source. The LLM slot-filler lives next to the server action; this
// file is pure string assembly.

/** Every slot is optional except the two the caller always knows. */
export interface StageSlots {
    /** 畫風 — '淡彩水墨工筆畫風' (ink) or '寫實真人舞台劇照' (photo). Always set. */
    styleMode: string;
    /** Performing 行當 (反串 already resolved upstream): 小生 / 老生 / 花旦 / 淨…. Always set. */
    roleType: string;
    /** 劇種用詞 — defaults to 京劇 (heavier 油彩 than 越劇 in image models). */
    operaType?: string;
    /** 劇目，如「紅樓夢」(no 書名號 — the template adds it). */
    playTitle?: string;
    /** 飾演的角色，如「賈寶玉」. */
    roleName?: string;
    /** 戲妝描述 — falls back to ROLE_DEFAULTS[roleType].makeup. */
    makeupDesc?: string;
    /** 頭面 — falls back to ROLE_DEFAULTS[roleType].headpiece. */
    headpieceDesc?: string;
    /** 服裝 — falls back to ROLE_DEFAULTS[roleType].costume. */
    costumeDesc?: string;
    /** 道具 — optional, no default. */
    propsDesc?: string;
    /** 場景 — the 泛用 hinge; LLM derives it from the occasion. */
    sceneDesc?: string;
    /** 動作 / 身段. */
    poseAction?: string;
    /** 神情. */
    emotionDesc?: string;
    /** 構圖 — defaults to 半身. */
    shotType?: string;
    /** 光線氛圍 — defaults to 舞台燈光. */
    lightingMood?: string;
    /** 額外負面限制 — appended to the fixed negative tail. */
    negativeConstraints?: string;
}

/** Per-行當 makeup / headpiece / costume defaults. Keyed by a normalized line. */
type RoleDefault = { makeup: string; headpiece: string; costume: string };
const ROLE_DEFAULTS: Record<string, RoleDefault> = {
    小生: {
        makeup: '俊扮，油彩明亮而濃，吊眉描眼、眼線分明、紅唇、淡掃胭脂，俊秀清貴',
        headpiece: '文生巾或束髮冠，配玉飾',
        costume: '繡花褶子或蟒袍，色澤雅致',
    },
    老生: {
        makeup: '俊扮揉臉，膚色沉著，掛黑髯口（三綹），眉眼端凝',
        headpiece: '相紗或方巾',
        costume: '蟒袍或褶子，沉穩大氣',
    },
    武生: {
        makeup: '英武俊扮，油彩濃、劍眉吊眼、紅唇',
        headpiece: '盔頭或紮巾，配翎子',
        costume: '靠甲或箭衣，英挺利落',
    },
    旦: {
        makeup: '貼片子、大頭，油彩濃豔，紅暈眼影、桃紅胭脂、朱唇，柳眉鳳眼',
        headpiece: '大頭頭面、點翠或水鑽頭飾，鳳冠或額子',
        costume: '繡花帔或宮裝，色彩鮮明',
    },
    老旦: {
        makeup: '素淨揉臉、年長膚色，眉眼慈和，無濃胭脂',
        headpiece: '老旦髮髻，素簪',
        costume: '素色帔或褶子',
    },
    淨: {
        makeup: '勾畫油彩臉譜，色塊誇張對比、線條粗獷分明，重彩濃妝',
        headpiece: '盔頭或紮巾，配絨球翎子',
        costume: '蟒袍或靠甲，氣勢威猛',
    },
    丑: {
        makeup: '鼻樑一塊白粉豆腐塊，眉眼誇張、滑稽生動',
        headpiece: '氈帽或方巾',
        costume: '褶子或短打，輕便',
    },
};

/** Normalize an arbitrary 行當 string to a ROLE_DEFAULTS key (longest match first). */
function roleKey(roleType: string): keyof typeof ROLE_DEFAULTS | undefined {
    const r = roleType;
    if (/淨|花臉/.test(r)) return '淨';
    if (/丑/.test(r)) return '丑';
    if (/武生/.test(r)) return '武生';
    if (/老生/.test(r)) return '老生';
    if (/老旦/.test(r)) return '老旦';
    if (/小生|生/.test(r)) return '小生';
    if (/旦|青衣|花旦/.test(r)) return '旦';
    return undefined;
}

/** Resolve makeup/headpiece/costume from explicit slot → role default → ''. */
function roleFilled(slots: StageSlots): Pick<StageSlots, 'makeupDesc' | 'headpieceDesc' | 'costumeDesc'> {
    const def = roleKey(slots.roleType) ? ROLE_DEFAULTS[roleKey(slots.roleType)!] : undefined;
    return {
        makeupDesc: slots.makeupDesc?.trim() || def?.makeup,
        headpieceDesc: slots.headpieceDesc?.trim() || def?.headpiece,
        costumeDesc: slots.costumeDesc?.trim() || def?.costume,
    };
}

const FIXED_NEGATIVE = '不要現代元素，不要文字，不要 logo，不要多餘人物';

/** Assemble the stage prompt, omitting empty slots so the grammar stays clean. */
export function buildStagePrompt(slots: StageSlots): string {
    const opera = slots.operaType?.trim() || '京劇';
    const { makeupDesc, headpieceDesc, costumeDesc } = roleFilled(slots);
    const v = (s?: string) => s?.trim() || '';

    const lines: string[] = [];

    // Identity lock (fixed) — the base reference face is the only identity source.
    lines.push(
        '請以基底參考圖中的人物為唯一身份基準，保持同一張臉、同一人物、相同五官比例、臉型、眼型、鼻口比例與神韻，不可換人，不可顯著改變年齡感與核心氣質。',
    );
    lines.push(`整體風格為：${slots.styleMode.trim()}。`);

    // Role line — degrade gracefully when play/role unknown.
    if (v(slots.playTitle) && v(slots.roleName)) {
        lines.push(`人物正在扮演${opera}《${v(slots.playTitle)}》中的${v(slots.roleName)}，行當為${slots.roleType}。`);
    } else if (v(slots.roleName)) {
        lines.push(`人物正在扮演${opera}角色${v(slots.roleName)}，行當為${slots.roleType}。`);
    } else {
        lines.push(`人物以${opera}${slots.roleType}行當登台演出。`);
    }

    // Costume/makeup block — each line only if it has content.
    const reqs: Array<[string, string | undefined]> = [
        ['戲妝要求', makeupDesc],
        ['頭面要求', headpieceDesc],
        ['服裝要求', costumeDesc],
        ['道具要求', v(slots.propsDesc) || undefined],
    ];
    for (const [label, val] of reqs) if (val) lines.push(`${label}：${val}。`);

    // Scene / staging block.
    const stage: Array<[string, string | undefined]> = [
        ['場景為', v(slots.sceneDesc) || undefined],
        ['動作為', v(slots.poseAction) || undefined],
        ['神情為', v(slots.emotionDesc) || undefined],
        ['構圖為', v(slots.shotType) || '半身'],
        ['光線氛圍為', v(slots.lightingMood) || '舞台燈光'],
    ];
    for (const [label, val] of stage) if (val) lines.push(`${label}：${val}。`);

    // Fixed tail + optional extra negatives.
    const neg = v(slots.negativeConstraints)
        ? `${FIXED_NEGATIVE}。額外限制：${v(slots.negativeConstraints)}`
        : FIXED_NEGATIVE;
    lines.push(`請強化戲曲角色辨識度與舞台感，確保畫面精緻、完整、自然。${neg}。`);

    return lines.join('\n');
}
