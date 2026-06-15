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
