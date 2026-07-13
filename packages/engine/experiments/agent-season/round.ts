/**
 * AGENT-SEASON · 時辰-ROUND LOOP (the clean core).
 * ============================================================================
 * The clock is a 時辰-ROUND clock, NOT one-tick-per-character. Each of the 6 時辰
 * of a day is a ROUND:
 *   (a) determine which characters are ACTIVE this 時辰 (occupation-rhythm + the
 *       班主's standing rehearsal call + a hot-want override + health);
 *   (b) PLACE them — each active character is an AGENT: it PLANS (grounded in the
 *       current 時辰 via a time query, its rhythm, wants, self-model, recall,
 *       who's present) and executes move/recall, stashing any interact intent;
 *   (c) form co-present GROUPS per venue;
 *   (d) run CONCURRENT scenes at each active venue (interact → runSceneLoop);
 *   (e) WEAVE the 時辰's PUBLIC scenes into one 章回 ("與此同時，那廂…");
 *   (f) advance to the next 時辰.
 * EMPTY 時辰 (nobody active/awake) FAST-FORWARD with a one-line 過場.
 *
 * Intimacy is RELATIONSHIP-DEPENDENT: established lovers (柳×金鳳, carnal history
 * in seed) escalate to a real bed scene alone in a private venue at night
 * (consummate); forbidden/unconfessed pairs (柳×蘇) stay restrained (high
 * resistance). Every scene's OUTCOME propagates to ALL participants (ledgers,
 * addressed-today, reciprocal want settlement) — a settled debt never re-plans.
 * 深宵 = scheduled night consolidation (self-model overwrite + living-want
 * self-rewrite + reflect) for everyone, then per-day reset.
 */

import {
    LocalClock,
    makeClock,
    runSceneLoop,
    decayWants,
    tension,
    applyRewrite,
    spawnWant,
    type Want,
    type WorldClock,
    type PartOfDay,
    type SceneLoopCastMember,
    type RecallPort,
    type SceneAgentPort,
} from '../../src/index.ts';
import {
    type Char,
    areEstablishedLovers,
    isFoodVenue,
    isPublicVenue,
    knowsRoutine,
    venueByName,
    VENUES,
    WORLD_PREMISE,
    buildDormants,
    dormantPresent,
    type DormantChar,
} from './world.ts';
import {
    rhythmPull,
    activeVenues,
    isDeepNight,
    isNightPart,
    predictWhereabouts,
    sameCluster,
    type RehearsalCall,
    transitStreets,
    occLabel,
} from './rhythm.ts';

/** FOLLOWED characters (追角): comma-separated names whose scenes ALSO get a
 *  first-person POV rendering (the subscriber-gated subjective layer). */
