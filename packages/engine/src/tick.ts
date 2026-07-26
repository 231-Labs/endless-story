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
    confiderOf,
    decayWants,
    fadeStaleWants,
    forcingLevel,
    hasWantSemantic,
    hasHostileWantToward,
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    shouldDeriveAftermath,
    tension,
    yearningNightPursuit,
    WANT_SEMANTIC_TAGS,
    type WantSemanticTag,
    type WantSource,
    type WantSubjectRef,
} from './core/want-core.ts';
import { pickOrthogonalThreads, spawnWant, type LedgerEvent } from './core/want-rewrite.ts';
import { runSceneLoop, type SceneBeat, type SceneLoopCastMember } from './core/scene-loop.ts';
import { CONDUCT_KINDS, STAGE_KINDS, isStageScene, skillStyleHint } from './core/skills.ts';
import { BOND, advanceReady, bondOf, bumpBond, decayBonds, seedBond } from './core/bond-graph.ts';
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
import type { AidActionInput, AidActionResult, AidPeer, AidSituation, AidVitality, ArchivePort, CanonicalSceneEvent, ClockPort, EconomyPort, RecallPort, RehearsalDecideReply, SceneAgentPort } from './ports.ts';
import { deriveBeatPerceiverIds, projectEventBeatsForWitness } from './core/scene-perception.ts';
import { commitBeatPhysics } from './core/physical-canon.ts';
import { bankRehearsalAttendance, buildLendSeatInput, buildNegotiationSeats, collectOverdueDebtWants, creditAdvertFor, enforceContractCommandPairing, foodScenesOf, formatMoney, performanceDutyLine, settleEveningPerformance, settleTenancyMoveIns, troupeLeaderId, troupePlayerIds, type SeasonCatalogItem } from './core/season-economy.ts';
import { deityHintFor, framePrayerFallback, templeScenesOf } from './core/temple-prayer.ts';
import { drainPendingDreams } from './core/dream.ts';
import { buildStakesBrief } from './core/stakes-brief.ts';
import { renownLabel, type WorldState } from './world-state.ts';

interface WantDraftForDeclaration {
    source: WantSource;
    characterId: string;
    desc: string;
    layer?: string;
    target?: string;
}

/** STRICT creation seam: the prose-producing seat has no direct authority over
 * mechanism metadata. A dedicated declaration call supplies finite tags and an
 * exact cast target. Legacy runs never enter this function's agent-call branch. */
async function declareStructuredWant(
    world: WorldState,
    agent: SceneAgentPort,
    draft: WantDraftForDeclaration,
): Promise<{ semanticTags?: WantSemanticTag[]; target?: string; subjectRef?: WantSubjectRef }> {
    if (!world.data.strictStructured) {
        return draft.target ? { target: draft.target } : {};
    }
    if (!agent.declareWantSemantics) {
        world.recordStructuredWarning({
            domain: 'want',
            kind: 'missing-semantic-seat',
            subjectId: draft.characterId,
            detail: `${draft.source}:${draft.desc}`,
        });
        return {};
    }
    try {
        const owner = world.castById(draft.characterId);
        const reply = await agent.declareWantSemantics({
            source: draft.source,
            characterId: draft.characterId,
            characterName: owner?.name ?? draft.characterId,
            desc: draft.desc,
            layer: draft.layer,
            target: draft.target,
            cast: world.data.cast.map((member) => ({ id: member.id, name: member.name })),
            subjects: Object.values(world.data.economy?.contracts ?? {}).map((contract) => ({
                kind: 'contract' as const,
                id: contract.id,
                label: contract.label,
            })),
        });
        if (!reply) {
            world.recordStructuredWarning({
                domain: 'want',
                kind: 'empty-semantic-declaration',
                subjectId: draft.characterId,
                detail: `${draft.source}:${draft.desc}`,
            });
            return {};
        }
        const semanticTags = [...new Set(reply.semanticTags)].filter((tag) =>
            (WANT_SEMANTIC_TAGS as readonly string[]).includes(tag),
        );
        const targetMember = reply.target
            ? world.data.cast.find(
                  (member) =>
                      member.id === reply.target || member.name === reply.target,
              )
            : undefined;
        if (reply.target && !targetMember) {
            world.recordStructuredWarning({
                domain: 'want',
                kind: 'invalid-semantic-target',
                subjectId: draft.characterId,
                detail: reply.target,
            });
        }
        const subjectRef =
            reply.subjectRef?.kind === 'contract' &&
            world.data.economy?.contracts[reply.subjectRef.id]
                ? reply.subjectRef
                : undefined;
        if (reply.subjectRef && !subjectRef) {
            world.recordStructuredWarning({
                domain: 'want',
                kind: 'invalid-semantic-subject',
                subjectId: draft.characterId,
                detail: `${reply.subjectRef.kind}:${reply.subjectRef.id}`,
            });
        }
        return {
            ...(semanticTags.length ? { semanticTags } : {}),
            ...(targetMember ? { target: targetMember.id } : {}),
            ...(subjectRef ? { subjectRef } : {}),
        };
    } catch (error) {
        world.recordStructuredWarning({
            domain: 'want',
            kind: 'semantic-seat-failed',
            subjectId: draft.characterId,
            detail: error instanceof Error ? error.message : String(error),
        });
        return {};
    }
}

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
    /** Live observer for the tick's committed MOVES, fired ONCE the movement
     *  phase closes — i.e. BEFORE any scene beat is played, so a live feed can
     *  place 行蹤 in true chronological order (moves precede the beats they lead
     *  to, not trail them). Observability only, same swallow-on-failure contract
     *  as onBeat. Absent ⇒ no move observation (backward compatible). */
    onMoves?: (moves: TickMoveObservation[]) => void;
}

/** One committed movement this tick — where a character was, and where the
 *  movement phase left them. Emitted as a batch via TickOpts.onMoves. */
export interface TickMoveObservation {
    day: number;
    tick: number;
    clock: string;
    characterId: string;
    name: string;
    fromSceneId: string;
    fromSceneName: string;
    toSceneId: string;
    toSceneName: string;
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
    const strictStructured = w.strictStructured === true;
    const events: CanonicalSceneEvent[] = [];
    const eventPovs: TickEventPov[] = [];

    const structuredWantGate = (
        want: (typeof wants)[number],
        legacy: boolean,
        structured: boolean,
        kind: string,
        targetId?: string,
        domain: 'authorization' | 'scene' | 'want' = 'want',
    ): boolean => {
        if (!strictStructured) return legacy;
        world.recordStructuredComparison({
            domain,
            kind,
            legacy,
            structured,
            actorId: want.characterId,
            targetId,
            subjectId: want.id,
            detail: want.layer,
        });
        return structured;
    };

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

