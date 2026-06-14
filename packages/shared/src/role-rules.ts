// Hard craft constraints for generated prose — the guardrail layer that complements
// role-traits.ts (which gives *voice*; this gives *hard rules*). Matched by SUBSTRING on
// the free-form `role` string, same flexible pattern as roleHint: a role we don't recognise
// gets NO hard constraints (we never block prose for an unknown role). These are 戲曲 domain
// facts (who carries a beard, which plays are 老生 work), not per-saga data — so no character
// names, no cast specifics live here.
//
// Consumed by the self-check (narrative-audit) AND by the craft directive in POV prompts, so
// "what the role forbids" is defined once.

/** Beard-related words; their (non-negated) appearance in a beardless role's prose is an error. */
export const BEARD_WORDS = [
    '髯口', '三髯', '黲髯', '白滿', '黑三', '掛髯', '鬍鬚', '鬍子', '鬍髭', '絡腮鬍', '髭', '鬚口',
];

/** Play title → the role-kind it is 應工 (canonically performed by). A beardless role singing a
 *  `老生` lead is an error. Extend per need; unknown plays are simply not checked. */
export const PLAY_KINDS: Record<string, string[]> = {
    老生: [
        '定軍山', '烏盆記', '捉放曹', '碰碑', '搜孤救孤', '空城計', '轅門斬子', '文昭關',
        '斬經堂', '四郎探母', '武家坡', '大登殿', '二進宮', '洪羊洞', '失街亭', '戰太平', '李陵碑',
    ],
};

// 掛鬚（有鬚）行當：老生/鬚生/淨(花臉)/末。這些角色出現髯口是本色，不算錯。
const BEARDED_ROLE = /老生|鬚生|淨|花臉|大花|二花|銅錘|架子花|老外|末行/;
// 俊扮無鬚行當：小生家族(含坤生/乾生)、旦行各門、武生、丑、名伶/坤伶。
const BEARDLESS_ROLE = /生|旦|丑|貼|伶/;

export interface RoleCraftRules {
    /** Does this role canonically carry a beard? (false ⇒ beard words in prose = error.) */
    beardAllowed: boolean;
    /** Play-kinds this role must NOT lead (e.g. a 小生 must not lead a 老生 play). */
    forbiddenPlayKinds: string[];
    /** Did we recognise the role at all? Unknown ⇒ fully permissive (never block). */
    known: boolean;
}

/**
 * Hard craft constraints for a free-form role string. Bearded roles checked first so that
 * 老生/鬚生 (which also contain 生) are not mis-classified as beardless. Unknown roles get a
 * permissive result so generated prose for a brand-new 行當 is never falsely flagged.
 */
export function roleCraftRules(role: string | undefined): RoleCraftRules {
    const r = (role ?? '').trim();
    if (!r || r === '—') return { beardAllowed: true, forbiddenPlayKinds: [], known: false };
    if (BEARDED_ROLE.test(r)) return { beardAllowed: true, forbiddenPlayKinds: [], known: true };
    if (BEARDLESS_ROLE.test(r)) return { beardAllowed: false, forbiddenPlayKinds: ['老生'], known: true };
    return { beardAllowed: true, forbiddenPlayKinds: [], known: false };
}

/** Terse craft guardrail for the POV/genesis prompt. A WRITER-FACING rule, never recited by the
 *  character — phrased so the model treats it as a constraint, not as identity flavour. Returns
 *  '' for roles with no hard rule (unknown, or bearded roles where a beard is fine). */
export function craftGuardrail(role: string | undefined): string {
    const rules = roleCraftRules(role);
    if (!rules.known || rules.beardAllowed) return '';
    return '俊扮無鬚、不掛髯口；不演老生戲、不勾花臉（這是寫作守門規矩，讀者看不到，角色不會把行當掛在嘴上——別寫進正文）。';
}
