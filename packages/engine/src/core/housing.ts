/**
 * Housing — the single home for the 房產/租約/實體鑰匙 (property / lease / physical
 * key) mechanism: 擁有權 (ownership / deed) separated from 使用權 (use-right /
 * holding a key).
 *
 * 屋主 (owner) holds the deed of a private dwelling whether or not they live in
 * it; 租客 (tenant) lives in (homeByChar) a scene they do NOT own and holds a
 * STANDING key — 一把帶在身上的門鑰, a real physical OBJECT that names its lock
 * (`WorldObject.keyFor`). This stage seeds a housing-STABLE opening: everyone
 * already housed, owners own by deed, tenants hold a standing key. NO money flows
 * (rent is a later stage) — conservation is untouched.
 *
 * Pure data, no I/O and no LLM: it only sets `propertyOwners`, grants standing
 * keys and mints key objects on the WorldState. Throws loudly with `[housing]`-
 * prefixed messages (like the `[economy]` module) so a mis-authored deed fails at
 * seed time rather than drifting silently.
 */

import type { WorldObject, WorldState } from '../world-state.ts';

/** A resolved property declaration: a private dwelling's 屋主 (deed) and, when
 *  let, its 租客 (lease — holds a physical key + standing use-right). Names are
 *  resolved against the cast/scenes at seed time. */
export interface PropertyDecl {
    /** The private dwelling (privacyLevel ≥ 3), by scene name. */
    sceneName: string;
    /** The 屋主(s) who hold the deed, by character name. */
    ownerNames: string[];
    /** When present, the dwelling is let: the 租客 lives here (homeByChar) and is
     *  handed a standing key object. */
    lease?: { tenantName: string; keyObjectId: string; keyLabel?: string };
}

/**
 * Seed the property/lease/key opening onto `world` from resolved declarations.
 * Deterministic: sets each dwelling's deed (`propertyOwners`), and for a let
 * dwelling grants the tenant a STANDING key and mints the physical key object.
 * Owner-occupied entries just record the deed — an owner enters by deed, no key.
 */
export function seedHousing(world: WorldState, decls: PropertyDecl[]): void {
    for (const decl of decls) {
        // ── resolve the dwelling — a deed only means something for a private space ──
        const scene = world.data.scenes.find((candidate) => candidate.name === decl.sceneName);
        if (!scene) throw new Error(`[housing] property references unknown scene: ${decl.sceneName}`);
        if (scene.privacyLevel < 3) {
            throw new Error(`[housing] scene "${decl.sceneName}" is not a private dwelling (privacyLevel ${scene.privacyLevel} < 3)`);
        }

        // ── resolve the 屋主 (deed) ──────────────────────────────────────────────
        const ownerIds = decl.ownerNames.map((name) => {
            const id = world.idByName(name);
            if (!id) throw new Error(`[housing] property "${decl.sceneName}" names unknown owner: ${name}`);
            return id;
        });
        (world.data.propertyOwners ??= {})[scene.id] = ownerIds;

        if (!decl.lease) continue; // owner-occupied — deed recorded, no key object

        // ── resolve the 租客 (lease) — must actually dwell in the leased scene ─────
        const { tenantName, keyObjectId, keyLabel } = decl.lease;
        const tenantId = world.idByName(tenantName);
        if (!tenantId) throw new Error(`[housing] lease of "${decl.sceneName}" names unknown tenant: ${tenantName}`);
        if (world.data.homeByChar[tenantId] !== scene.id) {
            throw new Error(
                `[housing] tenant ${tenantName} does not dwell in leased scene "${decl.sceneName}" ` +
                    `(homeByChar=${world.data.homeByChar[tenantId] ?? '∅'}); a stable start means the preset already housed them there`,
            );
        }
        if (world.objectById(keyObjectId)) throw new Error(`[housing] key object ${keyObjectId} already exists`);

        // the tenant holds a STANDING use-right (使用權 without 擁有權). grantAccess
        // reads the now deed-aware ownersOf — the deed was set above, so the tenant
        // reads as a GUEST (not owner) and the standing grant lands.
        world.grantAccess(scene.id, tenantId, 'standing');

        // the key made physical: a portable OBJECT carried by the tenant, naming
        // its lock via `keyFor`. Known to the tenant and the owner(s).
        const label = keyLabel ?? `${decl.sceneName}的鑰匙`;
        const key: WorldObject = {
            id: keyObjectId,
            label,
            aliases: [...new Set([label, '鑰匙'])],
            sceneId: world.data.roster[tenantId],
            portable: true,
            visibility: 'visible',
            carriedBy: tenantId,
            keyFor: scene.id,
            state: `${decl.sceneName}的門鑰，一直帶在身上`,
            version: 0,
            knownBy: [tenantId, ...ownerIds],
        };
        (world.data.objects ??= []).push(key);
    }
}
