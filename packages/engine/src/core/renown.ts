/**
 * 口碑 (renown) seed — plant each cast member's PUBLIC 名頭 (renown) and PRIVATE
 * 自視 (self-regard) at world creation, so the box-office hook (滿座長臉／停鑼折面子)
 * and the percept descriptors have a baseline to move from.
 *
 * Two sources, table first: an optional name-keyed frame table (canon values —
 * 柳安春 當紅卻怕不夠好…), else a ROLE-based default (台上的角兒 name higher, the
 * 前街討生活的 lower, a 記者's renown is the weight of his pen). Idempotent per
 * field: only sets what is still undefined, so a resumed world keeps whatever it
 * already earned across a season.
 *
 * Pure data + world mutation; no LLM, no chain. renown is NOT money — nothing
 * here touches the ledger, and `auditSeasonEconomy` is unaffected.
 */

import type { WorldState } from '../world-state.ts';

/** role → default { public renown, private self-regard }, both 0..1. 台上的角兒
 *  (小生/花旦/班主/歌女) carry a name; the 前街 trades (刀馬旦/丑/衣箱/小販/花婆) less;
 *  a 記者's renown is his pen's weight. A role with no entry falls to DEFAULT. */
const ROLE_RENOWN: Record<string, { renown: number; self: number }> = {
    小生: { renown: 0.65, self: 0.55 },
    花旦: { renown: 0.65, self: 0.55 },
    班主: { renown: 0.6, self: 0.6 },
    歌女: { renown: 0.55, self: 0.55 },
    記者: { renown: 0.4, self: 0.45 }, // 一支筆的分量
    刀馬旦: { renown: 0.35, self: 0.5 },
    丑: { renown: 0.35, self: 0.5 },
    衣箱: { renown: 0.3, self: 0.5 },
    小販: { renown: 0.3, self: 0.55 },
    花婆: { renown: 0.3, self: 0.55 },
};

/** The neutral fallback for a role the table below does not name. */
const DEFAULT_RENOWN = { renown: 0.5, self: 0.5 };

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Seed renown + self-regard onto every cast member. `table` (name → {renown?, self?})
 * carries authored canon and WINS per field; else the role default applies. Only
 * fields still `undefined` are written (idempotent), so re-running on a resumed
 * world — or over values already moved by the box office — is a no-op.
 */
export function seedRenown(
    world: WorldState,
    table?: Record<string, { renown?: number; self?: number }>,
): void {
    for (const member of world.data.cast) {
        const override = table?.[member.name];
        const roleDefault = ROLE_RENOWN[member.role ?? ''] ?? DEFAULT_RENOWN;
        if (member.renown === undefined) {
            member.renown = clamp01(override?.renown ?? roleDefault.renown);
        }
        if (member.selfRegard === undefined) {
            // self-regard follows the table's `self`, else the role default; the
            // final fall-through is the member's own (now-seeded) renown — they
            // rate themselves as the street does until something moves it.
            member.selfRegard = clamp01(override?.self ?? roleDefault.self ?? member.renown);
        }
    }
}
