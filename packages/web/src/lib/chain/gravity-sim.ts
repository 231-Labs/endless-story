/**
 * Gravity simulation — a pure, deterministic dynamical-systems harness that
 * embeds `gravity-core` in a minimal contention environment, so we can PROVE (by
 * simulation over many seeds + by the analytic argument below) that the
 * attraction rule:
 *
 *   (1) ATTRACTS — scattered contenders of an active resource converge into one
 *       scene and reach quorum;
 *   (2) SETTLES — once co-located they resolve (someone seizes the resource);
 *   (3) DISPERSES — after a resolution the resource exerts NO more pull, so the
 *       cohesive force vanishes and ordinary idle motion scatters them again.
 *
 * No chain, no LLM. The ENVIRONMENT (the parts NOT under test) is kept
 * deliberately simple and *neutral* so dispersal is not smuggled in:
 *
 *   - A agents, S scenes, complete graph (an agent moves to any scene in one hop,
 *     matching the live move phase which picks a target scene directly).
 *   - R resources, capacity 1, each with a fixed contender set; after a
 *     resolution a resource is HELD + LOCKED for `lockTicks`, and every LOSER's
 *     tension decays by `loseCool` ("demand moves on" — the matter is settled
 *     for now). These two relief terms are what make a contest END; the last
 *     test turns them OFF to show a ≥3-way rivalry then glues permanently.
 *   - tension(i,r) rises by `tensionRise` each unlocked tick for a non-holding
 *     contender; the holder's is 0.
 *   - movement: gravity-core's `gravityTarget` when something pulls; otherwise an
 *     UNBIASED idle random walk (jump to a uniform-random scene w.p. `wander`,
 *     else stay). The idle rule is NOT engineered to disperse — on a complete
 *     graph a random walk merely *mixes*, so any dispersal we observe is because
 *     the cohesive pull is gone, not because idle agents are pushed apart.
 *
 * ── Analytic argument the simulation backs ──────────────────────────────────
 * Convergence: while resource r is active, define Φ_r = (#contenders of r) −
 * (#contenders of r in attractorScene). Every contender computes the SAME target
 * = the current plurality scene P. Movers all step INTO P, so the count in P is
 * non-decreasing and Φ_r is non-increasing; P stays the plurality (its lead only
 * grows), so the target never flips — Φ_r ↓ 0, i.e. all contenders end up in one
 * scene (quorum). The full cluster is a fixed point: with everyone in P,
 * gravityTarget = P for all → nobody leaves.
 * Transience: resolution sets r LOCKED, so its ActiveDesire disappears →
 * gravityTarget contributes nothing for r. The cluster is therefore a TRANSIENT
 * attractor, never an absorbing state: with the pull gone the only remaining
 * dynamics is the mixing idle walk, which drives occupancy back toward uniform.
 * Hence the mechanism cannot, by itself, glue agents anywhere permanently —
 * provided lockTicks ≥ 1 (gravity-sim.test.ts shows lockTicks = 0 is the failure
 * mode, so a post-resolution cooldown is the design requirement).
 */

import { gravityTarget, type ActiveDesire } from './gravity-core.ts';

export interface ResourceSpec {
    id: string;
    /** agent ids that contend for this capacity-1 resource. */
    contenders: string[];
}

export interface SimConfig {
    agentIds: string[];
    sceneIds: string[];
    resources: ResourceSpec[];
    /** co-located contenders needed to stage an event (default 2). */
    minCast: number;
    /** consecutive co-located ticks before the event resolves (default 2). */
    linger: number;
    /** tension gained per unlocked tick by a non-holding contender (default 0.34). */
    tensionRise: number;
    /** ticks a resource stays held+inert after resolving (default 3). */
    lockTicks: number;
    /** tension threshold that makes a desire "pull" (default 0.4). */
    threshold: number;
    /** on a loss, a non-winning contender's tension is multiplied by (1-loseCool)
     *  — "demand moves on": the loser accepts defeat for now and stops being
     *  pulled, until tension rebuilds. The lever that prevents ≥3-way rivalries
     *  from gluing (default 0.85). */
    loseCool: number;
    /** idle agents jump to a uniform-random scene with this prob (default 0.5). */
    wander: number;
    seed: number;
}

