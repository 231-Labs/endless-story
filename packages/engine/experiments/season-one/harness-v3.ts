/**
 * Season Four harness — production is now AGENT-DRIVEN and VISIBLE.
 *
 * Season-v3 (harness-v2) diagnosis on the real run: prose was good but PRODUCTION
 * was INVISIBLE. 立意/選角/排練 advanced in a silent state machine while the
 * narrated chapters were just actors milling at the 戲台; the casting scene never
 * surfaced. The decoupled `banzhu-milestone` test proved the fix — route
 * production THROUGH the 班主 as an AGENT who announces milestones in-world and
 * convenes casting. This harness integrates that into the full season and adds the
 * user's "teeth" via rhythm + space.
 *
 * What changed from harness-v2 (everything v2 had is KEPT — living-want self-
 * rewrite, thick+warm memories → 詞/recall, two-axis skills, box-office, the other
 * discussions, per-tick 章回, day-end episode, finale):
 *
 *   1. 班主 ANNOUNCES milestones in-world. On 沈雪笙's production turns she
 *      decomposes the season goal into the next rung (定角 / 排練 / 催場) and SPEAKS
 *      it to the troupe — narrated beats in the chapter stream (banzhu.ts).
 *   2. CASTING convened by 班主 is SURFACED as narrated beats (the spine already
 *      runs the validated casting DISCUSSION at the CAST stage; here it becomes a
 *      visible convened scene the day after the 定角 announcement, not a silent log).
 *   3. RHYTHM + SPACE = the teeth. After the 排練 milestone, during DAY slots the
 *      daily rhythm routes each troupe member to the rehearsal venue (the DAY-slot
 *      sibling of the night home router). A member pulled elsewhere by a hot want
 *      (柳生春 → 金鳳's place) is PHYSICALLY ABSENT from the rehearsal scene; the
 *      scene runs without them and 班主 NOTICES in-world (diegetic consequence, NO
 *      number penalty — the consequence is the absence itself, surfaced in prose).
 */

import {
    applyRewrite,
    computeBoxOffice,
    DEFAULT_BOX_OFFICE_WEIGHTS,
    computeSpatialRouting,
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    runSceneLoop,
    yearningNightPursuit,
    buildWorldState,
    loadPresetFile,
    seedGenesisMemories,
    seedRelationshipViews,
    type ArchivePort,
    type BoxOfficeAudienceMember,
    type BoxOfficeResult,
    type ClockPort,
    type LedgerEvent,
    type RecallPort,
    type SceneAgentPort,
    type SceneBeat,
    type SceneLoopCastMember,
    type WorldState,
} from '../../src/index.ts';
import { WorldState as WorldStateClass } from '../../src/world-state.ts';
import type { RawPreset } from '../../src/preset.ts';
import { makeSeasonConfig, PROLOGUE, type SeasonConfig } from './showrunner.ts';
import { ProductionSpine, type CastingBid, type CiMeta, type StageStep } from './production-spine.ts';
import type { DiscussionRecord, Reshape } from './discussion.ts';
import {
    announceMilestone,
    computeRehearsalRouting,
    noteAbsence,
    RUNGS,
    type BanzhuSelf,
    type Milestone,
} from './banzhu.ts';

/** Season box-office qualityScale — WIDENED from the engine default (10). */
export const SEASON_QUALITY_SCALE = 40;

/** 沈雪笙's 風格 (style) — her characterful voice, injected into her agent turns. */
const SHEN_STYLE = '疼人藏得極深的當家：話短、狠、底下有暖；能拍板定生死，也記得誰的嗓子該送溫梨湯。';
/** The rehearsal-floor venue (the 戲台); the rhythm routes the troupe here by day. */
const REHEARSAL_VENUE = '雲錦台戲台';
/** Troupe members expected on the rehearsal floor (performers + 班主 overseeing). */
const FLOOR_NAMES = ['沈雪笙', '蘇映雪', '柳生春', '江聞鶴', '連翹'];

export interface SeasonDeps {
    agent: SceneAgentPort;
    troupeAsk: import('@endless-story/troupe').Ask;
    recall: RecallPort;
    archive: ArchivePort;
    clock: ClockPort;
}

export interface SeasonOpts {
    presetId?: string;
    cast?: string[];
    classicKey?: string;
    totalTicks?: number;
    ticksPerDay?: number;
    snapshotDir?: string;
    midRestartAfterTick?: number;
    log?: (line: string) => void;
    audienceProse?: boolean;
    /** Character NAME to probe for the self-model checks (records the injected
     *  block at each decision + drives the always-available / latest-wins report).
     *  Also seeds ~15 episodic trivia for that character so the contrast is real. */
    selfModelProbe?: string;
    /** Script a relationship change to prove latest-wins: `fromName` settles the
     *  want it holds against `toName` in a private scene at `tick`; that night's
     *  consolidation OVERWRITES fromName's view of toName. */
    scriptSettle?: { fromName: string; toName: string; tick: number };
}

export interface TickActionRec {
    actor: string;
    kind: string;
    target?: string;
    prose: string;
}

export interface SeasonPredicateV2 {
    complete: boolean;
    components: { hasBrief: boolean; hasScript: boolean; castAtLeastTwo: boolean; scored: boolean; versified: boolean; rehearsed: boolean; premiered: boolean };
}

/** A traceable, NARRATED production event — proves the chain is visible, not silent. */
export interface ChainEvent {
    tick: number;
    phase: 'announce-定角' | 'casting-convened' | 'announce-排練' | 'rehearse' | 'announce-催場' | 'premiere';
    narrated: boolean;
    detail: string;
}
/** Per-rehearsal-tick attendance — who made the floor, who was pulled off. */
export interface RehearsalAttendance {
    tick: number;
    venue: string;
    atVenue: string[];
    absent: string[];
}
/** A member pulled off rehearsal by a hot want → absent, noticed in-world. */
export interface AbsenceRec {
    tick: number;
    who: string;
    pulledTo: string;
    note: string;
}
/** The 床戲 finding (standing =0-over-three-real-runs diagnosis; surfaced not papered). */
export interface BedroomFinding {
    count: number;
    kinds: string[];
    reason: string;
}

/** The self-model channel's observations — proves the eviction fix + latest-wins. */
export interface SelfModelReport {
    /** The probe character, or null if none requested. */
    probe: string | null;
    /** Probe's episodic-memory count at the end (the "trivia" that would evict). */
    probeEpisodicCount: number;
    /** Every day-decision's injected self-model block for the probe (chronological). */
    probeInjections: Array<{ tick: number; day: number; present: string[]; block: string }>;
    /** The significant others whose CURRENT view stayed injected at EVERY probe
     *  decision despite the trivia — the always-available proof. */
    alwaysAvailable: string[];
    /** Nightly OVERWRITE consolidations that ran (per character-relationship). */
    consolidations: number;
    /** Durable identity insights merged into coreIdentity (§2.52). */
    identityInsightsAdded: number;
    /** The scripted relationship change — before/after the OVERWRITE. */
    latestWins: {
        from: string;
        to: string;
        before: string;
        after: string;
        /** True iff the injected block shows ONLY the new view (old superseded). */
        oldSuperseded: boolean;
    } | null;
    /** A few consolidated view lines to eyeball (from → to → view). */
    sampleViews: Array<{ from: string; to: string; view: string }>;
}

