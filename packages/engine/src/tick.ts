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
    confideWorry,
    confiderOf,
    decayWants,
    fadeStaleWants,
    forcingLevel,
    hasHostileWantToward,
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    shouldDeriveAftermath,
    tension,
} from './core/want-core.ts';
import { pickOrthogonalThreads, spawnWant, type LedgerEvent } from './core/want-rewrite.ts';
import { runSceneLoop, type SceneBeat, type SceneLoopCastMember } from './core/scene-loop.ts';
import { CONDUCT_KINDS, STAGE_KINDS, isStageScene, skillStyleHint } from './core/skills.ts';
import { BOND, advanceReady, bondOf, bumpBond, decayBonds, seedBond } from './core/bond-graph.ts';
import { dutyRhythm } from './core/livelihood-rhythm.ts';
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
import type { ArchivePort, CanonicalSceneEvent, ClockPort, EconomyPort, RecallPort, RehearsalDecideReply, SceneAgentPort } from './ports.ts';
import { deriveBeatPerceiverIds, projectEventBeatsForWitness } from './core/scene-perception.ts';
import { commitBeatPhysics } from './core/physical-canon.ts';
import { bankRehearsalAttendance, buildNegotiationSeats, enforceContractCommandPairing, foodScenesOf, formatMoney, settleEveningPerformance, settleTenancyMoveIns, troupeLeaderId, troupePlayerIds, type SeasonCatalogItem } from './core/season-economy.ts';
import { deityHintFor, framePrayerFallback, isStuckWant, templeScenesOf } from './core/temple-prayer.ts';
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

    // 1.6) DAY-START 班主 REHEARSAL CALL — at 清晨, before movement, the troupe
    // leader decides whether to call today's rehearsal and which 戲碼. It is the
    // 班主's judgment (排戲撐起今晚開鑼、也把新戲往前推，但佔掉白日、累著角兒); the
    // engine only READS the verdict. A call records w.rehearsalCall (the afternoon
    // movement phase pulls the troupe players to the venue → bankRehearsalAttendance
    // banks box-office quality, and, with emergentProduction, their rehearse accrues
    // production effort), announces it to the troupe as a next-morning-style public
    // percept, and — with emergentProduction and no play yet — BOOTSTRAPS the
    // production so it no longer waits on an individual propose_play. Optional agent
    // seam (fake omits decideRehearsal → never calls); a throw or null → no call.
    if (c.tickOfDay === 0 && w.economy && agent.decideRehearsal) {
        const banzhuId = troupeLeaderId(world);
        if (banzhuId) {
            const banzhu = world.castById(banzhuId);
            const banzhuName = banzhu?.name ?? '班主';
            const troupe = troupePlayerIds(world);
            const troupeNames = [...troupe].map((id) => world.nameById(id));
            const perf = w.economy.performance;
            const venueName = perf?.venueSceneName
                ?? (w.workByChar[banzhuId] ? world.sceneNameById(w.workByChar[banzhuId]) : world.sceneNameById(w.roster[banzhuId]));
            // Terse objective pressure the 班主 weighs: tonight's 開鑼, the treasury
            // runway, and the nearest looming contract deadline — facts, not advice.
            const situationParts: string[] = [];
            if (perf) situationParts.push(`今夜黃昏【${perf.venueSceneName}】開鑼，到場不足${perf.minCast}人便停鑼、票房歸零`);
            const troupeAcct = w.economy.state.accounts[w.economy.troupeAccountId];
            if (troupeAcct) {
                const avail = BigInt(troupeAcct.available);
                const cost = BigInt(troupeAcct.dailyFixedCost);
                situationParts.push(cost > 0n ? `班庫現銀約可撐 ${avail / cost} 日` : '班庫暫可周轉');
            }
            const nearestDeadline = Object.values(w.economy.contracts)
                .filter((contract) => contract.status === 'offered' && contract.deadlineDay >= today)
                .sort((a, b) => a.deadlineDay - b.deadlineDay)[0];
            if (nearestDeadline) situationParts.push(`「${nearestDeadline.label}」限第${nearestDeadline.deadlineDay}日簽成`);

            let reply: RehearsalDecideReply | null = null;
            try {
                reply = await agent.decideRehearsal({
                    banzhuName,
                    role: banzhu?.role,
                    troupeNames,
                    rehearsalVenue: venueName,
                    playSummary: w.production ? productionSummary(w.production) : null,
                    dayLabel: `第${today}日`,
                    situation: situationParts.join('；') || undefined,
                });
            } catch {
                reply = null; // fail safe: no rehearsal called this day
            }
            if (reply?.call) {
                const title = reply.title?.trim() || w.production?.title || '新戲';
                const venueScene = w.scenes.find((scene) => scene.name === venueName);
                const venueSceneId = venueScene?.id ?? w.roster[banzhuId];
                w.rehearsalCall = { day: today, title, venueSceneId };
                const witnessIds = troupe.size ? [...troupe] : w.cast.map((member) => member.id);
                const announceText = reply.line?.trim()
                    || `「${banzhuName}發話：今日排《${title}》，午後到「${venueName}」。」`;
                (w.scheduledEvents ??= []).push({
                    id: `rehearsal-call-d${today}-t${nowTick}`,
                    atTick: nowTick + 1,
                    sceneId: venueSceneId,
                    text: announceText,
                    visibility: 'public',
                    witnessIds,
                });
                w.dayAccum.lines.push(`[戲班] ${announceText}`);
                log(`  [排戲] ${banzhuName} 叫排《${title}》 → 午後「${venueName}」`);
                if (w.emergentProduction && !w.production) {
                    w.production = startProduction(title, banzhuId, today);
                    log(`  [排戲] 班主之命立起新戲《${title}》`);
                }
            }
        }
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
    // Distance-aware rest: only a CROSS-DISTRICT trip books a rest (you spent the
    // turn walking across town). A same-district hop is a few steps and books
    // none — so local movement stays fluid. `lastMovedTickByChar` is still
    // stamped on EVERY move because it also marks "arrived here this tick" for
    // the night deliberate-encounter test; the rest window is tracked separately.
    const restUntilByChar = (w.restUntilTickByChar ??= {});
    // 班主叫的排戲 — the day's called rehearsal, resolved once for the afternoon
    // pull below: the venue name + which troupe players it can draw. Only live on
    // the day it was called and during the two rehearsal parts (日午/晡時), the
    // window bankRehearsalAttendance banks presence in.
    const rehearsalToday = w.rehearsalCall?.day === today ? w.rehearsalCall : undefined;
    const rehearsalTroupe = rehearsalToday ? troupePlayerIds(world) : new Set<string>();
    const rehearsalVenueName = rehearsalToday ? world.sceneNameById(rehearsalToday.venueSceneId) : '';
    // HUNGER as a movement driver (餓了去食肆買東西吃): a pressing belly outranks
    // work. Precomputed once — sceneId → the cheapest location-anchored meal —
    // and EMPTY for any seed whose meals carry no sceneName, so the whole drive
    // is inert there. spendableOf reads a character's OWN purse (self-paid meals).
    const HUNGER_SEEK = 0.55; // pressing hunger — pull the mover to go eat first
    const foodScenes: Map<string, SeasonCatalogItem> = w.economy ? foodScenesOf(world) : new Map();
    // 廟願 — scene ids that read as a temple (神明 前). Precomputed once; EMPTY for
    // a world with no temple scene, so the 廟 PULL below and the §3.6 祈願 step are
    // both fully inert there (backward compat: zero behaviour change).
    const templeScenes: Set<string> = templeScenesOf(world);
    const spendableOf = (id: string): bigint => BigInt(w.economy?.state.accounts[id]?.available ?? '0');
    // 夜訪商量 PULL reads the bond underlay as PERSISTED at tick start. The lazy
    // canon seed (§2.95) runs after this movement phase, so on the very FIRST tick
    // this Map is empty and the confide pull is inert — by design; a confidence is
    // taken to someone you already have standing with, which only exists once ties
    // are seeded/warmed. Read-only here (never mutated before movement).
    const bondsAtMove = world.bondGraph();
    for (const member of orderedMovers) {
        const restUntil = restUntilByChar[member.id];
        // Travel across town consumes time: a one-tick rest prevents oscillation
        // and makes "I went there" persist long enough to become a scene. At
        // night a resting mover may still CHOOSE to return home, but no other
        // destination is offered during the rest.
        const coolingDown = restUntil !== undefined && nowTick < restUntil;
        if (coolingDown && !night) continue;
        const currentSceneId = w.roster[member.id];
        const live = world.liveWantsOf(member.id).slice(0, 4);
        // 撞破 (jealous-intrude) — at NIGHT the mover's hottest RIPE jealousy/grudge
        // (妒/怨, pressing+) may BARGE INTO its target's private tryst: the one setup
        // where BOTH the capacity bar and the welcome gate are skipped, so the
        // 3-person confrontation nightSceneKind already recognises can actually form.
        // It fires ONLY into a genuine 撞破 — the target sits in a PRIVATE (≥3) scene
        // holding EXACTLY 2 (the target + one other, an intimate pair the jealous
        // third is NOT part of) and the mover is not already there. No ripe jealousy,
        // or a target who is alone / in public / by day ⇒ intrudeSceneId undefined ⇒
        // every scene keeps both bars byte-for-byte, exactly as before.
        const resolveTargetId = (t: string): string | undefined =>
            world.castById(t) ? t : world.idByName(t);
        const intrude = night ? jealousNightPursuit(wants, member.id, resolveTargetId) : null;
        const intrudeSceneId = (() => {
            if (!intrude || intrude.id === member.id) return undefined;
            const sid = w.roster[intrude.id];
            if (!sid || sid === currentSceneId) return undefined;   // already there ⇒ no barge
            const scene = world.sceneById(sid);
            if (!scene || scene.privacyLevel < 3) return undefined;  // a掩門私會 is private
            const occupants = w.cast.filter((candidate) => w.roster[candidate.id] === sid);
            if (occupants.length !== 2) return undefined;            // an intimate PAIR, no more
            if (occupants.some((candidate) => candidate.id === member.id)) return undefined; // not us
            return sid;
        })();
        // A salient inner pull so the offered intrude option is chosen under real
        // pressure — the character still decides (restraint is valid); no numbers.
        const intrudePull = intrudeSceneId
            ? `聽聞${world.nameById(intrude!.id)}此刻與人在${world.sceneNameById(intrudeSceneId)}掩門私會，你妒火中燒，明知不請自來，也按捺不住要去撞破。`
            : undefined;
        const options = w.scenes.flatMap((scene) => {
            if (scene.id === currentSceneId) return [];
            if (coolingDown && scene.id !== w.homeByChar[member.id]) return [];
            // 撞破: for the ONE jealous-intrude target scene, skip BOTH bars below
            // (over-capacity by design, uninvited by design). Every other scene keeps
            // capacity + welcome exactly as before.
            const isIntrudeTarget = scene.id === intrudeSceneId;
            const occupancy = w.cast.filter((candidate) => w.roster[candidate.id] === scene.id).length;
            const capacity = scene.capacity ?? (scene.privacyLevel >= 3 ? 2 : scene.privacyLevel >= 2 ? 4 : 8);
            if (!isIntrudeTarget && occupancy >= capacity) return [];
            const ownerIds = Object.entries(w.homeByChar)
                .filter(([, home]) => home === scene.id)
                .map(([id]) => id);
            // 訪問權限 gate (replaces the old warmth admit): a private owned space
            // admits only its owner or a key-holder (standing/oneTime). A public
            // scene / an owner / a key-holder ⇒ canEnter true (never barred). The
            // 撞破 break-in ignores keys — isIntrudeTarget bypasses this exactly as
            // it bypassed the old gate.
            if (!isIntrudeTarget && !world.canEnter(member.id, scene.id)) return [];
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
                near: world.nearby(currentSceneId, scene.id),
                // 撞破: mark the barged-into tryst so decideMove frames choosing it as
                // bursting in uninvited (明知不請自來，妒火中燒也要去撞破).
                ...(isIntrudeTarget ? { intrude: true as const } : {}),
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
                ...(intrudePull ? [intrudePull] : []),
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
            // When this character has a resolved 行當專屬 duty for THIS part (歌女
            // 入夜唱堂會、記者深宵趕稿、班主坐鎮後台), dutyRhythm swaps in a stronger
            // on-post line naming the duty venue; otherwise it delegates to the
            // generic rhythm above. Still a soft hint — movement authority is untouched.
            rhythmHint: (() => {
                // HUNGER outranks work — 空著肚子做不了活. When hunger presses and a
                // location-anchored food scene sells a meal this mover can afford,
                // the strongest pull is to go eat FIRST (matching the old agent-
                // season eat drive). Skipped when already standing at a food scene
                // (§3.5 feeds them in passing) or when none is affordable — then it
                // falls through to the own-duty / rehearsal / generic rhythm below.
                // Soft hint only; the single movement authority is untouched. A seed
                // with no sceneName'd meal has an empty foodScenes ⇒ this never fires.
                if (w.economy && foodScenes.size && member.state.hunger > HUNGER_SEEK && !foodScenes.has(currentSceneId)) {
                    const affordable = [...foodScenes].filter(([, item]) => spendableOf(member.id) >= BigInt(item.priceSubunits));
                    // prefer a food scene in the mover's own district; else any affordable one.
                    const sameDistrict = affordable.filter(([foodSceneId]) => world.sameDistrict(currentSceneId, foodSceneId));
                    const pick = sameDistrict[0] ?? affordable[0];
                    if (pick) {
                        const [foodSceneId, meal] = pick;
                        const foodSceneName = world.sceneNameById(foodSceneId);
                        const priceText = formatMoney(w.economy, BigInt(meal.priceSubunits));
                        return `腹中空得發慌，空著肚子做不了活——先往「${foodSceneName}」墊墊肚子（一份${meal.label}${priceText}），趁早去吃，旁的事等吃過再說。`;
                    }
                }
                // 夜訪商量 PULL (confide) — at 黃昏/入夜/深宵 a character weighed down by a
                // pressing NON-romantic worry is drawn to go talk it over with their most-
                // trusted confidant. Mirror of the hunger PULL: a soft hint only (the single
                // movement authority is untouched), it fires only when the mover carries a
                // confideWorry AND a trusted confidant (bond ≥ known, non-hostile) sits at a
                // DIFFERENT, reachable scene. Prefers a confidant in the mover's own district;
                // skipped if already co-located; never forces. Falls through to the own-duty /
                // rehearsal / generic night rhythm below.
                if (clockLabel === '黃昏' || clockLabel === '入夜' || clockLabel === '深宵') {
                    const worry = confideWorry(wants, member.id);
                    if (worry) {
                        let bestConfidant: { id: string; near: boolean; bond: number } | null = null;
                        for (const other of w.cast) {
                            if (other.id === member.id) continue;
                            const otherScene = w.roster[other.id];
                            if (!otherScene || otherScene === currentSceneId) continue; // co-located ⇒ no pull
                            if (!options.some((o) => o.sceneId === otherScene)) continue; // must be reachable
                            const bond = bondOf(bondsAtMove, member.id, other.id);
                            if (bond < BOND.seed.known) continue; // not trusted enough
                            if (hasHostileWantToward(wants, member.id, other.id, other.name)) continue; // resented
                            const near = world.sameDistrict(currentSceneId, otherScene);
                            if (
                                !bestConfidant ||
                                (near && !bestConfidant.near) ||
                                (near === bestConfidant.near && bond > bestConfidant.bond)
                            ) {
                                bestConfidant = { id: other.id, near, bond };
                            }
                        }
                        if (bestConfidant) {
                            return `這樁事在心裡壓了整日，總沒個主意——不如趁夜去尋${world.nameById(bestConfidant.id)}，把心事與TA說道說道，或許就明朗了。`;
                        }
                    }
                }
                // 廟 PULL (祈願) — at 清晨 or 黃昏 a character carrying a STUCK want
                // (high tension, long-carried, still pressing — 求人無門) is softly
                // drawn to a reachable temple to say it out loud to 神明. Mirror of
                // the confide PULL: a soft hint only (the single movement authority
                // is untouched), placed AFTER confide so 「有人可商量」takes precedence
                // and this fires when there is no one to turn to. Low-frequency and
                // temple-gated, so it never overrides livelihood; a world with no
                // temple scene has an empty templeScenes ⇒ this never fires. Prefers a
                // temple in the mover's own district; skipped if already at one.
                if ((clockLabel === '清晨' || clockLabel === '黃昏') && templeScenes.size && !templeScenes.has(currentSceneId)) {
                    const stuck = live.find((wnt) => isStuckWant(wnt, nowTick));
                    if (stuck) {
                        const reachableTemples = options.filter((o) => templeScenes.has(o.sceneId));
                        const templePick =
                            reachableTemples.find((o) => world.sameDistrict(currentSceneId, o.sceneId)) ?? reachableTemples[0];
                        if (templePick) {
                            return `這樁心事求人無門，不如往${templePick.name}去，對神明討個主意、許個願。`;
                        }
                    }
                }
                return dutyRhythm(
                    clockLabel,
                    (() => {
                        // A player's OWN 行當專屬 duty for this part takes precedence.
                        const memberDuty = member.duties?.find((d) => d.part === clockLabel && d.duty);
                        if (memberDuty) return { sceneName: world.sceneNameById(memberDuty.sceneId), note: memberDuty.note };
                        // Else the 班主's called rehearsal is a TRANSIENT afternoon duty for
                        // troupe players with no own duty this part: it pulls them to the
                        // venue so bankRehearsalAttendance banks presence (box-office quality)
                        // and, with emergentProduction, their rehearse accrues effort. Soft
                        // hint only — the single movement authority is untouched.
                        if (rehearsalToday && (clockLabel === '日午' || clockLabel === '晡時') && rehearsalTroupe.has(member.id)) {
                            return { sceneName: rehearsalVenueName, note: `排《${rehearsalToday.title}》，班主叫的` };
                        }
                        return undefined;
                    })(),
                    w.workByChar[member.id] ? world.sceneNameById(w.workByChar[member.id]) : undefined,
                    w.homeByChar[member.id] ? world.sceneNameById(w.homeByChar[member.id]) : undefined,
                );
            })(),
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
        const fromSceneId = currentSceneId;
        const from = world.sceneNameById(fromSceneId);
        let arrivalSceneId = decision.targetSceneId;

        // 路遇 — a cross-district journey passes each district's public throat.
        // If someone the traveller CARES about stands on that road, they may be
        // waylaid: stop there and the errand slips (they never reach where they
        // meant to go). Optional agent seam — the fake omits transitReact, so the
        // deterministic path never intercepts and travellers always arrive. Only
        // asks when a relevant person is actually on the way, so it stays rare.
        if (agent.transitReact && !world.sameDistrict(fromSceneId, arrivalSceneId)) {
            for (const waypointId of world.transitWaypoints(fromSceneId, arrivalSceneId)) {
                const wpScene = world.sceneById(waypointId);
                const wpOccupancy = w.cast.filter((candidate) => w.roster[candidate.id] === waypointId).length;
                if (!wpScene || wpOccupancy >= (wpScene.capacity ?? 8)) continue; // don't overflow the road
                const onRoad = w.cast.find(
                    (other) =>
                        other.id !== member.id &&
                        w.roster[other.id] === waypointId &&
                        (live.some((want) => want.target === other.id) ||
                            member.relationshipView[other.id] !== undefined ||
                            w.edges[member.id]?.[other.id] !== undefined),
                );
                if (!onRoad) continue;
                const errand = live[0] ? `你正惦記著「${live[0].desc}」` : `你自往「${world.sceneNameById(arrivalSceneId)}」去辦自己的事`;
                const react = await agent
                    .transitReact({
                        name: member.name,
                        role: member.role ?? '—',
                        bodyFact: member.gender,
                        seenName: onRoad.name,
                        seenRole: onRoad.role ?? '—',
                        seenBodyFact: onRoad.gender,
                        tieToward: member.relationshipView[onRoad.id] ?? w.edges[member.id]?.[onRoad.id]?.tone,
                        waypointName: world.sceneNameById(waypointId),
                        fromName: from,
                        toName: world.sceneNameById(arrivalSceneId),
                        errand,
                        clock: clockLabel,
                        isNight: night,
                    })
                    .catch(() => ({ act: 'pass' as const }));
                if (react.act === 'engage') {
                    arrivalSceneId = waypointId; // stopped mid-road — the errand slips
                    log(`  路遇: ${member.name} 在${world.sceneNameById(waypointId)}被${onRoad.name}絆住${react.word ? `（${react.word}）` : ''}`);
                    w.dayAccum.lines.push(`[路遇] ${member.name}在${world.sceneNameById(waypointId)}遇著${onRoad.name}，${react.word ?? '把原本要辦的事擱下了'}`);
                    break;
                }
                if (react.act === 'greet') {
                    log(`  路遇: ${member.name} 與${onRoad.name}在${world.sceneNameById(waypointId)}打了個照面${react.word ? `（${react.word}）` : ''}`);
                }
            }
        }

        world.moveCharacter(member.id, arrivalSceneId);
        routed[member.id] = arrivalSceneId;
        // 一次性 領入: if the mover entered on a one-time pass, it is used up here
        // (owners / standing key-holders consume nothing). A 撞破 break-in holds no
        // pass, so it consumes nothing either.
        if (world.consumeOneTime(arrivalSceneId, member.id)) {
            log(`  [門] ${member.name} 用掉一次${world.sceneNameById(arrivalSceneId)}的門路`);
        }
        // Every move marks "arrived here this tick" (the night encounter test
        // reads it). Only a cross-district trip books the rest window — a same-
        // district hop is a few steps and stays free, so local movement is
        // fluid. Seeds without districts read as "far" (sameDistrict=false), so
        // they keep the old uniform 2-tick cost. A waylaid mover pays only for
        // how far they ACTUALLY got (arrival vs origin district).
        lastMovedTickByChar[member.id] = nowTick;
        if (!world.sameDistrict(fromSceneId, arrivalSceneId)) restUntilByChar[member.id] = nowTick + 2;
        log(`  move: ${member.name} ${from} → ${world.sceneNameById(arrivalSceneId)}${decision.reason ? `（${decision.reason}）` : ''}`);
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

    // A CHARACTER-attributed public beat (mirror of emitWorldBeat, but spoken BY a
    // character rather than by 世界) — surfaces to the lab 拍流 and joins the day's
    // material exactly like a scene beat. Used by the §3.6 祈願 step so a spoken
    // prayer reads as the CHARACTER addressing 神明, not a world announcement.
    const emitCharacterBeat = (sceneId: string, characterId: string, name: string, text: string): void => {
        const sceneName = world.sceneNameById(sceneId);
        const witnessIds = w.cast.map((member) => member.id);
        events.push({
            v: 1,
            id: `${w.sagaId}:prayer:t${nowTick}:${events.length}`,
            sagaId: w.sagaId,
            day: today,
            tick: nowTick,
            clock: clockLabel,
            sceneId,
            sceneName,
            visibility: 'public',
            witnessIds,
            editorialSignals: { resolvedWants: 0, departures: 0, relationshipTurn: false },
            beats: [{ characterId, name, text, audience: 'scene', perceiverIds: witnessIds }],
        });
        w.dayAccum.lines.push(`[${sceneName}] ${name}：${text}`);
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

    // 2.95) BOND UNDERLAY — the NUMERIC relationship layer (bond-graph.ts). Lazily
    // derive the initial graph + the 相許 set from EXISTING canon (the `edges` tone
    // graph + each member's relationship-view text), ONCE per world (guard on
    // `bonds === undefined`; both fields are initialised to at least [] so it never
    // re-seeds). Classification is data-driven regex on the tone/view TEXT, NEVER
    // name-cased. Empty edges + no intimate markers ⇒ both stay [], fully inert
    // (no behaviour change on a bond-less world). Numbers never enter a prompt —
    // the graph only gates world affordances (the advance card, the register).
    if (w.bonds === undefined) {
        const seedG = world.bondGraph(); // empty
        const seededPairs = new Set<string>();
        const INTIMATE = /舊情|舊愛|舊侶|舊歡|情人|夫妻|結髮|相許|恩愛|枕|同衾|露水|入幕|恩客|雲雨|一夜|眷侶/;
        const YEARNING = /暗戀|傾心|眷|相思|心悅|念著|放不下|愛慕|暗慕/;
        const KNOWN = /師|徒|搭檔|同儕|舊識|交好|同門|故人|夥伴|知交|親厚/;
        const classify = (from: string, to: string, text: string | undefined): void => {
            if (!text || from === to) return;
            if (INTIMATE.test(text)) {
                // past/present lover — establish the (symmetric) pair; either
                // direction's marker establishes (old lovers).
                seedBond(seedG, from, to, BOND.seed.established);
                seededPairs.add(world.pairKey(from, to));
            } else if (YEARNING.test(text)) {
                seedBond(seedG, from, to, BOND.seed.yearning); // NOT established
            } else if (KNOWN.test(text)) {
                seedBond(seedG, from, to, BOND.seed.known);
            }
            // else stranger — no seed.
        };
        for (const [from, row] of Object.entries(w.edges)) {
            for (const [to, edge] of Object.entries(row)) classify(from, to, edge.tone);
        }
        for (const member of w.cast) {
            for (const [to, view] of Object.entries(member.relationshipView)) classify(member.id, to, view);
        }
        world.setBonds(seedG);                    // at least [] — never re-seeds
        w.establishedPairs ??= [...seededPairs];   // at least []
    }

    // 2.96) 訪問權限 (space access grants) — lazily seed STANDING keys for every
    // PRIVATE owned space from EXISTING canon, ONCE per world (guard on
    // `accessGrants === undefined`; initialised to at least {} so it never
    // re-seeds). LOSSLESS migration of the old warmth gate: anyone the owner would
    // have admitted (welcome ≥ 0.7) gets a standing key, so existing runs behave
    // the same; PLUS old lovers (isEstablished) hold each other's keys (老情人持彼此
    // 鑰匙). Runs AFTER §2.95 so established pairs are already seeded. A tentative
    // suitor (a live 愛/情 want toward an owner, not warm/established) is 領入 with a
    // ONE-TIME pass — exercising the 一次性 seam; a full LLM-chosen "invite" is a
    // future seat, the method (grantAccess … 'oneTime') is the seam. An empty/
    // edgeless world derives to owner-only (no grants), so a public world is
    // untouched and there is no regression.
    if (w.accessGrants === undefined) {
        w.accessGrants = {};
        const LOVE_WANT = /愛|情/;
        for (const scene of w.scenes) {
            const owners = world.ownersOf(scene.id); // [] unless private (≥3) with an owner
            if (owners.length === 0) continue;
            for (const guest of w.cast) {
                if (owners.includes(guest.id)) continue; // an owner needs no key
                const warmlyAdmitted = owners.some((ownerId) => world.welcome(ownerId, guest.id) >= 0.7);
                const oldLovers = owners.some((ownerId) => world.isEstablished(ownerId, guest.id));
                if (warmlyAdmitted || oldLovers) {
                    world.grantAccess(scene.id, guest.id, 'standing');
                    continue;
                }
                // 一次性 領入: a one-sided suitor (a live love want aimed at an owner
                // this space does not yet welcome) is led in exactly once.
                const suitor = wants.some(
                    (wnt) =>
                        !wnt.retired &&
                        wnt.characterId === guest.id &&
                        LOVE_WANT.test(wnt.layer) &&
                        !!wnt.target &&
                        owners.some((ownerId) => wnt.target === ownerId || wnt.target === world.nameById(ownerId)),
                );
                if (suitor) world.grantAccess(scene.id, guest.id, 'oneTime');
            }
        }
        if (Object.keys(w.accessGrants).length) {
            log(`  訪問權限: 為 ${Object.keys(w.accessGrants).length} 處私處立鑰`);
        }
    }
    // The working bond graph for this tick (mutated by scenes, written back at end).
    const bonds = world.bondGraph();
    // Unordered pair keys that shared a scene today — spared tonight's cooling.
    const togetherToday = new Set<string>();
    // 夜訪商量 (confide) trust predicate — a confidant is someone this character has
    // real standing with (bond ≥ known, confider→other, ASYMMETRIC) and does NOT
    // resent (no jealous/reckon want aimed at them). Injected into nightSceneKind
    // (so a confide pair survives the night cull without a deliberate encounter)
    // and reused to pick the confide scene's opening actor. An empty graph ⇒ every
    // bond reads stranger (< known) ⇒ false for all pairs, so confide stays fully
    // inert on a bond-less world (zero behaviour change).
    const isTrustedConfidant = (a: string, b: string): boolean =>
        bondOf(bonds, a, b) >= BOND.seed.known && !hasHostileWantToward(wants, a, b, world.nameById(b));

    // 授權 on 相許 — becoming lovers hands over the key: each gets a STANDING key to
    // the OTHER's home (homeByChar). Called wherever the tick records a pair as 相許.
    // grantAccess is idempotent and no-ops on a co-owned (cohabiting) or public
    // home, so it is always safe to call.
    const grantMutualHomeKeys = (a: string, b: string): void => {
        const homeA = w.homeByChar[a];
        const homeB = w.homeByChar[b];
        if (homeB) world.grantAccess(homeB, a, 'standing');
        if (homeA) world.grantAccess(homeA, b, 'standing');
    };

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
            if (!deliberateEncounter && !nightSceneKind(cs, info?.privacyLevel ?? 0, wants, isTrustedConfidant)) {
                byScene.delete(sid);
            }
        }
        log(byScene.size ? `  夜場: ${byScene.size} 私戲` : '  夜: 快轉, sleep consolidates');
    }

    // 3.5) 順路而食 (eat-in-passing) — autonomic survival, deterministic by design.
    // This is 餓了就吃, not a dramatic choice (the old agent-season `eat`): an awake
    // character standing at a food scene who is at all hungry, can pay, and hasn't
    // eaten there today buys the meal — the relieve-hunger effect fires through the
    // SAME purchase path prose money must go through. NO scene beat is emitted (it
    // must never inflate scene counts); a [食] day-log + log line is the whole
    // surface. Never fatal: any rejection (broke / once-per-day / no economy) is
    // swallowed. Runs BEFORE scenes so a just-fed belly no longer reads as 腹中空 in
    // this tick's stateLine. Inert for any seed with no sceneName'd meal.
    if (!night && economy && w.economy && foodScenes.size) {
        const EAT_AT_STALL = 0.35; // at the stall and at all hungry ⇒ you eat
        for (const member of w.cast) {
            const rosterScene = w.roster[member.id];
            const meal = foodScenes.get(rosterScene);
            if (!meal || member.state.hunger <= EAT_AT_STALL) continue;
            if (spendableOf(member.id) < BigInt(meal.priceSubunits)) continue;
            try {
                const outcome = economy.commitCommand(world, {
                    actorId: member.id,
                    sceneId: rosterScene,
                    witnessIds: [member.id],
                    command: { action: 'purchase', itemId: meal.id },
                    causeEventId: `${w.sagaId}:eat:d${today}:t${nowTick}:${member.id}`,
                    seq: 0,
                    day: today,
                });
                if (!outcome.ok) continue; // once-per-day / can't afford — never fatal
                const eaten = `${member.name}在${world.sceneNameById(rosterScene)}吃了${meal.label}（${formatMoney(w.economy, BigInt(meal.priceSubunits))}）`;
                w.dayAccum.lines.push(`[食] ${eaten}`);
                log(`  [食] ${eaten}`);
            } catch (error) {
                log(`  [食] ${member.name} 進食未成：${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    // 3.6) 祈願 (say a prayer at a temple) — a DELIBERATE SPOKEN prayer to 神明,
    // autonomic and once-per-day, mirroring §3.5 eat-in-passing: any character
    // whose ROSTER scene is a temple, who carries a live want, and who has NOT
    // prayed today speaks their hottest want out loud as a prayer. The runner
    // voices it (agent.speakPrayer, cheap tier, fail-safe to null); the fake OMITS
    // the method, so a DETERMINISTIC framing (framePrayerFallback) voices it — the
    // mechanism runs, and is testable, with no LLM. Runs BOTH day and night (廟宇
    // stays open late) and reads the roster directly, so a pilgrim is fed a prayer
    // even when the night cull drops the temple scene. A prayer is EXPRESSION, not
    // resolution — the want is never mutated (only a tiny mood relief). The
    // once-per-day bound keeps the temple from flooding. Inert for a world with no
    // temple scene (templeScenes empty).
    if (templeScenes.size) {
        for (const member of w.cast) {
            const rosterScene = w.roster[member.id];
            if (!templeScenes.has(rosterScene)) continue;       // not standing at a temple
            if (world.prayedToday(member.id, today)) continue;  // once per day — no flooding
            const hot = world.liveWantsOf(member.id)[0];
            if (!hot) continue;                                 // a prayer needs a live 心願
            const templeName = world.sceneNameById(rosterScene);
            const targetName = hot.target ? (world.castById(hot.target)?.name ?? hot.target) : undefined;
            let text: string | null = null;
            if (agent.speakPrayer) {
                try {
                    text = await agent.speakPrayer({
                        name: member.name,
                        persona: member.persona,
                        role: member.role,
                        want: { desc: hot.desc, layer: hot.layer, target: targetName },
                        clock: clockLabel,
                        templeName,
                        deity: deityHintFor(templeName),
                    });
                } catch {
                    text = null; // fail safe: the deterministic framing voices it
                }
            }
            if (!text) text = framePrayerFallback(member.name, hot.desc, member.gender);
            world.addPrayer({
                id: `${w.sagaId}:prayer:d${today}:t${nowTick}:${member.id}`,
                characterId: member.id,
                name: member.name,
                day: today,
                tick: nowTick,
                clock: clockLabel,
                sceneId: rosterScene,
                sceneName: templeName,
                text,
                wantDesc: hot.desc,
                layer: hot.layer,
                target: targetName,
            });
            // A CHARACTER-attributed beat at the temple so the prayer reads as the
            // character speaking (surfaces live in the 拍流, joins the day's material).
            emitCharacterBeat(rosterScene, member.id, member.name, text);
            // Optional tiny mood relief — saying it out loud eases the heart a little.
            member.state.mood = Math.max(-1, Math.min(1, member.state.mood + 0.05));
            log(`  [祈願] ${member.name}在${templeName}對神明求告：${text}`);
        }
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

        // 夜訪商量: when this night 2-person private pair qualifies as confide, the
        // confider (the worrier) OPENS the scene — firstActorId brings their matter
        // onto the page, so the confidence itself transfers rather than the beat
        // landing on the listener's reaction. Precedence-correct: nightSceneKind
        // gates out tryst/reckoning first, so this only fires for a true confide.
        const confideOpenerId =
            night && isPrivate && ids.length === 2
                ? (() => {
                      const cs = ids.map((id) => ({ id, name: world.nameById(id) }));
                      return nightSceneKind(cs, info?.privacyLevel ?? 0, wants, isTrustedConfidant) === 'confide'
                          ? confiderOf(cs, wants, isTrustedConfidant) ?? undefined
                          : undefined;
                  })()
                : undefined;

        // SKILL hang point #2 — on the boards, a performer's stage craft (唱/身)
        // colours their beats on top of their daily bearing (conduct); off-stage
        // only conduct. So a 悲工/文戲 lead's on-stage OUTPUT reads different from
        // how they carry themselves at the tea-table — the framework's "different
        // style of output" made concrete, with one gather call + a wider kind set.
        const onStage = isStageScene(sceneName);
        const beatSkillKinds = onStage ? [...CONDUCT_KINDS, ...STAGE_KINDS] : [...CONDUCT_KINDS];
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
                    // SKILL hang point: fold this member's skills into a style hint
                    // so their speech + bearing (and, on the boards, their stage
                    // craft) carry their skills. undefined when nothing matches (beat
                    // unchanged) — the on-stage set adds 唱/身 to the conduct kinds.
                    styleHint: skillStyleHint(member.skills, beatSkillKinds),
                    ties,
                    // STANDING for the advance affordance: in a 2-person scene the
                    // world deals the advance card only on real bond standing
                    // (bond ≥ advanceAt); ≠2 people ⇒ leave undefined (default true).
                    advanceReady: ids.length === 2 ? advanceReady(bonds, id, ids.find((o) => o !== id)!) : undefined,
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
            // Established lovers alone at night open the intimacy register directly
            // (old lovers renegotiate nothing). Every other scene: undefined.
            emotionalStance: (night && isPrivate && ids.length === 2 && world.isEstablished(ids[0], ids[1])) ? 'consummate' : undefined,
            // 夜訪商量: the confider opens; every other scene routes normally (undefined).
            firstActorId: confideOpenerId,
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
                // 贈物暖情 — handing an object to a co-present person is affection made
                // physical (殷阿婆的白蘭買來簪在心上人襟前）: the gift warms the bond
                // both ways (bumpBond is symmetric). carrierName names the receiver;
                // skip a hand to oneself / an off-scene or unresolvable name.
                for (const eff of beat.objectEffects ?? []) {
                    if (!eff.carrierName) continue;
                    const receiverId = world.idByName(eff.carrierName);
                    if (!receiverId || receiverId === beat.characterId || !ids.includes(receiverId)) continue;
                    bumpBond(bonds, beat.characterId, receiverId, 'gift');
                    togetherToday.add(world.pairKey(beat.characterId, receiverId));
                    log(`  [贈] ${beat.name} 以物贈 ${world.nameById(receiverId)}，情意近了些`);
                }
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

        // BOND UPDATE (§2.1/2.4) — every unordered co-present pair warms just by
        // sharing the stage; a private scene warms more. Record who met so tonight's
        // cooling spares them (an old flame that met stays warm).
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                bumpBond(bonds, ids[i], ids[j], isPrivate ? 'private' : 'shared');
                togetherToday.add(world.pairKey(ids[i], ids[j]));
            }
        }
        // 相許 (event) — an in-scene advance→accept made them lovers HERE: warm the
        // bond hard (床) and record the milestone into the established set.
        if (loop.intimacyAccepted && ids.length === 2) {
            bumpBond(bonds, ids[0], ids[1], 'bed');
            world.addEstablished(ids[0], ids[1]);
            grantMutualHomeKeys(ids[0], ids[1]); // 相許 → 授權: mutual standing keys
            log(`  [相許] ${world.nameById(ids[0])} 與 ${world.nameById(ids[1])} 這一場成了彼此`);
        }
        // 相許 (verdict) — a settled night pair not yet established but still carrying
        // a live love-want toward each other: ask the milestone judge whether they
        // are, as of now, 相許 (READS the relationship, never steers it). Runs AFTER
        // the accept path above so an already-established pair is never re-judged.
        if (night && isPrivate && ids.length === 2 && !world.isEstablished(ids[0], ids[1])) {
            const [a, b] = ids;
            const loveWantBetween = wants.some((wnt) => {
                if (wnt.retired || !/愛|情/.test(wnt.layer) || !wnt.target) return false;
                if (wnt.characterId !== a && wnt.characterId !== b) return false;
                const other = wnt.characterId === a ? b : a;
                return wnt.target === other || wnt.target === world.nameById(other);
            });
            if (loveWantBetween) {
                const established = await agent.judgeEstablished({
                    aName: world.nameById(a),
                    bName: world.nameById(b),
                    aView: world.relationshipView(a, b),
                    bView: world.relationshipView(b, a),
                    wants: wants
                        .filter((wnt) => !wnt.retired && /愛|情/.test(wnt.layer) && (wnt.characterId === a || wnt.characterId === b))
                        .map((wnt) => wnt.desc),
                    lastSceneTail: loop.beats.slice(-4).map((bt) => `${bt.name}：${bt.text}`).join('\n') || undefined,
                });
                if (established) {
                    world.addEstablished(a, b);
                    grantMutualHomeKeys(a, b); // 相許 → 授權: mutual standing keys
                    bumpBond(bonds, a, b, 'accept');
                    log(`  [相許] ${world.nameById(a)} 與 ${world.nameById(b)} 已交了心`);
                }
            }
        }

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

    // 7.45) OVERNIGHT COUNTER SEATS — the establishment counterparty answers each
    // pending 還價 HERE, one async agent call per seat, so the 7.5 settle below
    // stays a PURE, replayable function: the verdicts are computed in this phase
    // and injected. The seat only chooses WITHIN what the mechanical gate allows
    // (a money-counter that breaks the reserve floor never reaches a seat — it is
    // refused deterministically inside settle). A throw or null reply → no verdict,
    // and settle falls back to its deterministic path for that contract.
    let counterVerdicts: Record<string, { accept: boolean; note?: string }> | undefined;
    if (dayEnd && economy && w.economy && agent.negotiateCounter) {
        for (const seat of buildNegotiationSeats(world)) {
            let reply: { accept: boolean; note?: string } | null = null;
            try {
                reply = await agent.negotiateCounter(seat.input);
            } catch {
                reply = null;
            }
            if (!reply) continue;
            (counterVerdicts ??= {})[seat.contractId] = { accept: reply.accept, note: reply.note };
            const label = w.economy.contracts[seat.contractId]?.label ?? seat.contractId;
            log(`  [還價·座席] ${label}: ${reply.accept ? '讓' : '不讓'}`);
        }
    }

    // 7.5) DAY-END ECONOMY SETTLEMENT — deterministic, idempotent per day.
    // Wages, fixed living/operating costs and contract deadlines settle HERE,
    // never in prose. Objective consequences land now (hunger, object states,
    // escrow release); the notices post as next-morning scheduled events so the
    // cast PERCEIVES the settlement before choosing anything (aftermath tick).
    let economyNotices: string[] | undefined;
    if (dayEnd && economy && w.economy) {
        const settled = economy.settleDay(world, { day: today, nowTick, ...(counterVerdicts ? { counterVerdicts } : {}) });
        if (settled.settled) {
            economyNotices = settled.publicNotices;
            for (const line of settled.publicNotices) {
                log(`  [結算] ${line}`);
                acc.lines.push(`[帳房] ${line}`);
            }
            for (const notice of settled.privateNotices) {
                log(`  [結算·私] ${world.nameById(notice.characterId)}：${notice.text}`);
            }
            // Contract 限期 foreclosure — the day's generic settlement percept
            // already went out, but it never names the SLOT and never retires the
            // want it kills. So a party who never signed keeps a 心事 for a 聯名
            // 搭檔欄 that can no longer be filled (the 柳安春 case). Deliver a sharp,
            // party-private percept so they KNOW it's over, and foreclose the moot
            // want so it stops pressing — tonight's self-rewrite then moves the heart.
            for (const foreclosure of settled.foreclosures ?? []) {
                const slotNote = foreclosure.slotUnfilled ? '——聯名搭檔那一欄，你終究沒填上一個名字' : '';
                (w.scheduledEvents ??= []).push({
                    id: `contract-foreclosed-${foreclosure.contractId}-t${nowTick}`,
                    atTick: nowTick + 1,
                    sceneId: foreclosure.sceneId,
                    text: `「${foreclosure.label}」的限期過了，這約終究沒簽成${slotNote}；擱在心上的那樁，就這麼無處著落了。`,
                    visibility: 'private',
                    witnessIds: foreclosure.partyIds.length ? foreclosure.partyIds : w.cast.map((member) => member.id),
                });
                for (const want of wants) {
                    if (want.retired || !foreclosure.partyIds.includes(want.characterId)) continue;
                    const aboutIt =
                        want.desc.includes(foreclosure.label) ||
                        (foreclosure.slotUnfilled && /搭檔|聯名|署名|填.{0,3}名|簽/.test(want.desc));
                    if (!aboutIt) continue;
                    want.retired = true;
                    log(`  [限期作廢] ${world.nameById(want.characterId)}「${want.desc}」隨約作廢`);
                    acc.lines.push(`[帳房] ${world.nameById(want.characterId)}擱在心上的「${want.desc}」，隨這約限期一過，也就了了。`);
                }
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

    // 7.75) NIGHTLY WANT REGENERATION (relationshipFallback wiring) — 願生不息.
    // The structural guard against livelihood machinery crowding out feeling: a
    // fresh want (especially an emotional one) can be BORN each night for EVERY
    // character — even one who had no scene — so nobody flatlines once their
    // personal arc resolves. Runs AFTER self-model + 心事自改 so it sees the day's
    // resolutions. The agent alone decides IF one is born (a successor seeded by a
    // want just resolved, or an ambient want stirred by real world/lifecycle
    // pressure); the ≤4-live budget inside spawnWant is the ONLY cap, so it never
    // spams, and there is NO artificial floor — null when nothing real stirs one.
    // Only NARRATIVE wants are added (spawnWant → kind:'narrative'); no economic
    // want, so season balances are untouched. Ledger figures NEVER enter the
    // prompt: worldPressure/lifecycle are terse PROSE (「銀錢將盡」, not 「餘 3 圓」).
    if (dayEnd && w.relationshipFallback) {
        const dayStartTick = nowTick - c.tickOfDay; // first tick of today
        const castNames = w.cast.map((member) => member.name);
        const regenEvents: LedgerEvent[] = [];
        // Money units struck from any scheduled-event handle so no ledger figure
        // leaks; day-counts I compose in `lifecycle` are explicitly allowed.
        const figureFree = (s: string) => s.replace(/[0-9０-９]+\s*[圓分兩文錢]?/g, '').replace(/\s+/g, '');
        // The nearest still-offered contract deadline — a clean PROSE label (名目),
        // number-free, feeding both the imminence clause and the finitude line.
        const nearContract = w.economy
            ? Object.values(w.economy.contracts)
                  .filter((ct) => ct.status === 'offered' && ct.deadlineDay >= today)
                  .sort((a, b) => a.deadlineDay - b.deadlineDay)[0]
            : undefined;
        for (const member of w.cast) {
            const liveWants = world.liveWantsOf(member.id).map((x) => ({ layer: x.layer, desc: x.desc }));
            // descs of wants this character RESOLVED today (resolvedTick since day-start).
            const justResolved = wants
                .filter(
                    (x) =>
                        x.retired &&
                        x.characterId === member.id &&
                        x.resolvedTick != null &&
                        x.resolvedTick >= dayStartTick,
                )
                .map((x) => x.desc);

            // worldPressure — the EXTERNAL world pressing on TA (not a want already
            // held): broke / short runway, the nearest looming deadline, acute
            // hunger. 0–2 terse PROSE clauses, no ledger figures.
            const pressure: string[] = [];
            const acct = w.economy?.state.accounts[member.id];
            if (acct) {
                const avail = BigInt(acct.available);
                const daily = BigInt(acct.dailyFixedCost);
                if (avail < 0n) pressure.push('入不敷出');
                else if (daily > 0n && avail / daily <= 2n) pressure.push('銀錢將盡');
            }
            const nextScheduled = (w.scheduledEvents ?? [])
                .filter((s) => s.atTick > nowTick && s.witnessIds.includes(member.id))
                .sort((a, b) => a.atTick - b.atTick)[0];
            const deadlineHandle = nextScheduled
                ? nextScheduled.clock ?? figureFree(nextScheduled.text).slice(0, 12)
                : nearContract?.label;
            if (deadlineHandle) pressure.push(`${deadlineHandle}之期將至`);
            if (member.state.hunger > 0.6) pressure.push('腹餒');
            const worldPressure = pressure.slice(0, 2).join('，');

            // lifecycle — a terse finitude line (day-counts are allowed here).
            const lifecycle = nearContract
                ? `第${today}日，離「${nearContract.label}」大限尚${Math.max(0, nearContract.deadlineDay - today)}日`
                : `第${today}日，又過了些時日`;

            // otherThreads — the character's OWN remembered threads furthest from
            // their current wants (the door out of a single-axis loop). Best-effort.
            let otherThreads: string[] = [];
            try {
                const hits = await recall.recall(member.id, member.name, 8, today);
                const mems = [...new Set(hits.map((h) => h.text).filter(Boolean))];
                otherThreads = pickOrthogonalThreads(mems, liveWants.map((x) => x.desc), 3);
            } catch {
                otherThreads = []; // recall unavailable → no threads, not fatal
            }

            const spawn = await agent.regenerateWant({
                name: member.name,
                persona: member.persona,
                secret: member.secret,
                coreIdentity: member.coreIdentity,
                liveWants,
                justResolved,
                worldPressure,
                lifecycle,
                otherThreads,
            });
            if (spawn && spawnWant(wants, member.id, spawn, nowTick, regenEvents, castNames)) {
                log(`  願生: ${member.name}「${spawn.desc}」`);
            }
        }
    }

    // 7.78) 撤銷 on souring (換鎖) — at day-end an OWNER whose heart has turned
    // hostile toward a current STANDING key-holder takes the key back: a live
    // 妒/怨/恨/仇 want aimed at a holder revokes that holder's key. A real 撤銷
    // driven by the relationship turning (not a static table). Core mechanism —
    // unconditional world physics, NOT behind relationshipFallback.
    if (dayEnd) {
        const HOSTILE = /妒|怨|恨|仇/;
        for (const owner of w.cast) {
            const home = w.homeByChar[owner.id];
            if (!home || !world.ownersOf(home).includes(owner.id)) continue; // owns no private home
            for (const holder of world.keyHoldersOf(home)) {
                if (holder.kind !== 'standing') continue; // a one-time pass is consumed on entry, not revoked
                const soured = wants.some(
                    (wnt) =>
                        !wnt.retired &&
                        wnt.characterId === owner.id &&
                        HOSTILE.test(wnt.layer) &&
                        !!wnt.target &&
                        (wnt.target === holder.charId || wnt.target === world.nameById(holder.charId)),
                );
                if (soured) {
                    world.revokeAccess(home, holder.charId);
                    log(`  [門] ${owner.name} 換了鎖，${world.nameById(holder.charId)} 進不去了`);
                }
            }
        }
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

    // 8.5) NIGHTLY BOND COOLING — at day-end every pair that did NOT share a scene
    // today cools toward its floor (floorOfPeak · peak): idle acquaintances drift
    // apart while an old flame (high peak) never cools back to stranger. Pairs that
    // met today (togetherToday) are spared. Unconditional world physics — NOT behind
    // relationshipFallback.
    if (dayEnd) decayBonds(bonds, togetherToday);

    // 9) Advance clock + write bonds back, then snapshot the whole world.
    w.clock = clock.advance(c);
    world.setBonds(bonds); // establishedPairs already live on w.data via addEstablished
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