export const defaultConfig = (over: Partial<SimConfig> = {}): SimConfig => ({
    agentIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    sceneIds: ['s0', 's1', 's2', 's3'],
    resources: [
        { id: 'spotlight', contenders: ['a', 'b'] },
        { id: 'recording', contenders: ['c', 'd'] },
    ],
    minCast: 2,
    linger: 2,
    tensionRise: 0.2,
    // the settlement must STAND long enough for cooled losers' demand to be
    // elsewhere when the resource re-opens; too short and a ≥3-way slot thrashes
    // (re-seized every few ticks) → the contenders never disperse.
    lockTicks: 6,
    threshold: 0.4,
    loseCool: 0.85,
    wander: 0.5,
    seed: 1,
    ...over,
});

/** Deterministic PRNG (mulberry32) so every run is reproducible from `seed`. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface TickMetrics {
    /** max agents in any one scene, this tick (raw clustering signal). */
    maxOccupancy: number;
    /** TRUE when ≥ minCast non-holder contenders of an active resource are
     *  co-located — the mechanism-relevant cluster (ignores random idle
     *  co-location). This is what must be TRANSIENT, never permanent. */
    contentionCluster: boolean;
    /** resources that resolved this tick. */
    resolved: string[];
    /** unlocked (active) resources this tick. */
    active: number;
}

export interface SimState {
    cfg: SimConfig;
    rand: () => number;
    t: number;
    scene: Map<string, string>;
    tension: Map<string, number>; // `${agent}|${res}`
    holder: Map<string, string | null>;
    locked: Map<string, number>;
    streak: Map<string, number>;
    history: TickMetrics[];
}

const tkey = (a: string, r: string) => `${a}|${r}`;

export function initState(cfg: SimConfig): SimState {
    const rand = rng(cfg.seed);
    const scene = new Map<string, string>();
    for (const a of cfg.agentIds) {
        scene.set(a, cfg.sceneIds[Math.floor(rand() * cfg.sceneIds.length)]);
    }
    const tension = new Map<string, number>();
    const holder = new Map<string, string | null>();
    const locked = new Map<string, number>();
    const streak = new Map<string, number>();
    for (const r of cfg.resources) {
        holder.set(r.id, null);
        locked.set(r.id, 0);
        streak.set(r.id, 0);
        for (const a of r.contenders) tension.set(tkey(a, r.id), cfg.threshold); // start tense
    }
    return { cfg, rand, t: 0, scene, tension, holder, locked, streak, history: [] };
}