const POV_CHARS = new Set(
    (process.env.SEASON_POV_CHARS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);

/** How many 時辰 a character will POST UP waiting for someone before giving up. */
const WAIT_PATIENCE = 2;
/** A scene this many beats or longer is a LONG/deep scene — it EATS the whole 時辰 and
 *  SPENDS its participants for the rest of the day (opportunity cost's teeth). */
export const OCCUPY_BEATS = 10;
import {
    applyRoundHealth,
    bodyLine,
    eat,
    ECON,
    HEALTH,
    HOME_MEAL_COST,
    HUNGER_FELT,
    HUNGER_STARVING,
    MEAL_COST,
} from './health.ts';

/** Where (and at what price) this character can eat RIGHT NOW: the food venue they
 *  stand at, a food venue in the same cluster (順路), or a cheaper 家常 meal at their
 *  own home. null = no reachable meal this 時辰 (geography, not poverty). Pure. */
function mealSpotFor(c: Char): { line: string; cost: number } | null {
    if (isFoodVenue(c.venue)) return { line: `在 ${c.venue} 攤子上吃了點東西`, cost: MEAL_COST };
    const nearby = VENUES.find((v) => isFoodVenue(v.name) && sameCluster(v.name, c.venue));
    if (nearby) return { line: `順路到 ${nearby.name} 打了個尖`, cost: MEAL_COST };
    if (c.venue === c.homeVenue) return { line: `在${c.venue}自己弄了口家常吃食`, cost: HOME_MEAL_COST };
    return null;
}
import { hottest, type Planner, type ToolCall } from './agent-turn.ts';
import { pronounFromBody } from '@endless-story/runner/services/character-agent/beat-prompt';
import { bumpActorFatigue, pickOrthogonalThreads, decayActorFatigue, type FatigueLedger } from '../../src/index.ts';
import { isBondLayer } from '../../src/core/want-core.ts';
import { CANON } from './canon-seed.ts';
import { bondOf, bumpBond, decayBonds, advanceReady, seedBond, BOND, type BondGraph } from '../../src/core/bond-graph.ts';
import {
    type Play,
    PRODUCTION,
    abilityOf,
    accumulateEffort,
    addCast,
    bumpReputeFromEffort,
    bumpReputeFromScene,
    markPremiered,
    registerProposal,
} from './production.ts';
import { type BoxOffice, computeBoxOffice } from './box-office.ts';
import { type SeasonConfig, type Verdict, countdownLine, razor } from './showrunner.ts';
import { canEnter, isOwned, accessNote } from './access.ts';
import { computePerception, decayTraces, hearsScene, leaveTrace, type TraceStore } from './perception.ts';

// ── records ───────────────────────────────────────────────────────────────────
export interface SurfacedMemory {
    char: string;
    tag: string;
    text: string;
    /** 'plan' = surfaced in auto-recall before the plan; 'scene' = at scene time. */
    context: 'plan' | 'scene';
    /** the beat/plan it shaped (short). */
    shaped: string;
}

export interface SceneRecord {
    venue: string;
    day: number;
    part: string;
    isPublic: boolean;
    isPrivate: boolean;
    consummate: boolean;
    intimacyGate: boolean;
    participants: string[];
    participantIds: string[];
    /** An in-scene advance→accept happened here: the pair BECAME lovers in this
     *  scene (event, not verdict) — the caller records them as established. */
    intimacyAccepted?: boolean;
    /** POV versions (追角 lens): participant name → the scene retold through their
     *  eyes (probe-validated subjective layer). Only rendered for FOLLOWED
     *  characters (SEASON_POV_CHARS) — cost scales with subscribers. */
    povVersions?: Record<string, string>;
    /** Set when this scene was a 傾吐 (confide): the name of the one who unburdened.
     *  Only what they SAID ALOUD transferred into the listener's memory. */
    confideBy?: string;
    /** true → this scene is a 修羅場: a jealous third walked in on an intimate pair. */
    discovery?: boolean;
    /** true → this 修羅場 broke in on the STILL-WARM AFTERMATH of a pair spent by a recent
     *  deep 床戲 (≥1 participant occupiedRestOfDay): the stake + first beat frame it as
     *  catching them just-abed / still entangled, not a fresh unrelated encounter. */
    aftermath?: boolean;
    beats: Array<{ name: string; text: string; inner: string }>;
    /** This scene's OWN beats woven into a readable 章回 (說書人 prose). Set for EVERY
     *  rendered scene (public AND private/床/修羅場) so a reader gets a literary version,
     *  not just raw beats/dialogue. null/undefined if the weave failed (never fatal).
     *  ADDITIONAL to the per-時辰 PUBLIC weave (RoundRecord.chapter). */
    chapter?: string;
    resolved: string[];
}

export interface Placement {
    char: string;
    from: string;
    to: string;
    plan: string;
    tools: string[];
    autoRecall: string[];
    timeQueried: boolean;
    interactIntent: { target: string; intent: string; confide?: boolean } | null;
}

export interface RoundRecord {
    tick: number;
    day: number;
    part: string;
    night: boolean;
    fastForward: boolean;
    passLine?: string;
    activeVenues: string[];
    active: string[];
    placements: Placement[];
    scenes: SceneRecord[];
    /** venues with a RENDERED scene this 時辰 (multi-venue concurrency proof). */
    sceneVenues: string[];
    chapter: string | null;
    consolidations: Array<{ char: string; updated: string[] }>;
    deaths: string[];
}

export interface SeasonDeps {
    /** Dynamically-established pairs carried over from the prior season (pairKey =
     *  sorted ids joined '|'). The milestone judge adds to this set in play. */
    establishedPairs?: string[];
    cast: Char[];
    planner: Planner;
    agent: SceneAgentPort;
    recall: RecallPort;
    clockPort: LocalClock;
    log: (s?: string) => void;
    days: number;
    ticksPerDay: number;
    maxScenesPerRound: number;
    /** reh state (mutated as the 班主 calls rehearsal). */
    reh: RehearsalCall;
    /** the season's NEW PLAY (mutated additively as production accumulates). */
    play: Play;
    /** the立局人 config: central question, deadline day, finale part, razor threshold. */
    showrunner: SeasonConfig;
    /** Called at each day boundary with the tick just finished and the pairs
     *  established so far — the caller persists a CHECKPOINT snapshot, so a
     *  mid-season crash (a TCP reset once ate two days) loses at most a day. */
    checkpoint?: (endedTick: number, establishedPairs: string[]) => void;
    /** The world's dormant population (street vendors etc.) — real entities,
     *  never flavor strings. Defaults to buildDormants(). */
    dormants?: DormantChar[];
    /** the numeric relationship underlay (seeded from canon; persisted). */
    bonds?: BondGraph;
}

export interface SeasonResult {
    rounds: RoundRecord[];
    scenes: SceneRecord[];
    surfaced: SurfacedMemory[];
    reh: RehearsalCall;
    rehearsalGathering: Array<{ tick: number; part: string; venue: string; members: string[] }>;
    timeToolUses: number;
    deaths: string[];
    /** pairs promoted to established IN PLAY (persist via snapshotCast). */
    establishedPairs: string[];
    /** the dormant population as the season left it (ledgers + heat persist). */
    dormants: DormantChar[];
    /** the bond graph as the season left it. */
    bonds: BondGraph;
    /** the accumulated play at season end. */
    play: Play;
    /** the deterministic box office (null if the play never premiered). */
    boxOffice: BoxOffice | null;
    /** the 大會串 premiere scene (null if it never premiered). */
    premiere: SceneRecord | null;
    /** the ending razor verdict. */
    showrunnerVerdict: Verdict;
    /** count of 時辰 the deadline world-fact was injected into plan context. */
    deadlineInjections: number;
    /** every 修羅場 that fired this season (a jealous third caught an intimate pair). */
    discoveries: Array<{ tick: number; part: string; discoverer: string; pair: [string, string]; venue: string; brokeIn?: boolean; heard?: boolean }>;
    /** perception counters: how many plans got a positionally-gated snapshot injected, and
     *  how many 修羅場 fired via the NEW adjacent-hear path. */
    perceptionInjections: number;
    hearDiscoveries: number;
    /** opportunity-cost counters: plans that carried the finite-時辰 framing; long scenes
     *  that SPENT their participants; active-turns skipped because a character was spent. */
    oppCostFramings: number;
    longScenes: number;
    occupiedTurns: number;
    /** POV daily reflections — charId → the character's per-day first-person subjective
     *  account (the narrative-subjective layer a reader follows, separate from 章回). */
    povReflections: Record<string, Array<{ day: number; text: string }>>;
    /** self-check pass counters: rendered scenes reviewed / beats whose text changed. */
    reviewedScenes: number;
    reviewedBeatsChanged: number;
    /** chapter-level self-check counters: woven 章回 put through reviewChapter / chapters
     *  whose prose the review actually repaired (gender / pronoun / logic / anachronism). */
    reviewedChapters: number;
    repairedChapters: number;
    /** economy: charId → how many meals that character ate this season (at street venues). */
    meals: Record<string, number>;
}

// ── recall (with surfacing detection) ────────────────────────────────────────
/** Append-only episodic write (never throws into the loop). */
async function writeMem(recall: RecallPort, id: string, text: string, importance: number, day: number): Promise<void> {
    try {
        await recall.remember(id, text, { kind: 'observation', importance, day });
    } catch {
        /* recall is loud elsewhere; a single episodic write must not kill the round */
    }
}

function tagIndex(cast: Char[]): Map<string, Map<string, string>> {
    // charId → (memoryText → tag)
    const m = new Map<string, Map<string, string>>();
    for (const c of cast) {
        const t = new Map<string, string>();
        for (const mem of c.thickMemories) t.set(mem.text, mem.tag);
        m.set(c.id, t);
    }
    return m;
}

async function doRecall(
    c: Char,
    query: string,
    recall: RecallPort,
    day: number,
    tags: Map<string, Map<string, string>>,
    hotTarget: string | undefined,
    context: 'plan' | 'scene',
    shaped: string,
    surfacedOut: SurfacedMemory[],
): Promise<string[]> {
    let mems: Array<{ text: string }> = [];
    try {
        mems = await recall.recall(c.id, query, 3, day);
    } catch {
        return [];
    }
    const tmap = tags.get(c.id);
    for (const mem of mems) {
        const tag = tmap?.get(mem.text);
        // Surfacing = a HEADLINE memory (carnal/暗戀) that surfaced when it is
        // relevant (its subject is the current hot target).
        if (tag && (tag.startsWith('肌膚') || tag.startsWith('暗戀')) && hotTarget && tag.includes(hotTarget.slice(0, 1))) {
            surfacedOut.push({ char: c.name, tag, text: mem.text, context, shaped });
        }
    }
    return mems.map((m) => m.text);
}

// ── one interact → a rendered scene (outcome propagates to BOTH) ──────────────
function castMember(c: Char, others: Char[]): SceneLoopCastMember {
    const ties: Record<string, string> = {};
    for (const o of others) {
        const v = c.relationshipViews.get(o.id);
        if (v) ties[o.id] = v;
    }
    return {
        characterId: c.id,
        name: c.name,
        persona: c.persona,
        // The recalled history COLOURS the scene — carnal/暗戀 memories included.
        memories: c.thickMemories.slice().sort((a, b) => b.importance - a.importance).slice(0, 5).map((m) => m.text),
        innerSecret: c.secret,
        role: c.role,
        bodyFact: c.bodyFact, // 身/sex — feeds the gender-correct intimacy register (data, not name-cased)
        carried: c.carried.length ? c.carried : undefined,
        ties,
    };
}

/** Tiny deterministic hash of the clock label (soil rotation key — no RNG). */
function clockLabelHash(s: string): number {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}

/** Render the 追角 POV versions of a finished scene for FOLLOWED participants.
 *  Ties/soil come from the viewer's own graph + memories (never the reverse edge).
 *  Non-fatal: a failed render just skips that lens. */
async function renderPovVersions(
    agent: SceneAgentPort,
    participants: Char[],
    beats: Array<{ name: string; text: string }>,
    venue: string,
    clockLabel: string,
): Promise<Record<string, string> | undefined> {
    const followed = participants.filter((c) => POV_CHARS.has(c.name));
    if (!followed.length || !beats.length) return undefined;
    const out: Record<string, string> = {};
    for (const c of followed) {
        const others = participants.filter((o) => o.id !== c.id);
        const ties = others
            .map((o) => {
                const v = c.relationshipViews.get(o.id);
                return v ? `對${o.name}：${v}` : '';
            })
            .filter(Boolean)
            .join('\n');
        const names = others.map((o) => o.name).join('|');
        const soilRe = new RegExp(names ? `${names}|肌膚|暗戀` : '肌膚|暗戀');
        // Soil ROTATION (anti-anchoring): always keep the single most important
        // memory (the identity anchor), but rotate the remaining picks across the
        // sorted rest by scene time — W3 showed a fixed top-4 soil makes the same
        // thesis sentence echo through every one of a character's POV scenes.
        const sorted = c.thickMemories
            .filter((m) => soilRe.test(m.tag + m.text))
            .sort((a, b) => b.importance - a.importance);
        const rest = sorted.slice(1);
        const rot = rest.length ? ((clockLabelHash(clockLabel) % rest.length) + rest.length) % rest.length : 0;
        const soil = [
            ...sorted.slice(0, 1),
            ...rest.slice(rot).concat(rest.slice(0, rot)).slice(0, 3),
        ].map((m) => m.text);
        try {
            const v = await agent.povScene({
                name: c.name,
                persona: c.persona,
                secret: c.secret,
                ties: ties || undefined,
                memories: soil.length ? soil : undefined,
                venue,
                venueHint: venueByName.get(venue)?.hint,
                clock: clockLabel,
                beats: beats.map((b) => ({ name: b.name, text: b.text })),
                castBodies: participants.map((x) => ({ name: x.name, bodyFact: x.bodyFact, role: x.role })),
            });
            if (v) out[c.name] = v;
        } catch {
            /* skip this lens */
        }
    }
    return Object.keys(out).length ? out : undefined;
}

/** A mutable accumulator for the self-check pass (scenes reviewed / beats changed). */
export interface ReviewCounter {
    scenes: number;
    beatsChanged: number;
}

/** A mutable accumulator for the CHAPTER-level self-check (woven 章回 reviewed / repaired). */
export interface ChapterReviewCounter {
    chapters: number;
    repaired: number;
}

/** One-line PUBLIC dossier per participant (canon description's first clause —
 *  the world-known identity, never the secret). */
function dossierOf(cs: Char[]): string[] {
    return cs.map((c) => `${c.name}（${c.role}）：${(CANON[c.id]?.description ?? c.persona).split('。')[0]}。`);
}

/** Build the DATA-DRIVEN cast-body list (name + 身/sex) for the gender-aware weave +
 *  chapter review, from a scene's actual participants. No names or pairings hardcoded. */
function castBodies(participants: Char[]): Array<{ name: string; bodyFact?: string }> {
    return participants.map((c) => ({ name: c.name, bodyFact: c.bodyFact }));
}

/**
 * CHAPTER-LEVEL SELF-CHECK — run a freshly-woven 章回 through reviewChapter and return
 * the corrected prose, counting reviews + repairs. Feeds the era world-premise + the
 * participants' 身/sex so the pass can catch a 坤生 (woman) written "男人" or a flipped
 * pronoun in the melted-down prose. Falls back to the original on null/throw. GENERAL:
 * participants derived from the actual cast, no name-casing.
 */
async function reviewWovenChapter(
    agent: SceneAgentPort,
    participants: Char[],
    chapter: string,
    ctr?: ChapterReviewCounter,
): Promise<string> {
    if (!chapter.trim()) return chapter;
    try {
        const reply = await agent.reviewChapter({
            worldPremise: WORLD_PREMISE,
            cast: castBodies(participants),
            chapter,
        });
        if (!reply || !reply.chapter.trim()) return chapter;
        if (ctr) {
            ctr.chapters += 1;
            if (reply.chapter.trim() !== chapter.trim()) ctr.repaired += 1;
        }
        return reply.chapter;
    } catch {
        return chapter;
    }
}

/**
 * SELF-CHECK / REPAIR a rendered scene's beats (§ the headline). Feeds the agent
 * the participants (name + 身 + role + one-line relationship toward the others),
 * the era world-premise, and the beats, then REPLACES the beats with the revised
 * ones — falling back to the originals if the review returns null/throws or the
 * shape drifts. GENERAL: participants derived from the actual cast, no name-casing.
 */
async function reviewBeats(
    agent: SceneAgentPort,
    participants: Char[],
    beats: Array<{ name: string; text: string; inner: string }>,
    ctr: ReviewCounter,
    venue?: string,
): Promise<Array<{ name: string; text: string; inner: string }>> {
    if (!beats.length) return beats;
    try {
        const reply = await agent.reviewScene({
            worldPremise: WORLD_PREMISE,
            venue,
            venueHint: venue ? venueByName.get(venue)?.hint : undefined,
            participants: participants.map((c) => ({
                name: c.name,
                bodyFact: c.bodyFact,
                role: c.role,
                relationship:
                    participants
                        .filter((o) => o.id !== c.id)
                        .map((o) => {
                            const v = c.relationshipViews.get(o.id);
                            return v ? `對${o.name}：${v}` : '';
                        })
                        .filter(Boolean)
                        .join('；') || undefined,
            })),
            beats: beats.map((b) => ({ name: b.name, text: b.text, inner: b.inner })),
        });
        if (!reply || !Array.isArray(reply.beats) || reply.beats.length !== beats.length) return beats;
        ctr.scenes += 1;
        const revised = beats.map((b, i) => {
            const t = (reply.beats[i]?.text ?? '').trim();
            const text = t || b.text;
            if (text !== b.text) ctr.beatsChanged += 1;
            return { name: b.name, text, inner: reply.beats[i]?.inner ?? b.inner };
        });
        return revised;
    } catch {
        return beats;
    }
}

/**
 * Weave ONE scene's own finalized beats into a readable 章回 (說書人 prose). Runs for
 * EVERY rendered scene — the private/床/修羅場 versions are exactly what the per-時辰
 * PUBLIC weave skips, so a reader gets literary prose there too instead of raw beats.
 * One extra LLM call per rendered scene (by design). GENERAL: lines are built from the
 * scene's actual participants + venue, no name-casing. try/catch → undefined on failure
 * so a weave hiccup never breaks the round.
 */
async function weaveSceneChapter(
    agent: SceneAgentPort,
    clock: WorldClock,
    venue: string,
    beats: Array<{ name: string; text: string; inner: string }>,
    participants: Char[],
    chapterCtr?: ChapterReviewCounter,
    context?: string[],
): Promise<string | undefined> {
    if (!beats.length) return undefined;
    try {
        const woven = await agent.weaveTickChapter({
            clock: `第${clock.day}日·${clock.partOfDay}`,
            context,
            dossier: dossierOf(participants),
            lines: beats.map((x) => `[${venue}] ${x.name}：${x.text}`),
            // Feed the scene's participants' 身/sex so the weaver keeps genders/pronouns
            // correct (a 坤生 is never rendered "男人"). DATA, never name-cased.
            castBodies: castBodies(participants),
        });
        if (!woven) return undefined;
        // CHAPTER-LEVEL SELF-CHECK: repair any gender/pronoun/logic slip the weave made.
        return await reviewWovenChapter(agent, participants, woven, chapterCtr);
    } catch {
        return undefined;
    }
}

/**
 * 關係盤 (facts only, NO thresholds): for every person this character KNOWS —
 * has a view of, is established with, or carries a bond-want toward — how long
 * since they last shared a scene. The mechanism never decides what "distant"
 * means (two days is an eternity for a new lover and nothing for the 班主);
 * the character reads the numbers with her own heart. Used by the nightly
 * mind AND by the on-demand `relations` faculty (her own call to take stock).
 */
function byIdOf(list: Char[], id: string): Char | undefined {
    return list.find((c) => c.id === id);
}

function relationLedger(
    c: Char,
    byId: Map<string, Char>,
    lastScene: Map<string, { tick: number }>,
    currentTick: number,
    ticksPerDay: number,
): string[] {
    const ids = new Set<string>([...c.relationshipViews.keys()]);
    for (const w of c.wants) {
        if (!w.retired && isBondLayer(w.layer) && w.target) {
            const t = byId.get(w.target) ?? [...byId.values()].find((o) => o.name === w.target);
            if (t) ids.add(t.id);
        }
    }
    const out: string[] = [];
    for (const oid of ids) {
        const t = byId.get(oid);
        if (!t || t.dead || t.id === c.id) continue;
        const last = lastScene.get([c.id, oid].sort().join('|'));
        const label = last
            ? Math.floor((currentTick - last.tick) / ticksPerDay) === 0
                ? '今日才同過場'
                : `${Math.floor((currentTick - last.tick) / ticksPerDay)}日沒單獨說過話`
            : '這一季還沒單獨說過話';
        out.push(`${t.name}：${label}`);
    }
    return out;
}

export async function doInteract(
    a: Char,
    b: Char,
    intent: string,
    clock: WorldClock,
    night: boolean,
    agent: SceneAgentPort,
    recall: RecallPort,
    tags: Map<string, Map<string, string>>,
    surfacedOut: SurfacedMemory[],
    // CONTINUATION: same pair, same private venue, immediately-consecutive 時辰 → this
    // is the same still-warm encounter carrying on (no fresh entrance / re-lock).
    continuation = false,
    priorTail?: string,
    reviewCtr?: ReviewCounter,
    chapterCtr?: ChapterReviewCounter,
    opts?: { maxTurns?: number },
    establishedDyn?: Set<string>,
    confide = false,
    bonds?: BondGraph,
): Promise<SceneRecord> {
    const venue = a.venue;
    const isPrivate = !isPublicVenue(venue); // a home / private venue → private
    const established = areEstablishedLovers(a, b) || !!establishedDyn?.has([a.id, b.id].sort().join('|'));
    // RELATIONSHIP-DEPENDENT intimacy: established lovers alone in a private venue
    // at night → consummate register (a real 床戲 is correct for THIS pair);
    // everyone else → default restrained (forbidden/unconfessed stays held).
    const consummate = established && isPrivate && night;
    const cast = [castMember(a, [b]), castMember(b, [a])];
    // LIVED memory reaches the scene (user-caught gap): castMember carries only
    // the canon seeds, so a character could spend a season in someone's bed and
    // still walk into a scene UNABLE to recall a single night of it — her lived
    // life reached beats only as distilled secret/view idiom (釘子 without the
    // name). Two episodic recalls per participant, keyed to the co-present other
    // + this scene's cause, ride in alongside the canon.
    try {
        const [ea, eb] = await Promise.all(
            [
                { self: a, other: b },
                { self: b, other: a },
            ].map(({ self, other }) =>
                recall.recall(self.id, `${other.name} ${intent}`.slice(0, 60), 2, clock.day).then((ms) => ms.map((m) => m.text.slice(0, 100))),
            ),
        );
        cast[0].memories = [...(cast[0].memories ?? []), ...ea].slice(0, 7);
        cast[1].memories = [...(cast[1].memories ?? []), ...eb].slice(0, 7);
    } catch {
        /* non-fatal: canon-only context tonight */
    }
    // STANDING gates the ADVANCE affordance (never the answer): you court a
    // stranger with scenes and confidences first; the world only deals the
    // advance card on real footing. Numbers never reach the prompt.
    if (bonds) {
        cast[0].advanceReady = advanceReady(bonds, a.id, b.id);
        cast[1].advanceReady = advanceReady(bonds, b.id, a.id);
    }
    const wants = [...a.wants, ...b.wants];
    const clockLabel = `第${clock.day}日·${clock.partOfDay}`;

    // THE BODY'S VETO (soft): a worn (乏) participant cannot sustain a long scene — the
    // body cuts it short whatever the heart wants, capping even a 床戲 to a few beats.
    // GENERAL: derived from the participants' health, never from names.
    const worn = Math.min(a.health, b.health) <= HEALTH.wornAt;

    const loop = await runSceneLoop({
        sceneId: `d${clock.day}p${clock.tickOfDay}-${a.id}`,
        sceneName: venue,
        sceneHint: venueByName.get(venue)?.hint,
        isPrivate,
        clock: clockLabel,
        firstActorId: confide ? a.id : undefined,
        stake: `${a.name}${intent}。${confide ? `（${a.name}是自己尋過來想說說心裡話的——說多少、怎麼說、說不說得出口，都由TA。）` : ''}${worn && opts?.maxTurns ? '（有人是拖著乏透的身子上的台——那點撐不住，也是這場戲的一部分。）' : ''}`,
        // The body's veto caps an ordinary scene — but a scene with an EXPLICIT
        // cap (the finale set piece) keeps its stage: a worn lead performing the
        // 大會串 is DRAMA (帶傷登台), not a truncation. The stake carries it.
        maxTurns: worn && !opts?.maxTurns ? 3 : opts?.maxTurns,
        // AXIOM (user, 2026-07-13): the WORLD never opens the register — only the
        // pair does, in-scene, via advance→accept. Seed-established lovers are not
        // auto-opened nightly (that was the mechanism deciding "tonight yes" for
        // them, saturating every private night with the adult register); their
        // establishment still counts for 修羅場 stakes and fast familiarity.
        emotionalStance: undefined,
        etiquette: WORLD_PREMISE, // pinned era facts colour every beat (anti-anachronism)
        cast,
        wants,
        tick: clock.currentTick,
        continuation, // pick up a still-warm encounter mid-moment
        priorTail,
        agent, // inject the SceneAgentPort (fake or runner) — never fall back to the runner default
    });

    let beats = loop.beats.map((x) => ({ name: x.name, text: x.text, inner: x.inner }));
    // SELF-CHECK / REPAIR pass: re-read the rendered scene and REPLACE the beats with
    // the repaired ones (pronouns / anatomy / voice / anachronism / prose), before the
    // outcome propagates so ledgers + memory carry the corrected text.
    if (reviewCtr) beats = await reviewBeats(agent, [a, b], beats, reviewCtr, venue);
    const resolved = loop.resolved.map((r) => `${r.want.characterId}：${r.want.desc}｜${r.note ?? ''}`);
    const sceneText = beats.map((x) => `${x.name}：${x.text}`).join('\n');

    // ── OUTCOME PROPAGATION to BOTH participants ──
    a.todayLedger.set(b.id, `${a.todayLedger.get(b.id) ?? ''}\n${sceneText}`.trim());
    b.todayLedger.set(a.id, `${b.todayLedger.get(a.id) ?? ''}\n${sceneText}`.trim());
    a.scenesToday += 1;
    b.scenesToday += 1;
    a.sceneThisRound = true;
    b.sceneThisRound = true;
    a.addressedToday.add(b.id);
    b.addressedToday.add(a.id);

    // Reciprocal settlement: if either side's want AIMED AT the other resolved, the
    // counterpart want aimed back also settles (the encounter changed BOTH). Keeps
    // a settled debt from re-planning as if it never happened.
    reciprocalSettle(a, b, loop.resolved.map((r) => r.want), clock.currentTick);

    // ── EPISODIC MEMORY on being-interacted-with (append-only, POV per participant).
    // Each participant writes their OWN first-person record of what happened + what
    // was done to them, so they genuinely REMEMBER it (no re-planning a settled thing).
    const stamp = `第${clock.day}日·${clock.partOfDay}`;
    const settled = loop.resolved.length > 0;
    const aBeat = beats.find((x) => x.name === a.name)?.text ?? '';
    const bBeat = beats.find((x) => x.name === b.name)?.text ?? '';
    await writeMem(recall, a.id, `${stamp}，在${venue}，我${intent}。${bBeat ? `${b.name}的回應：${bBeat.slice(0, 40)}` : ''}${settled ? '。這樁事當面了結了。' : '。話沒能全說開。'}`, 6, clock.day);
    await writeMem(recall, b.id, `${stamp}，在${venue}，${a.name}上門來${intent}。${aBeat ? `我看著${a.name}：${aBeat.slice(0, 40)}` : ''}${settled ? '。到底當面了結了。' : '。這事還懸著。'}`, 6, clock.day);

    // Surfacing at scene time: a headline carnal/暗戀 memory that this scene drew on.
    for (const who of [a, b]) {
        const other = who === a ? b : a;
        const tmap = tags.get(who.id);
        const head = who.thickMemories.find(
            (m) => (m.tag.startsWith('肌膚') || m.tag.startsWith('暗戀')) && m.tag.includes(other.name.slice(0, 1)),
        );
        if (head && beats.length) {
            surfacedOut.push({
                char: who.name,
                tag: head.tag,
                text: head.text,
                context: 'scene',
                shaped: `${beats[0].name}：${beats[0].text.slice(0, 48)}…`,
            });
        }
        void tmap;
    }

    // PER-SCENE WEAVE: this scene's own beats → a readable 章回. For a 床戲/私戲 this is
    // the literary version the per-時辰 PUBLIC weave never produces (it skips privates).
    // The scene's CAUSALITY rides into the weave: why the seeker came, and how
    // the encounter actually ENDED (their close / the hour / someone walking
    // out) — a chapter that neither arrives nor leaves reads like a hard cut.
    const endLine =
        loop.endReason === 'close' && loop.closedBy
            ? `這場是${loop.closedBy}自己收住的`
            : loop.moves.length
              ? `散時${loop.moves.map((m) => `${byIdOf([a, b], m.characterId)?.name ?? ''}起身往${m.toSceneName}去了`).join('、')}`
              : loop.endReason === 'drained'
                ? '人散了，這場便斷在半途'
                : '一個時辰盡了，各自歸位';
    const sceneCtx = [`${a.name}來此的緣故：${intent}`, `結束的光景：${endLine}`];
    const chapter = await weaveSceneChapter(agent, clock, venue, beats, [a, b], chapterCtr, sceneCtx);
    // 追角 lens: the followed participants' subjective versions of THIS scene.
    const povVersions = await renderPovVersions(agent, [a, b], beats, venue, clockLabel);

    // 傾吐 (confide): an information MEDIUM, not a special scene track. What
    // transfers is ONLY what the confider actually SAID ALOUD (objective beat
    // text) — the listener remembers the confider's VERSION, never their inner
    // (probe: 蘇 circled her secret in craft-metaphor; the tea she kept warm for
    // 生春 leaked as evidence, the confession never came — that's the medium's
    // correct granularity). Saying it out loud is itself a landing event: the
    // confider's secret may move (心事自改).
    let confideBy: string | undefined;
    if (confide && loop.beats.length >= 2) {
        const saidAloud = loop.beats.filter((x) => x.characterId === a.id).map((x) => x.text).join(' ');
        if (saidAloud.trim()) {
            confideBy = a.name;
            try {
                await recall.remember(
                    b.id,
                    `${clockLabel}，${a.name}在${venue}找我說了心裡話：${saidAloud}`.slice(0, 600),
                    { kind: 'observation', importance: 7, day: clock.day },
                );
            } catch {
                /* non-fatal */
            }
            if (a.secret) {
                try {
                    const evolved = await agent.evolveSecret({
                        name: a.name,
                        persona: a.persona,
                        secret: a.secret,
                        landed: [`今夜我把心裡的事對${b.name}說出了口——我親口說的是：${saidAloud.slice(0, 400)}`],
                        selfModel: a.coreIdentity.length ? a.coreIdentity : undefined,
                        castBodies: [a, b].map((x) => ({ name: x.name, bodyFact: x.bodyFact })),
                        canonSeed: CANON[a.id]?.secret,
                        day: clock.day,
                    });
                    if (evolved) a.secret = evolved;
                } catch {
                    /* non-fatal */
                }
            }
        }
    }

    return {
        venue,
        day: clock.day,
        part: clock.partOfDay,
        isPublic: isPublicVenue(venue),
        isPrivate,
        // Ex-post 床 needs to have HAPPENED ON PAGE: an accept opens the register,
        // but the stamp requires them to have actually stayed in it (≥4 beats past
        // the accept). A vow/taunt mis-tag used to stamp 床 on a doorway scene.
        consummate:
            consummate ||
            (loop.intimacyAccepted && loop.acceptedAtBeat != null && loop.beats.length - 1 - loop.acceptedAtBeat >= 4),
        intimacyGate: loop.intimacyGateOpened,
        intimacyAccepted: loop.intimacyAccepted || undefined,
        confideBy,
        participants: [a.name, b.name],
        participantIds: [a.id, b.id],
        povVersions,
        beats,
        chapter,
        resolved,
    };
}

/** GENERAL romantic-stake predicate (no names): C holds an exclusive/romantic claim
 *  on X if C is X's established lover, or carries a LIVE want of a romantic layer
 *  aimed at X. Drives jealousy/discovery for ANY cast, not a hardcoded triangle. */
const ROMANTIC_LAYERS = /情|愛|暗戀|癡/;
export function hasRomanticStake(c: Char, x: Char, establishedDyn?: Set<string>): boolean {
    if (c.id === x.id) return false;
    if (areEstablishedLovers(c, x)) return true;
    if (establishedDyn?.has([c.id, x.id].sort().join('|'))) return true;
    return c.wants.some(
        (w) => !w.retired && ROMANTIC_LAYERS.test(w.layer) && !!w.target && (w.target === x.id || w.target === x.name),
    );
}

/** A 修羅場: a romantically-invested third (`disc`) walks in on an intimate pair
 *  (`a`×`b`). Renders a 3-way confrontation and writes the rupture into all three
 *  ledgers + memories, so the night self-model overwrite REWRITES the relationship
 *  edges (betrayal / guilt / exposure). No one is forced to choose; the wound stays. */
export async function renderDiscovery(
    disc: Char,
    a: Char,
    b: Char,
    clock: WorldClock,
    agent: SceneAgentPort,
    recall: RecallPort,
    brokeIn = false,
    reviewCtr?: ReviewCounter,
    // AFTERMATH CONTINUITY: the caught pair were just spent by a recent deep 床戲 (≥1 is
    // occupiedRestOfDay) — frame the break-in as bursting in on the still-warm aftermath,
    // not a fresh unrelated encounter. GENERAL: any occupied intimate pair, no names.
    aftermath = false,
    chapterCtr?: ChapterReviewCounter,
): Promise<SceneRecord> {
    const venue = a.venue;
    const clockLabel = `第${clock.day}日·${clock.partOfDay}`;
    const cast = [castMember(disc, [a, b]), castMember(a, [disc, b]), castMember(b, [disc, a])];
    const how = brokeIn ? `${disc.name}推不開的門一把撞開、闖進${venue}` : `${disc.name}進了${venue}`;
    // The pair's state at the moment of intrusion: a still-warm aftermath (just abed,
    //衣衫未整, still entangled) vs. an in-progress tryst. Data-driven off occupancy.
    const caughtDoing = aftermath
        ? `${a.name}與${b.name}方纔那場翻雲覆雨才歇、衣衫未整、猶自偎在一處，餘溫未散`
        : `${a.name}與${b.name}在此私處纏綿`;
    const stake = `${how}，撞見${caughtDoing}，就在眼前。`;
    const loop = await runSceneLoop({
        sceneId: `disc-d${clock.day}p${clock.tickOfDay}-${disc.id}`,
        sceneName: venue,
        isPrivate: true,
        clock: clockLabel,
        stake,
        etiquette: WORLD_PREMISE,
        cast,
        wants: [...disc.wants, ...a.wants, ...b.wants],
        tick: clock.currentTick,
        agent,
    });
    let beats = loop.beats.map((x) => ({ name: x.name, text: x.text, inner: x.inner }));
    if (reviewCtr) beats = await reviewBeats(agent, [disc, a, b], beats, reviewCtr, a.venue);
    const sceneText = beats.map((x) => `${x.name}：${x.text}`).join('\n');
    // Propagate the rupture into every pairing's ledger → night consolidation rewrites edges.
    for (const [p, q] of [[disc, a], [disc, b], [a, disc], [b, disc]] as const) {
        p.todayLedger.set(q.id, `${p.todayLedger.get(q.id) ?? ''}\n${sceneText}`.trim());
    }
    for (const c of [disc, a, b]) c.sceneThisRound = true;
    disc.addressedToday.add(a.id);
    disc.addressedToday.add(b.id);
    const stamp = `第${clock.day}日·${clock.partOfDay}`;
    const forced = brokeIn ? '我推開那扇本不該我推的門，' : '';
    await writeMem(recall, disc.id, `${stamp}，${forced}在${venue}撞見${a.name}同${b.name}在一處纏綿。這一眼，我這輩子忘不掉。`, 9, clock.day);
    await writeMem(recall, a.id, `${stamp}，我同${b.name}在${venue}，${brokeIn ? `${disc.name}破門闖進來` : `被${disc.name}`}撞了個正著。`, 8, clock.day);
    await writeMem(recall, b.id, `${stamp}，我同${a.name}在${venue}正親密，${disc.name}${brokeIn ? '一把撞開門' : '闖了進來'}，全看在眼裡。`, 8, clock.day);
    // PER-SCENE WEAVE: a 修羅場 is private → the per-時辰 PUBLIC weave skips it. Give the
    // reader a woven 章回 of the confrontation too (raw beats stay under it).
    const chapter = await weaveSceneChapter(agent, clock, venue, beats, [disc, a, b], chapterCtr);
    // 追角 lens on the 修羅場 too — the walk-in IS the followed reader's money scene.
    const povVersions = await renderPovVersions(agent, [disc, a, b], beats, venue, `第${clock.day}日·${clock.partOfDay}`);
    return {
        venue,
        day: clock.day,
        part: clock.partOfDay,
        isPublic: false,
        isPrivate: true,
        consummate: false,
        intimacyGate: false,
        participants: [disc.name, a.name, b.name],
        participantIds: [disc.id, a.id, b.id],
        povVersions,
        discovery: true,
        aftermath,
        beats,
        chapter,
        resolved: [],
    };
}

function reciprocalSettle(a: Char, b: Char, resolvedWants: Want[], tick: number): void {
    for (const rw of resolvedWants) {
        if (!rw.target) continue;
        const owner = rw.characterId === a.id ? a : rw.characterId === b.id ? b : null;
        if (!owner) continue;
        const other = owner === a ? b : a;
        if (rw.target !== other.name && rw.target !== other.id) continue;
        // settle the other's mirror want aimed back at owner
        for (const w of other.wants) {
            if (w.retired || !w.target) continue;
            if (w.target === owner.name || w.target === owner.id) {
                w.retired = true;
                w.resolvedTick = tick;
                w.resolvedNote = `對方了斷了這樁事，這頭的心結也隨之落地`;
            }
        }
    }
}

// 時辰 per day (清晨/日午/晡時/黃昏/入夜/深宵) — a day's worth of ticks, for the
// "resolved just now (today)" milestone window.
const PARTS_PER_DAY = 6;

/** Ambient EXTERNAL pressure on a character tonight: the finale deadline (world-fact),
 *  the class-wide task, and their own purse/belly. These are the world pressing on TA,
 *  NOT a personal want already held — the raw material want-regeneration draws a fresh
 *  want from when a private arc has gone quiet. */
function worldPressureFor(c: Char, day: number, cfg: SeasonConfig): string {
    const parts = [countdownLine(cfg, day), `班子這一季的大事：${cfg.centralQuestion}`];
    if (c.money <= 8) parts.push(`你手頭只剩 ${c.money} 個錢，緊得很，一頓飯的錢都要掂量。`);
    if (c.hunger >= 0.6) parts.push('你餓著，肚裡空得發慌，這也是件要緊的事。');
    // ZERO-SUM TIME made visible: hours spent elsewhere are hours off the barre.
    if (c.occupation === 'troupe' && c.craft < 0.62) parts.push('你這些日子疏了功，手上明顯生了——台上的身段騙不了行家，這件事拖不得。');
    return parts.join('\n');
}

/** FINITUDE surfaced tonight: the year closing, and (across restored weeks) the plain
 *  fact that time keeps passing and chances thin. This is what keeps a character who has
 *  resolved everything from drifting on forever with nothing to want. */
function lifecycleFor(c: Char): string {
    if (c.seasonsLived <= 0) {
        return '年關將近，這一年快到頭了。人能站在台心的年月，本就不多。';
    }
    return `你已又過了 ${c.seasonsLived} 個年頭。一年一年過去，人不會一直年輕，能唱、能等、能重來的日子，一年比一年少。`;
}

// ── night consolidation (reflect for everyone, scheduled at 深宵) ─────────────
async function nightConsolidate(
    c: Char,
    byId: Map<string, Char>,
    day: number,
    tick: number,
    agent: SceneAgentPort,
    castNames: string[],
    showrunner: SeasonConfig,
): Promise<string[]> {
    const updated: string[] = [];
    const interactions = [...c.todayLedger.keys()]
        .map((oid) => {
            const o = byId.get(oid);
            if (!o) return null;
            return {
                otherId: oid,
                otherName: o.name,
                otherBodyFact: o.bodyFact,
                otherRole: o.role,
                currentView: c.relationshipViews.get(oid),
                todayText: c.todayLedger.get(oid) ?? '（今天只是照了個面）',
                resolvedWithThem: c.wants.some((w) => w.retired && w.target && (w.target === o.name || w.target === oid)),
            };
        })
        .filter(Boolean) as Parameters<SceneAgentPort['consolidateSelfModel']>[0]['interactions'];

    if (interactions.length) {
        try {
            const reply = await agent.consolidateSelfModel({
                name: c.name,
                persona: c.persona,
                secret: c.secret,
                coreIdentity: c.coreIdentity,
                interactions,
                day,
            });
            for (const rv of reply.relationshipViews) {
                const before = c.relationshipViews.get(rv.otherId);
                c.relationshipViews.set(rv.otherId, rv.view); // OVERWRITE — latest-wins
                const nm = byId.get(rv.otherId)?.name ?? rv.otherId;
                updated.push(`對${nm}：「${before ?? '（原本沒特別記著）'}」→「${rv.view}」`);
            }
            if (reply.identityInsight) {
                c.coreIdentity.push(reply.identityInsight);
                updated.push(`對自己多了一句：「${reply.identityInsight}」`);
            }
        } catch {
            /* loud-but-non-fatal at night */
        }

        // Living-want self-rewrite over the day's exchanges (scene-scoped to this char).
        const dayText = [...c.todayLedger.values()].join('\n').slice(0, 1200);
        if (dayText.trim()) {
            try {
                const reply = await agent.rewriteWantLedger({
                    name: c.name,
                    persona: c.persona,
                    secret: c.secret,
                    wants: c.wants.filter((w) => !w.retired).map((w) => ({ id: w.id, layer: w.layer, desc: w.desc })),
                    sceneText: dayText,
                });
                applyRewrite(c.wants, c.id, reply, tick, [], castNames);
            } catch {
                /* non-fatal */
            }
        }
    }

    // WANT REGENERATION — runs for EVERY character, even one who had no scene today, so a
    // resolved arc seeds its next phase (milestone → successor) and ambient world /
    // lifecycle pressure keeps a spent character from flatlining. NOT a floor: the port
    // returns null when nothing genuinely stirs, so a content character gets nothing.
    try {
        const justResolved = c.wants
            .filter((w) => w.retired && w.resolvedTick != null && w.resolvedTick > tick - PARTS_PER_DAY)
            .map((w) => w.desc);
        const liveWants = c.wants.filter((w) => !w.retired).map((w) => ({ layer: w.layer, desc: w.desc }));
        // The door out of a single-axis loop: sample the character's OWN memory
        // threads FURTHEST from everything they already want (incl. secret — for a
        // single-axis character the secret IS the burning theme), so 識字/攢錢/舊債
        // can become a want when pressure hits, not just the same theme's successor.
        const otherThreads = pickOrthogonalThreads(
            c.thickMemories.map((m) => m.text),
            [...liveWants.map((w) => w.desc), ...justResolved, c.secret ?? ''],
            3,
        );
        const spawn = await agent.regenerateWant({
            name: c.name,
            persona: c.persona,
            secret: c.secret,
            coreIdentity: c.coreIdentity,
            liveWants,
            justResolved,
            worldPressure: worldPressureFor(c, day, showrunner),
            lifecycle: lifecycleFor(c),
            otherThreads,
        });
        if (process.env.SEASON_REGEN_DIAG) {
            // eslint-disable-next-line no-console
            console.log(
                `  [regen-diag] ${c.name} live=${liveWants.length} 承接=${justResolved.length} → ${spawn ? `「${spawn.desc}」(${spawn.desc.length}字)` : '（null）'}`,
            );
        }
        if (spawn) {
            const before = c.wants.filter((w) => !w.retired).length;
            spawnWant(c.wants, c.id, spawn, tick, [], castNames);
            if (c.wants.filter((w) => !w.retired).length > before) {
                updated.push(`心裡新生一樁想要：「${spawn.desc}」`);
            }
        }
    } catch {
        /* non-fatal: no want this night */
    }

    return updated;
}

// ── active-set + occupancy (opportunity cost's teeth) ─────────────────────────
export interface ActiveResult {
    active: Char[];
    /** how many characters were skipped this 時辰 because a long scene SPENT them. */
    occupiedSkipped: number;
}

/**
 * Determine which characters take an active turn this 時辰. Rhythm (occupation × 時辰)
 * is the base pull; a hot-want override and night-rest health gate layer on top (both
 * pre-existing). NEW: a character SPENT by a long/deep scene earlier today is OCCUPIED —
 * still abed / spent — and is skipped for the rest of the day (reset at the day boundary).
 * Extracted + exported so the opportunity-cost teeth are mechanically testable.
 */
export function determineActive(
    cast: Char[],
    byName: Map<string, Char>,
    part: PartOfDay,
    reh: RehearsalCall,
    deep: boolean,
    night: boolean,
): ActiveResult {
    const active: Char[] = [];
    let occupiedSkipped = 0;
    for (const c of cast) {
        if (c.dead) continue;
        const pull = rhythmPull(c, part, reh);
        let isActive = pull.active;
        // Hot-want override (§2.43 pull, not command): ANY character carrying a live, hot 情
        // reckoning leaves home at 深宵 to settle it — UNLESS they've already met that target
        // today (no phantom). GENERAL — driven by the want's own layer/target, never by name.
        if (!isActive && deep) {
            const hot = hottest(c);
            const tgt = hot?.target ? byName.get(hot.target) : undefined;
            if (hot && hot.layer === '情' && !hot.retired && tgt && !c.addressedToday.has(tgt.id)) isActive = true;
        }
        // Worn-down characters at night REST to recover (sleep's teeth) — UNIVERSALLY. Even a
        // reckoning-chaser rests when the body is failing; the reckoning waits for a day they
        // can survive. (A prior name-cased exemption kept 柳生春 awake every night and, once a
        // restored week carried her fatigue forward with no rest, burned her to 油盡燈枯 by
        // day 1 — the real cause of "柳 does nothing", not any want-regen gap.)
        if (isActive && night && c.health <= HEALTH.wornAt) isActive = false;
        // THE BODY'S VETO (hard): a collapsed body (危) takes NO turn at ANY hour — the
        // character is 臥床, and this is the only guaranteed recovery window. Without it the
        // most-sought-after character gets loved to death: suitors wake them every 時辰,
        // drain (0.06+0.05/scene) outruns sleep (0.15), and the lead dies first.
        if (isActive && c.health <= HEALTH.dangerAt) isActive = false;
        // OPPORTUNITY COST: a character a long scene already consumed today takes no more
        // turns until the day resets — the finite 時辰 they spent is gone.
        if (isActive && c.occupiedRestOfDay) {
            occupiedSkipped += 1;
            isActive = false;
        }
        if (isActive) active.push(c);
    }
    return { active, occupiedSkipped };
}

/** The troupe LEAD = the alive troupe member with the highest ability (data-driven off
 *  abilityOf; NEVER name-cased). This is who carries the 大會串 — the 班主's summons and
 *  the craft-weight nudge both key off this, so the mechanism follows the cast, not a
 *  hardcoded name. null when there is no living troupe member. */
export function troupeLead(cast: Char[]): Char | null {
    let best: Char | null = null;
    for (const c of cast) {
        if (c.dead || c.occupation !== 'troupe') continue;
        if (!best || abilityOf(c.id) > abilityOf(best.id)) best = c;
    }
    return best;
}

/** Is the LEAD behind the troupe on rehearsal effort? True when the lead's accumulated
 *  effort is strictly less than the keenest castmate's — the romance nexus has starved
 *  their professional line and the 班主 should pull them in. GENERAL: pure effort compare. */
export function leadUnderRehearsed(lead: Char, play: Play, cast: Char[]): boolean {
    const leadEff = play.effort.get(lead.id) ?? 0;
    let maxOther = 0;
    for (const c of cast) {
        if (c.dead || c.occupation !== 'troupe' || c.id === lead.id) continue;
        maxOther = Math.max(maxOther, play.effort.get(c.id) ?? 0);
    }
    return leadEff < maxOther;
}

/** Mark the participants of a LONG scene (beats ≥ OCCUPY_BEATS) OCCUPIED for the rest of
 *  the day. Returns true if it fired. GENERAL: driven purely by beat count + the scene's
 *  own participant ids, never by name. */
export function markOccupancyFromScene(scene: SceneRecord, byId: Map<string, Char>): boolean {
    if (scene.beats.length < OCCUPY_BEATS) return false;
    for (const pid of scene.participantIds) {
        const c = byId.get(pid);
        if (c) c.occupiedRestOfDay = true;
    }
    return true;
}

// ── ONE 時辰-ROUND ────────────────────────────────────────────────────────────
export async function runRound(
    clock: WorldClock,
    deps: SeasonDeps,
    tags: Map<string, Map<string, string>>,
    out: {
        surfaced: SurfacedMemory[];
        rehearsalGathering: SeasonResult['rehearsalGathering'];
        timeToolUses: { n: number };
        premiere: SceneRecord | null;
        boxOffice: BoxOffice | null;
        deadlineInjections: { n: number };
        /** last woven chapter's tail, so the next 時辰 can 承上啟下 (continuity). */
        prevChapterTail: string;
        /** the tick + day of the LAST woven chapter — so prevTail only feeds forward
         *  across an IMMEDIATELY-consecutive active 時辰 (no fast-forward gap, no day
         *  boundary), killing the "二日入夜 → 三日日午 話音落地" time-mismatch. */
        lastWovenTick: number;
        lastWovenDay: number;
        /** SPOTLIGHT ledger (engine core actor-fatigue): recent scene-carriers tire,
         *  so scene-slot claiming favors FRESH pairs — breaks the hub monopoly where
         *  every hot want targets the same star and she is in every rendered scene. */
        spotlight: FatigueLedger;
        /** pairs promoted to established IN PLAY (milestone judge); persisted. */
        establishedDyn: Set<string>;
        /** unordered-pair key → last rendered scene, for cross-時辰 continuation. */
        lastScene: Map<string, { tick: number; venue: string; tail: string }>;
        /** 修羅場 log for the season + a per-day guard against re-firing the same one. */
        discoveries: SeasonResult['discoveries'];
        discoveredToday: Set<string>;
        /** pairKeys that already had a 傾吐 today (once per pair per day). */
        confidedToday: Set<string>;
        dormants: DormantChar[];
        /** the numeric relationship underlay (directed; never enters a prompt). */
        bonds: BondGraph;
        /** sorted pair keys that shared a scene today (skip cooling tonight). */
        togetherToday: Set<string>;
        /** pairKey → rendered scenes today (the SAME pair's Nth scene yields the slot). */
        pairScenesToday: Map<string, number>;
        /** PLAIN-LANGUAGE day digest lines (mechanical, from structured events) —
         *  the reader's orientation layer: no idiom, just who did what. */
        dayEvents: string[];
        /** self-check pass accumulator (scenes reviewed / beats whose text changed). */
        review: ReviewCounter;
        /** chapter-level self-check accumulator (woven 章回 reviewed / prose repaired). */
        chapterReview: ChapterReviewCounter;
        /** POV daily reflections, keyed by charId (the narrative-subjective layer). */
        povReflections: Record<string, Array<{ day: number; text: string }>>;
        /** PERCEPTION: the venue-keyed trace store (lingering 鼻 signals) + the PREVIOUS
         *  時辰's rendered scenes (the recent notable sound that can still leak into 耳). */
        traces: TraceStore;
        prevScenes: SceneRecord[];
        /** perception + opportunity-cost mechanical counters (see SeasonResult). */
        perceptionInjections: { n: number };
        hearDiscoveries: { n: number };
        oppCostFramings: { n: number };
        longScenes: { n: number };
        occupiedTurns: { n: number };
        /** economy: charId → meals eaten this season (accumulated across 時辰). */
        meals: Record<string, number>;
    },
): Promise<RoundRecord> {
    const { cast, planner, agent, recall, clockPort, log, reh, play, showrunner } = deps;
    const part = clock.partOfDay;
    const night = clockPort.isNight(clock);
    const deep = isDeepNight(part);
    const byId = new Map(cast.map((c) => [c.id, c]));
    const byName = new Map(cast.map((c) => [c.name, c]));
    const castNames = cast.map((c) => c.name);

    for (const c of cast) c.sceneThisRound = false;
    out.spotlight = decayActorFatigue(out.spotlight);
    // PERCEPTION: fade traces older than the lingering window before this 時辰's senses.
    decayTraces(out.traces, clock.currentTick);

    // 班主 rehearsal channel — 沈's autonomous call (day 時辰 only).
    if (!reh.announced && !isNightPart(part)) {
        const banzhu = cast.find((c) => c.occupation === 'banzhu' && !c.dead);
        if (banzhu) {
            const rp = rhythmPull(banzhu, part, reh);
            if (rp.active) {
                const troupePresent = cast.filter((c) => c.occupation === 'troupe' && !c.dead).map((c) => c.name);
                const dec = await planner.decideRehearsal({ char: banzhu, clock, reh, troupePresent });
                if (dec.call) {
                    reh.announced = true;
                    reh.line = dec.line;
                    reh.at = `第${clock.day}日·${part}`;
                    // Seed/advance the PLAY on the 班主 channel — the chosen 戲碼 becomes
                    // a 'scripted' Play (with an opening script fragment).
                    registerProposal(play, dec.title, reh.at);
                    log(`  〔班主號令〕${banzhu.name}（在 ${rp.venue}）傳話排《${play.title}》：「${dec.line}」`);
                }
            }
        }
    }

    // (a) determine ACTIVE characters (rhythm + hot-want override + health rest +
    // opportunity-cost occupancy). Extracted to determineActive (testable teeth).
    const { active, occupiedSkipped } = determineActive(cast, byName, part, reh, deep, night);
    out.occupiedTurns.n += occupiedSkipped;

    // 世相 (the day's living texture): meals, wages sung for, street walks —
    // collected so the 說書人 can weave LIFE around the drama (user: 營生描寫
    // 太少). Zero extra LLM cost — same weave, richer material.
    const worldTexture: string[] = [];
    const roundRec: RoundRecord = {
        tick: clock.currentTick,
        day: clock.day,
        part,
        night,
        fastForward: false,
        activeVenues: activeVenues(cast, part, reh),
        active: active.map((c) => c.name),
        placements: [],
        scenes: [],
        sceneVenues: [],
        chapter: null,
        consolidations: [],
        deaths: [],
    };

    log('──────────────────────────────────────────────────────────────────────');
    log(`時辰 ${clock.currentTick}  第${clock.day}日·${part}${night ? '（入夜）' : ''}  active=${active.length ? active.map((c) => c.name).join('、') : '（無）'}`);

    // SCHEDULED DEEP-NIGHT WORK — the sleeping mind's shift (self-model overwrite,
    // POV diary, want decay/regeneration, per-day reset). Defined here so BOTH paths
    // run it: a 深宵 where nobody stirred is the CANONICAL night, not an exception —
    // fast-forwarding used to skip this entirely, so a whole real week passed with
    // zero consolidations, zero diaries and zero want regeneration.
    const deepNightWork = async (): Promise<void> => {
        for (const c of cast) {
            if (c.dead) continue;
            const updated = await nightConsolidate(c, byId, clock.day, clock.currentTick, agent, castNames, showrunner);
            if (updated.length) roundRec.consolidations.push({ char: c.name, updated });
            // POV DAILY REFLECTION (narrative-subjective layer): a first-person, possibly
            // biased account of THIS character's day (their ledger + wants + self-model),
            // stored separately from the objective 時辰 章回. Read BEFORE the ledger clear.
            // 關係盤 into the night mind: plain facts for EVERY known tie, no
            // threshold — what counts as "too long" is the character's own heart's
            // arithmetic, never the mechanism's.
            const ledgerLines = relationLedger(c, byId, out.lastScene, clock.currentTick, deps.ticksPerDay);
            const tieNotes = ledgerLines.length ? [`【你與眾人的近疏（事實）】${ledgerLines.join('；')}。`] : [];
            const dayText = [[...c.todayLedger.values()].join('\n'), ...tieNotes].join('\n').slice(0, 1400);
            try {
                const refl = await agent.povReflect({
                    name: c.name,
                    persona: c.persona,
                    day: clock.day,
                    todayText: dayText,
                    wants: c.wants.filter((w) => !w.retired).map((w) => ({ layer: w.layer, desc: w.desc, target: w.target })),
                    // Day-rotated identity injection: a fixed full dump let one 命題句
                    // anchor every night's diary (「上海會不會終於看見我」×3 nights).
                    selfModel:
                        (c.coreIdentity.length > 3
                            ? [c.coreIdentity[0], ...c.coreIdentity.slice(1).filter((_, i) => (i + clock.day) % 2 === 0)]
                            : c.coreIdentity
                        ).join('\n') || undefined,
                    // pronoun guard: me + everyone today's ledger touched (the diary was the
                    // one un-guarded path that let a 坤生 lover be written 他/男人).
                    castBodies: [c, ...[...c.todayLedger.keys()].map((oid) => byId.get(oid)).filter(Boolean) as Char[]].map(
                        (x) => ({ name: x.name, bodyFact: x.bodyFact }),
                    ),
                });
                if (refl) (out.povReflections[c.id] ??= []).push({ day: clock.day, text: refl });
            } catch {
                /* non-fatal at night */
            }
            // 心事自改 (the day-end log line promised this; now it is real): when a
            // narrative want truly RESOLVED today, the character's SECRET may move to
            // its own next step. Frozen canon otherwise re-seeds the same want forever
            // (金鳳 kept collecting a debt the world had already paid, §W5).
            const landed = c.wants
                .filter(
                    (w) =>
                        w.kind === 'narrative' &&
                        w.retired &&
                        !!w.resolvedNote &&
                        w.resolvedTick != null &&
                        w.resolvedTick > clock.currentTick - 6,
                )
                .map((w) => `「${w.desc}」——${w.resolvedNote}`);
            if (landed.length && c.secret) {
                try {
                    const evolved = await agent.evolveSecret({
                        name: c.name,
                        persona: c.persona,
                        secret: c.secret,
                        landed,
                        selfModel: c.coreIdentity.length ? c.coreIdentity : undefined,
                        castBodies: cast.map((x) => ({ name: x.name, bodyFact: x.bodyFact })),
                        canonSeed: CANON[c.id]?.secret,
                        day: clock.day,
                    });
                    if (evolved) {
                        c.secret = evolved;
                        log(`  〔心事自改〕${c.name}：${evolved}`);
                    }
                } catch {
                    /* non-fatal at night */
                }
            }
            decayWants(c.wants);
        }
        for (const c of cast) {
            c.todayLedger.clear();
            c.scenesToday = 0;
            c.addressedToday.clear();
            c.occupiedRestOfDay = false; // a new day: the spent character rises again
            if (c.occupation === 'troupe') {
                // craft_{t+1} = base + (craft − base)·λ : skill erodes toward the
                // talent floor (天分鏽不掉), and the peak is expensive to hold.
                const base = 0.35 + 0.25 * Math.min(1, abilityOf(c.id) / 5);
                if (!c.practicedToday) c.craft = base + (c.craft - base) * 0.97;
            }
            c.practicedToday = false;
        }
        // COOLING: edges whose pair never met today drift toward their floor
        // (an old flame never cools back to stranger — 30% of its peak holds).
        decayBonds(out.bonds, out.togetherToday);
        out.togetherToday.clear();
        out.discoveredToday.clear(); // a new day can re-catch (jealousy is not spent in one night)
        // ── 本日提要 (PLAIN, mechanical): the reader's orientation layer ──
        if (out.dayEvents.length) {
            log(`  ── 本日提要（白話） ──`);
            for (const e of [...new Set(out.dayEvents)].slice(0, 10)) log(`  ・${e}`);
            out.dayEvents.length = 0;
        }
        out.confidedToday.clear(); // a new day may bring a new confidence
        out.pairScenesToday.clear();
        log(`  ── 第${clock.day}日終（深宵覆蓋自我模型 + 心事自改 + 反省）──`);
    };

    // FAST-FORWARD an empty 時辰 — bodies rest, but on a 深宵 the sleeping mind still
    // does its shift (consolidation/diary/regeneration must not depend on wakefulness).
    if (active.length === 0) {
        roundRec.fastForward = true;
        roundRec.passLine = deep
            ? '夜深了，梨園上下各自歸寢，一夜無話。'
            : part === '清晨'
              ? '天光未亮，戲子夜工，滿園還在夢裡，一時無話。'
              : '這個時辰無人在外走動，一時無話。';
        for (const c of cast) if (!c.dead) applyRoundHealth(c, false, 0); // everyone rests → recover
        log(`  〔過場〕${roundRec.passLine}`);
        if (deep) await deepNightWork();
        return roundRec;
    }

    // The deadline as a WORLD FACT injected into every plan this 時辰 (§2.42): it
    // tightens as the 大會串 nears and is never an instruction to premiere.
    const worldFactLine = countdownLine(showrunner, clock.day);

    // 班主 ACTIVE MANAGEMENT (fix): derive the troupe LEAD by ability (no names) and, once
    // rehearsal is on, note whether they've fallen behind the castmates on effort — the
    // romance nexus starving their professional line. When they have, the 班主 PULLS the
    // lead to the rehearsal venue this 時辰 (a standing summons + a snap-back if they
    // wander), so the lead-by-ability carries the 大會串 instead of rehearsing 1/3 as much.
    const lead = troupeLead(cast);
    const leadBehind = !!lead && reh.announced && leadUnderRehearsed(lead, play, cast);

    // (b) PASS A — placement + solo tools (each active char is an agent). Processed
    // KEENEST-FIRST, so a seeker whose target was placed earlier this 時辰 can navigate
    // to the target's ACTUAL spot (not a stale prediction) — the anti-swap guarantee.
    const ordered = [...active].sort((x, y) => (tension(hottest(y) ?? zeroW()) - tension(hottest(x) ?? zeroW())));
    const placed = new Set<string>();
    // venue → charIds turned away at the door this 時辰 (no access; may break in later).
    const atDoor = new Map<string, string[]>();
    for (const c of ordered) {
        const from = c.venue;
        const pull = rhythmPull(c, part, reh);
        // 班主 SUMMONS: on a rehearsal-duty 時辰, the under-rehearsed LEAD (derived by
        // ability) is pulled back to the rehearsal venue. GENERAL — keyed off occupation +
        // ability + effort, never a name; only the lead-by-ability who has fallen behind.
        const isRehearsalVenue = !!pull.venue && ['stage', 'practice'].includes(venueByName.get(pull.venue)?.kind ?? '');
        const banzhuSummons =
            leadBehind && lead && c.id === lead.id && !!pull.duty && isRehearsalVenue
                ? { venue: pull.venue!, line: reh.line ? `班主傳話：「${reh.line}」 ` : '班主傳話：' }
                : null;
        const hot = hottest(c);
        const hotTarget = hot?.target;
        const query = hot ? `${hot.desc}${hot.target ? ' ' + hot.target : ''}` : c.persona;
        out.timeToolUses.n += 1; // the grounding time query (every turn orients to 時辰)
        const autoRecall = await doRecall(c, query, recall, clock.day, tags, hotTarget, 'plan', hot?.desc ?? '', out.surfaced);

        const iAmOnDuty = !!pull.duty; // rehearsing / singing the 堂會 / running the house
        // Expire a stale standing wait: patience ran out, the want settled, or duty
        // calls me back to my post (I don't camp for romance when I'm on the job).
        if (c.waitingFor) {
            const stale = clock.currentTick - c.waitingFor.since >= WAIT_PATIENCE;
            const tid = c.waitingFor.target;
            const stillWanted = c.wants.some((w) => !w.retired && (w.target === tid || byId.get(tid)?.name === w.target));
            if (stale || !stillWanted || iAmOnDuty) c.waitingFor = null;
        }
        // MUTUAL-WAIT DEADLOCK BREAKER: if the person I'm camped for is ALSO camped for
        // me, at a different spot, we'd swap forever. The LESS keen one gives up their
        // post and moves to the keener's (both want to meet — the engine just stops the
        // standoff; it does not decide they meet). Keeps convergence robust, not lucky.
        if (c.waitingFor) {
            const tgt = byId.get(c.waitingFor.target);
            if (tgt && tgt.waitingFor?.target === c.id && tgt.venue !== c.waitingFor.venue) {
                const myT = tension(hottest(c) ?? zeroW());
                const theirT = tension(hottest(tgt) ?? zeroW());
                if (myT < theirT || (myT === theirT && c.id > tgt.id)) {
                    c.waitingFor = { ...c.waitingFor, venue: tgt.venue };
                }
            }
        }
        const waiting = c.waitingFor;
        if (waiting) c.venue = waiting.venue; // a posted-up character stays at their watch spot

        // ROUTINE KNOWLEDGE: if c has a hot want aimed at a person it KNOWS, expose that
        // person's routine-predicted whereabouts, so c navigates to where they really
        // are (their schedule) instead of a stale last-seen coordinate.
        const known = hotTarget ? byId.get(hotTarget) ?? byName.get(hotTarget) : undefined;
        const wb = known && knowsRoutine(c, known) ? predictWhereabouts(known, part, reh) : null;
        const targetWhereabouts = wb && known ? { name: known.name, note: wb.note } : null;
        const waitingNote = waiting
            ? `你正守在${waiting.venue}，等${byId.get(waiting.target)?.name ?? waiting.target}出現，好${waiting.intent}。`
            : null;

        const preview = cast.filter((o) => o.id !== c.id && !o.dead && o.venue === (pull.venue ?? c.venue));
        out.deadlineInjections.n += 1; // the deadline world-fact rides into every plan
        // PASSIVE perception (眼耳鼻身): 眼 from the current placements, 耳 from the PREVIOUS
        // 時辰's notable scenes still leaking through the walls (honest 1-時辰 delay, never
        // omniscient about the scene rendering later this 時辰), 鼻 from lingering traces.
        const perception = computePerception(c, cast, out.prevScenes, out.traces, part);
        out.perceptionInjections.n += 1;
        out.oppCostFramings.n += 1; // the finite-時辰 framing rides into every plan
        const plan = await planner.plan({ char: c, byId, present: preview, clock, night, pull, recalled: autoRecall, reh, targetWhereabouts, waitingNote, worldFactLine, accessNote: accessNote(c.id), perception, timeFinite: true, banzhuSummons });

        let interactIntent: Placement['interactIntent'] = null;
        let timeQueried = true;
        let moved = false;
        let choseWait: { target: string; intent: string } | null = null;
        for (const t of plan.tools) {
            if (t.tool === 'time') {
                timeQueried = true;
            } else if (t.tool === 'move') {
                const dest = resolveVenue(t.dest);
                if (dest) {
                    c.venue = dest;
                    moved = true;
                }
            } else if (t.tool === 'recall') {
                const more = await doRecall(c, t.query ?? query, recall, clock.day, tags, hotTarget, 'plan', hot?.desc ?? '', out.surfaced);
                autoRecall.push(...more.filter((m) => !autoRecall.includes(m)));
            } else if (t.tool === 'interact') {
                if (t.target) interactIntent = { target: t.target, intent: t.intent ?? '說幾句話', confide: t.confide === true };
            } else if (t.tool === 'relations') {
                // Her own call to take stock: the fact sheet lands in her working
                // context exactly like a recall — she reads it, the plan/scene react.
                const lines = relationLedger(c, byId, out.lastScene, clock.currentTick, deps.ticksPerDay);
                if (lines.length) autoRecall.push(`（你靜下心盤了盤身邊眾人的近疏）${lines.join('；')}。`);
            } else if (t.tool === 'wait') {
                if (t.target) choseWait = { target: t.target, intent: t.intent ?? '守著等人出現，把話說開' };
            }
        }

        // SEEK RESOLUTION: whom is c trying to reach this 時辰 (interact / wait / a
        // carried-over post)? If c KNOWS them, navigate by their routine and, when
        // waiting, post up with the standing intent. This is the anti-oscillation core:
        // a seeker heads to the other's real schedule, a waiter camps where they'll pass.
        const seekName = interactIntent?.target ?? choseWait?.target ?? (waiting ? byId.get(waiting.target)?.name : undefined);
        const seekIntent = interactIntent?.intent ?? choseWait?.intent ?? waiting?.intent ?? '把話說開';
        const seekChar = seekName ? byName.get(seekName) ?? [...byName.values()].find((x) => seekName.includes(x.name)) : undefined;
        const seekKnown = !!seekChar && knowsRoutine(c, seekChar);
        // WHO TRAVELS (breaks the mutual-seek swap without puppeteering):
        //   - on duty → I hold my post; the free party comes to me;
        //   - they're already here / already posted up for me → I hold, they arrive;
        //   - they're busy and I'm free → I go to them;
        //   - both free → the one who wants it MORE travels, the other lives their day.
        // Turns are processed keenest-first, so the keener commits and the other sees it.
        let iTravel = false;
        if (seekChar && seekKnown && !iAmOnDuty && !waiting) {
            const alreadyComing = seekChar.venue === c.venue || seekChar.waitingFor?.target === c.id;
            if (!alreadyComing) {
                const tp = predictWhereabouts(seekChar, part, reh);
                if (tp.busy) {
                    iTravel = true; // they're on the job, I'm free → I come to them
                } else {
                    const myT = hot ? tension(hot) : 0;
                    const back = hottest(seekChar);
                    const wantsMeBack = !!back?.target && (back.target === c.id || back.target === c.name);
                    const theirT = wantsMeBack ? tension(back!) : 0;
                    iTravel = myT > theirT || (myT === theirT && c.id < seekChar.id);
                }
            }
        }
        if (!moved) {
            if (iTravel) {
                // If the target was already placed this 時辰 (they are keener → processed
                // first), go to their ACTUAL spot; else navigate by their routine.
                c.venue = placed.has(seekChar!.id) ? seekChar!.venue : predictWhereabouts(seekChar!, part, reh).venue;
            } else if (!waiting && pull.venue && c.venue !== pull.venue) {
                c.venue = pull.venue; // hold my own life (on duty, or let the keener come to me)
            }
        }
        // Post up only as the traveller/seeker — never drag an on-duty holder into a wait.
        if (seekChar && seekKnown && (iTravel || waiting) && (choseWait || waiting)) {
            c.waitingFor = { target: seekChar.id, venue: c.venue, intent: seekIntent, since: waiting?.since ?? clock.currentTick };
        }
        if (choseWait && seekChar && !interactIntent) interactIntent = { target: seekChar.name, intent: seekIntent };

        // SOFT ACCESS GATE: an owned private room you hold no key to, you cannot simply
        // be INSIDE — you are turned to the door and post up (you may break in later at a
        // cost). Public venues and your own/granted rooms pass freely. Your own home is
        // always yours. (§ user: soft, owned, delegable; break-in preserved for 抓姦.)
        if (c.venue !== from && isOwned(c.venue) && !canEnter(c.id, c.venue)) {
            const barred = c.venue;
            atDoor.set(barred, [...(atDoor.get(barred) ?? []), c.id]);
            c.venue = from; // didn't get in — turned back to the door
            if (interactIntent && seekChar) {
                c.waitingFor = { target: seekChar.id, venue: from, intent: seekIntent, since: waiting?.since ?? clock.currentTick };
            }
            log(`    · ${c.name} 到 ${barred} 門外，沒有進入權，只能在門外候著。`);
        }

        // 班主 SUMMONS wins: a summoned lead who wandered off (chasing the romance nexus)
        // is pulled to the rehearsal venue — they answer the call and rejoin the troupe, so
        // effort accrues via the gathering. Bounded to the under-rehearsed lead-by-ability
        // on a rehearsal 時辰; the professional line stops being starved 1/3 of the season.
        if (banzhuSummons && c.venue !== banzhuSummons.venue) {
            c.venue = banzhuSummons.venue;
            c.waitingFor = null;
            interactIntent = null;
            log(`    · 〔班主叫班〕${c.name}（挑梁的角兒）落了排練，被叫回 ${banzhuSummons.venue} 歸班排戲。`);
        }

        // TRANSIT (no teleport): a cross-cluster walk physically passes the streets
        // between. The walker OBSERVES the town on the way — who's out, what the
        // street smells like — and may pick something up. Deterministic, zero LLM:
        // sights land in the ledger + memory so the night mind and tomorrow's plans
        // can react (daily-life texture; observations, not scenes).
        if (c.venue !== from) {
            const dest = c.venue;
            for (const street of transitStreets(from, dest)) {
                // The street's REAL state this 時辰: cast members standing there +
                // dormant lives at their trades (entities, never painted backdrop).
                const seen = cast.filter((o) => o.id !== c.id && !o.dead && o.venue === street).slice(0, 2);
                const streetFolk = out.dormants.filter((d) => d.haunt === street && dormantPresent(d, part));
                let h = clock.currentTick * 31 + street.length;
                for (const ch of c.id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
                const folk = streetFolk.length ? streetFolk[h % streetFolk.length] : undefined;
                const sight = seen.length
                    ? `遠遠見著${seen.map((o) => o.name).join('、')}也在街上`
                    : folk
                      ? `${folk.name}正${folk.doing}`
                      : '街面上冷冷清清';
                const line = `第${clock.day}日·${part}，打${from}往${dest}，路過${street}，${sight}。`;
                c.todayLedger.set(`transit:${street}:${clock.currentTick}`, line);
                await writeMem(recall, c.id, line, seen.length ? 4 : 3, clock.day);
                if (seen.length) log(`    · 〔路上〕${c.name} 路過 ${street}，${sight}。`);
                worldTexture.push(`${c.name}打${from}往${dest}，路過${street}，${sight}`);
                // IN-THE-MOMENT reaction (§C-level agency): the walker decides NOW —
                // most sightings pass; engaging costs the errand (the finite 時辰:
                // duty wage, the person they meant to find — all slip, mechanically,
                // because they simply never arrive). A summoned lead stays summoned
                // (the call of duty already spent this 時辰).
                if (seen.length && !banzhuSummons) {
                    try {
                        const errand = interactIntent
                            ? `你原是要去找${interactIntent.target}（${interactIntent.intent}）`
                            : pull.duty
                              ? '你原是要去當值營生（這一時辰的工錢）'
                              : `你原是要往${dest}去辦自己的事`;
                        const reaction = await planner.transitReact({
                            char: c, seen: seen[0], street, from, dest, errand, clock, night,
                        });
                        if (reaction.act === 'engage') {
                            c.venue = street; // stopped mid-road — the errand slips
                            c.waitingFor = null;
                            interactIntent = { target: seen[0].name, intent: reaction.word ?? '把街上撞見的這一刻接下去' };
                            log(`    · 〔路遇〕${c.name} 在 ${street} 撞見 ${seen[0].name}，把原本的事擱下，追了上去——${reaction.word ?? ''}`);
                            out.dayEvents.push(`${c.name}在${street}攔住了${seen[0].name}`);
                            c.todayLedger.set(`engage:${street}:${clock.currentTick}`, `在${street}撞見${seen[0].name}，擱下原本的事追了上去。`);
                            break; // the walk ends here
                        }
                        if (reaction.act === 'greet') {
                            c.todayLedger.set(`greet:${street}:${clock.currentTick}`, `在${street}與${seen[0].name}打了個照面，點頭而過。`);
                            seen[0].todayLedger.set(`greeted:${street}:${clock.currentTick}`, `在${street}與${c.name}打了個照面。`);
                            log(`    · 〔路上〕${c.name} 與 ${seen[0].name} 在 ${street} 打了個照面，各自趕路。`);
                        }
                    } catch {
                        /* the road goes on */
                    }
                }
                // 順路 purchase (~1/4 walks, needs coin) — a REAL exchange with a
                // real vendor: both sides remember it, and the vendor's life gains
                // heat (enough touches → lazy-activation candidate; the world grows
                // from being touched).
                const vendor = streetFolk.find((d) => d.sells?.length);
                if (vendor && h % 4 === 0 && c.money >= 2) {
                    c.money -= 1;
                    const bought = vendor.sells![h % vendor.sells!.length];
                    c.todayLedger.set(`buy:${street}:${clock.currentTick}`, `路過${street}，同${vendor.name}買了${bought}（花去 1）。`);
                    vendor.ledger.push({ day: clock.day, note: `${c.name}來買過${bought}` });
                    vendor.heat += 1;
                    log(`    · 〔路上〕${c.name} 路過 ${street}，同 ${vendor.name} 買了${bought}。`);
                    worldTexture.push(`${c.name}在${street}同${vendor.name}買了${bought}`);
                    if (vendor.heat === 5) {
                        log(`    · 〔世界生長〕${vendor.name} 的攤子這些日子被戲班的人踏熟了——這條命有了自己的份量（惰性生成候選）。`);
                    }
                }
            }
        }

        // EPISODIC MEMORY of the character's own ACTION this 時辰 (append-only).
        const moveNote = c.venue !== from ? `我從${from}去了${c.venue}` : `我留在${c.venue}`;
        const intentNote = interactIntent ? `，想找${interactIntent.target}${interactIntent.intent}` : '';
        await writeMem(recall, c.id, `第${clock.day}日·${part}，${moveNote}${intentNote}。`, 4, clock.day);

        roundRec.placements.push({
            char: c.name,
            from,
            to: c.venue,
            plan: plan.plan,
            tools: plan.tools.map((t) => toolLabel(t)),
            autoRecall,
            timeQueried,
            interactIntent,
        });
        placed.add(c.id); // a later seeker can now navigate to c's ACTUAL spot
    }

    // rehearsal gathering proof + PRODUCTION accrual: troupe co-located at a work
    // venue this 時辰 become cast and pour in rehearsal effort (recorded per member).
    if (reh.announced) {
        const at = `第${clock.day}日·${part}`;
        for (const v of ['雲錦台戲台', '練功房']) {
            const memberChars = active.filter((c) => c.occupation === 'troupe' && c.venue === v);
            if (memberChars.length >= 2) {
                out.rehearsalGathering.push({ tick: clock.currentTick, part, venue: v, members: memberChars.map((c) => c.name) });
                for (const m of memberChars) addCast(play, m.id, at); // reach 'cast' first
                for (const m of memberChars) accumulateEffort(play, m.id, PRODUCTION.effortPerGathering, at);
                for (const m of memberChars) {
                    m.practicedToday = true;
                    // diminishing daily returns: 0.015/時辰, effective cap ~3 sessions
                    m.craft = Math.min(1, m.craft + 0.015);
                }
                bumpReputeFromEffort(play, memberChars.length);
            }
        }
    }

    // (c)+(d) PASS B — group by venue, run CONCURRENT scenes (dedup pairs, cap).
    // Co-presence is PHYSICAL, not activity-based: someone asleep/idle in a venue is
    // still IN the room. If an active character engages them, they WAKE into the scene
    // (§ user: 柳 waits in 會樂里 asleep; 金鳳 comes home and engages him → he wakes).
    // This is not engine matchmaking — both chose to be here; the world just stops
    // pretending a present sleeper is absent.
    const scenes: SceneRecord[] = [];
    const woken = new Set<string>(); // present-but-inactive characters pulled awake by being engaged
    const venuesWithActive = [...new Set(active.map((c) => c.venue))];
    for (const venue of venuesWithActive) {
        const present = cast.filter((c) => !c.dead && c.venue === venue); // asleep/idle included
        // Claim order = FRESHNESS first (engine spotlight ledger): the pair with the
        // least recent screen time claims a scarce scene slot before the star's Nth
        // scene of the day. Ties keep keenest-first (sort is stable). No matchmaking —
        // only the ORDER of competing, self-chosen intents changes.
        const claims = roundRec.placements
            .filter((x) => x.interactIntent)
            .map((x) => {
                const ca = byName.get(x.char);
                const cb = byName.get(x.interactIntent!.target) ?? [...byName.values()].find((y) => x.interactIntent!.target.includes(y.name));
                const heat = (ca ? (out.spotlight[ca.id] ?? 0) : 0) + (cb ? (out.spotlight[cb.id] ?? 0) : 0);
                // PAIR-FRESHNESS: the SAME pair's Nth scene of the day yields the slot
                // to anyone else's first — a hot couple stops sealing themselves into a
                // private bubble the rest of the world can't reach (蘇連 spent a whole
                // season appearing ONLY with each other). Order only; no matchmaking.
                const pairN = ca && cb ? (out.pairScenesToday.get([ca.id, cb.id].sort().join('|')) ?? 0) : 0;
                return { p: x, heat: heat + pairN * 10 };
            })
            .sort((x, y) => x.heat - y.heat)
            .map((x) => x.p);
        for (const p of claims) {
            if (scenes.length >= deps.maxScenesPerRound) break;
            if (!p.interactIntent) continue;
            const a = byName.get(p.char);
            if (!a || a.venue !== venue || a.sceneThisRound) continue;
            const b = byName.get(p.interactIntent.target) ?? [...byName.values()].find((x) => p.interactIntent!.target.includes(x.name));
            if (!b || b.dead) continue;
            // THE BODY'S VETO (hard, receiving side): a collapsed (危) target cannot be
            // roused into a scene — the visitor finds them dead to the world and withdraws.
            // Pairs with the determineActive gate so the collapsed truly get to recover.
            if (b.health <= HEALTH.dangerAt) {
                if (b.venue === venue) log(`    · ${a.name} 來尋 ${b.name}，人卻昏沉不醒（身子透支），只得退了出去。`);
                continue;
            }
            const coPresent = b.venue === venue; // physically in the room — asleep counts
            // CLUSTER CATCH: a character POSTED UP waiting for b catches them anywhere in
            // the same 戲園/一帶 (same building — b comes off stage / out of a back room).
            const clusterCatch = !coPresent && a.waitingFor?.target === b.id && sameCluster(a.venue, b.venue) && !b.sceneThisRound;
            if (!coPresent && !clusterCatch) {
                if (!a.addressedToday.has(b.id)) {
                    // AUTO-PERSIST: a seeker who KNOWS b posts up and keeps watch rather than
                    // re-guessing a stale coordinate next 時辰 (this is what kills the oscillation).
                    if (knowsRoutine(a, b)) {
                        a.waitingFor = a.waitingFor ?? { target: b.id, venue: a.venue, intent: p.interactIntent.intent, since: clock.currentTick };
                        log(`    · ${a.name} 在 ${a.venue} 守著等 ${b.name}（${pronounFromBody(b.bodyFact)}此刻在 ${b.venue}，尚未過來）。`);
                    } else {
                        log(`    · ${a.name} 想在 ${venue} 找 ${b.name}，撲了個空（${b.name}此刻在 ${b.venue}）。`);
                    }
                }
                continue;
            }
            if (b.sceneThisRound) continue;
            // Cluster catch: b comes to where a is posted (they meet in the shared space).
            if (clusterCatch) {
                log(`    · ${a.name} 守在 ${a.venue}，${b.name} 從 ${b.venue} 過來，兩人在這一帶碰上了。`);
                b.venue = a.venue;
            }
            // Being engaged WAKES a present-but-inactive target: he cannot rest-recover
            // this round, so sleep keeps its teeth (getting woken is not resting).
            if (!active.includes(b)) woken.add(b.id);
            // CONTINUATION: the SAME pair, SAME private venue, immediately-consecutive
            // 時辰 = one still-warm encounter carrying on (溫存續戲), not a fresh scene.
            const pairKey = [a.id, b.id].sort().join('|');
            const prevPair = out.lastScene.get(pairKey);
            const isContinuation = !!prevPair && prevPair.venue === venue && prevPair.tick === clock.currentTick - 1 && !isPublicVenue(venue);
            const scene = await doInteract(
                a, b, p.interactIntent.intent, clock, night, agent, recall, tags, out.surfaced,
                isContinuation, isContinuation ? prevPair!.tail : undefined, out.review, out.chapterReview,
                undefined, out.establishedDyn,
                // 傾吐 cooldown: once per pair per day (a mechanical counter, not a
                // director) — the tag was drifting toward "any earnest talk".
                p.interactIntent.confide === true && !out.confidedToday.has(pairKey) && (out.confidedToday.add(pairKey), true),
                out.bonds,
            );
            scenes.push(scene);
            // BOND ledger: the scene warms the edge (both directions, saturating).
            out.togetherToday.add([a.id, b.id].sort().join('|'));
            if (scene.consummate) out.dayEvents.push(`${a.name}與${b.name}共度了一夜（${venue}）`);
            out.pairScenesToday.set([a.id, b.id].sort().join('|'), (out.pairScenesToday.get([a.id, b.id].sort().join('|')) ?? 0) + 1);
            bumpBond(
                out.bonds,
                a.id,
                b.id,
                scene.consummate ? 'bed' : scene.intimacyAccepted ? 'accept' : scene.confideBy ? 'confide' : scene.isPrivate ? 'private' : 'shared',
            );
            if (scene.confideBy) {
                log(`  〔傾吐〕${a.name} 找 ${b.name} 說了心裡壓著的事——說出口的那些，${b.name} 記下了。`);
                out.dayEvents.push(`${a.name}向${b.name}吐露了心事`);
            }
            // 相許 as an EVENT (no judge): they walked there themselves in this
            // scene; the world records the fact (for 修羅場 stakes + persistence).
            if (scene.intimacyAccepted && !areEstablishedLovers(a, b)) {
                const pk = [a.id, b.id].sort().join('|');
                if (!out.establishedDyn.has(pk)) {
                    out.establishedDyn.add(pk);
                    log(`  〔相許〕${a.name} 與 ${b.name}——這一場裡遞了意、接了意，自此是彼此的人（他們自己走到的）。`);
                    out.dayEvents.push(`${a.name}與${b.name}正式相許，成了彼此的人`);
                }
            }
            out.spotlight = bumpActorFatigue(out.spotlight, [a.id, b.id]);
            out.lastScene.set(pairKey, {
                tick: clock.currentTick,
                venue,
                tail: scene.beats.slice(-2).map((x) => `${x.name}：${x.text}`).join(' '),
            });
            // A rendered troupe scene at a work venue lifts the troupe's repute.
            if (reh.announced && a.occupation === 'troupe' && b.occupation === 'troupe') {
                const k = venueByName.get(venue)?.kind;
                if (k === 'stage' || k === 'practice' || k === 'backstage') bumpReputeFromScene(play);
            }
            a.waitingFor = null; // the watch resolved — they met
            if (b.waitingFor?.target === a.id) b.waitingFor = null;
            log(`    · ${a.name}×${b.name} @ ${venue}${scene.isPrivate ? '（私）' : ''}${scene.consummate ? '〔床〕' : ''} — ${scene.beats.length} 拍${scene.resolved.length ? `，了結：${scene.resolved.join('；')}` : ''}`);
            for (const bt of scene.beats) log(`         ${bt.name}：${bt.text}`);
            // EPISODIC MEMORY for co-present OBSERVERS (what they saw others do).
            const first = scene.beats[0];
            for (const obs of present) {
                if (obs.id === a.id || obs.id === b.id || obs.dead) continue;
                await writeMem(recall, obs.id, `第${clock.day}日·${clock.partOfDay}，我在${venue}看見${a.name}同${b.name}${first ? `：${first.text.slice(0, 36)}` : '對上了話'}。`, 3, clock.day);
            }
        }
    }
    // (d.5) DISCOVERY / 修羅場 — a romantically-invested third who CAME to (or is at)
    // a private INTIMATE scene walks in on it. General: driven by hasRomanticStake +
    // physical presence / having sought a participant, never a hardcoded triangle. The
    // rupture feeds the night self-model overwrite, so the relationship edges rewrite.
    for (const scene of [...scenes]) {
        if (!scene.isPrivate || scene.discovery) continue;
        const [aId, bId] = scene.participantIds;
        const A = byId.get(aId);
        const B = byId.get(bId);
        if (!A || !B) continue;
        if (!(scene.consummate || areEstablishedLovers(A, B))) continue; // only an INTIMATE pair can be caught
        const doorList = new Set(atDoor.get(scene.venue) ?? []);
        for (const p of roundRec.placements) {
            const C = byName.get(p.char);
            if (!C || C.dead || C.id === aId || C.id === bId || C.sceneThisRound) continue;
            // PERCEPTION NEEDS PRESENCE (no omniscience). THREE legitimate ways in:
            //   · you walked IN — you hold a key to this room (present at the venue);
            //   · you were turned away at the DOOR and you FORCE it (破門抓姦) — a costly
            //     transgression only a romantically-invested party would commit;
            //   · NEW — you are ADJACENT (same building, a different room) and you HEAR the
            //     intimate scene leak through the wall, so you rush over and break in. This
            //     is the payoff of passive perception: 抓姦 emerges without both parties
            //     ever sharing a room (the starvation that blocked it before).
            const present = C.venue === scene.venue;
            const atTheDoor = doorList.has(C.id);
            const heard = !present && !atTheDoor && !!hearsScene(C, scene);
            if (!present && !atTheDoor && !heard) continue;
            if (!(hasRomanticStake(C, A, out.establishedDyn) || hasRomanticStake(C, B, out.establishedDyn))) continue;
            const key = `${C.id}|${aId}|${bId}`;
            if (out.discoveredToday.has(key)) continue; // dedupe per (discoverer,pair) per day
            out.discoveredToday.add(key);
            // Both the door-forcer and the one who heard-and-rushed BREAK IN (they force
            // their way into a room they hold no key to).
            const brokeIn = (!present && atTheDoor) || heard;
            if (brokeIn) C.venue = scene.venue; // forced/rushed the door — now inside
            if (heard) out.hearDiscoveries.n += 1;
            // AFTERMATH CONTINUITY: if the caught pair were already SPENT by a recent deep
            // 床戲 (occupiedRestOfDay from a prior 時辰), the break-in bursts in on the still-
            // warm aftermath — the discovery frames it as such, not a disjoint fresh scene.
            const aftermath = A.occupiedRestOfDay || B.occupiedRestOfDay;
            const disc = await renderDiscovery(C, A, B, clock, agent, recall, brokeIn, out.review, aftermath, out.chapterReview);
            scenes.push(disc);
            out.spotlight = bumpActorFatigue(out.spotlight, disc.participants.map((n) => byName.get(n)?.id ?? n));
            out.dayEvents.push(`${C.name}撞見了${A.name}與${B.name}的私情現場`);
            out.discoveries.push({ tick: clock.currentTick, part, discoverer: C.name, pair: [A.name, B.name], venue: scene.venue, brokeIn, heard });
            log(`    ⚔ 修羅場：${C.name} ${heard ? '聞聲趕來、破門闖進，撞見' : brokeIn ? '破門闖進，撞見' : '撞見'} ${A.name}×${B.name} @ ${scene.venue} — ${disc.beats.length} 拍`);
            for (const bt of disc.beats) log(`         ${bt.name}：${bt.text}`);
            break; // one discoverer per scene per 時辰 (no pile-on)
        }
    }

    // PERCEPTION: every NOTABLE scene this 時辰 LEAVES a trace at its venue (a lingering
    // 鼻 signal) and its sound becomes what the NEXT 時辰 can HEAR through the wall.
    for (const s of scenes) leaveTrace(out.traces, s, clock.currentTick);
    out.prevScenes = scenes;

    // OPPORTUNITY COST: a LONG/deep scene (床/修羅場 that ran deep) SPENDS its participants
    // for the rest of the day — they are still abed / spent and take no further turn.
    for (const s of scenes) {
        if (markOccupancyFromScene(s, byId)) {
            out.longScenes.n += 1;
            log(`    · 〔耗盡此日〕${s.participants.join('、')} 這一場（${s.beats.length} 拍）纏得太深，今日再無餘力走動。`);
        }
    }

    roundRec.scenes = scenes;
    roundRec.sceneVenues = [...new Set(scenes.map((s) => s.venue))];

    // (e) WEAVE the 時辰's PUBLIC scenes into one 章回 — carrying the previous 時辰's
    // tail so passages CONNECT (承上啟下) instead of each opening cold.
    const publicScenes = scenes.filter((s) => s.isPublic);
    if (publicScenes.length) {
        const lines = publicScenes.flatMap((s) => s.beats.map((b) => `[${s.venue}] ${b.name}：${b.text}`));
        // The UNION of the 時辰's public-scene participants — feeds the weave/review their
        // 身/sex so the woven 章回 keeps every gender/pronoun correct (no 坤生 → 男人).
        const partIds = new Set(publicScenes.flatMap((s) => s.participantIds));
        const partChars = [...partIds].map((id) => byId.get(id)).filter(Boolean) as Char[];
        // GAP GUARD: only 承上啟下 when the previous woven chapter was the IMMEDIATELY-
        // preceding active 時辰 — same day AND exactly tick-1 (no fast-forwarded 時辰 in
        // between). A day boundary or any skipped 時辰 clears prevTail, so we never write
        // "二日入夜 → 三日日午 話音落地".
        const contiguous = out.lastWovenDay === clock.day && out.lastWovenTick === clock.currentTick - 1;
        const prevTail = contiguous ? out.prevChapterTail || undefined : undefined;
        // WHY the participants converged, in PASS-A (decision) order — the extra context
        // that lets the weave render one coherent scene with 前因後果 instead of stitched
        // beats. Only the public-scene participants' own reasons (their plan), each a
        // BACKGROUND reckoning the prose must not treat as an event.
        const pubNames = new Set(publicScenes.flatMap((s) => s.participants));
        const context = roundRec.placements
            .filter((p) => pubNames.has(p.char) && p.plan)
            .map((p) => `・${p.char}（${p.from}→${p.to}）：${p.plan}`);
        try {
            const woven = await agent.weaveTickChapter({
                clock: `第${clock.day}日·${part}`,
                lines: [...lines, ...worldTexture.slice(0, 6).map((t) => `[世相] ${t}。`)],
                dossier: dossierOf(partChars),
                prevTail,
                castBodies: castBodies(partChars),
                context,
            });
            // CHAPTER-LEVEL SELF-CHECK: repair any gender/pronoun/logic slip in the woven 回.
            roundRec.chapter = woven ? await reviewWovenChapter(agent, partChars, woven, out.chapterReview) : null;
        } catch {
            roundRec.chapter = null;
        }
        if (roundRec.chapter) {
            out.prevChapterTail = roundRec.chapter.slice(-80);
            out.lastWovenTick = clock.currentTick;
            out.lastWovenDay = clock.day;
        }
    }

    // health for the round: active drain, others recover.
    for (const c of cast) {
        if (c.dead) continue;
        const inScenes = scenes.filter((s) => s.participants.includes(c.name)).length;
        const died = applyRoundHealth(c, active.includes(c) || woken.has(c.id), inScenes);
        if (died) {
            roundRec.deaths.push(c.name);
            log(`  〔歿〕${c.name} 積勞成疾，油盡燈枯，歿於第${clock.day}日·${part}。`);
        }
    }

    // DAILY LIFE — WAGES (the income side of the small economy). A duty 時辰 actually
    // WORKED at the duty venue pays the occupation's wage (DATA: ECON table); wandering
    // off duty forfeits it — opportunity cost with an economic edge. The 千金's family
    // allowance lands once a day at 日午 regardless of venue. Never name-cased.
    for (const c of active) {
        if (c.dead) continue;
        const econ = ECON[c.occupation];
        if (!econ) continue;
        const pull = rhythmPull(c, part, reh);
        // "Worked" = at the duty venue, OR at another WORK venue in the same cluster —
        // a rehearsal split (生旦上戲台、武行在練功房) is still a worked duty 時辰.
        const kind = venueByName.get(c.venue)?.kind;
        const atWork =
            c.venue === pull.venue ||
            ((kind === 'stage' || kind === 'practice' || kind === 'backstage' || kind === 'nightclub') &&
                !!pull.venue &&
                sameCluster(c.venue, pull.venue));
        if (econ.dutyWage > 0 && pull.duty && pull.venue && atWork) {
            c.money += econ.dutyWage;
            log(`    · 〔工錢〕${c.name} 在 ${c.venue} 當值，掙下 ${econ.dutyWage}（身上 ${c.money}）。`);
            worldTexture.push(`${c.name}這個時辰在${c.venue}當值營生（${occLabel(c.occupation)}的活計）`);
        }
        if (econ.dailyAllowance > 0 && part === '日午') {
            c.money += econ.dailyAllowance;
            log(`    · 〔月例〕${c.name} 家裡的月例到手 ${econ.dailyAllowance}（身上 ${c.money}）。`);
        }
    }

    // DAILY LIFE — EATING (the small economy). Eating is life maintenance, not a
    // dramatic decision: a hungry character on a NON-scene turn eats in passing — at
    // the food venue they stand at, at a food venue in the SAME cluster (順路), or a
    // cheaper 家常 meal at their own home. The ONLY thing that blocks a meal is coin
    // (money < cost) — poverty, not scheduling, is the dramatic signal. GENERAL:
    // gated by hunger + venue geography + coin, never by character name.
    // EVERYONE eats — including a RESTING character (a person recovering at home
    // still feeds themselves; only being in a scene blocks a meal). W1 starvation
    // trap: the worn-down star rested every turn, the eat loop only covered
    // `active`, and starving-halved sleep recovery kept her pinned at 危 forever.
    for (const c of cast) {
        if (c.dead || c.sceneThisRound || c.hunger < HUNGER_FELT) continue;
        const spot = mealSpotFor(c);
        if (!spot) continue;
        if (eat(c, spot.cost)) {
            out.meals[c.id] = (out.meals[c.id] ?? 0) + 1;
            log(`    · 〔吃食〕${c.name} ${spot.line}（花去 ${spot.cost}，餘 ${c.money}）。`);
            worldTexture.push(`${c.name}${spot.line}`);
        } else if (c.hunger >= HUNGER_STARVING) {
            log(`    · 〔囊空〕${c.name} 餓得發慌，摸遍身上只有 ${c.money}，連碗麵都吃不起，硬撐著。`);
        } else {
            log(`    · 〔捨不得〕${c.name} 摸摸身上只剩 ${c.money}，吃食的錢都要掂量，先餓著。`);
        }
    }

    // (f) 深宵 = scheduled night consolidation for everyone, then per-day reset.
    if (deep) {
        await deepNightWork();
    } else {
        for (const c of active) decayWants(c.wants);
    }

    // FINALE — the 大會串 premiere on the deadline day's finale 時辰. A world-fact
    // deadline has arrived, not an instruction: the accumulated play PREMIERES, then
    // a DETERMINISTIC box office is computed (box-office.ts). The LLM writes only the
    // performance prose; every number is an audited sum.
    const isFinale =
        clock.day === showrunner.deadlineDay && part === showrunner.finalePart && play.state !== 'premiered';
    if (isFinale) {
        const at = `第${clock.day}日·${part}`;
        const leads = [...play.cast].sort((x, y) => abilityOf(y) - abilityOf(x)).slice(0, 2);
        if (leads.length >= 2) {
            const a = byId.get(leads[0])!;
            const b = byId.get(leads[1])!;
            a.sceneThisRound = false;
            b.sceneThisRound = false;
            a.venue = '雲錦台戲台';
            b.venue = '雲錦台戲台';
            markPremiered(play, at);
            const scene = await doInteract(
                a,
                b,
                `在${showrunner.finaleName}的戲台上，領銜合演這一齣新排的《${play.title}》——台下滿座，同行都來了，一季的積怨與情分都坐在台下看著；這一場定春雪社的名`,
                clock,
                night,
                agent,
                recall,
                tags,
                out.surfaced,
                false,
                undefined,
                out.review,
                out.chapterReview,
                // The finale is the season's PAYOFF, not a want negotiation — give it
                // room to be a real performance set-piece (body's veto still wins).
                { maxTurns: 10 },
                out.establishedDyn,
            );
            out.premiere = scene;
            out.boxOffice = computeBoxOffice(play, cast, (a.craft + b.craft) / 2);
            roundRec.scenes.push(scene);
            roundRec.sceneVenues = [...new Set(roundRec.scenes.map((s) => s.venue))];
            log(`  〔大會串〕春雪社在雲錦台獻演《${play.title}》 — ${a.name}×${b.name} 領銜，共 ${scene.beats.length} 拍。`);
            log(
                `  〔票房〕確定性加總 = ${out.boxOffice.total}（購票 ${out.boxOffice.ticketBuyers}、回訪 ${out.boxOffice.repeats}）｜戲之品相 ${out.boxOffice.quality.toFixed(2)}｜班之名望 ${out.boxOffice.repute.toFixed(2)}`,
            );
        } else {
            log('  〔大會串〕春雪社湊不齊角兒，這一場沒能演成。');
        }
    }

    return roundRec;
}

// ── the season driver ────────────────────────────────────────────────────────
export async function runSeason(deps: SeasonDeps): Promise<SeasonResult> {
    const tags = tagIndex(deps.cast);
    // seed thick memories into recall (day 1) — VERBATIM.
    for (const c of deps.cast) {
        for (const m of c.thickMemories) {
            await deps.recall.remember(c.id, m.text, { kind: 'reflection', importance: m.importance, day: 1 });
        }
    }
    const out = {
        surfaced: [] as SurfacedMemory[],
        rehearsalGathering: [] as SeasonResult['rehearsalGathering'],
        timeToolUses: { n: 0 },
        premiere: null as SceneRecord | null,
        boxOffice: null as BoxOffice | null,
        deadlineInjections: { n: 0 },
        prevChapterTail: '',
        lastWovenTick: -1,
        lastWovenDay: -1,
        spotlight: {},
        establishedDyn: new Set<string>(deps.establishedPairs ?? []),
        lastScene: new Map<string, { tick: number; venue: string; tail: string }>(),
        discoveries: [] as SeasonResult['discoveries'],
        discoveredToday: new Set<string>(),
        confidedToday: new Set<string>(),
        dormants: deps.dormants ?? buildDormants(),
        bonds: deps.bonds ?? new Map(),
        togetherToday: new Set<string>(),
        pairScenesToday: new Map<string, number>(),
        dayEvents: [] as string[],
        review: { scenes: 0, beatsChanged: 0 } as ReviewCounter,
        chapterReview: { chapters: 0, repaired: 0 } as ChapterReviewCounter,
        povReflections: {} as Record<string, Array<{ day: number; text: string }>>,
        traces: new Map() as TraceStore,
        prevScenes: [] as SceneRecord[],
        perceptionInjections: { n: 0 },
        hearDiscoveries: { n: 0 },
        oppCostFramings: { n: 0 },
        longScenes: { n: 0 },
        occupiedTurns: { n: 0 },
        meals: {} as Record<string, number>,
    };
    const rounds: RoundRecord[] = [];
    const allScenes: SceneRecord[] = [];
    const deaths: string[] = [];
    const total = deps.days * deps.ticksPerDay;
    for (let tick = 0; tick < total; tick++) {
        const clock = makeClock(deps.ticksPerDay, tick);
        const rec = await runRound(clock, deps, tags, out);
        rounds.push(rec);
        allScenes.push(...rec.scenes);
        deaths.push(...rec.deaths);
        if (deps.checkpoint && (tick + 1) % deps.ticksPerDay === 0) {
            try {
                deps.checkpoint(tick + 1, [...out.establishedDyn]);
            } catch {
                /* checkpointing must never kill the season */
            }
        }
    }
    return {
        rounds,
        scenes: allScenes,
        surfaced: out.surfaced,
        reh: deps.reh,
        rehearsalGathering: out.rehearsalGathering,
        timeToolUses: out.timeToolUses.n,
        deaths,
        play: deps.play,
        establishedPairs: [...out.establishedDyn],
        dormants: out.dormants,
        bonds: out.bonds,
        boxOffice: out.boxOffice,
        premiere: out.premiere,
        showrunnerVerdict: razor(deps.showrunner, deps.play),
        deadlineInjections: out.deadlineInjections.n,
        discoveries: out.discoveries,
        povReflections: out.povReflections,
        reviewedScenes: out.review.scenes,
        reviewedBeatsChanged: out.review.beatsChanged,
        reviewedChapters: out.chapterReview.chapters,
        repairedChapters: out.chapterReview.repaired,
        meals: out.meals,
        perceptionInjections: out.perceptionInjections.n,
        hearDiscoveries: out.hearDiscoveries.n,
        oppCostFramings: out.oppCostFramings.n,
        longScenes: out.longScenes.n,
        occupiedTurns: out.occupiedTurns.n,
    };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function resolveVenue(dest?: string): string | null {
    if (!dest) return null;
    if (venueByName.has(dest)) return dest;
    const m = VENUES.find((v) => v.name.includes(dest) || dest.includes(v.name));
    return m ? m.name : null;
}

function toolLabel(t: ToolCall): string {
    if (t.tool === 'move') return `move(${t.dest ?? ''})`;
    if (t.tool === 'interact') return `interact(${t.target ?? ''}｜${t.intent ?? ''})`;
    if (t.tool === 'wait') return `wait(${t.target ?? ''}｜${t.intent ?? ''})`;
    if (t.tool === 'recall') return `recall(${t.query ?? ''})`;
    return 'time';
}

let _zero: Want | null = null;
function zeroW(): Want {
    if (!_zero) _zero = { weight: 0, sat: 0 } as Want;
    return _zero;
}
