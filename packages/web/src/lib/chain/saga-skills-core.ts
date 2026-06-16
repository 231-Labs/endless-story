/**
 * Saga-skill DERIVATION — pure, zero-dependency core (no chain, no SDK, no I/O).
 *
 * Split out from `saga-skills.ts` so the derivation (and everything that builds on
 * it — the resource contest in `contest.ts`) can be unit-tested under `node --test`
 * with a node-clean import graph. The chain-writing half (`seedCharacterSkills`)
 * stays in `saga-skills.ts`, which re-exports everything here.
 */

/** The six per-saga skills declared in the spring-snow preset's `saga_attributes`. */
export type SkillKey =
    | 'vocal'
    | 'movement'
    | 'stage_presence'
    | 'martial'
    | 'literati'
    | 'networking';

export type SkillProfile = Record<SkillKey, number>;

export interface WorldAttrs {
    appearance?: number;
    constitution?: number;
    acuity?: number;
    disposition?: number;
}

export const SKILL_KEYS: SkillKey[] = [
    'vocal',
    'movement',
    'stage_presence',
    'martial',
    'literati',
    'networking',
];

/**
 * 行當 → skill emphasis (the character's 本工). Substring match, most specific
 * keywords first; the first hit wins. Unknown 行當 → BALANCED — never skill-less.
 */
const SKILL_PROFILES: { match: string[]; profile: SkillProfile }[] = [
    { match: ['刀馬旦', '武旦', '武生', '武小生'], profile: { martial: 88, movement: 86, stage_presence: 72, vocal: 55, networking: 50, literati: 42 } },
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], profile: { vocal: 84, stage_presence: 86, movement: 74, networking: 66, literati: 56, martial: 42 } },
    { match: ['坤生', '乾生', '小生'], profile: { vocal: 82, stage_presence: 84, movement: 76, literati: 64, networking: 56, martial: 58 } },
    { match: ['老生', '鬚生', '老旦'], profile: { vocal: 86, literati: 80, stage_presence: 74, networking: 58, movement: 56, martial: 44 } },
    { match: ['丑'], profile: { networking: 84, stage_presence: 78, movement: 76, literati: 70, vocal: 60, martial: 56 } },
    { match: ['淨', '大面', '花臉', '銅錘'], profile: { martial: 82, vocal: 78, stage_presence: 78, movement: 72, networking: 50, literati: 48 } },
    { match: ['班主', '掌事', '當家', '東家'], profile: { networking: 86, literati: 78, stage_presence: 78, vocal: 60, movement: 52, martial: 48 } },
    { match: ['記者', '報', '筆', '文人', '掮客'], profile: { literati: 88, networking: 84, stage_presence: 56, vocal: 40, movement: 40, martial: 38 } },
    { match: ['琴師', '樂師', '鼓', '場面', '文武場', '司鼓'], profile: { vocal: 72, literati: 70, networking: 58, stage_presence: 52, movement: 50, martial: 50 } },
    { match: ['衣箱', '管箱', '箱'], profile: { networking: 70, literati: 68, stage_presence: 48, movement: 46, vocal: 42, martial: 42 } },
    { match: ['龍套', '武行', '檢場', '道具'], profile: { movement: 64, martial: 64, stage_presence: 48, networking: 48, vocal: 44, literati: 40 } },
];
const BALANCED: SkillProfile = { vocal: 60, movement: 60, stage_presence: 60, martial: 55, literati: 58, networking: 60 };

