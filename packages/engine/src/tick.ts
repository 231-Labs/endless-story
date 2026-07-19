/**
 * Tick pipeline — one time-slice of the world, a lean re-expression of the
 * production want lane (web tick-loop.ts §3.9) with the CHARACTER_LIFECYCLE §6
 * fixes baked in from the start, not side-loaded:
 *
 *   · genesis wants are grown from the FULL self (persona + secret + saga
 *     premise), never the stripped description that starved production;
 *   · every scene beat self-assembles from persona + secret + recalled memories
 *     + a state line;
 *   · a port that fails THROWS (no catch(()=>[]) swallowing);
 *   · the whole world is snapshotted every tick, so a restart continues.
 *
 * The engine stages situations and resolves collisions; it never scripts a
 * character's choice (RUNNER_V2 §7). All LLM authorship goes through the
 * SceneAgentPort; the loop itself is deterministic orchestration.
 */

import {
    applyRipples,
    decayWants,
    fadeStaleWants,
    forcingLevel,
    newWant,
    nightSceneKind,
    shouldDeriveAftermath,
    tension,
} from './core/want-core.ts';
import { runSceneLoop, type SceneBeat, type SceneLoopCastMember } from './core/scene-loop.ts';
import { livelihoodRhythm } from './core/livelihood-rhythm.ts';
import {
    accumulateEffort,
    addScriptFragment,
    canPremiere,
    ensureContributor,
    markPremiered,
    productionSummary,
    startProduction,
    totalEffort,
    type ProductionStatus,
} from './core/production.ts';
import { PARTS_OF_DAY } from './ports.ts';
import type { ArchivePort, CanonicalSceneEvent, ClockPort, EconomyPort, RecallPort, SceneAgentPort } from './ports.ts';
import { deriveBeatPerceiverIds, projectEventBeatsForWitness } from './core/scene-perception.ts';
import { commitBeatPhysics } from './core/physical-canon.ts';
import { bankRehearsalAttendance, enforceContractCommandPairing, settleEveningPerformance, settleTenancyMoveIns } from './core/season-economy.ts';
import type { WorldState } from './world-state.ts';

export interface TickDeps {
    agent: SceneAgentPort;
    recall: RecallPort;
    archive: ArchivePort;
    clock: ClockPort;
    /** Season money physics. REQUIRED when the world carries economy data —
     *  a moneyed world without a settlement port must fail loud, not drift. */
    economy?: EconomyPort;
}

export interface TickOpts {
    /** Where WorldState snapshots to at tick end. Omit to skip snapshotting. */
    snapshotDir?: string;
    /** Log line sink (default console.log). */
    log?: (line: string) => void;
    /** Live observer for committed beats (post-physics, post-economy, pre-review).
     *  Observability only: the tick never awaits it, and an observer failure is
     *  logged and swallowed — mechanism must not depend on it. */
    onBeat?: (observation: TickBeatObservation) => void;
}

/** One committed beat as seen live, mid-tick, before the scene freezes. */
export interface TickBeatObservation {
    day: number;
    tick: number;
    clock: string;
    sceneId: string;
    sceneName: string;
    isPrivate: boolean;
    beatIndex: number;
    beat: SceneBeat;
}

export interface TickReport {
    day: number;
    tick: number;
    partOfDay: string;
    night: boolean;
    genesisRan: number;
    scenesPlayed: number;
    beats: number;
    /** Distinct scene ids that saw a beat this tick. */
    beatScenes: string[];
    resolved: number;
    liveWants: number;
    actedCharacterIds: string[];
    /** Scene ids chosen by characters and committed by the engine this tick. */
    routed: Record<string, string>;
    wove: boolean;
    episode: boolean;
    /** Frozen objective events produced this tick, before any POV interpretation. */
    events: CanonicalSceneEvent[];
    /** Read-only session projections, linked back to their frozen event. */
    eventPovs: TickEventPov[];
    /** Objective settlement facts (wages/costs/deadlines) when this tick closed a day. */
    economyNotices?: string[];
    /** Emergent-production snapshot when the flag is on — lets the lab surface a
     *  「製作中」 panel without re-reading the world file. Absent when off. */
    production?: {
        title: string;
        status: ProductionStatus;
        contributors: number;
        totalEffort: number;
        scriptFragments: number;
        premieredDay?: number;
    };
}

export interface TickEventPov {
    characterId: string;
    name: string;
    eventId: string;
    body: string;
}

/** A lean daily-life state line from the state vector (undertone, not an event). */
function stateLine(fatigue: number, hunger: number): string | undefined {
    const parts: string[] = [];
    if (fatigue > 0.6) parts.push('身子乏得緊');
    else if (fatigue > 0.4) parts.push('有些倦');
    if (hunger > 0.6) parts.push('腹中空');
    else if (hunger > 0.4) parts.push('略有些餓');
    return parts.length ? `【此刻身子】${parts.join('、')}（底色，別當成事寫）` : undefined;
}

