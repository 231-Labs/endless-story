/**
 * Spatial routing — night-time placement substrate (§2.50). Tired characters go to
 * their own home; following someone into a private home needs the owner's welcome,
 * so privacy EMERGES. By day the router is silent and the LLM keeps agency.
 * Character→home map is off-chain runner config, seeded at bootstrap or by a harness.
 */

const homeByCharacter = new Map<string, string>();

export function setHomeScene(characterId: string, sceneId: string): void {
    homeByCharacter.set(characterId, sceneId);
}
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

/** Daytime work anchors (G11) — where a character's 崗位 is. The morning router
 *  disperses the cast to these, mirroring the night pull toward homes. */
const workByCharacter = new Map<string, string>();

export function setWorkScenes(entries: Iterable<readonly [string, string]>): void {
    for (const [c, s] of entries) workByCharacter.set(c, s);
}
export function getWorkScene(characterId: string): string | undefined {
    return workByCharacter.get(characterId);
}
export function clearWorkScenes(): void {
    workByCharacter.clear();
}

export interface RoutingActor {
    id: string;
    sceneId: string;
    /** Caller guarantees this is set (fallback = current scene). */
    homeSceneId: string;
    /** 0..1; the tireder, the stronger the pull home. Default 0.4. */
    fatigue?: number;
    /** Already settled this night — leave in place. */
    asleep?: boolean;
    /** Drawn toward whom, and how strongly (0..1). `intrude` = jealousy-driven:
     *  follows the target into an unwelcoming home uninvited (撞破 material). */
    pursue?: { id: string; w: number; intrude?: boolean };
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
 * Night destinations for awake characters (`characterId → sceneId`); EMPTY by day
 * (defer to the LLM). `welcome(hostId, visitorId)` = warm directed edge (0..1).
 * Two rules stop a mutually-in-love pair from oscillating:
 *   1. At night pursuit only scores into a home you're WELCOMED into (or your own);
 *      public scenes and unwelcoming homes score 0, so home wins and you disperse.
 *   2. Actors resolve sequentially and see earlier commitments, so one anchors home
 *      and the other follows — the pair converges to one private room in a single tick.
 */
export function computeSpatialRouting(
    actors: readonly RoutingActor[],
    scenes: readonly RoutingSceneInfo[],
    night: boolean,
    welcome: (hostId: string, visitorId: string) => number,
    opts: SpatialRoutingOpts = {},
): Map<string, string> {
    const targets = new Map<string, string>();
    if (!night) return targets; // day: defer to the LLM

    const priv = opts.privateThreshold ?? 3;
    const homeW = opts.homeW ?? 1;
    const bondW = opts.bondW ?? 1;
    const nightHomeBias = opts.nightHomeBias ?? 0.2;

    const privacyById = new Map(scenes.map((s) => [s.id, s.privacyLevel]));
    const isPrivate = (sceneId: string): boolean => (privacyById.get(sceneId) ?? 0) >= priv;
    const ownerOfHome = new Map<string, string>();
    for (const a of actors) if (a.homeSceneId) ownerOfHome.set(a.homeSceneId, a.id);
    // Live positions, updated as each actor commits (rule 2).
    const posByActor = new Map(actors.map((a) => [a.id, a.sceneId]));

    for (const a of actors) {
        if (a.asleep) continue;
        const homePull = (a.fatigue ?? 0.4) * homeW + nightHomeBias;
        const cands: Array<{ scene: string; w: number }> = [{ scene: a.homeSceneId, w: homePull }];

        if (a.pursue) {
            const tScene = posByActor.get(a.pursue.id);
            if (tScene) {
                // Rule 1: only a welcomed home (or your own) draws you at night.
                let propriety = 0;
                if (tScene === a.homeSceneId) propriety = 1;
                else if (isPrivate(tScene)) {
                    const owner = ownerOfHome.get(tScene);
                    // Jealous intrusion asks nobody's leave — that is the point.
                    propriety = a.pursue.intrude ? 1 : owner ? welcome(owner, a.id) : 0;
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