    // 0.0) 注夢佇列 — dreams the owner queued at any moment (even while a prior
    // tick was running) are realised HERE, at the tick's safe start, before the
    // scheduled-event delivery below picks up whatever they schedule. Cadence +
    // 深宵 timing resolve against THIS clock. Empty/absent queue ⇒ no-op.
    for (const line of drainPendingDreams(world)) log(`  ${line}`);

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
                const declared = w.strictStructured
                    ? await declareStructuredWant(world, agent, {
                          source: 'genesis',
                          characterId: member.id,
                          layer: g.layer,
                          desc: g.desc,
                          target: g.target,
                      })
                    : { target: g.target };
                wants.push(
                    newWant({
                        id: world.nextWantId(),
                        characterId: member.id,
                        layer: g.layer,
                        desc: g.desc,
                        target: declared.target,
                        ...(w.strictStructured && declared.semanticTags?.length
                            ? { semanticTags: declared.semanticTags }
                            : {}),
                        ...(w.strictStructured && declared.subjectRef
                            ? { subjectRef: declared.subjectRef }
                            : {}),
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

    // 1.95) 邀約 —— 叩門的反向（晡時，reconcileVisit 旗標同轄）。白日心事壓不住
    // 的人，若正與心上人同場、自家私處對方又進不得，可遞句話「今夜來我處」——
    // 一次性領入（grantAccess oneTime），今夜用不用仍全由對方的移動選擇。遞不遞
    // 由 decideInvite 座席定（缺席＝嚥回去，確定性）；每人每日至多遞一次。兩造
    // 各記一條私密 scheduledEvent（與叩門拒門同渠道）。旗標關 ⇒ 整段跳過。
    if (clockLabel === '晡時' && agent.decideInvite) {
        const INVITE_LAYER = /愛|情|虧欠|愧|償/; // 怨不邀（記恨的人不會開自家門）
        for (const inviter of w.cast) {
            if ((w.inviteDayByChar?.[inviter.id] ?? 0) >= w.clock.day) continue; // 一日一話
            const home = w.homeByChar[inviter.id];
            const homeScene = home ? world.sceneById(home) : undefined;
            if (!homeScene || homeScene.privacyLevel < 3) continue; // 沒有私處可開
            if (!world.ownersOf(home).includes(inviter.id) && w.homeByChar[inviter.id] !== home) continue;
            const here = w.roster[inviter.id];
            const pressing = wants.find(
                (want) => {
                    if (
                        want.retired ||
                        want.characterId !== inviter.id ||
                        !want.target ||
                        forcingLevel(want) === 'idle'
                    ) {
                        return false;
                    }
                    const targetId = world.castById(want.target)
                        ? want.target
                        : world.idByName(want.target);
                    const declaredInvite =
                        hasWantSemantic(want, 'affection') ||
                        (hasWantSemantic(want, 'reckoning') &&
                            !hasWantSemantic(want, 'jealousy') &&
                            !hasWantSemantic(want, 'hostility'));
                    return structuredWantGate(
                        want,
                        INVITE_LAYER.test(want.layer),
                        declaredInvite,
                        'invite-eligibility',
                        targetId,
                        'authorization',
                    );
                },
            );
            if (!pressing) continue;
            const targetId = world.castById(pressing.target!) ? pressing.target! : world.idByName(pressing.target!);
            if (!targetId || targetId === inviter.id) continue;
            if (w.roster[targetId] !== here) continue; // 要同場才遞得了話
            if (world.canEnter(targetId, home)) continue; // 人家本就進得來，無需遞話
            const reply = await agent.decideInvite({
                inviterName: inviter.name,
                inviterRole: inviter.role ?? '—',
                inviterGender: inviter.gender,
                targetName: world.perceivedName(inviter.id, targetId),
                targetRole: world.castById(targetId)?.role ?? '—',
                wantDesc: pressing.desc,
                tieTowardTarget: inviter.relationshipView[targetId] ?? w.edges[inviter.id]?.[targetId]?.tone,
                sceneName: world.sceneNameById(here),
                homeName: world.sceneNameById(home),
                clockLabel,
            }).catch(() => null);
            (w.inviteDayByChar ??= {})[inviter.id] = w.clock.day; // 問過即記日（嚥回也算開過口的一天）
            if (reply?.invite !== true) continue;
            world.grantAccess(home, targetId, 'oneTime');
            const said = reply.line?.trim() || undefined;
            log(`  [邀約] ${inviter.name} 向${world.nameById(targetId)}遞話：今夜可來${world.sceneNameById(home)}${said ? `（${said}）` : ''}`);
            (w.scheduledEvents ??= []).push({
                id: `invite-given-${inviter.id}-t${nowTick}`,
                atTick: nowTick + 1,
                sceneId: here,
                text: `你把話遞出去了——請${world.perceivedName(inviter.id, targetId)}今夜來${world.sceneNameById(home)}坐坐${said ? `：「${said}」` : ''}。這句話出了口，就收不回了。`,
                visibility: 'private',
                witnessIds: [inviter.id],
            });
            (w.scheduledEvents ??= []).push({
                id: `invite-received-${targetId}-t${nowTick}`,
                atTick: nowTick + 1,
                sceneId: here,
                text: `${world.perceivedName(targetId, inviter.id)}${clockLabel}悄悄遞了句話：今夜得空，來${world.sceneNameById(home)}坐坐${said ? `——「${said}」` : ''}。去不去，在你。`,
                visibility: 'private',
                witnessIds: [targetId],
            });
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
    // Food scenes: sceneId → the cheapest location-anchored meal, precomputed once —
    // the anchor a hungry mover can be pulled toward and fed at (§3.5). EMPTY for any
    // seed whose meals carry no sceneName, so the 利害簡報's demoted hunger line and
    // the eat-in-passing step are both inert there. spendableOf reads a character's
    // OWN purse (self-paid meals). The hunger THRESHOLD (HUNGER_SEEK) now lives with
    // the brief in stakes-brief.ts.
    const foodScenes: Map<string, SeasonCatalogItem> = w.economy ? foodScenesOf(world) : new Map();
    // 廟願 — scene ids that read as a temple (神明 前). Precomputed once; EMPTY for
    // a world with no temple scene, so the 廟 PULL below and the §3.6 祈願 step are
    // both fully inert there (backward compat: zero behaviour change).
    const templeScenes: Set<string> = templeScenesOf(world);

    // 2.35) 還願 —— 廟願生命週期的下半環。曾在廟裡親口許過的願，其後真的了結
    // （judge 判成——淡忘與限期作廢不算：後者不寫 resolvedTick），當事人再踏進
    // 廟門那一拍便還了願：願籤記上 fulfilled、得一條私憶。無廟、無願、無了結
    // ⇒ 整段惰性（additive，無旗標）。
    if (w.prayers?.length && templeScenes.size) {
        for (const p of w.prayers) {
            if (p.fulfilledTick !== undefined) continue;
            const matching = wants.filter(
                (want) =>
                    want.characterId === p.characterId &&
                    want.retired &&
                    want.resolvedTick !== undefined &&
                    !!p.wantDesc &&
                    want.desc === p.wantDesc,
            );
            const legacyTrulyDone = matching.some(
                (want) => !/淡了|過去了/.test(want.resolvedNote ?? ''),
            );
            const structuredTrulyDone = matching.some(
                (want) => want.resolutionCause === 'resolved',
            );
            if (w.strictStructured) {
                world.recordStructuredComparison({
                    domain: 'want',
                    kind: 'prayer-resolution-cause',
                    actorId: p.characterId,
                    subjectId: p.id,
                    legacy: legacyTrulyDone,
                    structured: structuredTrulyDone,
                    detail: p.wantDesc,
                });
                if (matching.some((want) => want.resolutionCause === undefined)) {
                    world.recordStructuredWarning({
                        domain: 'want',
                        kind: 'missing-resolution-cause',
                        subjectId: p.id,
                        detail: p.wantDesc,
                    });
                }
            }
            const trulyDone = () =>
                w.strictStructured ? structuredTrulyDone : legacyTrulyDone;
            // 香火願 (source 'owner') 應驗s SILENTLY the moment the want truly
            // resolves: the character never made this vow — never knew it exists
            // — so there is no temple visit to wait for and no private memory to
            // keep. The 願牆 stamp alone tells the owner their incense answered.
            if (p.source === 'owner') {
                if (!trulyDone()) continue;
                p.fulfilledDay = w.clock.day;
                p.fulfilledTick = nowTick;
                log(`  [香火應驗] ${world.nameById(p.characterId)}的那樁香火願成了（${p.wantDesc}）`);
                continue;
            }
            const standing = w.roster[p.characterId];
            if (!standing || !templeScenes.has(standing)) continue; // 要人真的在廟裡
            if (!trulyDone()) continue;
            p.fulfilledDay = w.clock.day;
            p.fulfilledTick = nowTick;
            log(`  [還願] ${world.nameById(p.characterId)} 在${p.sceneName}還了那樁願（${p.wantDesc}）`);
            (w.scheduledEvents ??= []).push({
                id: `prayer-fulfilled-${p.id}`,
                atTick: nowTick + 1,
                sceneId: standing,
                text: `你回到${p.sceneName}，對神明還了那樁願——當日求的「${p.wantDesc}」，如今成了。`,
                visibility: 'private',
                witnessIds: [p.characterId],
            });
        }
    }
    const spendableOf = (id: string): bigint => BigInt(w.economy?.state.accounts[id]?.available ?? '0');
    // 夜訪商量 PULL reads the bond underlay as PERSISTED at tick start. The lazy
    // canon seed (§2.95) runs after this movement phase, so on the very FIRST tick
    // this Map is empty and the confide pull is inert — by design; a confidence is
    // taken to someone you already have standing with, which only exists once ties
    // are seeded/warmed. Read-only here (never mutated before movement).
    const bondsAtMove = world.bondGraph();
    // Roster as it stands BEFORE this tick's movement phase — diffed after the
    // phase (incl. tenancy move-ins) to observe the tick's committed moves in
    // chronological order (onMoves fires before any scene beat plays).
    const rosterBeforeMoves = { ...w.roster };
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
        const intrude = night
            ? jealousNightPursuit(wants, member.id, resolveTargetId, strictStructured)
            : null;
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
        // 叩門夜訪 (knock-visit) — PARALLEL to 撞破's targeting but WITHOUT its
        // license. ACTIVE ONLY when the reconcileVisit flag is on. At night a ripe
        // (edge+) 愛/虧欠 want may SEEK its target who is HOME ALONE in a private
        // scene — but the visitor's ardor never opens the door: the mover may only
        // walk up and KNOCK (求見). The knock-target option is EMITTED despite the
        // 訪問權限 key gate (else the mover could never even reach the door), yet it
        // carries NO entry: admission is the OCCUPANT's one-time 放行, resolved
        // after decideMove through the optional decideAdmit seat (absent seat ⇒
        // REFUSE). The capacity bar is NOT bypassed (occupancy===1 in a private
        // home passes the default bar anyway). The target sits ALONE (occupancy
        // EXACTLY 1 — an admitted mover joins to make an intimate pair of 2), not
        // mid-tryst. Flag off ⇒ yearn null ⇒ knockSceneId undefined ⇒ every scene
        // keeps both bars byte-for-byte, exactly as before.
        const yearn = night
            ? yearningNightPursuit(wants, member.id, resolveTargetId, strictStructured)
            : null;
        const knockSceneId = (() => {
            if (!yearn || yearn.intrude !== true || yearn.id === member.id) return undefined; // ripe edge+ only
            const sid = w.roster[yearn.id];
            if (!sid || sid === currentSceneId) return undefined;   // already there ⇒ no visit
            const scene = world.sceneById(sid);
            if (!scene || scene.privacyLevel < 3) return undefined;  // a private home
            const occupants = w.cast.filter((candidate) => w.roster[candidate.id] === sid);
            if (occupants.length !== 1) return undefined;            // target HOME ALONE (admitted mover joins ⇒ pair)
            if (occupants[0].id === member.id) return undefined;     // that lone occupant isn't us
            if (sid === intrudeSceneId) return undefined;            // same scene ⇒ jealousy is the acuter claim
            return sid;
        })();
        // A salient inner pull so the offered 叩門 option is weighed under real
        // pressure — the character still decides (restraint is valid); no numbers.
        const knockPull = knockSceneId
            ? `你心裡放不下${world.nameById(yearn!.id)}，聽聞他此刻獨在${world.sceneNameById(knockSceneId)}——你進不得那扇門，但可以上前叩門求見；開不開，由屋裡人。`
            : undefined;
        const options = w.scenes.flatMap((scene) => {
            if (scene.id === currentSceneId) return [];
            if (coolingDown && scene.id !== w.homeByChar[member.id]) return [];
            // 撞破: for the ONE jealous-intrude target scene, skip BOTH bars below
            // (over-capacity by design, uninvited by design). Every other scene keeps
            // capacity + welcome exactly as before.
            const isIntrudeTarget = scene.id === intrudeSceneId;
            // 叩門: the ONE knock-target scene is emitted PAST the canEnter filter
            // below (else the barred mover could never even reach the door to
            // knock) — but it carries NO entry license and NO capacity exemption:
            // choosing it walks the mover to the door, and whether it opens is the
            // occupant's 放行 (resolved after decideMove). A mover who ALREADY
            // holds a key needs no knock — their option stays a normal entry.
            // knockSceneId already excludes intrudeSceneId, so never both.
            const isKnockTarget = scene.id === knockSceneId && !world.canEnter(member.id, scene.id);
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
            // it bypassed the old gate. A 叩門 target passes the FILTER only (the
            // option must exist to be knocked on); it is never an entry here.
            if (!isIntrudeTarget && !isKnockTarget && !world.canEnter(member.id, scene.id)) return [];
            const presentCharacters = w.cast
                .filter((candidate) => candidate.id !== member.id && w.roster[candidate.id] === scene.id)
                .map((candidate) => ({
                    id: candidate.id,
                    // 相識分寸: the mover sees each present other as THEY know them;
                    // flag-off ⇒ perceivedName === nameById (byte-identical). The id
                    // stays intact — the move percept never matches on this name.
                    name: world.perceivedName(member.id, candidate.id),
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
                homeOfName: ownerIds[0] ? world.perceivedName(member.id, ownerIds[0]) : undefined,
                isHome: w.homeByChar[member.id] === scene.id,
                isWork: w.workByChar[member.id] === scene.id,
                near: world.nearby(currentSceneId, scene.id),
                // 撞破: mark the barged-into tryst so decideMove frames choosing it as
                // bursting in uninvited (明知不請自來，妒火中燒也要去撞破).
                ...(isIntrudeTarget ? { intrude: true as const } : {}),
                // 叩門: mark the home-alone scene so decideMove frames choosing it
                // as walking up to KNOCK (求見) — entry is the occupant's to grant,
                // never the mover's to take (開不開，由屋裡人).
                ...(isKnockTarget ? { knock: true as const } : {}),
            }];
        });
        // 尋人掛心 (seekRouting flag) — a PERSISTED seek_person intention routes
        // here as a SOFT pull only (decideMove stays the single movement
        // authority; options/bars are untouched): target co-present ⇒ the
        // intention is MET and the entry clears; target's scene among the
        // offered options ⇒ a salient reminder pull; target shut away where the
        // seeker can't follow ⇒ the pull counsels waiting (at night the existing
        // 叩門/撞破 machinery takes over on its own when eligible — never
        // duplicated here). Flag off, or no live entry, ⇒ zero extra lines —
        // decideMove inputs byte-identical (backward compat).
        const seekMap = w.seeking;
        const seekEntry = seekMap?.[member.id];
        let seekPull: string | undefined;
        if (seekMap && seekEntry) {
            if (!world.castById(seekEntry.targetId)) {
                delete seekMap[member.id]; // target no longer in the world — the intention lapses
            } else if (w.roster[seekEntry.targetId] === currentSceneId) {
                delete seekMap[member.id]; // 尋著了 — met face to face, the intention is fulfilled
                log(`  [尋人] ${member.name} 尋著了${world.nameById(seekEntry.targetId)}`);
            } else {
                const seekSceneId = w.roster[seekEntry.targetId];
                // 相識分寸: the seeker names the sought as THEY know them.
                const seekName = world.perceivedName(member.id, seekEntry.targetId);
                seekPull = options.some((option) => option.sceneId === seekSceneId)
                    ? `你先前打定主意要去尋${seekName}，此刻他在${world.sceneNameById(seekSceneId)}——這樁心事還掛著。`
                    : `你先前打定主意要去尋${seekName}，可他此刻在私處，白日不便闖——且等他露面。`;
            }
        }
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
                ...(knockPull ? [knockPull] : []),
                ...(seekPull ? [seekPull] : []),
            ].filter(Boolean).join('\n') || undefined,
            planHint: [
                // Standing plan (if any) leads — the character heads toward goals, not just reacts.
                member.plan ? `【你這些日子的打算】\n${member.plan}` : '',
                `【眼下心事】\n${live.map((want) => `- [${want.layer}] ${want.desc}`).join('\n')}`,
            ].filter(Boolean).join('\n'),
            // 利害簡報 (stakes brief): the soft movement hint, now a NEUTRAL BRIEFING
            // instead of the old single-winner priority cascade. It COLLECTS every
            // applicable stake — tonight's show / livelihood (the piece the cascade
            // never surfaced), 口碑, the 行當本分 rhythm, a DEMOTED hunger line, plus the
            // optional 夜訪/廟 pulls — livelihood/reputation first, appetite one line
            // among others (never『旁的事等吃過再說』). Still a soft hint: the single
            // movement authority (decideMove) is untouched, and the deterministic
            // FakeSceneAgent ignores it, so the mechanical movement/economy path is
            // byte-identical. The heavy lifting is the pure `buildStakesBrief` helper.
            rhythmHint: buildStakesBrief({
                world,
                member,
                currentSceneId,
                clockLabel,
                nowTick,
                liveWants: live,
                wants,
                options,
                bonds: bondsAtMove,
                foodScenes,
                templeScenes,
                rehearsalToday,
                rehearsalTroupe,
                rehearsalVenueName,
            }),
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
        const chosenOption = options.find((option) => option.sceneId === decision.targetSceneId);
        if (!chosenOption) continue;
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

        // 叩門/放行 (knock + consent) — the chosen option was a KNOCK, not an
        // entry: the mover walked to the door of a home they may NOT enter
        // (canEnter false) and asked. Whether the door opens is the OCCUPANT's
        // decision, through the optional decideAdmit seat; an absent seat or a
        // null/invalid reply ⇒ REFUSE (deterministic, conservative — the fake
        // agent inherits this default by simply omitting the seat). ADMIT mints a
        // one-time 放行 (grantAccess oneTime) and the move commits through the
        // SAME path as any other accepted move, where consumeOneTime (below) uses
        // the pass up on entry — granted and consumed exactly once. A waylaid
        // knocker (路遇 above re-aimed arrivalSceneId) never reached the door, so
        // their stop-over commits as a normal move instead.
        let moveAnnotation = decision.reason ? `（${decision.reason}）` : '';
        if (chosenOption.knock && arrivalSceneId === knockSceneId) {
            // Recompute the lone occupant NOW — earlier movers this phase may have
            // shifted the roster since the option was built (never trust stale locals).
            const occupantsNow = w.cast.filter(
                (candidate) => candidate.id !== member.id && w.roster[candidate.id] === arrivalSceneId,
            );
            const occupant = occupantsNow.length === 1 ? occupantsNow[0] : undefined;
            const reply = occupant && agent.decideAdmit
                ? await agent.decideAdmit({
                      occupantName: occupant.name,
                      occupantRole: occupant.role ?? '—',
                      occupantGender: occupant.gender,
                      occupantState: {
                          fatigue: occupant.state.fatigue,
                          hunger: occupant.state.hunger,
                          mood: occupant.state.mood,
                      },
                      // 相識分寸: the occupant hears the knocker AS THEY know them —
                      // an unfamiliar voice at night reads as 深夜生人.
                      knockerName: world.perceivedName(occupant.id, member.id),
                      knockerRole: member.role ?? '—',
                      clockLabel,
                      sceneName: world.sceneNameById(arrivalSceneId),
                      tieTowardKnocker:
                          occupant.relationshipView[member.id] ?? w.edges[occupant.id]?.[member.id]?.tone,
                      isNight: true,
                  }).catch(() => null)
                : null;
            const doorLine = reply?.line?.trim() || undefined;
            if (reply?.admit === true && occupant) {
                world.grantAccess(arrivalSceneId, member.id, 'oneTime');
                moveAnnotation = `（叩門，${world.nameById(occupant.id)}放行${doorLine ? `：${doorLine}` : ''}）`;
            } else {
                // REFUSED (or nobody answered): the door stays shut, no access is
                // granted, the roster never changes — but the walk there and back
                // SPENT the move (same arrived/rest bookkeeping as a committed
                // move that ends at the mover's CURRENT scene). Both sides keep
                // the moment: two party-private scheduled events deliver it next
                // tick as a real percept (recall.remember + observeScene + the
                // 拍流/紀事 lines — the same channel 帳房/戲園 lines ride).
                log(`  [叩門] ${member.name} 在${world.sceneNameById(arrivalSceneId)}外叩門，${occupant ? `${world.nameById(occupant.id)}沒有開門` : '無人應門'}${doorLine ? `（隔門：${doorLine}）` : ''}`);
                (w.scheduledEvents ??= []).push({
                    id: `knock-refused-${member.id}-t${nowTick}`,
                    atTick: nowTick + 1,
                    sceneId: fromSceneId,
                    text: `深宵你去叩了${occupant ? world.perceivedName(member.id, occupant.id) : world.sceneNameById(arrivalSceneId)}的門，門沒開${doorLine ? `，只隔門聽得一句：${doorLine}` : ''}。`,
                    visibility: 'private',
                    witnessIds: [member.id],
                });
                if (occupant) {
                    (w.scheduledEvents ??= []).push({
                        id: `knock-refused-${occupant.id}-t${nowTick}`,
                        atTick: nowTick + 1,
                        sceneId: arrivalSceneId,
                        text: `${clockLabel}有人叩門，你聽出是${world.perceivedName(occupant.id, member.id)}，你沒有開門。`,
                        visibility: 'private',
                        witnessIds: [occupant.id],
                    });
                }
                lastMovedTickByChar[member.id] = nowTick;
                if (!world.sameDistrict(fromSceneId, arrivalSceneId)) restUntilByChar[member.id] = nowTick + 2;
                continue;
            }
        }

        world.moveCharacter(member.id, arrivalSceneId);
        routed[member.id] = arrivalSceneId;
        // 一次性 領入: if the mover entered on a one-time pass, it is used up here
        // (owners / standing key-holders consume nothing). A 撞破 break-in holds no
        // pass, so it consumes nothing either. A just-放行'd knocker holds exactly
        // the pass minted above — consumed right here, on this entry.
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
        log(`  move: ${member.name} ${from} → ${world.sceneNameById(arrivalSceneId)}${moveAnnotation}`);
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

    // 2.55) MOVE OBSERVATION — the movement phase (incl. tenancy move-ins) is
    // closed; publish the tick's committed moves to any live observer NOW, before
    // scene beats play, so 行蹤 reads in true order (move → the beats it leads to).
    // Pure observability: a diff of the roster, never a mechanism input.
    if (opts.onMoves) {
        const moves: TickMoveObservation[] = [];
        for (const [characterId, toSceneId] of Object.entries(w.roster)) {
            const fromSceneId = rosterBeforeMoves[characterId];
            if (!fromSceneId || fromSceneId === toSceneId) continue;
            moves.push({
                day: today,
                tick: nowTick,
                clock: clockLabel,
                characterId,
                name: world.nameById(characterId),
                fromSceneId,
                fromSceneName: world.sceneNameById(fromSceneId),
                toSceneId,
                toSceneName: world.sceneNameById(toSceneId),
            });
        }
        if (moves.length) {
            try {
                opts.onMoves(moves);
            } catch (error) {
                log(`  [observer] onMoves failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
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
                case 'seek_person': {
                    // 尋人掛心 (seekRouting flag): a declared seek becomes a PERSISTED
                    // intention — recorded here, ROUTED at the next movement phase as a
                    // soft pull (同場即了、私處且候), expired at day-end after 3 blank
                    // days. Target resolves by id or name, exactly like the movement
                    // phase's resolveTargetId. Flag off (or an unresolvable/self
                    // target) ⇒ the old no-op — but LOGGED now, never hidden.
                    const seekTargetId = result.target
                        ? (world.castById(result.target) ? result.target : world.idByName(result.target))
                        : undefined;
                    // Two guards, measured from a real run (q4sn): 白韻秋 declared
                    // 「去尋柳安春」6× and 尋著 5× in 15 拍 — a spin. (a) You cannot
                    // resolve to go FIND someone already standing with you; that intent
                    // belongs in this beat's words, not a 掛心 (and it would re-resolve
                    // as 尋著 instantly). (b) Re-declaring the SAME target you are ALREADY
                    // seeking must not re-stamp sinceTick — that resets the 3-day expiry
                    // so the intention could never lapse — nor spam a second 拍流 line.
                    const coPresent = !!seekTargetId && w.roster[seekTargetId] === w.roster[member.id];
                    const alreadySeeking = !!seekTargetId && w.seeking?.[member.id]?.targetId === seekTargetId;
                    if (seekTargetId && seekTargetId !== member.id && !coPresent && !alreadySeeking) {
                        (w.seeking ??= {})[member.id] = { targetId: seekTargetId, sinceTick: nowTick };
                        log(`  [尋人] ${member.name} 打定主意去尋${world.nameById(seekTargetId)}`);
                    } else if (coPresent) {
                        log(`  action noop: seek_person (${member.name} 與${world.nameById(seekTargetId!)}已同處，這心意該當面說)`);
                    } else if (alreadySeeking) {
                        log(`  action noop: seek_person (${member.name} 續尋${world.nameById(seekTargetId!)}，念頭照舊)`);
                    } else {
                        log(`  action noop: seek_person (${member.name})`);
                    }
                    break;
                }
                // perform / personal: still no production effect this tick — but the
                // diagnostics stop hiding them (one log line each, nothing more).
                case 'perform':
                    log(`  action noop: perform (${member.name})`);
                    break;
                case 'personal':
                    log(`  action noop: personal (${member.name})`);
                    break;
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
        const inferredBonds: Array<{
            from: string;
            to: string;
            kind: 'established' | 'yearning' | 'known';
        }> = [];
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
                inferredBonds.push({ from, to, kind: 'established' });
            } else if (YEARNING.test(text)) {
                seedBond(seedG, from, to, BOND.seed.yearning); // NOT established
                inferredBonds.push({ from, to, kind: 'yearning' });
            } else if (KNOWN.test(text)) {
                seedBond(seedG, from, to, BOND.seed.known);
                inferredBonds.push({ from, to, kind: 'known' });
            }
            // else stranger — no seed.
        };
        for (const [from, row] of Object.entries(w.edges)) {
            for (const [to, edge] of Object.entries(row)) classify(from, to, edge.tone);
        }
        for (const member of w.cast) {
            for (const [to, view] of Object.entries(member.relationshipView)) classify(member.id, to, view);
        }
        if (strictStructured) {
            world.recordStructuredWarning({
                domain: 'preset',
                kind: 'missing-declared-bonds',
                detail: 'STRICT does not derive bonds or established pairs from tone/view prose',
            });
            for (const inferred of inferredBonds) {
                world.recordStructuredComparison({
                    domain: 'scene',
                    kind: `bond-underlay-${inferred.kind}`,
                    legacy: true,
                    structured: false,
                    actorId: inferred.from,
                    targetId: inferred.to,
                    subjectId: world.pairKey(inferred.from, inferred.to),
                });
            }
            world.setBonds(new Map());
            w.establishedPairs ??= [];
        } else {
            world.setBonds(seedG);                    // at least [] — never re-seeds
            w.establishedPairs ??= [...seededPairs];   // at least []
        }
    }

    // 2.96) 訪問權限 (space access grants) — lazily seed STANDING keys for every
    // PRIVATE owned space from EXISTING canon, ONCE per world (guard on
    // `accessSeeded`; NOT on `accessGrants === undefined`, because the housing seed
    // may pre-populate `accessGrants` with tenant keys at frame-apply time — the
    // undefined guard would then wrongly skip this social seed). `accessGrants` is
    // still initialised to at least {} here so the accessors always find a table.
    // LOSSLESS migration of the old warmth gate: anyone the owner would have
    // admitted (welcome ≥ 0.7) gets a standing key, so existing runs behave the
    // same; PLUS old lovers (isEstablished) hold each other's keys (老情人持彼此
    // 鑰匙). Runs AFTER §2.95 so established pairs are already seeded. A tentative
    // suitor (a live 愛/情 want toward an owner, not warm/established) is 領入 with a
    // ONE-TIME pass — exercising the 一次性 seam; a full LLM-chosen "invite" is a
    // future seat, the method (grantAccess … 'oneTime') is the seam. It reads the
    // now deed-aware `ownersOf` and the idempotent `grantAccess`, so it stays
    // ADDITIVE over any housing-seeded tenant keys. An empty/edgeless world derives
    // to owner-only (no grants), so a public world is untouched and there is no
    // regression.
    if (!w.accessSeeded) {
        w.accessGrants ??= {};
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
                    (wnt) => {
                        if (
                            wnt.retired ||
                            wnt.characterId !== guest.id ||
                            !wnt.target
                        ) {
                            return false;
                        }
                        const ownerTarget = owners.find(
                            (ownerId) =>
                                wnt.target === ownerId ||
                                wnt.target === world.nameById(ownerId),
                        );
                        if (!ownerTarget) return false;
                        return structuredWantGate(
                            wnt,
                            LOVE_WANT.test(wnt.layer),
                            hasWantSemantic(wnt, 'affection'),
                            'initial-one-time-key',
                            ownerTarget,
                            'authorization',
                        );
                    },
                );
                if (suitor) world.grantAccess(scene.id, guest.id, 'oneTime');
            }
        }
        if (Object.keys(w.accessGrants).length) {
            log(`  訪問權限: 為 ${Object.keys(w.accessGrants).length} 處私處立鑰`);
        }
        w.accessSeeded = true; // never re-seed (separates 'never seeded' from housing pre-population)
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
        bondOf(bonds, a, b) >= BOND.seed.known &&
        !hasHostileWantToward(
            wants,
            a,
            b,
            world.nameById(b),
            strictStructured,
        );

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
            if (!deliberateEncounter && !nightSceneKind(
                cs,
                info?.privacyLevel ?? 0,
                wants,
                isTrustedConfidant,
                strictStructured,
            )) {
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

    // 3.7) 資助搭救 (financial aid / rescue) — daytime, economy-only, autonomic-but-
    // JUDGED, mirroring §3.5 順路而食 / §3.6 祈願. A character holding CLEAR SURPLUS
    // coin who stands co-present with someone in REAL hardship (broke / no runway /
    // acutely starving) decides whether to give some of their OWN money to help —
    // and how much, to whom. The give/no-give JUDGMENT is the capability's
    // (agent.decideAid, shaped by personality + each bond); the runner path's
    // finalizeAid enforces the HARD safety inside it (recipient a real LISTED peer,
    // running total ≤ funds, NO overdraft — the same rule as the on-chain transfer).
    // The fake OMITS decideAid, so a DETERMINISTIC fallback voices it: a small,
    // surplus-clamped gift to the neediest WARMLY-BONDED co-present peer — so the
    // mechanism runs and is testable with no LLM, and ordinary runs don't leak
    // charity everywhere. The money moves ONLY through the conserving pay path
    // (giver debited, recipient credited, SAME ledger, no mint) → auditSeasonEconomy
    // stays []. Generosity deepens ties (bumpBond 'gift', both ways) and spares the
    // pair tonight's cooling. Bounded to ONE aid decision per giver per day. NOT at
    // night — rest. Fully inert when the world carries no economy.
    if (!night && economy && w.economy) {
        const data = w.economy;
        const per = BigInt(data.subunitsPerUnit);
        const AID_FLOOR_DAYS = 3n;         // a giver keeps ≥ this many days of own keep back
        const AID_STARVING = 0.8;          // acutely starving reads as hardship even when solvent
        const AID_FALLBACK_GIFT_YUAN = 3n; // the fallback's small fixed sum (圓), always clamped ≤ surplus
        const aidedToday = (w.aidGivenTodayByChar ??= {});
        const acctOf = (id: string) => data.state.accounts[id];
        // whole-day runway from subunits (∞ → 999 when there is no daily burn).
        const runwayDaysOf = (avail: bigint, cost: bigint): number => (cost > 0n ? Number(avail / cost) : 999);
        const vitalityOf = (avail: bigint, cost: bigint, hunger: number): AidVitality => {
            const runway = runwayDaysOf(avail, cost);
            if (hunger > AID_STARVING || runway <= 0) return 'failing';
            if (hunger > 0.5 || runway <= 2) return 'strained';
            return 'healthy';
        };
        // hardship — in a conserving world `available` is never < 0, so this reads as
        // runway ~0 (can't cover even a full day) or acute starving.
        const isHardship = (id: string): boolean => {
            const a = acctOf(id);
            if (!a) return false;
            const avail = BigInt(a.available);
            const cost = BigInt(a.dailyFixedCost);
            const hunger = world.castById(id)?.state.hunger ?? 0;
            return avail < 0n || (cost > 0n ? avail < cost : avail <= 0n) || hunger > AID_STARVING;
        };
        // how the giver SEES this person — text (never a number), drives the LLM's
        // weighing. Derived from the established set / relationship-view / edge tone /
        // bond; a coarse, safe default (neutral) when nothing is known.
        const relationFor = (giverId: string, peerId: string): AidPeer['relation'] => {
            if (world.isEstablished(giverId, peerId)) return 'lover';
            const view = world.relationshipView(giverId, peerId) ?? w.edges[giverId]?.[peerId]?.tone ?? '';
            if (/仇|怨|恨|敵|過節/.test(view)) return 'rival';
            if (/恩師|師父|師傅|師姐|師兄/.test(view)) return 'mentor';
            if (/徒|門生|後輩|徒兒/.test(view)) return 'protege';
            if (/親|家人|骨肉|兄|弟|姊|妹|爹|娘|父|母/.test(view)) return 'family';
            const bond = bondOf(bonds, giverId, peerId);
            if (bond >= BOND.seed.yearning) return 'ambiguous';
            if (bond >= BOND.seed.known) return 'friend';
            return 'neutral';
        };
        const distressOf = (avail: bigint, cost: bigint, hunger: number): { situation: AidSituation; distress: string } => {
            if (hunger > AID_STARVING) return { situation: 'dire-need', distress: '餓得發昏，撐不住了' };
            if (avail <= 0n || runwayDaysOf(avail, cost) <= 0) return { situation: 'dire-need', distress: '身上錢已見底，連今日都難挨' };
            return { situation: 'tight', distress: '手頭拮据，日子緊巴巴' };
        };

        for (const [sid, ids] of byScene) {
            if (ids.length < 2) continue; // aid needs someone to aid, right here
            for (const giverId of ids) {
                if (aidedToday[giverId] === today) continue; // one aid decision per giver per day
                const giverAcct = acctOf(giverId);
                const giver = world.castById(giverId);
                if (!giverAcct || !giver) continue;
                const available = BigInt(giverAcct.available);
                const dailyCost = BigInt(giverAcct.dailyFixedCost);
                // surplus — comfortably positive above a small floor (keep some days of
                // own keep; a zero-burn giver still keeps ≥ 1 圓), so aid never beggars.
                const floorSub = dailyCost > 0n ? dailyCost * AID_FLOOR_DAYS : per;
                const surplusSub = available - floorSub;
                if (surplusSub < per) continue; // no clear (≥ 1 圓) surplus → this giver gives nothing
                // co-present others in real hardship — the only candidates for aid.
                const hardshipIds = ids.filter((id) => id !== giverId && isHardship(id));
                if (hardshipIds.length === 0) continue;

                const peers: AidPeer[] = hardshipIds.map((id) => {
                    const member = world.castById(id)!;
                    const a = acctOf(id)!;
                    const pAvail = BigInt(a.available);
                    const pCost = BigInt(a.dailyFixedCost);
                    const { situation, distress } = distressOf(pAvail, pCost, member.state.hunger);
                    return {
                        id,
                        name: member.name,
                        role: member.role ?? '—',
                        relation: relationFor(giverId, id),
                        personality: member.persona,
                        situation,
                        distress,
                        runwayDays: runwayDaysOf(pAvail, pCost),
                    };
                });

                // Real state fed to the capability — funds/daily/runway are exactly what
                // aid-prompt.ts already consumes (the giver's own purse), no more.
                const input: AidActionInput = {
                    name: giver.name,
                    role: giver.role ?? '—',
                    persona: giver.persona,
                    traits: [],
                    funds: Number(available / per),
                    dailyCost: Number(dailyCost / per),
                    runwayDays: runwayDaysOf(available, dailyCost),
                    vitalityState: vitalityOf(available, dailyCost, giver.state.hunger),
                    peers,
                };

                // The give/no-give judgment: the capability's when present (finalizeAid
                // guards overdraft inside it), else the deterministic fallback — a small
                // clamped gift to the neediest WARMLY-BONDED co-present peer.
                let result: AidActionResult;
                if (agent.decideAid) {
                    try {
                        result = await agent.decideAid(input);
                    } catch {
                        result = { gifts: [] }; // fail-safe: no aid this turn
                    }
                } else {
                    const neediest = [...peers].sort((a, b) => {
                        const aa = BigInt(acctOf(a.id)!.available);
                        const ba = BigInt(acctOf(b.id)!.available);
                        if (aa !== ba) return aa < ba ? -1 : 1; // poorest first
                        return (world.castById(b.id)?.state.hunger ?? 0) - (world.castById(a.id)?.state.hunger ?? 0);
                    })[0];
                    const warm = bondOf(bonds, giverId, neediest.id) >= BOND.seed.known;
                    const surplusYuan = surplusSub / per; // ≥ 1n (guarded above)
                    const giftYuan = surplusYuan < AID_FALLBACK_GIFT_YUAN ? surplusYuan : AID_FALLBACK_GIFT_YUAN;
                    result =
                        warm && giftYuan > 0n
                            ? {
                                  gifts: [{
                                      recipientId: neediest.id,
                                      recipientName: neediest.name,
                                      amount: Number(giftYuan),
                                      memo: 'gift',
                                      line: '這個你先拿著，別跟我客氣。',
                                      reason: 'deterministic: warm bond + clear surplus + neediest co-present peer',
                                  }],
                                  reason: 'fallback aid',
                              }
                            : { gifts: [] };
                }

                aidedToday[giverId] = today; // bound: one aid decision per giver per day, give or not

                for (const gift of result.gifts) {
                    if (gift.recipientId === giverId || !ids.includes(gift.recipientId)) continue; // a real co-present OTHER
                    if (!(gift.amount > 0)) continue;
                    const recipientName = world.nameById(gift.recipientId);
                    try {
                        const outcome = economy.commitCommand(world, {
                            actorId: giverId,
                            sceneId: sid,
                            witnessIds: ids,
                            command: { action: 'pay', toName: recipientName, amountYuan: gift.amount, memo: gift.line ?? '接濟' },
                            causeEventId: `${w.sagaId}:aid:d${today}:t${nowTick}:${giverId}:${gift.recipientId}`,
                            seq: 0,
                            day: today,
                        });
                        if (!outcome.ok) continue; // insufficient / bad target — swallowed, never fatal (like the hunger buy)
                        // generosity deepens ties both ways; a met pair is spared tonight's cooling.
                        bumpBond(bonds, giverId, gift.recipientId, 'gift');
                        togetherToday.add(world.pairKey(giverId, gift.recipientId));
                        // 相識分寸: aiding someone by name exchanges names — raise to 'named'.
                        if (w.subjectiveNaming) {
                            world.setAcquaint(giverId, gift.recipientId, 'named');
                            world.setAcquaint(gift.recipientId, giverId, 'named');
                        }
                        const aided = `${giver.name} 接濟 ${recipientName} ${formatMoney(data, BigInt(gift.amount) * per)}${gift.line ? `（${gift.line}）` : ''}`;
                        w.dayAccum.lines.push(`[濟] ${aided}`);
                        log(`  [濟] ${aided}`);
                    } catch (error) {
                        log(`  [濟] ${giver.name} 接濟未成：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
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
        // 惰息存在 (quietPresence): a LONE character with nothing pressing (no want past
        // idle) and nobody seeking them is QUIETED this tick — skip the solo musing beat
        // entirely (no LLM), instead of spending a call on ambient filler. Reactive
        // solitude survives: a pressing want or a seeker keeps them on. Their breath is
        // not lost — it is folded into ONE day-end reflection below. Flag off ⇒ the solo
        // beat plays as before (byte-identical).
        if (w.quietPresence && ids.length === 1) {
            const only = ids[0];
            const pressing = world.liveWantsOf(only).some((wnt) => forcingLevel(wnt) !== 'idle');
            const sought = Object.values(w.seeking ?? {}).some((s) => s.targetId === only);
            if (!pressing && !sought) {
                (w.dayAccum.quietedIds ??= []).push(only);
                log(`  [惰息] ${world.nameById(only)} 這拍無事、無人尋，惰息（不叫戲）`);
                continue;
            }
        }
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
                      return nightSceneKind(
                          cs,
                          info?.privacyLevel ?? 0,
                          wants,
                          isTrustedConfidant,
                          strictStructured,
                      ) === 'confide'
                          ? confiderOf(
                                cs,
                                wants,
                                isTrustedConfidant,
                                strictStructured,
                            ) ?? undefined
                          : undefined;
                  })()
                : undefined;

        // SKILL hang point #2 — on the boards, a performer's stage craft (唱/身)
        // colours their beats on top of their daily bearing (conduct); off-stage
        // only conduct. So a 悲工/文戲 lead's on-stage OUTPUT reads different from
        // how they carry themselves at the tea-table — the framework's "different
        // style of output" made concrete, with one gather call + a wider kind set.
        const legacyStage = isStageScene(sceneName);
        const structuredStage =
            info?.capabilities?.includes('stage') === true;
        if (strictStructured && info) {
            world.recordStructuredComparison({
                domain: 'scene',
                kind: 'stage-capability',
                legacy: legacyStage,
                structured: structuredStage,
                subjectId: info.id,
                detail: info.name,
            });
            if (info.capabilities === undefined && legacyStage) {
                world.recordStructuredWarning({
                    domain: 'preset',
                    kind: 'missing-stage-capability',
                    subjectId: info.id,
                    detail: info.name,
                });
            }
        }
        const onStage = strictStructured
            ? structuredStage
            : legacyStage;
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
                // 相識分寸: how THIS actor perceives each co-present other's NAME
                // (keyed by their id, same POV shape as `ties`). Only built when the
                // flag is on; undefined ⇒ the runner displays the canonical name
                // (byte-identical). The canonical `name` below stays intact for
                // addressed matching — the runner shows knownAs ?? name.
                const knownAs = w.subjectiveNaming
                    ? Object.fromEntries(ids.filter((o) => o !== id).map((o) => [o, world.perceivedName(id, o)]))
                    : undefined;
                return {
                    characterId: id,
                    name: member.name,
                    knownAs,
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
                    // 借賒有據: which credit verbs to 亮牌 for this actor in THIS
                    // scene (borrow needs a co-present cast member; repay an open
                    // 欠條 to one). undefined when the flag is off — byte-identical.
                    credit: creditAdvertFor(world, id, ids),
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
            strictStructured,
            agent,
            onStructuredComparison: strictStructured
                ? (comparison) =>
                      world.recordStructuredComparison({
                          domain: 'scene',
                          ...comparison,
                      })
                : undefined,
            // 文筆二階 v2: the cross-scene per-character beat buffer (by reference) —
            // scene-loop reads it for each actor's imagery-avoid window and appends
            // each committed beat, so a character's verbal tic is caught across scenes.
            recentBeatsByChar: (w.recentBeatsByChar ??= {}),
            // 執念自揀: when on, each beat is handed its actor's full live-want menu and
            // may self-tag which it pushed; the ledger follows the choice. Off ⇒ the
            // single-want handoff (byte-identical, incl. the FakeSceneAgent path).
            beatPicksWant: w.beatPicksWant === true,
            beforeBeat: (actor) => {
                actor.sceneHint = world.physicalHint(actor.characterId, sid);
                actor.objects = world.accessibleObjects(actor.characterId, sid).map((object) => ({
                    id: object.id,
                    label: object.label,
                    state: object.state,
                    container: object.container ? world.objectById(object.container)?.label ?? object.container : undefined,
                }));
                actor.economyLine = economy?.projectFor(world, actor.characterId, sid);
                actor.credit = creditAdvertFor(world, actor.characterId, ids);
            },
            onBeat: async (beat) => {
                // 相識分寸: resolve the addressed display back to an id — perceived-name
                // aware (knownAs), so addressing 「趙師傅」still finds 趙阿福. Flag-off ⇒
                // exactly `idByName` (byte-identical).
                const addressedId = beat.addressed
                    ? world.resolveAddressed(beat.characterId, beat.addressed, ids)
                    : undefined;
                // Directly addressing a co-present other exchanges names — raise the
                // pair to 'named' BOTH ways (monotonic; flag-gated).
                if (w.subjectiveNaming && addressedId && addressedId !== beat.characterId && ids.includes(addressedId)) {
                    world.setAcquaint(beat.characterId, addressedId, 'named');
                    world.setAcquaint(addressedId, beat.characterId, 'named');
                }
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
                    // 相識分寸: handing something to someone exchanges names — raise the
                    // pair to 'named' both ways (monotonic; flag-gated).
                    if (w.subjectiveNaming) {
                        world.setAcquaint(beat.characterId, receiverId, 'named');
                        world.setAcquaint(receiverId, beat.characterId, 'named');
                    }
                    log(`  [贈] ${beat.name} 以物贈 ${world.nameById(receiverId)}，情意近了些`);
                    // 實體鑰匙 (Stage 2) — 使用權只隨門鑰的當面交手而動。commitBeatPhysics
                    // 已把物件的 carriedBy 移到收受者，此處只補使用權：這只物件是不是一把
                    // 門鑰（keyFor）。因為整段在 `ids.includes(receiverId)` 之內，物理相遇
                    // 已是結構性前提——沒當面遇著，鑰匙遞不出去，使用權也就動不了。
                    const obj = world.objectById(eff.objectId);
                    if (obj?.keyFor) {
                        const lock = obj.keyFor;                       // the sceneId this key opens
                        const owners = world.ownersOf(lock);
                        if (owners.includes(receiverId)) {
                            // 收回: the key was surrendered to an OWNER — the giver, if a
                            // non-owner holder, loses their use-right (物理相遇拿回). The
                            // owner enters by deed regardless; a giver who was already an
                            // owner surrenders nothing.
                            if (!owners.includes(beat.characterId) && world.canEnter(beat.characterId, lock)) {
                                world.revokeAccess(lock, beat.characterId);
                                log(`  [門] ${beat.name} 把${world.sceneNameById(lock)}的鑰匙交還${world.nameById(receiverId)}，自此進不去了`);
                            }
                        } else {
                            // 授鑰: handed to a non-owner — they gain a STANDING use-right
                            // (grantAccess no-ops for an owner/public scene, so this is
                            // safe). 借鑰/lending (非屋主→非屋主) thus grants the receiver
                            // and does NOT revoke the giver: 撤銷 is its own deliberate act
                            // (交還屋主，或 §7.78 換鎖). Handing a key is trust made physical;
                            // the gift-bond bump above already warmed it (門鑰亦是贈物).
                            world.grantAccess(lock, receiverId, 'standing');
                            log(`  [門] ${beat.name} 把${world.sceneNameById(lock)}的鑰匙交到${world.nameById(receiverId)}手裡，往後自行進出`);
                        }
                    }
                }
                const causeEventId = `${eventId}:b${beatIndex}`;
                beatIndex += 1;
                if (beat.economyCommands?.length && !economy) {
                    throw new Error(`[economy] ${beat.name} proposed money commands but this world has no economy`);
                }
                for (const [seq, command] of (beat.economyCommands ?? []).entries()) {
                    // 借錢是兩造的事 (creditVerbs): a borrow reaches the ledger
                    // only through the LENDER's consent seat — decideLend answers
                    // lend/refuse HERE, before the pure commit; an absent seat /
                    // null / throw REFUSES deterministically (the fake agent
                    // inherits this by omitting the seat). A refusal is a REAL
                    // social event (ok:true + a 婉拒 line), never a replan.
                    let lendVerdict: { lend: boolean; line?: string } | null | undefined;
                    if (command.action === 'borrow') {
                        lendVerdict = null;
                        const seatInput = agent.decideLend
                            ? buildLendSeatInput(world, { actorId: beat.characterId, sceneId: sid, command })
                            : null;
                        if (seatInput) {
                            try {
                                lendVerdict = (await agent.decideLend!(seatInput)) ?? null;
                            } catch {
                                lendVerdict = null;
                            }
                        }
                    }
                    const outcome = economy!.commitCommand(world, {
                        actorId: beat.characterId,
                        sceneId: sid,
                        witnessIds: ids,
                        command,
                        causeEventId,
                        seq,
                        day: today,
                        ...(lendVerdict !== undefined ? { lendVerdict } : {}),
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
                // 相識分寸: sharing a played scene means you now recognise this person
                // by face/trade — raise stranger→acquainted BOTH ways (monotonic, so a
                // named pair is untouched). One shared scene is enough. Flag-gated.
                if (w.subjectiveNaming) {
                    world.setAcquaint(ids[i], ids[j], 'acquainted');
                    world.setAcquaint(ids[j], ids[i], 'acquainted');
                }
            }
        }
        // 相許 (event) — an in-scene advance→accept made them lovers HERE: warm the
        // bond hard (床) and record the milestone into the established set.
        if (loop.intimacyAccepted && ids.length === 2) {
            bumpBond(bonds, ids[0], ids[1], 'bed');
            world.addEstablished(ids[0], ids[1]);
            grantMutualHomeKeys(ids[0], ids[1]); // 相許 → 授權: mutual standing keys
            if (w.subjectiveNaming) { world.setAcquaint(ids[0], ids[1], 'named'); world.setAcquaint(ids[1], ids[0], 'named'); }
            log(`  [相許] ${world.nameById(ids[0])} 與 ${world.nameById(ids[1])} 這一場成了彼此`);
        }
        // 相許 (verdict) — a settled night pair not yet established but still carrying
        // a live love-want toward each other: ask the milestone judge whether they
        // are, as of now, 相許 (READS the relationship, never steers it). Runs AFTER
        // the accept path above so an already-established pair is never re-judged.
        if (night && isPrivate && ids.length === 2 && !world.isEstablished(ids[0], ids[1])) {
            const [a, b] = ids;
            const loveWantBetween = wants.some((wnt) => {
                if (wnt.retired || !wnt.target) return false;
                if (wnt.characterId !== a && wnt.characterId !== b) return false;
                const other = wnt.characterId === a ? b : a;
                if (!structuredWantGate(
                    wnt,
                    /愛|情/.test(wnt.layer),
                    hasWantSemantic(wnt, 'affection'),
                    'established-eligibility',
                    other,
                    'authorization',
                )) {
                    return false;
                }
                return wnt.target === other || wnt.target === world.nameById(other);
            });
            if (loveWantBetween) {
                const established = await agent.judgeEstablished({
                    aName: world.nameById(a),
                    bName: world.nameById(b),
                    aView: world.relationshipView(a, b),
                    bView: world.relationshipView(b, a),
                    wants: wants
                        .filter((wnt) => {
                            if (
                                wnt.retired ||
                                (wnt.characterId !== a && wnt.characterId !== b)
                            ) {
                                return false;
                            }
                            const other = wnt.characterId === a ? b : a;
                            return structuredWantGate(
                                wnt,
                                /愛|情/.test(wnt.layer),
                                hasWantSemantic(wnt, 'affection'),
                                'established-brief',
                                other,
                                'authorization',
                            );
                        })
                        .map((wnt) => wnt.desc),
                    lastSceneTail: loop.beats.slice(-4).map((bt) => `${bt.name}：${bt.text}`).join('\n') || undefined,
                });
                if (established) {
                    world.addEstablished(a, b);
                    grantMutualHomeKeys(a, b); // 相許 → 授權: mutual standing keys
                    if (w.subjectiveNaming) { world.setAcquaint(a, b, 'named'); world.setAcquaint(b, a, 'named'); }
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
                // 相識分寸: participants carry knownAs from the SPEAKER's POV so a beat
                // that addresses someone by their perceived name still resolves the
                // right witness. Flag-off ⇒ knownAs undefined ⇒ matching unchanged.
                perceiverIds: deriveBeatPerceiverIds(
                    b,
                    ids.map((id) => ({
                        id,
                        name: world.nameById(id),
                        knownAs: w.subjectiveNaming ? world.perceivedName(b.characterId, id) : undefined,
                    })),
                ),
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
                    ties: Object.entries(world.selfTies(id, ids)).map(([oid, t]) => `對${world.perceivedName(id, oid)}：${t}`).join('\n') || undefined,
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
                const declared = w.strictStructured
                    ? await declareStructuredWant(world, agent, {
                          source: 'aftermath',
                          characterId: owner.id,
                          layer: after.layer,
                          desc: after.desc,
                          target: after.target,
                      })
                    : { target: after.target };
                wants.push(
                    newWant({
                        id: world.nextWantId(),
                        characterId: owner.id,
                        layer: after.layer,
                        desc: after.desc,
                        target: declared.target,
                        ...(w.strictStructured && declared.semanticTags?.length
                            ? { semanticTags: declared.semanticTags }
                            : {}),
                        ...(w.strictStructured && declared.subjectRef
                            ? { subjectRef: declared.subjectRef }
                            : {}),
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
            const declaredDeltas = w.strictStructured
                ? await Promise.all(
                      deltas.map(async (delta) => {
                          if (!delta.newThread?.trim()) return delta;
                          const declared = await declareStructuredWant(world, agent, {
                              source: 'ripple',
                              characterId: delta.characterId,
                              layer: delta.layer,
                              desc: delta.newThread,
                              target: delta.target,
                          });
                          return {
                              ...delta,
                              target: declared.target,
                              semanticTags: declared.semanticTags,
                              subjectRef: declared.subjectRef,
                          };
                      }),
                  )
                : deltas;
            for (const sp of applyRipples(
                wants,
                declaredDeltas,
                nowTick,
                () => world.nextWantId(),
                w.strictStructured === true,
            )) {
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
                    const structuredAboutIt =
                        want.subjectRef?.kind === 'contract' &&
                        want.subjectRef.id === foreclosure.contractId;
                    if (w.strictStructured) {
                        world.recordStructuredComparison({
                            domain: 'want',
                            kind: 'contract-foreclosure',
                            actorId: want.characterId,
                            subjectId: foreclosure.contractId,
                            legacy: aboutIt,
                            structured: structuredAboutIt,
                            detail: want.desc,
                        });
                        if (aboutIt && !want.subjectRef) {
                            world.recordStructuredWarning({
                                domain: 'want',
                                kind: 'missing-want-subject-ref',
                                subjectId: want.id,
                                detail: foreclosure.contractId,
                            });
                        }
                    }
                    if (w.strictStructured ? !structuredAboutIt : !aboutIt) continue;
                    want.retired = true;
                    want.resolutionCause = 'foreclosed';
                    log(`  [限期作廢] ${world.nameById(want.characterId)}「${want.desc}」隨約作廢`);
                    acc.lines.push(`[帳房] ${world.nameById(want.characterId)}擱在心上的「${want.desc}」，隨這約限期一過，也就了了。`);
                }
            }
            // 欠條生怨 (creditVerbs) — after the chase, every OVERDUE 欠條 between
            // two cast members stirs BOTH hearts exactly once (dedup by bill
            // marker; a spawn the ≤4-live budget rejects retries at the next
            // settle). Vendor bills spawn debtor-side only when the business maps
            // cleanly to a single cast owner; 前街食肆 declares none, so its 賒帳
            // stays on the books without a want. Flag off ⇒ zero new behavior.
            { // 欠條生怨（借賒有據已常駐）—— 逾期欠條到期生 虧欠/催討 want
                const debtEvents: LedgerEvent[] = [];
                const castNames = w.cast.map((member) => member.name);
                for (const seed of collectOverdueDebtWants(world, today)) {
                    if (spawnWant(
                        wants,
                        seed.characterId,
                        {
                            desc: seed.desc,
                            layer: seed.layer,
                            ...(w.strictStructured
                                ? {
                                      target: seed.targetId,
                                      semanticTags: ['reckoning' as const],
                                  }
                                : {}),
                        },
                        nowTick,
                        debtEvents,
                        castNames,
                        () => world.nextWantId(),
                        w.strictStructured === true,
                    )) {
                        (w.economy!.debtWantsSpawned ??= []).push(seed.marker);
                        log(`  [欠條生怨] ${world.nameById(seed.characterId)}「${seed.desc}」`);
                    }
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
        // 營生・口碑 framing per character: performers get the 排戲/登台 rhythm + the
        // 名頭一場場攢 stake; a non-troupe hand a lighter 「自有活路、名聲亦要攢」 line.
        // Omitted when the world carries no livelihood (economy) — nothing to frame.
        const planTroupeIds = w.economy ? troupePlayerIds(world) : new Set<string>();
        const livelihoodFramingFor = (memberId: string): string | undefined => {
            if (!w.economy) return undefined;
            const standing = renownLabel(world.renownOf(memberId));
            if (planTroupeIds.has(memberId)) {
                // 規劃避讓: when a show stands, name its committed 時段 (黃昏、入夜) as a
                // fixed booking so the plan reserves them and schedules the rest around it.
                const duty = performanceDutyLine(world, memberId);
                return `你是戲班的角兒，白天排戲、入夜登台是你的活路；開鑼時人在台上，戲才唱得成，一場票房是全班的生計，你也有分潤。名頭（眼下${standing}）靠一場場戲攢，攢得起也跌得下。這條營生怎麼經營、幾時上心，由你自己拿捏。${duty ? `\n${duty}` : ''}`;
            }
            return `你在這條街上自有活路，靠手上的本事營生（不繫在班庫那一場戲上）；名頭（眼下${standing}）也是一件件事攢起來的，攢得起也跌得下。怎麼營生、往哪處使力，由你自己拿主意。`;
        };
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
                    livelihoodFraming: livelihoodFramingFor(member.id),
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
            const declaredSpawn =
                spawn && w.strictStructured
                    ? {
                          ...spawn,
                          ...(await declareStructuredWant(world, agent, {
                              source: 'owner',
                              characterId: member.id,
                              layer: spawn.layer,
                              desc: spawn.desc,
                              target: spawn.target,
                          })),
                      }
                    : spawn;
            if (declaredSpawn && spawnWant(
                wants,
                member.id,
                declaredSpawn,
                nowTick,
                regenEvents,
                castNames,
                () => world.nextWantId(),
                w.strictStructured === true,
            )) {
                log(`  願生: ${member.name}「${declaredSpawn.desc}」`);
            }
        }
    }

    // 7.78) 撤銷 on souring (換鎖) + 逐客 (eviction) — at day-end an OWNER whose heart
    // has turned hostile toward a current STANDING key-holder takes the key back: a
    // live 妒/怨/恨/仇 want aimed at a holder revokes that holder's key. Generalized
    // over ownedScenesBy (deed-aware), so a LANDLORD may 換鎖 on a soured 租客 of a
    // rental they own but do NOT live in — not only their own home. A real 撤銷 driven
    // by the relationship turning (not a static table). Core mechanism — unconditional
    // world physics, NOT behind relationshipFallback.
    if (dayEnd) {
        const HOSTILE = /妒|怨|恨|仇/;
        for (const owner of w.cast) {
            for (const sceneId of world.ownedScenesBy(owner.id)) {
                for (const holder of world.keyHoldersOf(sceneId)) {
                    if (holder.kind !== 'standing') continue; // a one-time pass is consumed on entry, not revoked
                    const soured = wants.some((wnt) => {
                        if (
                            wnt.retired ||
                            wnt.characterId !== owner.id ||
                            !wnt.target ||
                            (wnt.target !== holder.charId &&
                                wnt.target !== world.nameById(holder.charId))
                        ) {
                            return false;
                        }
                        return structuredWantGate(
                            wnt,
                            HOSTILE.test(wnt.layer),
                            hasWantSemantic(wnt, 'hostility') ||
                                hasWantSemantic(wnt, 'jealousy'),
                            'revoke-standing-key',
                            holder.charId,
                            'authorization',
                        );
                    });
                    if (!soured) continue;
                    world.revokeAccess(sceneId, holder.charId);
                    // 逐客: a rekey on a LEASED scene where THIS holder is the 租客 ends the
                    // lease — the deed-holder evicted their tenant. Drop the lease registry
                    // entry and any future rent bill (already-paid rent stays paid: removing
                    // an unpaid FUTURE obligation moves no money, so conservation is
                    // untouched). A non-lease rekey (an old lover's key) is unchanged.
                    const lease = w.leases?.[sceneId];
                    if (lease && lease.tenantId === holder.charId) {
                        if (lease.rentBillId && w.economy?.bills) {
                            w.economy.bills = w.economy.bills.filter((bill) => bill.id !== lease.rentBillId);
                        }
                        delete w.leases![sceneId];
                        // NOTE (deliberate for this stage): the evicted 租客 is NOT auto-
                        // rehoused — their homeByChar still points at the now-barred scene;
                        // the movement gate already handles a barred home gracefully (they
                        // simply can no longer let themselves in). Rehousing is a later arc.
                        log(`  [門] ${owner.name} 把${world.sceneNameById(sceneId)}的鎖換了，逐了租客${world.nameById(holder.charId)}，租約就此斷了`);
                    } else {
                        log(`  [門] ${owner.name} 換了鎖，${world.nameById(holder.charId)} 進不去了`);
                    }
                }
            }
        }
    }

    // 7.79) 尋人掛心到期 (seekRouting flag) — at day-end an intention older than
    // 3 full days lapses: the seeker never crossed paths with the one they meant
    // to find. The entry clears and the seeker keeps the letting-go as a party-
    // PRIVATE scheduled percept (the same channel the 叩門 refusal rides —
    // recall.remember + observeScene next tick), never public canon. Flag off /
    // no entries ⇒ fully inert; fresher entries keep waiting (跨拍守候).
    if (dayEnd && w.seeking) {
        for (const [seekerId, seekEntry] of Object.entries(w.seeking)) {
            if (nowTick - seekEntry.sinceTick < perDay * 3) continue;
            delete w.seeking[seekerId];
            const seeker = world.castById(seekerId);
            if (!seeker) continue;
            const seekName = world.castById(seekEntry.targetId)
                ? world.perceivedName(seekerId, seekEntry.targetId)
                : seekEntry.targetId;
            log(`  [尋人] ${seeker.name} 這幾日終究沒尋著${seekName}，念頭且擱下了`);
            (w.scheduledEvents ??= []).push({
                id: `seek-expired-${seekerId}-t${nowTick}`,
                atTick: nowTick + 1,
                sceneId: w.roster[seekerId],
                text: `這幾日總想去尋${seekName}，終究沒碰上——這念頭且先擱下。`,
                visibility: 'private',
                witnessIds: [seekerId],
            });
        }
    }

    // 7.79) 惰息呼吸 (quietPresence) — each character QUIETED today (idle solo turns
    // folded away) gets ONE consolidated first-person reflection here, in place of the
    // scattered per-tick self-talk the pre-filter skipped. Wires the otherwise-dormant
    // povReflect; the line rides the POV channel (acc.povByName) into the day's episode.
    // Breathing room preserved — once a day, with weight — while the LLM calls were saved.
    if (dayEnd && w.quietPresence && agent.povReflect && w.dayAccum.quietedIds?.length) {
        for (const id of new Set(w.dayAccum.quietedIds)) {
            const member = world.castById(id);
            if (!member) continue;
            const todayText = acc.interactions?.[id]
                ? Object.values(acc.interactions[id]).flat().join('\n').slice(-1200)
                : '';
            try {
                const line = await agent.povReflect({
                    name: member.name,
                    persona: member.persona,
                    day: today,
                    todayText,
                    wants: world.liveWantsOf(id).map((x) => ({ layer: x.layer, desc: x.desc, target: x.target })),
                    selfModel: member.coreIdentity?.length ? member.coreIdentity.join('\n') : undefined,
                    castBodies: w.cast.map((c) => ({ name: c.name, bodyFact: c.gender })),
                });
                if (line) {
                    acc.povByName[member.name] = acc.povByName[member.name] ? `${acc.povByName[member.name]}\n\n${line}` : line;
                    // Persist the breath into the tick record's POV channel (eventId
                    // 'quiet-reflect', tied to no scene) so it survives to disk — the
                    // reading UI + diagnostics can surface it; without this it lived only
                    // in the ephemeral day-accum and vanished unless an episode composed.
                    eventPovs.push({ characterId: id, name: member.name, eventId: 'quiet-reflect', body: line });
                    await archive.commit({ kind: 'pov', day: today, tick: nowTick, name: member.name, characterId: id, eventId: 'quiet-reflect', body: line });
                    log(`  [惰息·反思] ${member.name} 這一日的內心一筆`);
                }
            } catch (err) {
                log(`  povReflect 失敗（${member.name}）：${err instanceof Error ? err.message : String(err)}`);
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

    // 8.6) 情分會淡 (heartsCanFade, opt-in) — lift the immortality that made every
    // season replay the SAME seeded couple: a genesis LOVE that never fades. At
    // day-end a love-want whose target went UNSEEN today starves; past a grace its
    // weight erodes, and once it drops under the floor the heart lets go (「情分淡
    // 了」): the want retires and the character keeps a private percept. That is ALL
    // the engine does — it does NOT revoke the keys the 相許 granted, does NOT
    // dissolve the 相許, does NOT route anyone anywhere. Seeing the feeling cooled,
    // the character decides the rest (still go? hand the key back? let it lie?).
    // Meeting resets the clock, so a tended love never fades; NON-love wants (志向/
    // 身份 — who you ARE) are never touched. Flag off ⇒ inert (byte-identical).
    if (dayEnd && w.heartsCanFade) {
        const LOVE_LAYER = /愛|情|戀|眷|慾/;
        const STARVE_GRACE = 3;   // days apart before a love begins to fade
        const FADE_FACTOR = 0.7;  // weight retained per further day apart
        const FADE_FLOOR = 0.25;  // below this the heart lets go
        for (const wnt of wants) {
            if (wnt.retired || !wnt.target) continue;
            const targetId = world.castById(wnt.target) ? wnt.target : world.idByName(wnt.target);
            if (!targetId || targetId === wnt.characterId) continue;
            if (!structuredWantGate(
                wnt,
                LOVE_LAYER.test(wnt.layer),
                hasWantSemantic(wnt, 'affection'),
                'heart-fade',
                targetId,
                'want',
            )) {
                continue;
            }
            if (togetherToday.has(world.pairKey(wnt.characterId, targetId))) {
                wnt.starveDays = 0;
                continue;
            }
            wnt.starveDays = (wnt.starveDays ?? 0) + 1;
            if (wnt.starveDays <= STARVE_GRACE) continue;
            wnt.weight *= FADE_FACTOR;
            if (wnt.weight >= FADE_FLOOR) continue;
            wnt.retired = true;
            wnt.resolvedTick = nowTick;
            wnt.resolutionCause = 'faded';
            wnt.resolvedNote = '（久不相見，情分淡了）';
            log(`  [淡了] ${world.nameById(wnt.characterId)} 對 ${world.nameById(targetId)} 那點心思，日子久了淡了`);
            // The fade is INTERNAL — it retires the want and leaves the character a
            // private percept to READ. It touches NOTHING physical or relational: no
            // key is revoked, no 相許 is dissolved by the engine. Whether they still
            // go, still hold the key, still call each other lovers — the character
            // decides, SEEING this. (Present the situation; never force the outcome.)
            (w.scheduledEvents ??= []).push({
                id: `love-faded-${wnt.characterId}-t${nowTick}`,
                atTick: nowTick + 1,
                sceneId: w.roster[wnt.characterId],
                text: `這些日子沒見著${world.perceivedName(wnt.characterId, targetId)}，那點熱乎氣倒像隔了一層——說不清是幾時淡的。`,
                visibility: 'private',
                witnessIds: [wnt.characterId],
            });
        }
    }

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
