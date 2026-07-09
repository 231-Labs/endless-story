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
} as const;

/** Apply one 時辰's health delta. `awake` = took an agent turn this 時辰;
 *  `scenes` = rendered scenes the character was in this 時辰. Returns whether the
 *  character just died. */
export function applyRoundHealth(c: Char, awake: boolean, scenes: number): boolean {
    if (c.dead) return false;
    if (awake) {
        c.health -= HEALTH.awakeDrain + HEALTH.sceneDrain * Math.max(0, scenes);
        c.fatigue = Math.min(1, c.fatigue + 0.12 + 0.1 * Math.max(0, scenes));
    } else {
        c.health += HEALTH.sleepRecover;
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
    if (c.health <= HEALTH.dangerAt) return '你身子已透支到危險的地步，眼前發黑、幾乎撐不住，再不歇下怕是要出人命。';
    if (c.health <= HEALTH.wornAt) return '你連著奔忙，身上乏透了，眼皮沉得抬不起，該找地方歇了。';
    if (c.fatigue >= 0.5) return '你有些累了，精神還撐得住。';
    return '你精神還好。';
}

export const healthStatus = (c: Char): '好' | '乏' | '危' | '歿' =>
    c.dead ? '歿' : c.health <= HEALTH.dangerAt ? '危' : c.health <= HEALTH.wornAt ? '乏' : '好';