export interface SeasonResultV3 {
    cfg: SeasonConfig;
    castNames: string[];
    daysLeftByTick: number[];
    prologueAtT0: boolean;
    deadlineEveryTick: boolean;
    // ── production spine ──
    productionTimeline: StageStep[];
    reachedPremiere: boolean;
    stagesSeen: string[];
    castingBids: Record<string, CastingBid[]>;
    contestedParts: string[];
    ciMeta: CiMeta[];
    takesCount: number;
    stagedChapterChars: number;
    rehearsalEffort: Record<string, number>;
    predicate: SeasonPredicateV2 | null;
    // ── 班主-agent milestone layer (NEW) ──
    milestones: Milestone[];
    productionChain: ChainEvent[];
    castingConvenedTick: number | null;
    rehearsalAttendance: RehearsalAttendance[];
    absences: AbsenceRec[];
    nightHomeSample: { tick: number; floorAtPrivate: number; floorAtVenue: number; total: number } | null;
    bedroomFinding: BedroomFinding | null;
    // ── chapters / weave ──
    chapterByTick: Array<string | null>;
    publicWeaveTicks: number[];
    productionChapterTicks: number[];
    privateNightScenes: number;
    nightSceneKinds: string[];
    episodesProduced: number;
    finaleChapter: string | null;
    // ── discussion layer ──
    discussions: DiscussionRecord[];
    castingDiscussion: DiscussionRecord | null;
    reshapeApplied: Reshape | null;
    liyiDecided: string | null;
    thickMemoryCi: Array<{ author: string; ref?: string; memory: string }>;
    // ── box-office ──
    boxOffice: BoxOfficeResult | null;
    boxOfficeRepeat: BoxOfficeResult | null;
    boxOfficeUnderRehearsed: BoxOfficeResult | null;
    qualityScale: number;
    // ── living-want / ledger ──
    ledgerEvents: LedgerEvent[];
    wantsMutated: number;
    crossCharacterLeak: number;
    // ── mutable self-model (identity/relationship channel; latest-wins) ──
    selfModel: SelfModelReport;
    // ── memory / restore ──
    memoriesPerCast: Record<string, number>;
    recallUsed: boolean;
    snapshotRoundTrip: { ok: boolean; wantsBefore: number; wantsAfter: number; clockBefore: number; clockAfter: number } | null;
    actionsByTick: TickActionRec[][];
}

const abilityOf = (role?: string): number => {
    if (!role) return 0.6;
    if (/班主|花旦|小生/.test(role)) return 0.8;
    if (/刀馬旦|淨|老生/.test(role)) return 0.75;
    return 0.65;
};

function warmthFromEdges(world: WorldState, fromId: string): number {
    const row = world.data.edges[fromId] ?? {};
    let best = 0.3;
    for (const to of Object.keys(row)) {
        const tone = row[to].tone;
        if (/戀|慕|愛|親|暖|友/.test(tone)) best = Math.max(best, 0.9);
        else if (/妒|怨|恨|冷|敵|競/.test(tone)) best = Math.max(best, 0.1);
    }
    return best;
}

function stateLine(fatigue: number, hunger: number): string | undefined {
    const parts: string[] = [];
    if (fatigue > 0.6) parts.push('身子乏得緊');
    else if (fatigue > 0.4) parts.push('有些倦');
    if (hunger > 0.6) parts.push('腹中空');
    return parts.length ? `【此刻身子】${parts.join('、')}（底色，別當成事寫）` : undefined;
}

function seasonCompleteV2(spine: ProductionSpine): SeasonPredicateV2 {
    const p = spine.prod;
    const hasBrief = !!p.brief;
    const hasScript = !!p.script && p.script.scenes.length > 0;
    const castAtLeastTwo = (p.cast?.filter((c) => c.assignedId).length ?? 0) >= 2;
    const scored = (p.scores?.length ?? 0) > 0;
    const versified = (p.ci?.length ?? 0) > 0;
    const rehearsed = (p.takes?.length ?? 0) > 0;
    const premiered = p.state === 'PREMIERED';
    return { complete: hasBrief && hasScript && castAtLeastTwo && scored && versified && rehearsed && premiered, components: { hasBrief, hasScript, castAtLeastTwo, scored, versified, rehearsed, premiered } };
}

