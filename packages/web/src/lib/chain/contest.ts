/**
 * Resource-contest model — who WINS a contested drama resource. Validated in the
 * decoupled offline sim. Replaces the skill-blind
 * "highest tension wins" with the design-review model:
 *
 *   intent (memory-derived desire) gates whether you actively contend;
 *   ability (先天 attrs + 後天 skills, weighted by WHAT the resource is) gates
 *   whether you can succeed.  outcome ≈ (intent + FLOOR) × ability^gate
 *
 *   · 想搶但搶不起     low ability → ability^gate ≈ 0 → loses even at high intent
 *   · 能力夠但不想搶   the FLOOR lets the ablest be thrust in (臨危受命) when no one
 *                      who wants it is around — but a willing-and-able peer beats them
 *
 * Deterministic + pure (no RNG) so the on-chain settlement stays reproducible;
 * drama variance is emergent (intent shifts per tick, holder-stickiness/cooldown),
 * not random. The relevant 先天/後天 per resource is a ContestSpec — keyed by the
 * resource label prefix by default, and OVERRIDABLE by an LLM-director-authored
 * spec (see resolveContestSpec / the director guideline).
 */

import { deriveSagaSkills, type SkillKey, type SkillProfile, type WorldAttrs } from './saga-skills-core.ts';

export type InnateKey = 'appearance' | 'constitution' | 'acuity' | 'disposition';

/** What decides winning THIS resource. Weights are 0..1; only the relevant axes
 *  are filled. `abilityGate` (γ): higher ⇒ ability is a harder wall (硬功型 ~2);
 *  relationship/intent-driven contests give a low gate (~1.2). */
export interface ContestSpec {
    innate: Partial<Record<InnateKey, number>>;
    skill: Partial<Record<SkillKey, number>>;
    abilityGate: number;
}

/**
 * Default spec per resource KIND (the label prefix, e.g. `recording:`). These are
 * the sim-validated baselines; an LLM director may override per event. Keep them
 * here as the single source of truth so the autonomous path always has a sensible
 * contest even with no director-authored spec.
 */
export const DEFAULT_CONTEST_SPECS: Record<string, ContestSpec> = {
    recording: { skill: { vocal: 1.0, stage_presence: 0.4 }, innate: { disposition: 0.2 }, abilityGate: 2.0 },
    spotlight: { skill: { stage_presence: 1.0, vocal: 0.3 }, innate: { appearance: 0.4 }, abilityGate: 2.0 },
    partnership: { skill: { stage_presence: 0.7, movement: 0.6 }, innate: { appearance: 0.3 }, abilityGate: 1.8 },
    naming: { skill: { networking: 1.0, stage_presence: 0.4 }, innate: { acuity: 0.3 }, abilityGate: 1.8 },
    patronage: { skill: { vocal: 0.8, networking: 0.7 }, innate: { disposition: 0.2 }, abilityGate: 1.8 },
    martial: { skill: { martial: 1.0, movement: 0.8 }, innate: { constitution: 0.4 }, abilityGate: 2.0 },
};

/** Mild, ability-light fallback for an unrecognised resource kind: a touch of
 *  presence, low gate ⇒ intent dominates (don't hard-gate something we can't map). */
const FALLBACK_SPEC: ContestSpec = { skill: { stage_presence: 0.5 }, innate: {}, abilityGate: 1.2 };

/** The 臨危受命 floor: even intent≈0 keeps a tiny score so an able-but-unwilling
 *  participant can be thrust in when no one who wants it is contending. */
export const INTENT_FLOOR = 0.08;

/**
 * Resolve the spec for a resource kind. An LLM-director-authored `override`
 * (partial) wins field-by-field over the default; unknown kinds get FALLBACK.
 */
export function resolveContestSpec(kind: string, override?: Partial<ContestSpec> | null): ContestSpec {
    const base = DEFAULT_CONTEST_SPECS[kind] ?? FALLBACK_SPEC;
    if (!override) return base;
    return {
        innate: override.innate ?? base.innate,
        skill: override.skill ?? base.skill,
        abilityGate: override.abilityGate ?? base.abilityGate,
    };
}

/** Weighted competence for this resource, 0..1. Innate attrs + saga skills, each
 *  /100, weighted per the spec. No weights ⇒ neutral 0.5 (spec didn't say). */
export function computeAbility(attrs: WorldAttrs, skills: SkillProfile, spec: ContestSpec): number {
    let s = 0;
    let w = 0;
    for (const [k, weight] of Object.entries(spec.innate)) {
        const v = attrs[k as InnateKey];
        if (typeof v === 'number' && weight) {
            s += (v / 100) * weight;
            w += weight;
        }
    }
    for (const [k, weight] of Object.entries(spec.skill)) {
        const v = skills[k as SkillKey];
        if (typeof v === 'number' && weight) {
            s += (v / 100) * weight;
            w += weight;
        }
    }
    return w > 0 ? s / w : 0.5;
}

export interface Contender {
    id: string;
    /** memory-derived desire for this resource, 0..1 (the drama tension). */
    intent: number;
    /** competence for this resource, 0..1 (computeAbility). */
    ability: number;
}

/**
 * Pick the winner: argmax (intent + FLOOR) × ability^gate. Deterministic — ties
 * break by id so the result is reproducible. Returns null only when no contender
 * scores above zero (all unskilled AND unwilling ⇒ don't move the slot).
 */
export function chooseContestWinner(contenders: ReadonlyArray<Contender>, abilityGate: number): string | null {
    let best: { id: string; score: number } | null = null;
    for (const c of contenders) {
        const score = (c.intent + INTENT_FLOOR) * Math.pow(Math.max(0, c.ability), abilityGate);
        if (score <= 0) continue;
        if (!best || score > best.score || (score === best.score && c.id < best.id)) {
            best = { id: c.id, score };
        }
    }
    return best?.id ?? null;
}

/**
 * Convenience: build a Contender from raw inputs (skills are re-derived from role
 * + attrs, matching what was seeded on chain by seedCharacterSkills — so the
 * off-chain settlement needs no skill read).
 */
export function toContender(id: string, intent: number, role: string, attrs: WorldAttrs, spec: ContestSpec): Contender {
    const skills = deriveSagaSkills(role, attrs);
    return { id, intent, ability: computeAbility(attrs, skills, spec) };
}