/** Advance one tick; returns this tick's metrics (and records them in history). */
export function step(st: SimState): TickMetrics {
    const { cfg } = st;
    const resolved: string[] = [];

    // 1. tension rises for non-holders of UNLOCKED resources.
    let active = 0;
    for (const r of cfg.resources) {
        if ((st.locked.get(r.id) ?? 0) > 0) continue;
        active++;
        for (const a of r.contenders) {
            if (st.holder.get(r.id) === a) {
                st.tension.set(tkey(a, r.id), 0);
            } else {
                const cur = st.tension.get(tkey(a, r.id)) ?? 0;
                st.tension.set(tkey(a, r.id), Math.min(1, cur + cfg.tensionRise));
            }
        }
    }

    // 2. movement: gravity pull, else an unbiased idle random walk.
    for (const a of cfg.agentIds) {
        const here = st.scene.get(a)!;
        const desires: ActiveDesire[] = [];
        for (const r of cfg.resources) {
            if ((st.locked.get(r.id) ?? 0) > 0) continue;
            if (!r.contenders.includes(a)) continue;
            if (st.holder.get(r.id) === a) continue;
            const tension = st.tension.get(tkey(a, r.id)) ?? 0;
            desires.push({
                resourceId: r.id,
                tension,
                contenderScenes: r.contenders.map((x) => st.scene.get(x)!),
            });
        }
        const target = gravityTarget(here, desires, cfg.threshold);
        if (target) {
            if (target !== here) st.scene.set(a, target);
        } else if (st.rand() < cfg.wander) {
            st.scene.set(a, cfg.sceneIds[Math.floor(st.rand() * cfg.sceneIds.length)]);
        }
    }

    // 3. resolution: a quorum of co-located contenders, held for `linger`, settles.
    let contentionCluster = false;
    for (const r of cfg.resources) {
        if ((st.locked.get(r.id) ?? 0) > 0) continue;
        const bySceneCount = new Map<string, string[]>();
        for (const a of r.contenders) {
            if (st.holder.get(r.id) === a) continue;
            const s = st.scene.get(a)!;
            (bySceneCount.get(s) ?? bySceneCount.set(s, []).get(s)!).push(a);
        }
        let quorumScene: string | null = null;
        let quorumAgents: string[] = [];
        for (const [s, ags] of bySceneCount) {
            if (ags.length >= cfg.minCast && ags.length > quorumAgents.length) {
                quorumScene = s;
                quorumAgents = ags;
            }
        }
        if (!quorumScene) {
            st.streak.set(r.id, 0);
            continue;
        }
        contentionCluster = true;
        const nextStreak = (st.streak.get(r.id) ?? 0) + 1;
        st.streak.set(r.id, nextStreak);
        if (nextStreak >= cfg.linger) {
            // winner = highest-tension present contender (deterministic tiebreak by id).
            let winner = quorumAgents[0];
            let best = -1;
            for (const a of quorumAgents) {
                const tn = st.tension.get(tkey(a, r.id)) ?? 0;
                if (tn > best || (tn === best && a < winner)) {
                    best = tn;
                    winner = a;
                }
            }
            st.holder.set(r.id, winner);
            st.tension.set(tkey(winner, r.id), 0);
            // "demand moves on": every other contender cools after the loss, so a
            // multi-way rivalry isn't pulled straight back together (the lever
            // that prevents ≥3-way permanent glue).
            for (const a of r.contenders) {
                if (a === winner) continue;
                st.tension.set(tkey(a, r.id), (st.tension.get(tkey(a, r.id)) ?? 0) * (1 - cfg.loseCool));
            }
            st.locked.set(r.id, cfg.lockTicks);
            st.streak.set(r.id, 0);
            resolved.push(r.id);
        }
    }

    // 4. decrement locks (resource re-activates after the cooldown).
    for (const r of cfg.resources) {
        const l = st.locked.get(r.id) ?? 0;
        if (l > 0) st.locked.set(r.id, l - 1);
    }

    // 5. metrics.
    const occ = new Map<string, number>();
    for (const a of cfg.agentIds) occ.set(st.scene.get(a)!, (occ.get(st.scene.get(a)!) ?? 0) + 1);
    const maxOccupancy = Math.max(...occ.values());
    const m: TickMetrics = { maxOccupancy, contentionCluster, resolved, active };
    st.history.push(m);
    st.t++;
    return m;
}

export function run(cfg: SimConfig, ticks: number): SimState {
    const st = initState(cfg);
    for (let i = 0; i < ticks; i++) step(st);
    return st;
}

/* ── derived metrics over a finished run ──────────────────────────────────── */

/** Tick index of the first time `minCast` contenders of ANY resource co-located
 *  long enough to resolve — i.e. attraction produced an event. -1 if never. */
export function firstResolveTick(st: SimState): number {
    return st.history.findIndex((h) => h.resolved.length > 0);
}

export function totalResolutions(st: SimState): number {
    return st.history.reduce((n, h) => n + h.resolved.length, 0);
}

/** Longest run of consecutive ticks holding a CONTENTION cluster. Bounded ⇒ each
 *  cluster is transient (forms→resolves→disperses); ≈ horizon ⇒ permanent glue. */
export function longestClusterRun(st: SimState): number {
    let run = 0;
    let best = 0;
    for (const h of st.history) {
        if (h.contentionCluster) best = Math.max(best, (run += 1));
        else run = 0;
    }
    return best;
}

/** Fraction of ticks with NO contention cluster — the contest has dissolved. */
export function dispersedFraction(st: SimState): number {
    const n = st.history.filter((h) => !h.contentionCluster).length;
    return n / Math.max(1, st.history.length);
}

/** How many separate cluster EPISODES occurred (false→true transitions). >1 ⇒ a
 *  limit cycle (form → resolve → disperse → re-form), not one frozen clump. */
export function clusterEpisodes(st: SimState): number {
    let episodes = 0;
    let prev = false;
    for (const h of st.history) {
        if (h.contentionCluster && !prev) episodes++;
        prev = h.contentionCluster;
    }
    return episodes;
}