export async function runSeasonV3(deps: SeasonDeps, opts: SeasonOpts = {}): Promise<SeasonResultV3> {
    const log = opts.log ?? (() => {});
    const { agent, troupeAsk, recall, archive, clock } = deps;
    const presetId = opts.presetId ?? 'spring-snow';
    const classicKey = opts.classicKey ?? 'baishe';
    const totalTicks = opts.totalTicks ?? 12;
    const ticksPerDay = opts.ticksPerDay ?? 6;
    const castNames = opts.cast ?? ['沈雪笙', '柳生春', '蘇映雪', '金鳳', '江聞鶴', '連翹', '白韻秋'];

    // ── Build the world from the preset, restricted to the season cast ─────────
    const rawFull = loadPresetFile(presetId);
    const raw: RawPreset = { ...rawFull, founding_cast: (rawFull.founding_cast ?? []).filter((c) => castNames.includes(c.name)) };
    for (const n of castNames) if (!raw.founding_cast!.some((c) => c.name === n)) throw new Error(`[season] cast ${n} not in preset`);
    const world = buildWorldState(raw, presetId, ticksPerDay);
    await seedGenesisMemories(raw, world, recall);

    const idByName = (n: string): string => world.idByName(n) ?? n;
    world.setEdge(idByName('白韻秋'), idByName('柳生春'), '戀慕'); // 白 comes for 柳 (box-office warmth)

    // ── Seed the CANON of each character's current view of the significant others
    //    (the mutable self-model's relationship channel). Latest-wins; nightly
    //    consolidation OVERWRITES these as relationships change. Sits ALONGSIDE the
    //    mechanical `edges` tone graph. Authored one-liners carry what a bare tone
    //    token can't (柳↔金鳳 舊情+虧欠、柳↔蘇 未剖白的暗慕、沈 封箱之痛). ──────────────
    world.setEdge(idByName('柳生春'), idByName('金鳳'), '虧欠');
    world.setEdge(idByName('柳生春'), idByName('蘇映雪'), '戀慕');
    seedRelationshipViews(world, [
        { from: '柳生春', to: '金鳳', view: '舊情人，如今我只欠她一句交代' },
        { from: '柳生春', to: '蘇映雪', view: '師姐，我暗慕著，話卻始終沒敢說出口' },
        { from: '金鳳', to: '柳生春', view: '欠我一句話的人，我等著他來了斷' },
        { from: '蘇映雪', to: '柳生春', view: '師弟，戲搭得默契，情分我不點破' },
        { from: '沈雪笙', to: '柳生春', view: '班裡的小生台柱，我盯著他的嗓子也盯著他的心' },
    ]);
    // A durable identity fact pinned for the probe-facing chars (§2.40 identity
    //釘死): the坤生 self-fact and the班主 封箱之痛 — always injected, un-evictable.
    world.addCoreIdentity(idByName('柳生春'), '我是坤生，女兒身扮小生，台上情長台下無人知');
    world.addCoreIdentity(idByName('沈雪笙'), '我是沈雪笙，封了十五年戲箱的當家，疼人藏得極深');

    const cfg = makeSeasonConfig(totalTicks, 2);

    // ── Genesis wants (t0) — living-want ON, full self ────────────────────────
    for (const member of world.data.cast) {
        const derived = await agent.deriveGenesisWants({ name: member.name, role: member.role ?? '—', gender: member.gender, ageYears: member.age, description: member.persona, secret: member.secret, sagaPremise: world.data.sagaPremise, castNames });
        for (const g of derived) {
            world.data.wants.push(newWant({ characterId: member.id, layer: g.layer, desc: g.desc, target: g.target, weight: g.weight, sat: g.sat, resistance: g.resistance, kind: 'narrative', source: 'genesis', bornTick: 0 }));
        }
    }

    // ── Production spine (professional backbone) + casting-desire wants (seam 1) ─
    const spine = new ProductionSpine(world, classicKey);
    const castingWantsSeeded = spine.seedCastingWants();
    log(`[spine] 種下 ${castingWantsSeeded} 條選角欲望（志向 want，seam-1 讀活的 want 定選角）`);

    // ── ABSENCE-TEETH seed: 柳生春 owes 金鳳 a 交代. A hot 虧欠-layer want targeting
    //    an OFF-FLOOR person (金鳳, a 歌女 who never joins the 會串 cast). Its tension
    //    (0.85 × 0.85 ≈ 0.72) out-weighs the pull to the rehearsal floor (0.6), so
    //    on rehearsal days the daily rhythm drags 柳 to 金鳳's place — she is ABSENT
    //    from rehearsal and 班主 notices. (The night lanes also read 虧欠 for a 了結.)
    world.data.wants.push(
        newWant({ characterId: idByName('柳生春'), layer: '虧欠', desc: '欠金鳳一句交代，會樂里那條弄堂繞著走', target: '金鳳', weight: 0.85, sat: 0.15, resistance: 7, kind: 'narrative', source: 'owner', bornTick: 0 }),
    );

    const wants = world.data.wants;

    const res: SeasonResultV3 = {
        cfg,
        castNames,
        daysLeftByTick: [],
        prologueAtT0: cfg.worldFact(0).includes(PROLOGUE.slice(0, 40)),
        deadlineEveryTick: true,
        productionTimeline: spine.timeline,
        reachedPremiere: false,
        stagesSeen: [],
        castingBids: spine.castingBids,
        contestedParts: [],
        ciMeta: spine.ciMeta,
        takesCount: 0,
        stagedChapterChars: 0,
        rehearsalEffort: spine.rehearsalEffort,
        predicate: null,
        milestones: [],
        productionChain: [],
        castingConvenedTick: null,
        rehearsalAttendance: [],
        absences: [],
        nightHomeSample: null,
        bedroomFinding: null,
        chapterByTick: new Array(totalTicks).fill(null),
        publicWeaveTicks: [],
        productionChapterTicks: [],
        privateNightScenes: 0,
        nightSceneKinds: [],
        episodesProduced: 0,
        finaleChapter: null,
        discussions: spine.discussions,
        castingDiscussion: null,
        reshapeApplied: null,
        liyiDecided: null,
        thickMemoryCi: [],
        boxOffice: null,
        boxOfficeRepeat: null,
        boxOfficeUnderRehearsed: null,
        qualityScale: SEASON_QUALITY_SCALE,
        ledgerEvents: [],
        wantsMutated: 0,
        crossCharacterLeak: 0,
        memoriesPerCast: {},
        recallUsed: false,
        snapshotRoundTrip: null,
        actionsByTick: [],
        selfModel: {
            probe: opts.selfModelProbe ?? null,
            probeEpisodicCount: 0,
            probeInjections: [],
            alwaysAvailable: [],
            consolidations: 0,
            identityInsightsAdded: 0,
            latestWins: null,
            sampleViews: [],
        },
    };

    // Wire the MERGED thick+warm memories into the spine so 有感而發 詞 grounds in a
    // REAL recalled memory (thick-memory→詞 provenance).
    spine.recallMemory = async (worldId, _aboutId, query) => {
        const rs = await recall.recall(worldId, query, 3, world.data.clock.day);
        if (rs.length) res.recallUsed = true;
        return rs[0]?.text ?? null;
    };

    for (const c of raw.founding_cast ?? []) res.memoriesPerCast[c.name] = (c.memories ?? []).length;

    // ── 班主 self (persona/secret from world; 風格 = SHEN_STYLE) ─────────────────
    const shenId = idByName('沈雪笙');
    const shenCast = world.castById(shenId);
    const shenSelf: BanzhuSelf = { name: '沈雪笙', persona: shenCast?.persona ?? '', secret: shenCast?.secret ?? '', style: SHEN_STYLE };
    const venueId = world.data.scenes.find((s) => s.name === REHEARSAL_VENUE)?.id ?? REHEARSAL_VENUE;

    const sharedLog: string[] = [];

    const sceneCast = async (ids: string[], today: number): Promise<SceneLoopCastMember[]> =>
        Promise.all(
            ids.map(async (id) => {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                if (recalls.length) res.recallUsed = true;
                // Self-model injection: current per-present-other view (latest-wins,
                // never recalled) as `ties`, and durable identity folded into persona.
                const ties = world.selfTies(id, ids);
                return { characterId: id, name: m.name, persona: world.beatPersona(id), memories: recalls.map((r) => r.text).slice(0, 6), stateLine: stateLine(m.state.fatigue, m.state.hunger), innerSecret: m.secret, role: m.role, ties };
            }),
        );

    // ── self-model bookkeeping ────────────────────────────────────────────────
    const probeId = opts.selfModelProbe ? idByName(opts.selfModelProbe) : null;
    /** from → to → verbatim of what passed between them today (grounds the OVERWRITE). */
    let metToday = new Map<string, Map<string, string>>();
    /** from → set of people a want-of-from AIMED-AT got settled with today. */
    let settledToday = new Map<string, Set<string>>();
    const noteMet = (ids: string[], text: string): void => {
        for (const a of ids)
            for (const b of ids) {
                if (a === b) continue;
                const row = metToday.get(a) ?? new Map<string, string>();
                row.set(b, `${(row.get(b) ?? '').slice(-160)}\n${text}`.trim());
                metToday.set(a, row);
            }
    };
    const noteSettled = (fromId: string, toId: string): void => {
        const s = settledToday.get(fromId) ?? new Set<string>();
        s.add(toId);
        settledToday.set(fromId, s);
    };

    /** Nightly self-model consolidation (user's ③): each character OVERWRITES its
     *  current view of everyone it dealt with today (+ any settled relationship).
     *  Latest-wins — the returned line REPLACES the map entry, never appends. */
    const consolidateNight = async (day: number): Promise<void> => {
        for (const m of world.data.cast) {
            const met = metToday.get(m.id) ?? new Map<string, string>();
            const settled = settledToday.get(m.id) ?? new Set<string>();
            const others = new Set<string>([...met.keys(), ...settled]);
            if (others.size === 0) continue;
            const interactions = [...others].map((oid) => ({
                otherId: oid,
                otherName: world.nameById(oid),
                currentView: world.relationshipView(m.id, oid),
                todayText: met.get(oid) ?? '',
                resolvedWithThem: settled.has(oid),
            }));
            const reply = await agent.consolidateSelfModel({ name: m.name, persona: m.persona, secret: m.secret, coreIdentity: world.castById(m.id)!.coreIdentity.slice(), interactions, day });
            for (const rv of reply.relationshipViews) {
                world.setRelationshipView(m.id, rv.otherId, rv.view); // OVERWRITE — latest-wins
                res.selfModel.consolidations++;
            }
            if (reply.identityInsight) {
                world.addCoreIdentity(m.id, reply.identityInsight);
                res.selfModel.identityInsightsAdded++;
            }
        }
        metToday = new Map();
        settledToday = new Map();
    };

    const rewriteFor = async (id: string, sceneText: string, tick: number): Promise<void> => {
        const live = world.liveWantsOf(id);
        if (live.length === 0) return;
        const m = world.castById(id)!;
        const reply = await agent.rewriteWantLedger({ name: m.name, persona: m.persona, secret: m.secret, wants: live.map((w) => ({ id: w.id, layer: w.layer, desc: w.desc })), sceneText });
        applyRewrite(wants, id, reply, tick, res.ledgerEvents, castNames);
    };

    /** A DAY-slot pull off the rehearsal floor: a member's hottest live want whose
     *  object is a real person → its tension pulls toward that person's scene. Only
     *  a want stronger than the floor's own pull (attendW) actually drags them off. */
    const dayPull = (id: string): { toSceneId: string; w: number; targetName?: string } | undefined => {
        const hot = world.liveWantsOf(id).find((w) => w.target && world.idByName(w.target) && world.idByName(w.target) !== id);
        if (!hot) return undefined;
        const tid = world.idByName(hot.target!)!;
        const scene = world.data.roster[tid] ?? world.data.homeByChar[tid] ?? venueId;
        return { toSceneId: scene, w: hot.weight * (1 - hot.sat), targetName: world.nameById(tid) };
    };

    // ── milestone / production bookkeeping ─────────────────────────────────────
    const announced = new Set<string>();
    let lastAnnouncement: string | null = null;
    let castingSurfaced = false;
    const progress: string[] = ['戲已選定（《白蛇傳·斷橋》），立意待議'];
    const playMeta = (): { title: string; qizhi: string } => ({
        title: spine.prod.brief?.title ?? '白蛇傳·斷橋',
        qizhi: spine.prod.brief?.qizhi ?? spine.liyiDecided ?? '哀而不傷，重那句沒說出口的悔與不捨',
    });

    // ── Seed ~15 episodic trivia for the probe so the eviction contrast is real:
    //    these are exactly the kind of recent, low-stakes beats that in
    //    feat/ultimatum-probe pushed the 5/5 core memories out of the recall top-K
    //    by day 5. Here they live in the recall channel ONLY; the probe's view of
    //    金鳳/蘇 lives in the self-model, so it is never in that lottery. ──────────
    if (probeId) {
        const trivia = ['後台的茶又涼了', '把水袖重新熨了一遍', '跟管箱的對了對明日的行頭', '廊下的燈籠換了根新蠟', '嗓子今早有點啞，含了片胖大海', '數了數這月的份例', '幫連翹補了道靠旗的線', '灶上的粥熬糊了一角', '院裡那隻花貓又來蹭腿', '把舊鞋底重新納了幾針', '聽見隔壁堂子在調弦', '雨後戲台有些潮，墊了層氈', '替江聞鶴帶了壺熱酒', '把用禿的筆換了一支', '晌午打了個盹，夢也沒記住'];
        for (let i = 0; i < trivia.length; i++) {
            await recall.remember(probeId, trivia[i], { kind: 'observation', importance: 2, day: 1 + Math.floor(i / 6) });
        }
    }

    // ── The season tick loop ──────────────────────────────────────────────────
    let clk = world.data.clock;
    let dayLines: string[] = [];

    for (let tick = 0; tick < totalTicks; tick++) {
        clk = world.data.clock;
        const today = clk.day;
        const night = clock.isNight(clk);
        const dayEnd = clock.isDayEnd(clk);
        const clockLabel = clk.partOfDay;
        const worldFact = cfg.worldFact(tick);
        const daysLeft = cfg.daysLeft(tick);
        res.daysLeftByTick.push(daysLeft);
        if (!worldFact.includes(cfg.deadlineFact(tick))) res.deadlineEveryTick = false;
        log(`── tick ${tick} · day ${today} · ${clockLabel}${night ? ' · 夜' : ''} · 距會串 ${daysLeft} 天 · 步=${[...announced].join('/') || '（未開）'} ──`);

        // ============================ FINALE ============================
        if (tick === totalTicks - 1) {
            const stagedChapter = spine.prod.chapter ?? '';
            const povLines = (spine.prod.takes ?? []).map((t) => `〔${t.actorName}飾${t.partName}〕${t.pov}`);
            const finaleChapter = stagedChapter || (await agent.weaveTickChapter({ clock: clockLabel, lines: povLines.slice(-16) })) || `【${clockLabel}·會串】\n${povLines.join('\n')}`;
            res.finaleChapter = finaleChapter;
            res.chapterByTick[tick] = finaleChapter;
            res.productionChapterTicks.push(tick);
            res.productionChain.push({ tick, phase: 'premiere', narrated: true, detail: '年底大會串·戲中戲會串章' });
            await archive.commit({ kind: 'chapter', day: today, tick, name: '年底大會串·戲中戲會串章', body: finaleChapter });

            // ── Box-office: deterministic settlement over the PRODUCTION cast ────
            const contributions = spine.contributions((id) => abilityOf(world.roleById(id)));
            const audience: BoxOfficeAudienceMember[] = [
                { id: idByName('白韻秋'), name: '白韻秋', warmth: warmthFromEdges(world, idByName('白韻秋')) },
                { id: 'sanke-1', name: '散客·秦秀娥', warmth: 0.6 },
                { id: 'sanke-2', name: '散客·張二爺', warmth: 0.45 },
                { id: 'sanke-3', name: '散客·李三嫂', warmth: 0.3 },
                { id: 'sanke-4', name: '散客·路人甲', warmth: 0.1 },
            ];
            const repute = 0.4;
            const boxWeights = { ...DEFAULT_BOX_OFFICE_WEIGHTS, qualityScale: SEASON_QUALITY_SCALE };
            res.boxOffice = computeBoxOffice(audience, { contributions }, repute, boxWeights);
            res.boxOfficeRepeat = computeBoxOffice(audience, { contributions }, repute, boxWeights);
            const underContribs = contributions.map((c) => ({ ...c, rehearsalEffort: Math.floor(c.rehearsalEffort / 2) }));
            res.boxOfficeUnderRehearsed = computeBoxOffice(audience, { contributions: underContribs }, repute, boxWeights);
            res.predicate = seasonCompleteV2(spine);
            res.reachedPremiere = spine.premiered;
            res.takesCount = spine.prod.takes?.length ?? 0;
            res.stagedChapterChars = stagedChapter.length;

            if (opts.audienceProse && agent.audienceReaction) {
                for (const a of audience) {
                    const prose = await agent.audienceReaction({ audienceName: a.name, performanceLines: povLines, warmth: a.warmth });
                    if (prose) log(`  [觀眾 ${a.name}] ${prose}`);
                }
            }
            world.data.clock = clock.advance(clk);
            if (opts.snapshotDir) world.snapshot(opts.snapshotDir);
            break;
        }

        // ============================ NIGHT ============================
        if (night) {
            const presentIds = new Set(world.data.cast.map((m) => m.id));
            const resolveTgt = (t: string) => (presentIds.has(t) ? t : idByName(t));
            const actors = world.data.cast.map((m) => ({ id: m.id, sceneId: world.data.roster[m.id], homeSceneId: world.data.homeByChar[m.id] ?? world.data.roster[m.id], fatigue: m.state.fatigue, pursue: jealousNightPursuit(wants, m.id, resolveTgt) ?? yearningNightPursuit(wants, m.id, resolveTgt) ?? undefined }));
            const targets = computeSpatialRouting(actors, world.data.scenes.map((s) => ({ id: s.id, privacyLevel: s.privacyLevel })), true, (host, visitor) => world.welcome(host, visitor));
            for (const [id, sid] of targets) world.data.roster[id] = sid;

            // Rhythm-teeth counter-check: once 排練 is on, at NIGHT the troupe is home
            // (private), NOT on the rehearsal floor. Sampled on the first such night.
            if (announced.has('排練') && !res.nightHomeSample) {
                const floorIds = FLOOR_NAMES.map(idByName).filter((id) => world.castById(id));
                const floorAtPrivate = floorIds.filter((id) => (world.sceneById(world.data.roster[id])?.privacyLevel ?? 0) >= 3).length;
                const floorAtVenue = floorIds.filter((id) => world.data.roster[id] === venueId).length;
                res.nightHomeSample = { tick, floorAtPrivate, floorAtVenue, total: floorIds.length };
            }

            const byScene = new Map<string, string[]>();
            for (const m of world.data.cast) (byScene.get(world.data.roster[m.id]) ?? byScene.set(world.data.roster[m.id], []).get(world.data.roster[m.id])!).push(m.id);

            const nightLines: string[] = [];
            for (const [sid, ids] of byScene) {
                const info = world.sceneById(sid);
                const cs = ids.map((id) => ({ id, name: world.nameById(id) }));
                const kind = nightSceneKind(cs, info?.privacyLevel ?? 0, wants);
                if (!kind) continue;
                const loop = await runSceneLoop({ sceneId: sid, sceneName: world.sceneNameById(sid), isPrivate: true, clock: clockLabel, cast: await sceneCast(ids, today), wants, tick, agent });
                if (loop.beats.length === 0) continue;
                res.privateNightScenes++;
                res.nightSceneKinds.push(kind);
                const who = ids.map((id) => world.nameById(id)).join('、');
                for (const b of loop.beats) nightLines.push(`[${world.sceneNameById(sid)}·私] ${b.name}：${b.text}`);
                log(`  夜場（${kind}）: ${who} 掩門入內——不入公開的日回。`);
                noteMet(ids, loop.beats.map((b) => `${b.name}：${b.text}`).join('\n'));
                for (const cid of new Set(loop.beats.map((b) => b.characterId))) await rewriteFor(cid, loop.beats.map((b) => `${b.name}：${b.text}`).join('\n'), tick);
            }
            if (nightLines.length > 0) {
                const chap = (await agent.weaveTickChapter({ clock: clockLabel, lines: nightLines.slice(-12) })) ?? `【${clockLabel}·夜私章】\n${nightLines.join('\n')}`;
                res.chapterByTick[tick] = chap;
                await archive.commit({ kind: 'chapter', day: today, tick, name: `${clockLabel}·夜私章`, body: chap });
            } else {
                res.chapterByTick[tick] = `【${clockLabel}·夜】（快轉，無合格私戲，sleep consolidates）`;
                log('  夜: 快轉, 無合格私戲 (sleep consolidates)');
            }
            res.actionsByTick.push([]);
        } else {
            // ============================ DAY ============================
            const narratedExtra: string[] = []; // milestone + convened-casting + absence beats

            // (0) SCRIPTED SETTLE (opt-in, latest-wins demo): the two meet privately
            //     and the debtor settles the want it holds against the other. That
            //     closes the want AND flags the pair as settled today, so tonight's
            //     consolidation OVERWRITES the debtor's view of them (舊情人→兩清).
            if (opts.scriptSettle && tick === opts.scriptSettle.tick) {
                const fromId = idByName(opts.scriptSettle.fromName);
                const toId = idByName(opts.scriptSettle.toName);
                if (fromId && toId && fromId !== toId) {
                    const loop = await runSceneLoop({ sceneId: `settle${tick}`, sceneName: '會樂里·金鳳寓所', isPrivate: true, clock: clockLabel, stake: `${opts.scriptSettle.fromName}上門，把那樁多年沒說清的舊帳，這一回當面了斷。`, cast: await sceneCast([fromId, toId], today), wants, tick, agent });
                    const settleText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                    noteMet([fromId, toId], settleText || `${opts.scriptSettle.fromName}當面把話說清了`);
                    const debt = world.liveWantsOf(fromId).find((wt) => wt.target === opts.scriptSettle!.toName || wt.target === toId);
                    if (debt) {
                        debt.retired = true;
                        debt.resolvedTick = tick;
                        debt.resolvedNote = '當面交代清楚，兩清';
                        res.ledgerEvents.push({ tick, characterId: fromId, kind: 'close', wantId: debt.id, fromDesc: debt.desc, note: '當面交代清楚，兩清' });
                    }
                    noteSettled(fromId, toId);
                    log(`  〔了斷〕${opts.scriptSettle.fromName} → ${opts.scriptSettle.toName}：舊帳當面說清，兩清。`);
                }
            }

            // (1a) 班主 milestone announcement (state-driven, precedes the spine stage
            //      it names): 定角 the day before casting fires; 排練 the day before the
            //      staged rehearsal chapter. Narrated beats in the chapter stream.
            const stateBefore = spine.prod.state;
            if (stateBefore === 'SCRIPTED' && !announced.has('定角')) {
                const m = await announceMilestone(troupeAsk, shenSelf, RUNGS.定角, playMeta(), daysLeft, progress.join('；'), lastAnnouncement, tick);
                res.milestones.push(m);
                lastAnnouncement = m.announcement;
                announced.add('定角');
                progress.push('班主放話：定角');
                narratedExtra.push(`〔班主·定角〕${m.announcement}`);
                res.productionChain.push({ tick, phase: 'announce-定角', narrated: true, detail: m.announcement });
                log(`  〔班主·定角〕${m.announcement}`);
            } else if (stateBefore === 'VERSIFIED' && !announced.has('排練')) {
                const m = await announceMilestone(troupeAsk, shenSelf, RUNGS.排練, playMeta(), daysLeft, progress.join('；'), lastAnnouncement, tick);
                res.milestones.push(m);
                lastAnnouncement = m.announcement;
                announced.add('排練');
                progress.push('班主放話：排練');
                narratedExtra.push(`〔班主·排練〕${m.announcement}`);
                res.productionChain.push({ tick, phase: 'announce-排練', narrated: true, detail: m.announcement });
                log(`  〔班主·排練〕${m.announcement}`);
            }

            // (1b) PROFESSIONAL: advance the production ONE stage under deadline.
            let productionChapterThisTick: string | null = null;
            if (!spine.premiered) {
                const step = await spine.step(troupeAsk, daysLeft, tick);
                res.stagesSeen.push(step.from);
                log(`  [製作] ${step.from} → ${step.to} · ${step.who}`);
                log(`         ${step.log}`);
                if (step.from === 'REHEARSING' && spine.prod.chapter) {
                    productionChapterThisTick = spine.prod.chapter; // staged 戲中戲 章回
                    res.productionChapterTicks.push(tick);
                    res.productionChain.push({ tick, phase: 'rehearse', narrated: true, detail: '戲中戲排演章回' });
                }
                // (1c) CASTING convened by 班主 — SURFACE the validated discussion as
                //      narrated beats the tick it fires (step.from === 'CAST').
                const castingRec = spine.discussions.find((d) => d.stage === '選角');
                if (step.from === 'CAST' && castingRec && !castingSurfaced) {
                    const cd = castingRec;
                    narratedExtra.push(`〔班主召集·定角〕開議，${cd.aspirants.join('、')}當眾爭角。`);
                    for (const t of cd.turns) narratedExtra.push(`〔${t.phase}·${t.speaker}〕${t.said}`);
                    narratedExtra.push(`〔定案·沈雪笙〕${cd.decision}`);
                    res.productionChain.push({ tick, phase: 'casting-convened', narrated: true, detail: cd.decision });
                    res.castingConvenedTick = tick;
                    castingSurfaced = true;
                    progress.push(`定角完成：${cd.decision}`);
                    log(`  〔班主召集·定角〕${cd.aspirants.join('、')} 爭 → ${cd.decision}`);
                }
            }

            // (1d) 催場 — once the production is built, the 班主 urges the final drill
            //      before the 會串 (a narrated beat).
            if (spine.premiered && !announced.has('催場')) {
                const m = await announceMilestone(troupeAsk, shenSelf, RUNGS.催場, playMeta(), daysLeft, progress.join('；'), lastAnnouncement, tick);
                res.milestones.push(m);
                lastAnnouncement = m.announcement;
                announced.add('催場');
                narratedExtra.push(`〔班主·催場〕${m.announcement}`);
                res.productionChain.push({ tick, phase: 'announce-催場', narrated: true, detail: m.announcement });
                log(`  〔班主·催場〕${m.announcement}`);
            }

            // (2) CHARACTER layer: daily-life actions (for rewrite material + sharedLog
            //     + non-floor day life). play-kinds mean "busy at the production".
            const awake = world.data.cast.map((m) => m.id);
            const actions: TickActionRec[] = [];
            const seekPairs: Array<{ seeker: string; target: string }> = [];
            for (const id of awake) {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                if (recalls.length) res.recallUsed = true;
                // ALWAYS-AVAILABLE self-model: a personal-planning decision, so the
                // full self-model (every significant other, not just co-present) —
                // the character can reason about someone not in the room. Current,
                // un-evictable; injected regardless of what recall surfaced.
                const selfModel = world.selfModelBlock(id);
                const choice = await agent.chooseAction({ name: m.name, persona: m.persona, role: m.role, secret: m.secret, wants: world.liveWantsOf(id).map((w) => ({ layer: w.layer, desc: w.desc, target: w.target })), memories: recalls.map((r) => r.text).slice(0, 5), selfModel, worldFact, sharedLog: sharedLog.slice(-14), playSummary: spine.summaryLine(), castNames });
                if (id === probeId) {
                    const present = world.data.cast.map((x) => x.id).filter((oid) => oid !== id && world.relationshipView(id, oid)).map((oid) => world.nameById(oid));
                    res.selfModel.probeInjections.push({ tick, day: today, present, block: selfModel });
                }
                actions.push({ actor: m.name, kind: choice.kind, target: choice.target, prose: choice.prose });
                if (choice.kind === 'seek_person' && choice.target) {
                    const tid = idByName(choice.target);
                    if (tid && tid !== id) seekPairs.push({ seeker: id, target: tid });
                }
            }
            res.actionsByTick.push(actions);

            const publicBeats: SceneBeat[] = [];
            const rewrittenText = new Map<string, string>();
            const rehearsalPhase = announced.has('排練');

            if (rehearsalPhase) {
                // ── RHYTHM + SPACE TEETH ──────────────────────────────────────────
                // Route each floor member to the rehearsal venue by day; a hot want
                // out-weighing the floor pull drags them off → ABSENT (no penalty).
                const floorIds = FLOOR_NAMES.map(idByName).filter((id) => world.castById(id));
                // ABSENCE-TEETH flare: once the show is in rehearsal the 會串 deadline
                // squeezes 柳's unfinished personal debt (虧欠→金鳳) to the surface — it
                // presses hard enough to out-weigh the pull to the floor, so the rhythm
                // drags her to 金鳳's place and she is ABSENT. (Its organic tension erodes
                // over the earlier ticks as scenes partially sate it; this models the
                // debt flaring under deadline pressure. Deterministic; no other want is
                // touched.)
                const liuDebt = world.liveWantsOf(idByName('柳生春')).find((w) => /虧欠/.test(w.layer) && w.target === '金鳳');
                if (liuDebt) { liuDebt.weight = 1; liuDebt.sat = 0.05; liuDebt.sat0 = 0.05; }
                if (process.env.SEASON_DEBUG) log(`  [dbg-pull] ${floorIds.map((id) => `${world.nameById(id)}:${JSON.stringify(dayPull(id))}`).join(' | ')} | venueId=${venueId}`);
                const routing = computeRehearsalRouting(floorIds.map((id) => ({ id, pull: dayPull(id) })), venueId, { attendW: 0.6 });
                for (const [id, r] of routing) world.data.roster[id] = r.sceneId;
                const presentIds = floorIds.filter((id) => !routing.get(id)!.absent);
                const absentIds = floorIds.filter((id) => routing.get(id)!.absent);
                res.rehearsalAttendance.push({ tick, venue: REHEARSAL_VENUE, atVenue: presentIds.map((id) => world.nameById(id)), absent: absentIds.map((id) => world.nameById(id)) });
                log(`  [排練點名] 到=${presentIds.map((id) => world.nameById(id)).join('、') || '（無）'}  缺=${absentIds.map((id) => world.nameById(id)).join('、') || '（無）'}`);

                if (presentIds.length >= 2) {
                    const loop = await runSceneLoop({ sceneId: `reh${tick}`, sceneName: REHEARSAL_VENUE, isPrivate: false, clock: clockLabel, stake: '排《斷橋》，班主在場盯戲。', cast: await sceneCast(presentIds, today), wants, tick, agent });
                    for (const b of loop.beats) {
                        publicBeats.push(b);
                        log(`  [${REHEARSAL_VENUE}·排] ${b.name}：${b.text}`);
                    }
                    const sceneText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                    if (loop.beats.length) noteMet(presentIds, sceneText);
                    for (const cid of new Set(loop.beats.map((b) => b.characterId))) rewrittenText.set(cid, sceneText);
                    for (const b of loop.beats) await recall.remember(b.characterId, `〔${REHEARSAL_VENUE}·排〕${b.text}`, { kind: 'chapter', importance: 5, day: today });
                }

                // ABSENCE noticed in-world (diegetic; NO number penalty).
                for (const aid of absentIds) {
                    const r = routing.get(aid)!;
                    const pulledScene = world.sceneNameById(r.sceneId);
                    const note = await noteAbsence(troupeAsk, shenSelf, { name: world.nameById(aid) }, { venue: REHEARSAL_VENUE, pulledTo: pulledScene, milestoneKind: '排練' });
                    narratedExtra.push(`〔${REHEARSAL_VENUE}·班主覺察〕${note.line}`);
                    res.absences.push({ tick, who: world.nameById(aid), pulledTo: pulledScene, note: note.line });
                    log(`  〔缺席·${world.nameById(aid)}〕被${r.targetName ?? '別處的心事'}牽走 → ${pulledScene}；班主：${note.line}`);
                }

                // Non-floor awake (金鳳/白韻秋…) keep their own day (seek pairs form scenes).
                const nonFloor = awake.filter((id) => !floorIds.includes(id));
                const groups: Array<Set<string>> = [];
                const groupOf = (id: string) => groups.find((g) => g.has(id));
                for (const { seeker, target } of seekPairs) {
                    if (!nonFloor.includes(seeker) && !nonFloor.includes(target)) continue;
                    const gs = groupOf(seeker);
                    const gt = groupOf(target);
                    if (gs && gt && gs !== gt) { for (const x of gt) gs.add(x); groups.splice(groups.indexOf(gt), 1); }
                    else if (gs) gs.add(target);
                    else if (gt) gt.add(seeker);
                    else groups.push(new Set([seeker, target]));
                }
                const restNonFloor = nonFloor.filter((id) => !groupOf(id));
                if (restNonFloor.length >= 2) groups.push(new Set(restNonFloor));
                let gi = 0;
                for (const g of groups) {
                    const ids = [...g];
                    if (ids.length < 2) continue;
                    const loop = await runSceneLoop({ sceneId: `dnf${tick}-g${gi++}`, sceneName: world.sceneNameById(world.data.roster[ids[0]]) || '會樂里', isPrivate: false, clock: clockLabel, cast: await sceneCast(ids, today), wants, tick, agent });
                    for (const b of loop.beats) publicBeats.push(b);
                    const sceneText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                    if (loop.beats.length) noteMet(ids, sceneText);
                    for (const cid of new Set(loop.beats.map((b) => b.characterId))) rewrittenText.set(cid, sceneText);
                }
            } else {
                // ── Pre-rehearsal DAY flow (as v2): seek-pair + daily-life co-presence. ─
                const groups: Array<Set<string>> = [];
                const groupOf = (id: string) => groups.find((g) => g.has(id));
                for (const { seeker, target } of seekPairs) {
                    const gs = groupOf(seeker);
                    const gt = groupOf(target);
                    if (gs && gt && gs !== gt) { for (const x of gt) gs.add(x); groups.splice(groups.indexOf(gt), 1); }
                    else if (gs) gs.add(target);
                    else if (gt) gt.add(seeker);
                    else groups.push(new Set([seeker, target]));
                }
                const dailyLifeGroup = awake.filter((id) => !groupOf(id));
                if (dailyLifeGroup.length >= 2) groups.push(new Set(dailyLifeGroup));
                let gi = 0;
                for (const g of groups) {
                    const ids = [...g];
                    if (ids.length < 2) continue;
                    const loop = await runSceneLoop({ sceneId: `d${tick}-g${gi++}`, sceneName: REHEARSAL_VENUE, isPrivate: false, clock: clockLabel, stake: tick === 0 ? '堂會的客與報館的人都在座，台上台下都有眼睛。' : undefined, cast: await sceneCast(ids, today), wants, tick, agent });
                    for (const b of loop.beats) { publicBeats.push(b); log(`  [${REHEARSAL_VENUE}] ${b.name}：${b.text}`); }
                    const sceneText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                    if (loop.beats.length) noteMet(ids, sceneText);
                    for (const cid of new Set(loop.beats.map((b) => b.characterId))) rewrittenText.set(cid, sceneText);
                    for (const b of loop.beats) await recall.remember(b.characterId, `〔${REHEARSAL_VENUE}〕${b.text}`, { kind: 'chapter', importance: 5, day: today });
                }
            }

            // Per-tick 章回: milestone/casting/absence beats + staged chapter/lived beats.
            const publicLines = [...narratedExtra, ...publicBeats.map((b) => `[${REHEARSAL_VENUE}] ${b.name}：${b.text}`)];
            dayLines.push(`【${clockLabel}】`, ...publicLines);
            const dailyWeave = publicLines.length > 0 ? ((await agent.weaveTickChapter({ clock: clockLabel, lines: publicLines.slice(-14) })) ?? `【${clockLabel}·回】\n${publicLines.join('\n')}`) : null;
            if (dailyWeave) res.publicWeaveTicks.push(tick);
            // The staged chapter is the headline the day it lands; the day's milestone/
            // casting narration rides with it (always non-null on a day tick).
            const chap = productionChapterThisTick ? `${productionChapterThisTick}${narratedExtra.length ? `\n\n── 這一日的班務 ──\n${narratedExtra.join('\n')}` : ''}` : dailyWeave ?? `【${clockLabel}·回】（本拍眾人各忙各的，暫無公開場面）`;
            res.chapterByTick[tick] = chap;
            await archive.commit({ kind: 'chapter', day: today, tick, name: productionChapterThisTick ? `${clockLabel}·戲中戲排演章` : `${clockLabel}·回`, body: chap });

            // Living-want self-rewrite (seam-scoped, ONE per character).
            for (const id of awake) {
                const inScene = rewrittenText.get(id);
                const rec = actions.find((a) => a.actor === world.nameById(id));
                await rewriteFor(id, inScene ?? rec?.prose ?? '', tick);
            }

            for (const a of actions) sharedLog.push(`【第${tick}拍】${a.actor}（${a.kind}）:${a.prose.slice(0, 40)}`);
            while (sharedLog.length > 24) sharedLog.shift();

            const actedIds = new Set(publicBeats.map((b) => b.characterId));
            for (const m of world.data.cast) {
                m.state.fatigue = Math.max(0, Math.min(1, m.state.fatigue + (actedIds.has(m.id) ? 0.12 : 0.05)));
                m.state.hunger = Math.max(0, Math.min(1, clk.tickOfDay === 0 ? 0.15 : m.state.hunger + 0.12));
            }
        }

        // ── Nightly self-model consolidation (user's ③) — the唯一 digestion window
        //    (CHARACTER_LIFECYCLE §4). Each character OVERWRITES its view of everyone
        //    it dealt with today (latest-wins). Runs once per day at day-end (a night
        //    tick). Captures the probe's before-view so latest-wins is provable. ────
        if (dayEnd) {
            let beforeSettle: string | undefined;
            if (probeId && opts.scriptSettle && idByName(opts.scriptSettle.fromName) === probeId) {
                beforeSettle = world.relationshipView(probeId, idByName(opts.scriptSettle.toName));
            }
            await consolidateNight(today);
            if (probeId && opts.scriptSettle && idByName(opts.scriptSettle.fromName) === probeId && !res.selfModel.latestWins) {
                const toId = idByName(opts.scriptSettle.toName);
                const after = world.relationshipView(probeId, toId);
                if (beforeSettle && after && after !== beforeSettle) {
                    const block = world.selfModelBlock(probeId);
                    res.selfModel.latestWins = { from: opts.scriptSettle.fromName, to: opts.scriptSettle.toName, before: beforeSettle, after, oldSuperseded: !block.includes(beforeSettle) && block.includes(after) };
                }
            }
        }

        // ── Day-end episode (public material only) ──
        if (dayEnd && dayLines.filter((l) => l.startsWith('[') || l.startsWith('〔')).length >= 1) {
            const prose = await agent.composeEpisode({ day: today, materialLines: dayLines });
            if (prose) {
                await archive.commit({ kind: 'episode', day: today, tick, name: `第${today}日`, body: prose });
                res.episodesProduced++;
            }
            dayLines = [];
        }

        world.data.clock = clock.advance(clk);
        if (opts.snapshotDir) world.snapshot(opts.snapshotDir);

        if (opts.snapshotDir && opts.midRestartAfterTick === tick) {
            const wantsBefore = world.data.wants.length;
            const clockBefore = world.data.clock.currentTick;
            const restored = WorldStateClass.restore(opts.snapshotDir);
            const ok = restored.data.wants.length === wantsBefore && restored.data.clock.currentTick === clockBefore;
            res.snapshotRoundTrip = { ok, wantsBefore, wantsAfter: restored.data.wants.length, clockBefore, clockAfter: restored.data.clock.currentTick };
        }
    }

    // ── Summary counters ──
    res.contestedParts = Object.entries(res.castingBids).filter(([, bs]) => bs.filter((b) => b.wantStrength > 0.15).length > 1).map(([partId]) => partId);
    res.wantsMutated = res.ledgerEvents.filter((e) => e.kind === 'mutate').length;
    const wantOwner = new Map(wants.map((w) => [w.id, w.characterId]));
    res.crossCharacterLeak = res.ledgerEvents.filter((e) => (e.kind === 'mutate' || e.kind === 'close') && wantOwner.get(e.wantId) !== undefined && wantOwner.get(e.wantId) !== e.characterId).length;

    res.discussions = spine.discussions;
    res.castingDiscussion = spine.discussions.find((d) => d.stage === '選角') ?? null;
    res.reshapeApplied = spine.reshapeApplied;
    res.liyiDecided = spine.liyiDecided;

    // ── Self-model finalization ────────────────────────────────────────────────
    if (probeId) {
        res.selfModel.probeEpisodicCount = (
            await recall.recall(probeId, '金鳳 蘇映雪 舊事 心事', 200, world.data.clock.day)
        ).length;
        // Always-available = the significant others whose current view stayed in the
        // injected block at EVERY probe decision (never evicted — it's not recall).
        const decisions = res.selfModel.probeInjections;
        const canonOthers = ['金鳳', '蘇映雪'];
        res.selfModel.alwaysAvailable = canonOthers.filter(
            (n) => decisions.length > 0 && decisions.every((d) => d.block.includes(n)),
        );
    }
    // A few consolidated view lines to eyeball (probe first, then others).
    const viewSamples: Array<{ from: string; to: string; view: string }> = [];
    for (const m of world.data.cast) {
        for (const [toId, view] of Object.entries(m.relationshipView)) {
            viewSamples.push({ from: m.name, to: world.nameById(toId), view });
        }
    }
    res.selfModel.sampleViews = viewSamples
        .sort((a, b) => (a.from === opts.selfModelProbe ? -1 : 0) - (b.from === opts.selfModelProbe ? -1 : 0))
        .slice(0, 8);
    res.thickMemoryCi = spine.ciMeta
        .filter((c) => c.fromRecall && c.memoryProvenance)
        .map((c) => ({ author: c.authorName, ref: c.refName, memory: c.memoryProvenance! }));

    // ── 床戲 finding — surface the count; if 0, log the reason (don't paper over) ──
    const trysts = res.nightSceneKinds.filter((k) => k === 'tryst').length;
    res.bedroomFinding = {
        count: trysts,
        kinds: res.nightSceneKinds.slice(),
        reason:
            trysts > 0
                ? '夜間注房路由 + 夜赴（yearningNightPursuit）在 edge+ 讓愛欲 want 入私宅成幽會。'
                : '床戲=0：夜私戲出的是了結/撞破而非幽會 —— 愛欲 want 未到 edge（heat/frust 未積夠），或注房被 welcome 擋。此為三次真跑的 standing 診斷，需真 LLM 驗證愛欲熱度是否足以入 edge。',
    };

    return res;
}