function clamp(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Derive a character's six saga skills from 行當 (dominant) + rolled world attrs
 * (a small ± nudge so same-行當 peers individuate). Pure + deterministic.
 */
export function deriveSagaSkills(role: string, world: WorldAttrs = {}): SkillProfile {
    const r = role || '';
    const base = SKILL_PROFILES.find((g) => g.match.some((kw) => r.includes(kw)))?.profile ?? BALANCED;
    const n = (v: number | undefined) => (typeof v === 'number' ? (v - 70) / 5 : 0);
    const body = n(world.constitution);
    const look = n(world.appearance);
    const wit = n(world.acuity);
    const heart = n(world.disposition);
    return {
        vocal: clamp(base.vocal + heart),
        movement: clamp(base.movement + body),
        stage_presence: clamp(base.stage_presence + look + heart * 0.5),
        martial: clamp(base.martial + body),
        literati: clamp(base.literati + wit),
        networking: clamp(base.networking + wit * 0.5 + heart * 0.5),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Craft skills — a SECOND axis on the SAME skill DOF, for the production engine.
//
// These gate "who can author a 劇目" + grade "how good", and are deliberately
// NOT in the saga's card_weight_rules (authoring competence must not bias event
// card-draw). The 6 perf skills above drive events (event.move); these 3 drive
// production authoring (packages/troupe). Wiring: declare these 3 in the saga's
// `saga_attributes` too, and `seedCharacterSkills` writes them in the same PTB.
// See docs/PRODUCTION_ENGINE.md §3.
// ─────────────────────────────────────────────────────────────────────────────

export type CraftSkillKey = 'playwriting' | 'composing' | 'lyricism';
export type CraftProfile = Record<CraftSkillKey, number>;

export const CRAFT_SKILL_KEYS: CraftSkillKey[] = ['playwriting', 'composing', 'lyricism'];

/** 行當 → craft emphasis (本工). Substring match, most specific first; first hit wins. */
const CRAFT_PROFILES: { match: string[]; profile: CraftProfile }[] = [
    { match: ['記者', '報', '筆', '文人', '掮客'], profile: { playwriting: 86, lyricism: 78, composing: 40 } },
    { match: ['班主', '掌事', '當家', '東家'], profile: { playwriting: 78, lyricism: 64, composing: 48 } },
    { match: ['琴師', '樂師', '鼓', '場面', '文武場', '司鼓'], profile: { composing: 86, lyricism: 58, playwriting: 46 } },
    { match: ['老生', '鬚生', '老旦'], profile: { playwriting: 74, lyricism: 72, composing: 50 } },
    { match: ['花旦', '青衣', '正旦', '坤伶', '旦'], profile: { lyricism: 76, playwriting: 52, composing: 48 } },
    { match: ['坤生', '乾生', '小生'], profile: { lyricism: 64, playwriting: 54, composing: 50 } },
    { match: ['丑'], profile: { playwriting: 62, lyricism: 58, composing: 46 } },
    { match: ['淨', '大面', '花臉', '銅錘'], profile: { composing: 52, playwriting: 48, lyricism: 46 } },
];
const CRAFT_BALANCED: CraftProfile = { playwriting: 50, composing: 50, lyricism: 50 };

/**
 * Derive a character's 3 craft skills from 行當 (dominant) + the 6 perf skills
 * (literati feeds 編劇/填詞, vocal feeds 作曲/填詞) + a small world-attr nudge.
 * Pure + deterministic — mirrors `deriveSagaSkills`. Pass `perf` (the output of
 * deriveSagaSkills) to let craft build on the same character's performance axis;
 * omit it to derive from 行當 alone.
 */
export function deriveCraftSkills(role: string, world: WorldAttrs = {}, perf?: SkillProfile): CraftProfile {
    const r = role || '';
    const base = CRAFT_PROFILES.find((g) => g.match.some((kw) => r.includes(kw)))?.profile ?? CRAFT_BALANCED;
    const lit = perf?.literati ?? 60;
    const voc = perf?.vocal ?? 60;
    const nudge = (v: number | undefined) => (typeof v === 'number' ? (v - 70) / 5 : 0);
    const wit = nudge(world.acuity);
    const heart = nudge(world.disposition);
    return {
        playwriting: clamp(base.playwriting + (lit - 60) / 4 + wit),
        composing: clamp(base.composing + (voc - 60) / 4),
        lyricism: clamp(base.lyricism + (lit - 60) / 6 + (voc - 60) / 6 + heart * 0.5),
    };
}

/** Full per-saga profile: 6 perf (events) + 3 craft (authoring), derived together. */
export function deriveAllSkills(role: string, world: WorldAttrs = {}): SkillProfile & CraftProfile {
    const perf = deriveSagaSkills(role, world);
    return { ...perf, ...deriveCraftSkills(role, world, perf) };
}