export async function runTick(world: WorldState, deps: TickDeps, opts: TickOpts = {}): Promise<TickReport> {
    const log = opts.log ?? ((l: string) => console.log(l));
    const { agent, recall, archive, clock, economy } = deps;
    const w = world.data;
    if (w.economy && !economy) {
        throw new Error('world carries season economy data but TickDeps.economy is missing — pass a LocalEconomy');
    }
    const c = w.clock;
    const nowTick = c.currentTick;
    const today = c.day;
    const night = clock.isNight(c);
    const dayEnd = clock.isDayEnd(c);
    const clockLabel = c.partOfDay;
    const wants = w.wants; // mutated in place; snapshot persists it
    const events: CanonicalSceneEvent[] = [];
    const eventPovs: TickEventPov[] = [];

    log(`── tick ${nowTick} · day ${today} · ${clockLabel}${night ? ' · 夜' : ''} ──`);

    // The clock constitution, stated to every mind every beat: agents cannot
    // budget a day they do not know the shape of (v17: both leads burned the
    // deadline night between stage and paper because nobody told them 戲散之後
    // 仍有兩個時辰). World facts, not direction.
    // The full rulebook, not just the clock: a game hands players its physics
    // before they step in (the user's rule: 「物理上的規則應該要清楚揭露，像個
    // skill 一樣」). Facts about how the world works; never direction.
    const perDay = c.ticksPerDay;
    const leftToday = Math.max(0, perDay - c.tickOfDay - 1);
    const timeCharter = [
        // Charter derives the day's shape from the ACTUAL clock (not a hardcoded 6):
        // whatever ticks-per-day this run uses, agents are told the real count, one
        // action per tick, and exactly where they stand — 本日第 X／N 拍、還剩 M 拍 —
        // so they can budget a day whose shape they now truly know.
        `一日${perDay}拍${perDay === PARTS_OF_DAY.length ? '，一拍一時辰' : ''}，循${PARTS_OF_DAY.join('、')}${perDay === PARTS_OF_DAY.length ? '' : '推移'}；每一拍你只有一次行動（先擇去處，再在場中言行）。此刻${clockLabel}，為本日第${c.tickOfDay + 1}／${perDay}拍，過此還有${leftToday}拍。`,
        '去處只能從當下列給你的合法選項中挑；場地有容量，滿了便進不去。入夜與深宵屬夜，各自歸宿或私訪。',
        '紙、物、錢都是真的：動物件須出 objectEffects、動銀錢須出 economyCommands（買賣、給錢、簽約、拒簽、填搭檔、還價），只在嘴上說的世界不認帳。',
        '簽約、拒簽、填欄、還價都得人在契約紙前；還價一次一句條款，對方隔夜回話。',
        ...(w.economy?.performance ? [`黃昏【${w.economy.performance.venueSceneName}】開鑼：領銜缺席戲就塌，白日在台上排過戲夜裡才叫得動座，票房入班庫。`] : []),
        ...(w.economy ? ['每日深宵之末日結：工錢、食宿、帳期一併清算；契約限期之日以子夜收卷。'] : []),
    ].join('');

    // 0) SCHEDULED WORLD EVENTS — machine-readable clocks enter objective canon
    // exactly once, before movement. They are percepts, never scripted choices.
    const deliveredScheduled = new Set(w.deliveredScheduledEventIds ?? []);
    const dueScheduledEvents = (w.scheduledEvents ?? []).filter(
        (scheduled) => scheduled.atTick <= nowTick && !deliveredScheduled.has(scheduled.id),
    );
    for (const scheduled of dueScheduledEvents) {
        const sceneName = world.sceneNameById(scheduled.sceneId);
        const event: CanonicalSceneEvent = {
            v: 1,
            id: `${w.sagaId}:scheduled:${scheduled.id}`,
            sagaId: w.sagaId,
            day: today,
            tick: nowTick,
            clock: scheduled.clock ?? clockLabel,
            sceneId: scheduled.sceneId,
            sceneName,
            visibility: scheduled.visibility,
            witnessIds: [...scheduled.witnessIds],
            editorialSignals: { resolvedWants: 0, departures: 0, relationshipTurn: false },
            beats: [{
                characterId: '__world__',
                name: '世界',
                text: scheduled.text,
                audience: 'scene',
                perceiverIds: [...scheduled.witnessIds],
            }],
        };
        for (const id of scheduled.witnessIds) {
            const member = world.castById(id);
            if (!member) throw new Error(`scheduled event ${scheduled.id} has unknown witness id: ${id}`);
            await recall.remember(id, `〔${sceneName}·${event.clock}〕世界：${scheduled.text}`, {
                kind: 'observation',
                importance: 10,
                day: today,
            });
            await agent.observeScene?.({ event, characterId: id, name: member.name, persona: member.persona });
        }
        await archive.commit({
            kind: 'shoujuan',
            day: today,
            tick: nowTick,
            name: `${sceneName}·${scheduled.id}`,
            sceneId: scheduled.sceneId,
            eventId: event.id,
            body: `世界：${scheduled.text}`,
        });
        w.dayAccum.lines.push(`【${event.clock}】`, `[${sceneName}] 世界：${scheduled.text}`);
        events.push(event);
        deliveredScheduled.add(scheduled.id);
        log(`  world event: [${sceneName}] ${scheduled.text}`);
    }
    w.deliveredScheduledEventIds = [...deliveredScheduled];

    // 1) GENESIS + ledger upkeep — daytime only (§3.9: night consolidates).
    let genesisRan = 0;
    if (!night) {
        for (const member of w.cast) {
            if (wants.some((x) => x.characterId === member.id && x.source === 'genesis')) continue;
            const derived = await agent.deriveGenesisWants({
                name: member.name,
                role: member.role ?? '—',
                gender: member.gender,
                ageYears: member.age,
                description: member.persona,
                // The two fields production forgot to pass — the malnourished call site.
                secret: member.secret,
                sagaPremise: w.sagaPremise,
                castNames: w.cast.map((x) => x.name),
                contestedResources: w.contestedResources,
            });
            for (const g of derived) {
                wants.push(
                    newWant({
                        characterId: member.id,
                        layer: g.layer,
                        desc: g.desc,
                        target: g.target,
                        resource: w.contestedResources.length > 0 ? (g.resource ?? null) : undefined,
                        weight: g.weight,
                        sat: g.sat,
                        resistance: g.resistance,
                        kind: 'narrative',
                        source: 'genesis',
                        bornTick: nowTick,
                    }),
                );
            }
            if (derived.length) {
                genesisRan += derived.length;
                log(`  genesis: ${member.name} ×${derived.length}`);
            }
        }
        decayWants(wants);
        for (const f of fadeStaleWants(wants, nowTick)) log(`  淡了: ${world.nameById(f.characterId)}「${f.desc}」`);
    }

    // 2) AUTONOMOUS MOVEMENT — there is exactly one movement authority:
    // the world enumerates legal destinations, the character chooses a
    // structured scene id, then the engine validates and commits it. Home and
    // work are affordance labels, never deterministic teleport destinations.
    const routed: Record<string, string> = {};
    const orderedMovers = [...w.cast].sort((a, b) => {
        const aw = world.liveWantsOf(a.id)[0];
        const bw = world.liveWantsOf(b.id)[0];
        return (bw ? tension(bw) : 0) - (aw ? tension(aw) : 0);
    });
    const lastMovedTickByChar = (w.lastMovedTickByChar ??= {});
    for (const member of orderedMovers) {
        const lastMovedTick = lastMovedTickByChar[member.id];
        // Intentional travel consumes time. A one-tick rest prevents oscillation
        // and makes "I went there" persist long enough to become a scene. At
        // night a recent mover may still CHOOSE to return home, but no other
        // destination is offered during cooldown.
        const coolingDown = lastMovedTick !== undefined && nowTick - lastMovedTick < 2;
        if (coolingDown && !night) continue;
        const currentSceneId = w.roster[member.id];
        const live = world.liveWantsOf(member.id).slice(0, 4);
        const options = w.scenes.flatMap((scene) => {
            if (scene.id === currentSceneId) return [];
            if (coolingDown && scene.id !== w.homeByChar[member.id]) return [];
            const occupancy = w.cast.filter((candidate) => w.roster[candidate.id] === scene.id).length;
            const capacity = scene.capacity ?? (scene.privacyLevel >= 3 ? 2 : scene.privacyLevel >= 2 ? 4 : 8);
            if (occupancy >= capacity) return [];
            const ownerIds = Object.entries(w.homeByChar)
                .filter(([, home]) => home === scene.id)
                .map(([id]) => id);
            if (scene.privacyLevel >= 3 && ownerIds.length > 0 && !ownerIds.includes(member.id)) {
                const admitted = ownerIds.some(
                    (ownerId) => w.roster[ownerId] === scene.id && world.welcome(ownerId, member.id) >= 0.7,
                );
                if (!admitted) return [];
            }
            const presentCharacters = w.cast
                .filter((candidate) => candidate.id !== member.id && w.roster[candidate.id] === scene.id)
                .map((candidate) => ({
                    id: candidate.id,
                    name: candidate.name,
                    role: candidate.role ?? '—',
                    bodyFact: candidate.gender,
                    tieToward: member.relationshipView[candidate.id] ?? w.edges[member.id]?.[candidate.id]?.tone,
                }));
            return [{
                sceneId: scene.id,
                name: scene.name,
                description: scene.description,
                presentCharacters,
                privacyLevel: scene.privacyLevel,
                homeOfName: ownerIds[0] ? world.nameById(ownerIds[0]) : undefined,
                isHome: w.homeByChar[member.id] === scene.id,
                isWork: w.workByChar[member.id] === scene.id,
            }];
        });
        const decision = await agent.decideMove({
            name: member.name,
            role: member.role ?? '—',
            bodyFact: member.gender,
            currentSituation: [
                timeCharter,
                ...dueScheduledEvents
                    .filter((event) => event.witnessIds.includes(member.id))
                    .map((event) => event.text),
                ...(economy ? [economy.projectFor(world, member.id, currentSceneId) ?? ''] : []),
            ].filter(Boolean).join('\n') || undefined,
            planHint: [
                // Standing plan (if any) leads — the character heads toward goals, not just reacts.
                member.plan ? `【你這些日子的打算】\n${member.plan}` : '',
                `【眼下心事】\n${live.map((want) => `- [${want.layer}] ${want.desc}`).join('\n')}`,
            ].filter(Boolean).join('\n'),
            // Livelihood day-rhythm (行當節律): a soft, overridable pull toward the
            // character's 做活處 by day and 住處 at night, drawn from this seed's
            // own home/work anchors. Never routes — just gives an idle character a
            // default of earning their keep / going home rather than wandering.
            rhythmHint: livelihoodRhythm(
                clockLabel,
                w.workByChar[member.id] ? world.sceneNameById(w.workByChar[member.id]) : undefined,
                w.homeByChar[member.id] ? world.sceneNameById(w.homeByChar[member.id]) : undefined,
            ),
            currentSceneName: world.sceneNameById(currentSceneId),
            options,
            clock: clockLabel,
            isNight: night,
            heart: live.map((want) => ({
                desc: want.desc,
                towardName: want.target
                    ? (world.castById(want.target)?.name ?? want.target)
                    : undefined,
                ripe: forcingLevel(want),
            })),
        });
        if (!decision.move || !decision.targetSceneId) continue;
        if (!options.some((option) => option.sceneId === decision.targetSceneId)) continue;
        const from = world.sceneNameById(currentSceneId);
        world.moveCharacter(member.id, decision.targetSceneId);
        routed[member.id] = decision.targetSceneId;
        lastMovedTickByChar[member.id] = nowTick;
        log(`  move: ${member.name} ${from} → ${world.sceneNameById(decision.targetSceneId)}${decision.reason ? `（${decision.reason}）` : ''}`);
    }

    // 2.5) TENANCY MOVE-INS — a leased room becomes home the moment its tenant
    // arrives carrying the lease. The travel was their own committed choice;
    // this only settles the objective consequence (and cans it for the record).
    for (const moveIn of settleTenancyMoveIns(world)) {
        log(`  [遷入] ${moveIn.line}`);
        w.dayAccum.lines.push(`[帳房] ${moveIn.line}`);
        (w.scheduledEvents ??= []).push({
            id: `tenancy-${moveIn.characterId}-t${nowTick}`,
            atTick: nowTick + 1,
            sceneId: w.homeByChar[moveIn.characterId],
            text: moveIn.line,
            visibility: 'public',
            witnessIds: w.cast.map((member) => member.id),
        });
    }

    // 2.6) Rehearsal presence banks after movement — quality earned in daylight.
    bankRehearsalAttendance(world, PARTS_OF_DAY.indexOf(w.clock.partOfDay));

    // Emit a public 世界 beat this tick (surfaces to the lab 拍流 exactly like a
    // scheduled event and joins the day's episode material). Used for the two
    // production lifecycle moments worth announcing: a proposal and a premiere.
    const emitWorldBeat = (sceneId: string, text: string): void => {
        const sceneName = world.sceneNameById(sceneId);
        const witnessIds = w.cast.map((member) => member.id);
        events.push({
            v: 1,
            id: `${w.sagaId}:production:t${nowTick}:${events.length}`,
            sagaId: w.sagaId,
            day: today,
            tick: nowTick,
            clock: clockLabel,
            sceneId,
            sceneName,
            visibility: 'public',
            witnessIds,
            editorialSignals: { resolvedWants: 0, departures: 0, relationshipTurn: false },
            beats: [{ characterId: '__world__', name: '世界', text, audience: 'scene', perceiverIds: witnessIds }],
        });
        w.dayAccum.lines.push(`[${sceneName}] 世界：${text}`);
        log(`  production: ${text}`);
    };

    // 2.7) ACTIONS — the 劇本產出 action layer (flag-gated, OFF by default). A
    // character may spend this daytime tick's action on a collaborative
    // production instead of only moving/speaking: propose a new play, join one,
    // add a script fragment, or rehearse. chooseAction is an existing port seam
    // (fake = deterministic, real = one cheap LLM call); the engine routes off the
    // self-tagged kind, NEVER a regex on prose. Effort is a deterministic
    // accumulator; the work premieres at day-end when the razor holds (§7.8).
    // Night is for rest — production is daytime livelihood.
    if (w.emergentProduction && !night) {
        for (const member of orderedMovers) {
            const memWants = world.liveWantsOf(member.id).slice(0, 4);
            const result = await agent.chooseAction({
                name: member.name,
                persona: member.persona,
                role: member.role,
                secret: member.secret,
                wants: memWants.map((want) => ({
                    layer: want.layer,
                    desc: want.desc,
                    target: want.target ? (world.castById(want.target)?.name ?? want.target) : undefined,
                })),
                selfModel: world.selfModelBlock(member.id),
                worldFact: [w.sagaPremise, timeCharter, w.production ? productionSummary(w.production) : '尚無新戲在排']
                    .filter(Boolean)
                    .join('\n'),
                sharedLog: w.dayAccum.lines.slice(-8),
                playSummary: w.production ? productionSummary(w.production) : null,
                castNames: w.cast.map((other) => other.name),
            });
            const prod = w.production;
            switch (result.kind) {
                case 'propose_play':
                    if (!prod) {
                        w.production = startProduction('新戲', member.id, today);
                        emitWorldBeat(w.roster[member.id], `${member.name}提議排一齣新戲，招人同做。`);
                    } else {
                        ensureContributor(prod, member.id);
                    }
                    break;
                case 'compose':
                    if (prod) {
                        addScriptFragment(prod, member.id, result.prose);
                        prod.timeline.push(`第${today}日：${member.name} 添戲文`);
                        w.dayAccum.lines.push(`[做活] ${member.name}：${result.prose}`);
                    }
                    break;
                case 'join_play':
                    if (prod) {
                        ensureContributor(prod, member.id);
                        prod.timeline.push(`第${today}日：${member.name} 入夥`);
                        w.dayAccum.lines.push(`[做活] ${member.name}：${result.prose}`);
                    }
                    break;
                case 'rehearse':
                    if (prod) {
                        accumulateEffort(prod, member.id, 1);
                        prod.timeline.push(`第${today}日：${member.name} 走了一遍`);
                        w.dayAccum.lines.push(`[做活] ${member.name}：${result.prose}`);
                    }
                    break;
                // seek_person / perform / personal: no production effect this tick.
            }
        }
    }

    // 3) Group co-present cast by scene; at night keep only qualifying scenes.
    const byScene = new Map<string, string[]>();
    for (const m of w.cast) {
        const sid = w.roster[m.id];
        (byScene.get(sid) ?? byScene.set(sid, []).get(sid)!).push(m.id);
    }
    if (night) {
        for (const [sid, ids] of [...byScene]) {
            const info = world.sceneById(sid);
            const cs = ids.map((id) => ({ id, name: world.nameById(id) }));
            const deliberateEncounter =
                ids.length > 1 && ids.some((id) => lastMovedTickByChar[id] === nowTick);
            if (!deliberateEncounter && !nightSceneKind(cs, info?.privacyLevel ?? 0, wants)) {
                byScene.delete(sid);
            }
        }
        log(byScene.size ? `  夜場: ${byScene.size} 私戲` : '  夜: 快轉, sleep consolidates');
    }

    // 4) SCENES — self-assembled interaction loops.
    let beats = 0;
    const beatScenes: string[] = [];
    const actedCharacterIds: string[] = [];
    let resolvedCount = 0;
    const acc = w.dayAccum;
    /** Per-character angle on this tick: objective act + inner thought. */
    const pov = new Map<string, { name: string; lines: string[] }>();

    for (const [sid, ids] of byScene) {
        if (ids.length === 0) continue;
        const info = world.sceneById(sid);
        const isPrivate = (info?.privacyLevel ?? 0) >= 3;
        const sceneName = world.sceneNameById(sid);

        const castWithMem: SceneLoopCastMember[] = await Promise.all(
            ids.map(async (id) => {
                const member = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const others = ids.filter((o) => o !== id).map((o) => world.nameById(o));
                const recalls = await Promise.all([
                    hot ? recall.recall(id, hot.desc, 3, today) : Promise.resolve([]),
                    ...others.slice(0, 2).map((n) => recall.recall(id, n, 1, today)),
                ]);
                const memories = [...new Set(recalls.flat().map((m) => m.text))].slice(0, 6);
                // Self-model injection: current per-present-other view (latest-wins,
                // never recalled) + durable identity folded into persona. Always
                // available — the eviction fix for "who X is to me".
                const ties = world.selfTies(id, ids);
                return {
                    characterId: id,
                    name: member.name,
                    persona: world.beatPersona(id),
                    memories: memories.length ? memories : undefined,
                    stateLine: stateLine(member.state.fatigue, member.state.hunger),
                    innerSecret: member.secret,
                    standingPlan: member.plan,
                    role: member.role,
                    bodyFact: member.gender,
                    ties,
                    sceneHint: world.physicalHint(id, sid),
                    objects: world.accessibleObjects(id, sid).map((object) => ({
                        id: object.id,
                        label: object.label,
                        state: object.state,
                        container: object.container ? world.objectById(object.container)?.label ?? object.container : undefined,
                    })),
                    economyLine: economy?.projectFor(world, id, sid),
                };
            }),
        );

        const eventId = `${w.sagaId}:d${today}:t${nowTick}:${sid}`;
        let beatIndex = 0;
        const loop = await runSceneLoop({
            sagaId: w.sagaId,
            sceneId: sid,
            sceneName,
            isPrivate,
            clock: clockLabel,
            etiquette: w.etiquette,
            timeCharter,
            cast: castWithMem,
            castNames: w.cast.map((member) => member.name),
            wants,
            tick: nowTick,
            agent,
            beforeBeat: (actor) => {
                actor.sceneHint = world.physicalHint(actor.characterId, sid);
                actor.objects = world.accessibleObjects(actor.characterId, sid).map((object) => ({
                    id: object.id,
                    label: object.label,
                    state: object.state,
                    container: object.container ? world.objectById(object.container)?.label ?? object.container : undefined,
                }));
                actor.economyLine = economy?.projectFor(world, actor.characterId, sid);
            },
            onBeat: (beat) => {
                const addressedId = beat.addressed ? world.idByName(beat.addressed) : undefined;
                // A beat that touches a contract paper must also move the ledger —
                // checked BEFORE physics so a rejected draft leaves no object change.
                enforceContractCommandPairing(world, beat.objectEffects, beat.economyCommands);
                commitBeatPhysics({
                    world,
                    sceneId: sid,
                    actorId: beat.characterId,
                    actorName: beat.name,
                    witnessIds: ids,
                    text: beat.text,
                    audience: beat.audience,
                    addressedId,
                    effects: beat.objectEffects,
                });
                const causeEventId = `${eventId}:b${beatIndex}`;
                beatIndex += 1;
                if (beat.economyCommands?.length && !economy) {
                    throw new Error(`[economy] ${beat.name} proposed money commands but this world has no economy`);
                }
                for (const [seq, command] of (beat.economyCommands ?? []).entries()) {
                    const outcome = economy!.commitCommand(world, {
                        actorId: beat.characterId,
                        sceneId: sid,
                        witnessIds: ids,
                        command,
                        causeEventId,
                        seq,
                        day: today,
                    });
                    if (!outcome.ok) {
                        throw new Error(`[economy] ${beat.name} 的銀錢動作沒有發生：${outcome.reason}`);
                    }
                    for (const line of outcome.publicLines) {
                        log(`  [銀錢] ${line}`);
                        if (!isPrivate) acc.lines.push(`[${sceneName}] （帳）${line}`);
                    }
                }
                if (opts.onBeat) {
                    try {
                        opts.onBeat({
                            day: today,
                            tick: nowTick,
                            clock: clockLabel,
                            sceneId: sid,
                            sceneName,
                            isPrivate,
                            beatIndex: beatIndex - 1,
                            beat,
                        });
                    } catch (error) {
                        log(`  [observer] onBeat failed: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            },
        });

        // Freeze only after the existing scene checker has repaired hard prose
        // errors. The checker may edit text, never actors/order/count; structured
        // perception metadata remains attached to the original beat.
        if (loop.beats.length > 0 && ids.length > 1) {
            const reviewed = await agent.reviewScene({
                worldPremise: w.sagaPremise,
                venue: sceneName,
                venueHint: world.physicalHint('__reviewer__', sid),
                participants: ids.map((id) => {
                    const member = world.castById(id)!;
                    return {
                        name: member.name,
                        bodyFact: member.gender,
                        role: member.role,
                        carried: [],
                        relationship: Object.values(world.selfTies(id, ids)).join('、') || undefined,
                    };
                }),
                beats: loop.beats.map((beat) => ({ name: beat.name, text: beat.text, inner: beat.inner })),
            });
            if (reviewed?.beats.length === loop.beats.length && reviewed.beats.every((beat, i) => beat.name === loop.beats[i].name)) {
                loop.beats = loop.beats.map((beat, i) => ({
                    ...beat,
                    text: reviewed.beats[i].text,
                    inner: reviewed.beats[i].inner ?? beat.inner,
                }));
            }
        }

        const event: CanonicalSceneEvent = {
            v: 1,
            id: eventId,
            sagaId: w.sagaId,
            day: today,
            tick: nowTick,
            clock: clockLabel,
            sceneId: sid,
            sceneName,
            visibility: isPrivate ? 'private' : 'public',
            witnessIds: [...ids],
            editorialSignals: {
                resolvedWants: loop.resolved.length,
                // Venue transitions are committed in the autonomous movement
                // phase before this event. A scene beat has no movement authority.
                departures: 0,
                relationshipTurn: loop.intimacyAccepted,
                objectChanges: loop.beats.reduce((count, beat) => count + (beat.objectEffects?.length ?? 0), 0),
            },
            beats: loop.beats.map((b) => ({
                characterId: b.characterId,
                name: b.name,
                text: b.text,
                addressed: b.addressed,
                audience: b.audience ?? 'scene',
                perceiverIds: deriveBeatPerceiverIds(b, ids.map((id) => ({ id, name: world.nameById(id) }))),
                inner: b.inner || undefined,
                objectEffects: b.objectEffects,
                economyCommands: b.economyCommands,
            })),
        };
        if (event.beats.length) {
            events.push(event);
            for (const id of ids) {
                const member = world.castById(id)!;
                await agent.observeScene?.({ event, characterId: id, name: member.name, persona: member.persona });
            }
        }

        if (loop.beats.length && acc.lines[acc.lines.length - 1] !== `【${clockLabel}】`) acc.lines.push(`【${clockLabel}】`);
        const shoujuan: string[] = [];
        for (const b of loop.beats) {
            shoujuan.push(`${b.name}：${b.text}`);
            log(`  [${sceneName}] ${b.name}：${b.text}`);
            if (!actedCharacterIds.includes(b.characterId)) actedCharacterIds.push(b.characterId);
            if (!isPrivate) acc.lines.push(`[${sceneName}] ${b.name}：${b.text}`);
            if (!acc.actorIds.includes(b.characterId)) acc.actorIds.push(b.characterId);
            if (!acc.sceneIds.includes(sid)) acc.sceneIds.push(sid);
            const p = pov.get(b.characterId) ?? { name: b.name, lines: [] };
            p.lines.push(`〔${sceneName}·${clockLabel}〕${b.text}\n（心下：${b.inner}）`);
            pov.set(b.characterId, p);
        }
        if (isPrivate && loop.beats.length) {
            const who = ids.map((id) => world.nameById(id)).join('、');
            acc.lines.push(`[${sceneName}] ${who}掩門入內——窗內的來回，不入公開的日回。`);
        }
        if (loop.beats.length) {
            beats += loop.beats.length;
            beatScenes.push(sid);
            await archive.commit({ kind: 'shoujuan', day: today, tick: nowTick, name: sceneName, sceneId: sid, eventId, body: shoujuan.join('\n') });
            // Remember each actor's turn so the next tick continues from it.
            for (const b of loop.beats) {
                await recall.remember(b.characterId, `〔${sceneName}〕${b.text}（心下：${b.inner}）`, {
                    kind: 'chapter',
                    importance: 5,
                    day: today,
                });
            }
        }


        // Render the frozen event through each witness's own durable session.
        if (loop.beats.length) {
            for (const id of ids) {
                const member = world.castById(id)!;
                const rendered = await agent.povScene({
                    sagaId: w.sagaId,
                    characterId: id,
                    eventId,
                    name: member.name,
                    persona: member.persona,
                    secret: member.secret,
                    ties: Object.entries(world.selfTies(id, ids)).map(([oid, t]) => `對${world.nameById(oid)}：${t}`).join('\n') || undefined,
                    venue: sceneName,
                    clock: clockLabel,
                    beats: projectEventBeatsForWitness(event, id),
                    castBodies: ids.map((cid) => {
                        const x = world.castById(cid)!;
                        return { name: x.name, bodyFact: x.gender, role: x.role };
                    }),
                });
                if (rendered) {
                    const aggregate = pov.get(id) ?? { name: member.name, lines: [] };
                    aggregate.lines.push(rendered);
                    pov.set(id, aggregate);
                    eventPovs.push({ characterId: id, name: member.name, eventId, body: rendered });
                }
            }
        }

        for (const id of loop.actedCharacterIds) if (!actedCharacterIds.includes(id)) actedCharacterIds.push(id);

        // relationshipFallback: bank today's exchanges per co-present pair for
        // the nightly self-model consolidation (capped, latest lines win).
        if (w.relationshipFallback && loop.beats.length && ids.length > 1) {
            const sceneLines = loop.beats.map((b) => `${b.name}：${b.text}`).slice(-12);
            const interactions = (acc.interactions ??= {});
            for (const a of ids) {
                for (const b of ids) {
                    if (a === b) continue;
                    const bank = ((interactions[a] ??= {})[b] ??= []);
                    bank.push(...sceneLines);
                    if (bank.length > 24) interactions[a][b] = bank.slice(-24);
                }
            }
        }

        // Resolutions → aftermath wants.
        for (const rv of loop.resolved) {
            resolvedCount++;
            log(`  resolved: ${world.nameById(rv.want.characterId)}「${rv.want.desc}」${rv.note ? ` — ${rv.note}` : ''}`);
            if (w.relationshipFallback && rv.want.target) {
                const targetId = world.castById(rv.want.target) ? rv.want.target : world.idByName(rv.want.target);
                if (targetId) {
                    const resolvedWith = (acc.resolvedWith ??= {});
                    (resolvedWith[rv.want.characterId] ??= []).push(targetId);
                }
            }
            if (w.relationshipFallback) {
                const landed = (acc.landedByChar ??= {});
                (landed[rv.want.characterId] ??= []).push(`「${rv.want.desc}」${rv.note ? `──${rv.note}` : '，這一樁落定了'}`);
            }
            const owner = world.castById(rv.want.characterId);
            if (!owner) continue;
            if (!shouldDeriveAftermath(rv.want)) {
                log(`  aftermath settled: ${owner.name}（不再自動生成下一層 aftermath want）`);
                continue;
            }
            const after = await agent.deriveAftermathWant({
                name: owner.name,
                persona: owner.persona,
                resolvedDesc: rv.want.desc,
                resolvedNote: rv.note,
                beats: loop.beats.map((b) => `${b.name}：${b.text}`),
            });
            if (after) {
                wants.push(
                    newWant({
                        characterId: owner.id,
                        layer: after.layer,
                        desc: after.desc,
                        target: after.target,
                        weight: after.weight,
                        sat: after.sat,
                        resistance: after.resistance,
                        kind: 'narrative',
                        source: 'aftermath',
                        bornTick: nowTick,
                    }),
                );
                log(`  aftermath: ${owner.name}「${after.desc}」`);
            }
        }

        // Ripples → shift/spawn threads.
        if (loop.beats.length && ids.length > 1) {
            const deltas = await agent.judgeRipples({
                sceneName,
                beats: loop.beats.map((b) => `${b.name}：${b.text}`),
                // A scene can stir only its witnesses. News can travel later as
                // another physical event; the ripple judge is not a telepathic bus.
                roster: ids.map((id) => {
                    const member = world.castById(id)!;
                    return {
                        characterId: id,
                        name: member.name,
                        wants: wants.filter((x) => !x.retired && x.characterId === id).map((x) => x.desc),
                    };
                }),
            });
            for (const sp of applyRipples(wants, deltas, nowTick)) {
                log(`  new thread: ${world.nameById(sp.characterId)}「${sp.desc}」`);
            }
        }
    }

    // 4.9) 黃昏開鑼 — the show settles on whoever the movement phase brought
    // to the boards; box office is the treasury's income side.
    const performance = settleEveningPerformance(world, { day: today, partIndex: PARTS_OF_DAY.indexOf(w.clock.partOfDay) });
    if (performance) {
        log(`  [開鑼] ${performance.line}`);
        w.dayAccum.lines.push(`[戲園] ${performance.line}`);
        (w.scheduledEvents ??= []).push({
            id: `boxoffice-t${nowTick}`,
            atTick: nowTick + 1,
            sceneId: w.scenes.find((scene) => scene.name === w.economy!.performance!.venueSceneName)!.id,
            text: performance.line,
            visibility: 'public',
            witnessIds: w.cast.map((member) => member.id),
        });
    }

    // 5) Advance the daily-life state vector (undertone; derived, persisted).
    for (const m of w.cast) {
        const acted = actedCharacterIds.includes(m.id);
        m.state.fatigue = Math.max(0, Math.min(1, m.state.fatigue + (night ? -0.4 : acted ? 0.12 : 0.05)));
        m.state.hunger = Math.max(0, Math.min(1, c.tickOfDay === 0 ? 0.15 : m.state.hunger + 0.12));
    }

    // 6) WEAVE the tick's public beats into one 回 (private windows stay off it).
    let wove = false;
    const woveInput = acc.lines.filter((l) => l.startsWith('[') && !l.includes('掩門入內'));
    if (beats > 0 && woveInput.length >= 3) {
        const woven = await agent.weaveTickChapter({ clock: clockLabel, lines: woveInput.slice(-12) });
        if (woven) {
            await archive.commit({ kind: 'chapter', day: today, tick: nowTick, name: `${clockLabel}·回`, body: woven });
            wove = true;
        }
    }

    // 7) PER-CHARACTER POV — each actor's own angle this tick (objective + inner).
    //    Full first-person serial prose is M1; M0 archives the captured angle.
    for (const p of eventPovs) {
        await archive.commit({ kind: 'pov', day: today, tick: nowTick, name: p.name, characterId: p.characterId, eventId: p.eventId, body: p.body });
    }
    for (const p of pov.values()) {
        acc.povByName[p.name] = p.lines.join('\n\n');
    }

    // 7.5) DAY-END ECONOMY SETTLEMENT — deterministic, idempotent per day.
    // Wages, fixed living/operating costs and contract deadlines settle HERE,
    // never in prose. Objective consequences land now (hunger, object states,
    // escrow release); the notices post as next-morning scheduled events so the
    // cast PERCEIVES the settlement before choosing anything (aftermath tick).
    let economyNotices: string[] | undefined;
    if (dayEnd && economy && w.economy) {
        const settled = economy.settleDay(world, { day: today, nowTick });
        if (settled.settled) {
            economyNotices = settled.publicNotices;
            for (const line of settled.publicNotices) {
                log(`  [結算] ${line}`);
                acc.lines.push(`[帳房] ${line}`);
            }
            for (const notice of settled.privateNotices) {
                log(`  [結算·私] ${world.nameById(notice.characterId)}：${notice.text}`);
            }
        }
    }

    // 7.55) NIGHTLY DAY-PLANNING (N6): each character evolves a standing plan for
    // the day ahead — 長期目標／眼下打算／未竟之事 — so tomorrow's movement and beats
    // budget toward goals & the season deadline instead of being purely reactive.
    // Real adapters only (planDay is optional; fake omits it → planning skipped).
    if (dayEnd && agent.planDay) {
        const pendingDeadlines = (w.scheduledEvents ?? []).filter(
            (scheduled) => !deliveredScheduled.has(scheduled.id) && scheduled.atTick > nowTick,
        );
        for (const member of w.cast) {
            const todayLines = acc.interactions?.[member.id]
                ? Object.values(acc.interactions[member.id]).flat().join('\n').slice(-1200)
                : undefined;
            const situation = [
                timeCharter,
                ...pendingDeadlines
                    .filter((event) => event.witnessIds.includes(member.id))
                    .map((event) => `〔將臨〕第${event.atTick}拍將有：${event.text}`),
                ...(economy ? [economy.projectFor(world, member.id, w.roster[member.id] ?? '') ?? ''] : []),
            ].filter(Boolean).join('\n') || undefined;
            const relationshipPressure = Object.entries(member.relationshipView).map(
                ([otherId, view]) => `對${world.nameById(otherId)}：${view}`,
            );
            try {
                const reply = await agent.planDay({
                    name: member.name,
                    role: member.role ?? '—',
                    sagaName: w.sagaId,
                    dayLabel: `第${today}日 · ${clockLabel}`,
                    currentPlan: member.plan,
                    recentSituation: todayLines,
                    situation,
                    relationshipPressure: relationshipPressure.length ? relationshipPressure : undefined,
                    innerSecret: member.secret,
                });
                if (reply && reply.planText.trim()) member.plan = reply.planText.trim();
            } catch (err) {
                log(`  planDay 失敗（${member.name}）：${err instanceof Error ? err.message : String(err)}`);
            }
        }
        log(`  日程：${w.cast.length} 人各定明日之計`);
    }

    // 7.6) NIGHTLY SELF-MODEL CONSOLIDATION (relationshipFallback wiring):
    // OVERWRITE each character's current one-line view of everyone they dealt
    // with today (latest-wins, never appended) + optional identity insight.
    // The anti-decay half of the structural fallback — validated on the web
    // tick path; here gated behind the flag until a long-season A/B lands.
    if (dayEnd && w.relationshipFallback && acc.interactions) {
        for (const [actorId, others] of Object.entries(acc.interactions)) {
            const member = world.castById(actorId);
            if (!member) continue;
            const interactions = Object.entries(others).map(([otherId, sceneLines]) => {
                const other = world.castById(otherId);
                return {
                    otherId,
                    otherName: other?.name ?? otherId,
                    otherBodyFact: other?.gender,
                    otherRole: other?.role,
                    currentView: member.relationshipView[otherId],
                    todayText: sceneLines.join('\n').slice(-1200),
                    resolvedWithThem: (acc.resolvedWith?.[actorId] ?? []).includes(otherId) || undefined,
                };
            });
            const reply = await agent.consolidateSelfModel({
                name: member.name,
                persona: member.persona,
                secret: member.secret,
                coreIdentity: member.coreIdentity,
                interactions,
                day: today,
            });
            for (const view of reply.relationshipViews) world.setRelationshipView(actorId, view.otherId, view.view);
            if (reply.identityInsight) world.addCoreIdentity(actorId, reply.identityInsight);
            if (reply.relationshipViews.length) log(`  self-model: ${member.name} 更新對 ${reply.relationshipViews.length} 人的看法`);
        }
        delete acc.interactions;
        delete acc.resolvedWith;
    }

    // 7.7) NIGHTLY 心事自改 (relationshipFallback wiring): the secret is a
    // LIVING thing. When something真的落地 today (a resolved want), the unspoken
    // matter may move to its own next step — 蘇映雪 saying 行不通 out loud must
    // be able to move what 柳安春 keeps under her tongue, not only her view
    // line. canonSeed pins the bedrock facts; only the heart moves. null → keep.
    if (dayEnd && w.relationshipFallback && acc.landedByChar) {
        for (const [actorId, landed] of Object.entries(acc.landedByChar)) {
            const member = world.castById(actorId);
            if (!member?.secret || landed.length === 0) continue;
            const evolved = await agent.evolveSecret({
                name: member.name,
                persona: member.persona,
                secret: member.secret,
                landed,
                selfModel: [
                    ...member.coreIdentity,
                    ...Object.entries(member.relationshipView).map(([oid, view]) => `對${world.nameById(oid)}：${view}`),
                ],
                castBodies: w.cast.map((candidate) => ({ name: candidate.name, bodyFact: candidate.gender })),
                canonSeed: member.secretSeed,
                day: today,
            });
            if (evolved && evolved.trim() && evolved.trim() !== member.secret) {
                member.secret = evolved.trim();
                log(`  心事自改: ${member.name}`);
            }
        }
        delete acc.landedByChar;
    }

    // 7.8) PRODUCTION PREMIERE — at day-end, if the razor holds (a scripted work,
    // real collaborators, enough rehearsal banked), the play premieres. Purely
    // mechanical, so the premiere is auditable. Runs before the episode so the
    // premiere lands in the day's woven material.
    if (w.emergentProduction && dayEnd && w.production && canPremiere(w.production)) {
        markPremiered(w.production, today);
        const venue = w.roster[w.production.initiatorId] ?? w.roster[w.cast[0].id];
        emitWorldBeat(venue, `《${w.production.title}》今日首演，${w.production.contributors.length}人共成之，積功${totalEffort(w.production)}。`);
    }

    // 8) DAY-END EPISODE.
    let episode = false;
    if (dayEnd && acc.lines.length >= 3) {
        const tensionLines = wants
            .filter((x) => !x.retired)
            .sort((a, b) => tension(b) - tension(a))
            .slice(0, 6)
            .map((x) => `${world.nameById(x.characterId)}：${x.desc}`);
        const prose = await agent.composeEpisode({
            day: today,
            materialLines: acc.lines,
            tensionLines,
            povTexts: Object.entries(acc.povByName).map(([name, text]) => ({ name, text })),
        });
        if (prose) {
            await archive.commit({ kind: 'episode', day: today, tick: nowTick, name: `第${today}日`, body: prose });
            episode = true;
        }
        w.dayAccum = { lines: [], actorIds: [], sceneIds: [], povByName: {} };
    }

    // 9) Advance clock + snapshot the whole world.
    w.clock = clock.advance(c);
    if (opts.snapshotDir) world.snapshot(opts.snapshotDir);

    const liveWants = wants.filter((x) => !x.retired).length;
    log(`  → ${byScene.size} scene(s) · ${beats} beat(s) · ${resolvedCount} resolved · ${liveWants} live want(s)`);

    return {
        day: today,
        tick: nowTick,
        partOfDay: clockLabel,
        night,
        genesisRan,
        scenesPlayed: byScene.size,
        beats,
        beatScenes,
        resolved: resolvedCount,
        liveWants,
        actedCharacterIds,
        routed,
        wove,
        episode,
        events,
        eventPovs,
        economyNotices,
        production: w.production
            ? {
                  title: w.production.title,
                  status: w.production.status,
                  contributors: w.production.contributors.length,
                  totalEffort: totalEffort(w.production),
                  scriptFragments: w.production.scriptFragments.length,
                  premieredDay: w.production.premieredDay,
              }
            : undefined,
    };
}
