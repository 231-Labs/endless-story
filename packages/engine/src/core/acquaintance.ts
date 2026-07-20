/**
 * 相識分寸 — deterministic ACQUAINTANCE SEED (no LLM). Called once, when the world
 * carries `subjectiveNaming`, AFTER the cast / edges / relationship-views are
 * seeded (the flagship wiring runs it from the lab manager & the engine CLI). It
 * decides, for every ORDERED pair (perceiver P, target T), how well P starts out
 * knowing T:
 *
 *   1. P holds a `relationshipView[T]` OR a seeded edge `edges[P][T]`
 *        ⇒ NAMED — you know by name someone you already have an opinion of.
 *   2. else P & T share a `workByChar` OR `homeByChar` scene (co-workers / room-
 *        mates) ⇒ NAMED — you know the people you work and sleep beside.
 *   3. else T has a public-facing role（花婆／小販／記者／歌女／班主）
 *        ⇒ ACQUAINTED — a street / press / stage figure known by trade + surname.
 *        ONE-DIRECTIONAL: others know them, not the reverse (each ordered pair is
 *        judged on its own, so T→P is only set if P is likewise public/connected).
 *   4. else ⇒ leave unset — a genuine stranger（defaults to 'stranger'）。
 *
 * Monotonic via `setAcquaint` (a later rule can only ever RAISE a pair), so the
 * ordering of the passes below is safe. For the spring-snow cast this yields:
 * troupe-mates named to each other; 前街 vendors（趙阿福・殷阿婆）acquainted-by-trade
 * to unconnected troupe folk, yet already NAMED to 何阿喜（same 前街 work）and to the
 * edge/view holders they have canon with; genuine strangers stay stranger.
 */

import type { WorldState } from '../world-state.ts';

/** Public-facing roles known to the street by trade + surname（rule 3）. */
const PUBLIC_ROLES = new Set(['花婆', '小販', '記者', '歌女', '班主']);

export function seedAcquaintance(world: WorldState): void {
    const d = world.data;
    // Guard: subjective-naming worlds only, and only if never seeded — a resumed
    // world already carries its `acquaintance` map and must not be re-seeded.
    if (!d.subjectiveNaming || d.acquaintance !== undefined) return;
    d.acquaintance = {}; // initialise so the seed is idempotent even for an all-stranger world

    const cast = d.cast;
    for (const p of cast) {
        for (const t of cast) {
            if (p.id === t.id) continue;
            // 1) an opinion / a canon edge ⇒ you know them by name.
            const hasView = world.relationshipView(p.id, t.id) !== undefined || d.edges[p.id]?.[t.id] !== undefined;
            // 2) same workplace or same dwelling ⇒ co-workers / roommates ⇒ named.
            const wP = d.workByChar[p.id];
            const hP = d.homeByChar[p.id];
            const together = (wP !== undefined && wP === d.workByChar[t.id]) || (hP !== undefined && hP === d.homeByChar[t.id]);
            if (hasView || together) {
                world.setAcquaint(p.id, t.id, 'named');
                continue;
            }
            // 3) a public-facing figure ⇒ acquainted by trade/surname (one-directional).
            if (t.role && PUBLIC_ROLES.has(t.role)) {
                world.setAcquaint(p.id, t.id, 'acquainted');
            }
            // 4) else: leave unset (stranger by default).
        }
    }
}
