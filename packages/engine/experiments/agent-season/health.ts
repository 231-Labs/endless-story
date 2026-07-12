/**
 * AGENT-SEASON · HEALTH / MORTALITY — the teeth behind sleep.
 * ============================================================================
 * Sleep is NOT a peer tool competing with wants (it never wins that competition,
 * per run-1). Instead it is a SURVIVAL NEED backed by death, plus the 深宵 rhythm:
 *   - every AWAKE 時辰 drains health (more if the character acted in a scene);
 *   - a SLEEPING 時辰 (深宵-rhythm home / inactive) recovers it;
 *   - health ≤ 0 → the character DIES.
 * The character's fatigue/health is surfaced in its planning situation, so
 * self-preservation pulls a worn-down character toward rest.
 */

import type { Char } from './world.ts';

export const HEALTH = {
    /** health lost per awake 時辰 (base exertion). */
    awakeDrain: 0.06,
    /** extra health lost per rendered scene the character was in this 時辰. */
    sceneDrain: 0.05,
    /** health recovered per sleeping 時辰. */
    sleepRecover: 0.15,
    /** at/below this the character reads as worn (乏); self-preservation kicks in. */
    wornAt: 0.45,
    /** at/below this the character is in danger (危). */
    dangerAt: 0.2,
    /** hunger gained per awake 時辰 (a soft driver, like fatigue). */
    hungerRise: 0.12,
} as const;

// ── the small economy: meals + coin ──────────────────────────────────────────
/** Coin a meal at a street/food venue costs. */
export const MEAL_COST = 3;
/** Coin a home-cooked 家常 meal costs (cheaper than the street). */
export const HOME_MEAL_COST = 2;
/** Hunger a character resets to after eating (a full belly, not stone empty). */
export const MEAL_HUNGER_LOW = 0.05;
/** At/above this felt hunger the 身 line surfaces the pang (so the agent CAN decide to eat). */
export const HUNGER_FELT = 0.4;
/** At/above this the body is STARVING: extra health drain awake, and sleep no longer
 *  restores properly (餓着傷身、餓着睡不安穩). This is the teeth that turns poverty →
 *  hunger → failing health into a REAL lifecycle pressure (feeds the 世道 want lane). */
export const HUNGER_STARVING = 0.8;

/** Occupation-keyed income (DATA, no character names): a duty 時辰 actually WORKED at
 *  the duty venue pays `dutyWage`; `dailyAllowance` is unconditional family money paid
 *  once a day (the 千金's 月例). Skipping duty to chase someone forfeits that 時辰's
 *  wage — opportunity cost becomes economic, not just narrative. */
export const ECON: Record<string, { dutyWage: number; dailyAllowance: number }> = {
    troupe: { dutyWage: 3, dailyAllowance: 0 },
    banzhu: { dutyWage: 2, dailyAllowance: 0 },
    geinu: { dutyWage: 6, dailyAllowance: 0 },
    guest: { dutyWage: 0, dailyAllowance: 5 },
};

/**
 * EAT a meal costing `cost`: deduct it and reset hunger low. Returns whether a meal was
 * actually eaten — a near-broke character (money < cost) can't afford one, so they go
 * without (money floored at 0). GENERAL: pure state, no character-name logic.
 */
export function eat(c: Char, cost: number = MEAL_COST): boolean {
    if (c.money < cost) {
        c.money = Math.max(0, c.money); // never negative
        return false;
    }
    c.money -= cost;
    c.hunger = MEAL_HUNGER_LOW;
    return true;
}

/** Apply one 時辰's health delta. `awake` = took an agent turn this 時辰;
 *  `scenes` = rendered scenes the character was in this 時辰. Returns whether the
 *  character just died. */
export function applyRoundHealth(c: Char, awake: boolean, scenes: number): boolean {
    if (c.dead) return false;
    const starving = c.hunger >= HUNGER_STARVING;
    if (awake) {
        // Starving bodies wear faster (餓着傷身) — the poverty→hunger→health chain.
        c.health -= HEALTH.awakeDrain + HEALTH.sceneDrain * Math.max(0, scenes) + (starving ? 0.04 : 0);
        c.fatigue = Math.min(1, c.fatigue + 0.12 + 0.1 * Math.max(0, scenes));
        c.hunger = Math.min(1, c.hunger + HEALTH.hungerRise); // an active 時辰 works up an appetite
    } else {
        // A starving sleep restores poorly (餓着睡不安穩).
        c.health += starving ? HEALTH.sleepRecover * 0.5 : HEALTH.sleepRecover;
        c.fatigue = Math.max(0, c.fatigue - 0.4);
    }
    c.health = Math.min(1, c.health);
    if (c.health <= 0) {
        c.health = 0;
        c.dead = true;
        return true;
    }
    return false;
}

/** Situation line surfaced to the agent (self-preservation signal). */
export function bodyLine(c: Char): string {
    const hungry =
        c.hunger >= HUNGER_STARVING
            ? '腹中空得發慌，餓過了頭，手腳都有些發虛。'
            : c.hunger >= HUNGER_FELT
              ? '腹中有些餓了。'
              : '';
    if (c.health <= HEALTH.dangerAt) return `你身子已透支到危險的地步，眼前發黑、幾乎撐不住，再不歇下怕是要出人命。${hungry}`;
    if (c.health <= HEALTH.wornAt) return `你連著奔忙，身上乏透了，眼皮沉得抬不起，該找地方歇了。${hungry}`;
    if (c.fatigue >= 0.5) return `你有些累了，精神還撐得住。${hungry}`;
    return hungry ? `你精神還好，只是${hungry}` : '你精神還好。';
}

export const healthStatus = (c: Char): '好' | '乏' | '危' | '歿' =>
    c.dead ? '歿' : c.health <= HEALTH.dangerAt ? '危' : c.health <= HEALTH.wornAt ? '乏' : '好';
