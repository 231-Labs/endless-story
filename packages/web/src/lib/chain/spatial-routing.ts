/**
 * Spatial routing — the world's time/space substrate (research §2.50).
 *
 * Each character has a HOME scene (residence). At night the router places awake
 * characters: tired → go to your OWN home; a strong enough pull toward someone
 * ELSE only wins if that someone is home and their home's owner WELCOMES you.
 * Privacy (two people alone in a private room) therefore EMERGES — nobody is barred
 * by a wall; people simply don't go where they aren't wanted, and at night that means
 * their own home. By DAY the router stays silent and the LLM `decideMove` keeps agency.
 *
 * Two decoupled sims validated this (§2.50): `spatial-dispersal.ts` (abstract) and
 * `spatial-dispersal-graph.ts` (real relationship graph + privacy_level + homeSceneId).
 * This module is the runner-side port of that logic — pure, injected, unit-tested.
 *
 * NOT on chain, NOT via chamber (chamber is the user's collection space). The
 * character→home map is off-chain runner config, seeded at bootstrap or by a harness.
 */

// ─── home-scene resolver (off-chain runner config) ───────────────────────────
const homeByCharacter = new Map<string, string>();

/** Assign one character's residence scene. */
export function setHomeScene(characterId: string, sceneId: string): void {
    homeByCharacter.set(characterId, sceneId);
}
/** Bulk-assign residences (bootstrap / harness). */
export function setHomeScenes(entries: Iterable<readonly [string, string]>): void {
    for (const [c, s] of entries) homeByCharacter.set(c, s);
}
export function getHomeScene(characterId: string): string | undefined {
    return homeByCharacter.get(characterId);
}
/** Reset (tests / harness isolation). */
export function clearHomeScenes(): void {
    homeByCharacter.clear();
}

// ─── the router ──────────────────────────────────────────────────────────────
export interface RoutingActor {
    id: string;
    /** Current scene id (from scene.currentCharacterIds). */
    sceneId: string;
    /** Resolved residence — the caller guarantees this is set (fallback = current scene). */
    homeSceneId: string;
    /** 0..1 tiredness; the tireder, the stronger the pull home. Default 0.4. */
    fatigue?: number;
    /** Already settled/asleep this night — leave in place. */
    asleep?: boolean;
    /** Who this character is drawn toward, and how strongly (0..1). From plan/relationship. */
    pursue?: { id: string; w: number };
}

export interface RoutingSceneInfo {
    id: string;
    /** On-chain SceneAccess.privacy_level (0 public … 5 fully private). */
    privacyLevel: number;
}

export interface SpatialRoutingOpts {
    /** privacyLevel ≥ this ⇒ a private home (visits need a welcome). Default 3. */
    privateThreshold?: number;
    /** Home pull = fatigue × homeW + (night ? nightHomeBias : 0). */
    homeW?: number;
    nightHomeBias?: number;
    /** Pursuit pull = pursue.w × bondW × propriety. */
    bondW?: number;
}

/**
 * Compute each awake character's night destination. Returns a `characterId → sceneId`
 * map containing ONLY the characters the router has a structural opinion about — at
 * night, that's everyone awake; by day the map is EMPTY (defer to the LLM). The caller
 * applies these like `gravityTargets` (override the move decision).
 *
 * `welcome(hostId, visitorId)` = does the home's owner warmly welcome this visitor (0..1)?
 * Read from the directed relationship graph (warm tone edge).
 *
 * Two rules keep a MUTUALLY-in-love pair from oscillating (both pursue each other with
 * symmetric weight ⇒ they'd swap homes every tick and never meet):
 *   1. **Night follow-into-home only.** At night you only follow someone into a home
 *      you're WELCOMED into (or your own). Chasing them into a public scene, or into a
 *      home whose owner doesn't want you, scores 0 — so home wins and you disperse.
 *   2. **Sequential resolution.** Actors resolve in order; a later actor sees where the
 *      earlier ones just committed. So one of the pair reaches their home first (anchors,
 *      since their partner is still in public ⇒ pursuit scores 0 ⇒ home), and the other
 *      then sees them home-and-welcoming ⇒ follows. The pair converges to one private
 *      room in a single tick, with no per-character disposition weights needed.
 */
export function computeSpatialRouting(
    actors: readonly RoutingActor[],
    scenes: readonly RoutingSceneInfo[],
    night: boolean,
    welcome: (hostId: string, visitorId: string) => number,
    opts: SpatialRoutingOpts = {},
): Map<string, string> {
    const targets = new Map<string, string>();
    if (!night) return targets; // day = LLM agency; the router only imposes the night layer

    const priv = opts.privateThreshold ?? 3;
    const homeW = opts.homeW ?? 1;
    const bondW = opts.bondW ?? 1;
    const nightHomeBias = opts.nightHomeBias ?? 0.2;

    const privacyById = new Map(scenes.map((s) => [s.id, s.privacyLevel]));
    const isPrivate = (sceneId: string): boolean => (privacyById.get(sceneId) ?? 0) >= priv;
    // homeSceneId → owner id (whose residence it is)
    const ownerOfHome = new Map<string, string>();
    for (const a of actors) if (a.homeSceneId) ownerOfHome.set(a.homeSceneId, a.id);
    // live positions — updated as each actor commits, so followers see anchors (rule 2)
    const posByActor = new Map(actors.map((a) => [a.id, a.sceneId]));

    for (const a of actors) {
        if (a.asleep) continue; // already settled — don't wander
        const homePull = (a.fatigue ?? 0.4) * homeW + nightHomeBias;
        const cands: Array<{ scene: string; w: number }> = [{ scene: a.homeSceneId, w: homePull }];

        if (a.pursue) {
            const tScene = posByActor.get(a.pursue.id);
            if (tScene) {
                // rule 1: at night, only a home you're welcomed into (or your own) draws you;
                // a public scene or an unwelcoming home scores 0 ⇒ you go home instead.
                let propriety = 0;
                if (tScene === a.homeSceneId) propriety = 1;
                else if (isPrivate(tScene)) {
                    const owner = ownerOfHome.get(tScene);
                    propriety = owner ? welcome(owner, a.id) : 0;
                }
                cands.push({ scene: tScene, w: a.pursue.w * bondW * propriety });
            }
        }

        cands.sort((x, y) => y.w - x.w);
        const chosen = cands[0].scene;
        targets.set(a.id, chosen);
        posByActor.set(a.id, chosen); // commit (rule 2)
    }
    return targets;
}
