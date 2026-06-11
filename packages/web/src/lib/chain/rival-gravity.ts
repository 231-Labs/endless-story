/**
 * Rival gravity (glue) — turn the on-chain resource ledger + the deterministic
 * desire gating into the contender map that `gravity-core` needs, so the move
 * phase can pull rivals toward their contest. Pure mechanism + cooldown live in
 * `gravity-core` (verified in gravity-core.test.ts / gravity-sim.test.ts); this
 * file only shapes chain data into it.
 *
 * Server-only; flag-gated by the caller (`rivalGravity` tick input).
 */

import { defaultDesiresForCast, type ResourceSnapshot } from './drama-core.js';
import { gravityTargetsForContenders } from './gravity-core.js';

export interface GravityCastMember {
    id: string;
    name?: string;
    /** public role tags — the same gating drama uses (publicTagsWithRole). */
    tags?: string[];
    /** current scene, or undefined when off-stage / unknown. */
    sceneId?: string;
}

/**
 * Compute each pulled character's attractor scene from the live ledger. Uses the
 * SAME `defaultDesiresForCast` gating as the drama engine, so the people the
 * move phase draws together are exactly the ones who would feel tension over the
 * resource. Returns characterId → attractor sceneId (may equal the current scene
 * = "stay"). Resources on cooldown / already held are excluded by gravity-core.
 */
export function computeGravityTargets(
    resources: ResourceSnapshot[],
    cast: GravityCastMember[],
): Map<string, string> {
    const sceneByChar = new Map<string, string>();
    for (const c of cast) if (c.sceneId) sceneByChar.set(c.id, c.sceneId);

    const contendersByResource = new Map<string, string[]>();
    const heldByChar = new Map<string, Set<string>>();
    const castSize = cast.length;

    for (const c of cast) {
        const specs = defaultDesiresForCast(resources, castSize, {
            agentName: c.name,
            agentTags: c.tags,
        });
        for (const spec of specs) {
            for (const claim of spec.claims) {
                const r = resources.find((x) => x.id === claim.ref);
                if (!r) continue;
                const list = contendersByResource.get(r.id);
                if (list) list.push(c.id);
                else contendersByResource.set(r.id, [c.id]);
                if ((r.allocations[c.id] ?? 0n) > 0n) {
                    const held = heldByChar.get(c.id) ?? new Set<string>();
                    held.add(r.id);
                    heldByChar.set(c.id, held);
                }
            }
        }
    }

    return gravityTargetsForContenders({ sceneByChar, contendersByResource, heldByChar });
}
