/**
 * Spatial routing — night-time placement substrate (§2.50). Tired characters go to
 * their own home; following someone into a private home needs the owner's welcome,
 * so privacy EMERGES. By day the router is silent and the LLM keeps agency.
 * Character→home map is off-chain config seeded at founding; durable via the
 * `web/data/*.json` file-store pattern (want-store.ts) — an in-memory-only map
 * silently no-op'd night routing after every server restart.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const HOME_STORE_PATH = path.join(DATA_DIR, 'home-scenes.json');

/** characterId → home sceneId. */
type HomeSceneFile = Record<string, string>;

let homeCache: HomeSceneFile | null = null;

function loadHomes(): HomeSceneFile {
    if (homeCache) return homeCache;
    try {
        homeCache = JSON.parse(fs.readFileSync(HOME_STORE_PATH, 'utf-8')) as HomeSceneFile;
    } catch {
        homeCache = {};
    }
    return homeCache;
}

function saveHomes(all: HomeSceneFile): void {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(HOME_STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[spatial-routing] home save failed:', err instanceof Error ? err.message : err);
    }
}

export function setHomeScene(characterId: string, sceneId: string): void {
    const all = loadHomes();
    all[characterId] = sceneId;
    saveHomes(all);
}
export function setHomeScenes(entries: Iterable<readonly [string, string]>): void {
    const all = loadHomes();
    for (const [c, s] of entries) all[c] = s;
    saveHomes(all);
}
export function getHomeScene(characterId: string): string | undefined {
    return loadHomes()[characterId];
}
/** Reset cache AND file (tests / harness isolation). */
export function clearHomeScenes(): void {
    homeCache = {};
    saveHomes(homeCache);
}
/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetHomeSceneCache(): void {
    homeCache = null;
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
 *      An INTRUDING pursuit (jealousy / a breaking want) is a compulsion — it
 *      overrides tiredness and always beats the pull home.
 *   2. Live positions START at each actor's HOME (their night anchor), not their
 *      daytime scene, so following is order-independent: a pursuer aims where the
 *      pursued will BE at night, and 撞破 still follows an earlier committed move.
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
    // Live positions START at each actor's night anchor (home), not the daytime
    // scene — so a pursuer sees the pursued where they'll actually be (rule 2).
    const posByActor = new Map(actors.map((a) => [a.id, a.homeSceneId]));

    for (const a of actors) {
        if (a.asleep) continue;
        // Softened so a strong warm bond can beat the pull home (was fatible of
        // exceeding the max pursuit weight at high night fatigue → home always won).
        const homePull = (a.fatigue ?? 0.4) * homeW * 0.6 + nightHomeBias;
        const cands: Array<{ scene: string; w: number }> = [{ scene: a.homeSceneId, w: homePull }];

        if (a.pursue) {
            const tScene = posByActor.get(a.pursue.id);
            if (tScene && tScene !== a.homeSceneId) {
                // Rule 1: only a welcomed private home (or an intrusion) draws you.
                let propriety = 0;
                if (isPrivate(tScene)) {
                    const owner = ownerOfHome.get(tScene);
                    propriety = a.pursue.intrude ? 1 : owner ? welcome(owner, a.id) : 0;
                }
                // An intrusion is a compulsion: it overrides tiredness (homePull),
                // never merely competes with it — else high night fatigue buries it.
                const w = a.pursue.intrude
                    ? homePull + a.pursue.w
                    : a.pursue.w * bondW * propriety;
                if (propriety > 0) cands.push({ scene: tScene, w });
            }
        }

        cands.sort((x, y) => y.w - x.w);
        const chosen = cands[0].scene;
        targets.set(a.id, chosen);
        posByActor.set(a.id, chosen); // commit (rule 2)
    }
    return targets;
}
