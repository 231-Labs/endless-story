/**
 * Season One harness — the full four-layer narrative pipeline (RUNNER_V2 §9;
 * SEASON_ONE_SLICE). Its OWN tick loop (core tick.ts is untouched) that reuses
 * every proven part: the scene loop + weave, want-core night routing, the
 * validated living-want self-rewrite, and the deterministic box-office. Only the
 * Showrunner (season config + razor) and box-office integration are new.
 *
 * Agent-agnostic: pass a FakeSceneAgent for the smoke, a RunnerSceneAgent for the
 * real run. The two decoupled-test fixes are baked in:
 *   #1 structured action — the agent self-tags action_kind; the engine routes off
 *      the tag (play.ts), never a regex on prose. A `compose` now COUNTS as a
 *      fragment (the emergence-test bug).
 *   #2 living-want ON — every character rewrites only their OWN wants, seeing only
 *      what they just did / the one scene they were in (scene-scoped).
 */

import {
    applyRewrite,
    computeBoxOffice,
    computeSpatialRouting,
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    runSceneLoop,
    yearningNightPursuit,
    buildWorldState,
    loadPresetFile,
    seedGenesisMemories,
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
import { applyPlayAction, playSummaryLine, totalRehearsalEffort, type NewPlay } from './play.ts';
import { isSeasonComplete, makeSeasonConfig, PROLOGUE, type SeasonConfig, type SeasonPredicate } from './showrunner.ts';

export interface SeasonDeps {
    agent: SceneAgentPort;
    recall: RecallPort;
    archive: ArchivePort;
    clock: ClockPort;
}

export interface SeasonOpts {
    presetId?: string;
    /** The 7 season cast, in the order that sets fake love-targets (§5). */
    cast?: string[];
    totalTicks?: number;
    ticksPerDay?: number;
    rehearsalThreshold?: number;
    snapshotDir?: string;
    /** Do a snapshot→restore round-trip after this tick (mid-season). */
    midRestartAfterTick?: number;
    log?: (line: string) => void;
    /** Write audience-reaction PROSE at the finale (real run only; off in smoke). */
    audienceProse?: boolean;
}

export interface TickActionRec {
    actor: string;
    kind: string;
    target?: string;
    prose: string;
}

export interface SeasonResult {
    cfg: SeasonConfig;
    castNames: string[];
    /** daysLeft injected each tick (must strictly decrement). */
    daysLeftByTick: number[];
    /** worldFact(0) carried the §6 prologue verbatim. */
    prologueAtT0: boolean;
    /** every tick's worldFact carried the deadline line. */
    deadlineEveryTick: boolean;
    play: NewPlay | null;
    proposal: { emerged: boolean; tick: number | null; proposer: string | null };
    /** one 章回 per tick (public weave on day ticks, private 夜章 on night ticks,
     *  finale performance chapter on the last) — index = tick. */
    chapterByTick: Array<string | null>;
    publicWeaveTicks: number[];
    privateNightScenes: number;
    nightSceneKinds: string[];
    episodesProduced: number;
    finaleChapter: string | null;
    predicate: SeasonPredicate | null;
    boxOffice: BoxOfficeResult | null;
    boxOfficeRepeat: BoxOfficeResult | null;
    ledgerEvents: LedgerEvent[];
    wantsMutated: number;
    /** rewrite events whose want does NOT belong to the acting character (must be 0). */
    crossCharacterLeak: number;
    snapshotRoundTrip: { ok: boolean; wantsBefore: number; wantsAfter: number; clockBefore: number; clockAfter: number } | null;
    actionsByTick: TickActionRec[][];
}

const abilityOf = (role?: string): number => {
    if (!role) return 0.6;
    if (/班主|花旦|小生/.test(role)) return 0.8;
    if (/刀馬旦|淨|老生/.test(role)) return 0.75;
    return 0.65;
};

/** Warmth (0..1) toward the troupe, from a character's outgoing tone edges. */
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

export async function runSeason(deps: SeasonDeps, opts: SeasonOpts = {}): Promise<SeasonResult> {
    const log = opts.log ?? (() => {});
    const { agent, recall, archive, clock } = deps;
    const presetId = opts.presetId ?? 'spring-snow';
    const totalTicks = opts.totalTicks ?? 10;
    const ticksPerDay = opts.ticksPerDay ?? 6;
    const castNames = opts.cast ?? ['沈雪笙', '柳安春', '蘇映雪', '金鳳', '江聞鶴', '連翹', '白韻秋'];

    // ── Build the world from the preset, restricted to the season cast ─────────
    const rawFull = loadPresetFile(presetId);
    const raw: RawPreset = { ...rawFull, founding_cast: (rawFull.founding_cast ?? []).filter((c) => castNames.includes(c.name)) };
    for (const n of castNames) if (!raw.founding_cast!.some((c) => c.name === n)) throw new Error(`[season] cast ${n} not in preset`);
    const world = buildWorldState(raw, presetId, ticksPerDay);
    await seedGenesisMemories(raw, world, recall);

    const idByName = (n: string): string => world.idByName(n) ?? n;
    // Intimacy/relationship soil: 白韻秋 comes for 柳安春 (feeds box-office warmth).
    world.setEdge(idByName('白韻秋'), idByName('柳安春'), '戀慕');

    const cfg = makeSeasonConfig(totalTicks, opts.rehearsalThreshold ?? 2);

    // ── Genesis wants (t0), full self (persona + secret + premise) ────────────
    for (const member of world.data.cast) {
        const derived = await agent.deriveGenesisWants({
            name: member.name,
            role: member.role ?? '—',
            gender: member.gender,
            ageYears: member.age,
            description: member.persona,
            secret: member.secret,
            sagaPremise: world.data.sagaPremise,
            castNames,
        });
        for (const g of derived) {
            world.data.wants.push(
                newWant({
                    characterId: member.id,
                    layer: g.layer,
                    desc: g.desc,
                    target: g.target,
                    weight: g.weight,
                    sat: g.sat,
                    resistance: g.resistance,
                    kind: 'narrative',
                    source: 'genesis',
                    bornTick: 0,
                }),
            );
        }
    }

    // ── Result accumulators ───────────────────────────────────────────────────
    const res: SeasonResult = {
        cfg,
        castNames,
        daysLeftByTick: [],
        prologueAtT0: cfg.worldFact(0).includes(PROLOGUE.slice(0, 40)),
        deadlineEveryTick: true,
        play: null,
        proposal: { emerged: false, tick: null, proposer: null },
        chapterByTick: new Array(totalTicks).fill(null),
        publicWeaveTicks: [],
        privateNightScenes: 0,
        nightSceneKinds: [],
        episodesProduced: 0,
        finaleChapter: null,
        predicate: null,
        boxOffice: null,
        boxOfficeRepeat: null,
        ledgerEvents: [],
        wantsMutated: 0,
        crossCharacterLeak: 0,
        snapshotRoundTrip: null,
        actionsByTick: [],
    };

    const sharedLog: string[] = [];
    const wants = world.data.wants;

    // Assemble a scene-loop cast (persona + secret + ties + recalled memories).
    const sceneCast = async (ids: string[], today: number): Promise<SceneLoopCastMember[]> =>
        Promise.all(
            ids.map(async (id) => {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                const ties: Record<string, string> = {};
                for (const o of ids) {
                    if (o === id) continue;
                    const tone = world.data.edges[id]?.[o]?.tone;
                    if (tone) ties[o] = `你對TA：${tone}`;
                }
                return {
                    characterId: id,
                    name: m.name,
                    persona: m.persona,
                    memories: recalls.map((r) => r.text).slice(0, 6),
                    stateLine: stateLine(m.state.fatigue, m.state.hunger),
                    innerSecret: m.secret,
                    role: m.role,
                    ties,
                };
            }),
        );

    // Scene-scoped living-want rewrite for ONE character (fix #2).
    const rewriteFor = async (id: string, sceneText: string, tick: number): Promise<void> => {
        const live = world.liveWantsOf(id);
        if (live.length === 0) return;
        const m = world.castById(id)!;
        const reply = await agent.rewriteWantLedger({
            name: m.name,
            persona: m.persona,
            secret: m.secret,
            wants: live.map((w) => ({ id: w.id, layer: w.layer, desc: w.desc })),
            sceneText,
        });
        applyRewrite(wants, id, reply, tick, res.ledgerEvents, castNames);
    };

    // ── The season tick loop ──────────────────────────────────────────────────
    let clk = world.data.clock;
    // Day-episode accumulator (PUBLIC lines only; private night scenes never join).
    let dayLines: string[] = [];

    for (let tick = 0; tick < totalTicks; tick++) {
        clk = world.data.clock;
        const today = clk.day;
        const night = clock.isNight(clk);
        const dayEnd = clock.isDayEnd(clk);
        const clockLabel = clk.partOfDay;
        const worldFact = cfg.worldFact(tick);
        res.daysLeftByTick.push(cfg.daysLeft(tick));
        if (!worldFact.includes(cfg.deadlineFact(tick))) res.deadlineEveryTick = false;
        log(`── tick ${tick} · day ${today} · ${clockLabel}${night ? ' · 夜' : ''} · 距會串 ${cfg.daysLeft(tick)} 天 ──`);

        // ============================ FINALE ============================
        if (tick === totalTicks - 1) {
            const play = res.play;
            if (play) {
                play.performed = true;
                play.performedTick = tick;
            }
            const castIds = play ? [...play.cast] : world.data.cast.map((m) => m.id);
            const perfCast = await sceneCast(castIds, today);
            const perf = await runSceneLoop({
                sceneId: 'huichuan',
                sceneName: '年底大會串',
                isPrivate: false,
                clock: clockLabel,
                stake: '霞飛路對台、報館與堂會的眼睛都在台下——這一場定春雪社往後掛不掛得上名。',
                cast: perfCast,
                wants,
                tick,
                agent,
            });
            const perfLines = perf.beats.map((b) => `[年底大會串] ${b.name}：${b.text}`);
            // Fold the accumulated script fragments into the performance material.
            const fragLines = (play?.fragments ?? []).map((f) => `〔戲文·${f.author}〕${f.text}`);
            const finaleChapter =
                (await agent.weaveTickChapter({ clock: clockLabel, lines: [...fragLines, ...perfLines].slice(-16) })) ??
                `【${clockLabel}·會串】\n${[...fragLines, ...perfLines].join('\n')}`;
            res.finaleChapter = finaleChapter;
            res.chapterByTick[tick] = finaleChapter;
            await archive.commit({ kind: 'chapter', day: today, tick, name: '年底大會串·會串章', body: finaleChapter });

            // ── Box-office: deterministic pure settlement (§4) ───────────────
            const contributions = (play ? [...play.cast] : []).map((id) => ({
                characterId: id,
                ability: abilityOf(world.roleById(id)),
                rehearsalEffort: play?.rehearsalEffort[id] ?? 0,
            }));
            const audience: BoxOfficeAudienceMember[] = [
                { id: idByName('白韻秋'), name: '白韻秋', warmth: warmthFromEdges(world, idByName('白韻秋')) },
                { id: 'sanke-1', name: '散客·秦秀娥', warmth: 0.6 },
                { id: 'sanke-2', name: '散客·張二爺', warmth: 0.45 },
                { id: 'sanke-3', name: '散客·李三嫂', warmth: 0.3 },
                { id: 'sanke-4', name: '散客·路人甲', warmth: 0.1 },
            ];
            const repute = 0.4; // troupe standing (accumulator; M0 constant, auditable)
            res.boxOffice = computeBoxOffice(audience, { contributions }, repute);
            res.boxOfficeRepeat = computeBoxOffice(audience, { contributions }, repute); // determinism check
            res.predicate = isSeasonComplete(play, cfg);

            if (opts.audienceProse && agent.audienceReaction) {
                for (const a of audience) {
                    const prose = await agent.audienceReaction({ audienceName: a.name, performanceLines: perfLines, warmth: a.warmth });
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
            const actors = world.data.cast.map((m) => ({
                id: m.id,
                sceneId: world.data.roster[m.id],
                homeSceneId: world.data.homeByChar[m.id] ?? world.data.roster[m.id],
                fatigue: m.state.fatigue,
                pursue: jealousNightPursuit(wants, m.id, resolveTgt) ?? yearningNightPursuit(wants, m.id, resolveTgt) ?? undefined,
            }));
            const targets = computeSpatialRouting(
                actors,
                world.data.scenes.map((s) => ({ id: s.id, privacyLevel: s.privacyLevel })),
                true,
                (host, visitor) => world.welcome(host, visitor),
            );
            for (const [id, sid] of targets) world.data.roster[id] = sid;
            if (process.env.SEASON_DEBUG) {
                for (const a of actors) {
                    const hot = world.liveWantsOf(a.id)[0];
                    log(`  [dbg] ${world.nameById(a.id)} home=${world.sceneNameById(a.homeSceneId)} pursue=${a.pursue ? world.nameById(a.pursue.id) + (a.pursue.intrude ? '(intrude)' : '') : '-'} → ${world.sceneNameById(world.data.roster[a.id])} | hot=${hot ? `${hot.layer}:${hot.desc.slice(0, 8)} heat=${hot.heat} frust=${hot.frust} R=${hot.resistance}` : '-'}`);
                }
            }

            const byScene = new Map<string, string[]>();
            for (const m of world.data.cast) (byScene.get(world.data.roster[m.id]) ?? byScene.set(world.data.roster[m.id], []).get(world.data.roster[m.id])!).push(m.id);

            const nightLines: string[] = [];
            for (const [sid, ids] of byScene) {
                const info = world.sceneById(sid);
                const cs = ids.map((id) => ({ id, name: world.nameById(id) }));
                const kind = nightSceneKind(cs, info?.privacyLevel ?? 0, wants);
                if (!kind) continue;
                const loop = await runSceneLoop({
                    sceneId: sid,
                    sceneName: world.sceneNameById(sid),
                    isPrivate: true,
                    clock: clockLabel,
                    cast: await sceneCast(ids, today),
                    wants,
                    tick,
                    agent,
                });
                if (loop.beats.length === 0) continue;
                res.privateNightScenes++;
                res.nightSceneKinds.push(kind);
                const who = ids.map((id) => world.nameById(id)).join('、');
                for (const b of loop.beats) nightLines.push(`[${world.sceneNameById(sid)}·私] ${b.name}：${b.text}`);
                log(`  夜場（${kind}）: ${who} 掩門入內——不入公開的日回。`);
                // Living-want rewrite for the private-scene participants (scene-scoped).
                for (const cid of new Set(loop.beats.map((b) => b.characterId))) {
                    await rewriteFor(cid, loop.beats.map((b) => `${b.name}：${b.text}`).join('\n'), tick);
                }
            }
            // Per-tick PRIVATE 夜章 — a chapter EVERY tick, but OFF the public weave.
            if (nightLines.length > 0) {
                const chap = (await agent.weaveTickChapter({ clock: clockLabel, lines: nightLines.slice(-12) })) ?? `【${clockLabel}·夜私章】\n${nightLines.join('\n')}`;
                res.chapterByTick[tick] = chap;
                await archive.commit({ kind: 'chapter', day: today, tick, name: `${clockLabel}·夜私章`, body: chap });
            } else {
                log('  夜: 快轉, 無合格私戲 (sleep consolidates)');
            }
            res.actionsByTick.push([]);
        } else {
            // ============================ DAY ============================
            const awake = world.data.cast.map((m) => m.id);
            const actions: TickActionRec[] = [];
            const seekPairs: Array<{ seeker: string; target: string }> = [];
            const playWorkers: string[] = [];

            for (const id of awake) {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                const choice = await agent.chooseAction({
                    name: m.name,
                    persona: m.persona,
                    role: m.role,
                    secret: m.secret,
                    wants: world.liveWantsOf(id).map((w) => ({ layer: w.layer, desc: w.desc, target: w.target })),
                    memories: recalls.map((r) => r.text).slice(0, 5),
                    worldFact,
                    sharedLog: sharedLog.slice(-14),
                    playSummary: playSummaryLine(res.play),
                    castNames,
                });
                actions.push({ actor: m.name, kind: choice.kind, target: choice.target, prose: choice.prose });

                // Route the structured action (fix #1: off the tag, not the prose).
                if (choice.kind === 'propose_play' || choice.kind === 'join_play' || choice.kind === 'compose' || choice.kind === 'rehearse') {
                    const before = res.play;
                    res.play = applyPlayAction(res.play, id, choice.kind, choice.prose, tick);
                    if (!before && res.play) {
                        res.proposal = { emerged: true, tick, proposer: world.nameById(res.play.proposer) };
                        log(`  排新戲 起頭: ${world.nameById(res.play.proposer)}（${choice.kind}）`);
                    }
                    playWorkers.push(id);
                } else if (choice.kind === 'seek_person' && choice.target) {
                    const tid = idByName(choice.target);
                    if (tid && tid !== id) seekPairs.push({ seeker: id, target: tid });
                    else playWorkers.push(id); // fell through — treat as solo (no scene)
                } else {
                    log(`  私事: ${m.name} — ${choice.prose.slice(0, 24)}…`);
                }
            }
            res.actionsByTick.push(actions);

            // ── Form co-presence groups (union seek pairs, then a rehearsal group) ──
            const groups: Array<Set<string>> = [];
            const groupOf = (id: string) => groups.find((g) => g.has(id));
            for (const { seeker, target } of seekPairs) {
                const gs = groupOf(seeker);
                const gt = groupOf(target);
                if (gs && gt && gs !== gt) {
                    for (const x of gt) gs.add(x);
                    groups.splice(groups.indexOf(gt), 1);
                } else if (gs) gs.add(target);
                else if (gt) gt.add(seeker);
                else groups.push(new Set([seeker, target]));
            }
            const rehearsalGroup = playWorkers.filter((id) => !groupOf(id));
            if (rehearsalGroup.length >= 2) groups.push(new Set(rehearsalGroup));

            // ── Run each ≥2-person group as a public scene ──
            const publicBeats: SceneBeat[] = [];
            let gi = 0;
            const rewrittenText = new Map<string, string>();
            for (const g of groups) {
                const ids = [...g];
                if (ids.length < 2) continue;
                const sceneName = '雲錦台戲台';
                const loop = await runSceneLoop({
                    sceneId: `d${tick}-g${gi++}`,
                    sceneName,
                    isPrivate: false,
                    clock: clockLabel,
                    stake: tick === 0 ? '堂會的客與報館的人都在座，台上台下都有眼睛。' : undefined,
                    cast: await sceneCast(ids, today),
                    wants,
                    tick,
                    agent,
                });
                for (const b of loop.beats) {
                    publicBeats.push(b);
                    log(`  [${sceneName}] ${b.name}：${b.text}`);
                }
                const sceneText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                for (const cid of new Set(loop.beats.map((b) => b.characterId))) rewrittenText.set(cid, sceneText);
                // remember each actor's turn (next tick continues from it)
                for (const b of loop.beats) await recall.remember(b.characterId, `〔${sceneName}〕${b.text}`, { kind: 'chapter', importance: 5, day: today });
            }

            // ── Public weave: one 章回 for this tick from PUBLIC beats ──
            const publicLines = publicBeats.map((b) => `[雲錦台戲台] ${b.name}：${b.text}`);
            dayLines.push(`【${clockLabel}】`, ...publicLines);
            if (publicLines.length > 0) {
                const chap = (await agent.weaveTickChapter({ clock: clockLabel, lines: publicLines.slice(-12) })) ?? `【${clockLabel}·回】\n${publicLines.join('\n')}`;
                res.chapterByTick[tick] = chap;
                res.publicWeaveTicks.push(tick);
                await archive.commit({ kind: 'chapter', day: today, tick, name: `${clockLabel}·回`, body: chap });
            }

            // ── Living-want self-rewrite (fix #2), scene-scoped, ONE per character ──
            for (const id of awake) {
                const inScene = rewrittenText.get(id);
                const rec = actions.find((a) => a.actor === world.nameById(id));
                await rewriteFor(id, inScene ?? rec?.prose ?? '', tick);
            }

            // roll the shared log
            for (const a of actions) sharedLog.push(`【第${tick}拍】${a.actor}（${a.kind}）:${a.prose.slice(0, 40)}`);
            while (sharedLog.length > 24) sharedLog.shift();

            // state vector
            const actedIds = new Set(publicBeats.map((b) => b.characterId));
            for (const m of world.data.cast) {
                m.state.fatigue = Math.max(0, Math.min(1, m.state.fatigue + (actedIds.has(m.id) ? 0.12 : 0.05)));
                m.state.hunger = Math.max(0, Math.min(1, clk.tickOfDay === 0 ? 0.15 : m.state.hunger + 0.12));
            }
        }

        // ── Day-end episode (public material only) ──
        if (dayEnd && dayLines.filter((l) => l.startsWith('[')).length >= 1) {
            const prose = await agent.composeEpisode({ day: today, materialLines: dayLines });
            if (prose) {
                await archive.commit({ kind: 'episode', day: today, tick, name: `第${today}日`, body: prose });
                res.episodesProduced++;
            }
            dayLines = [];
        }

        // ── Advance clock + snapshot ──
        world.data.clock = clock.advance(clk);
        if (opts.snapshotDir) world.snapshot(opts.snapshotDir);

        // ── Mid-season snapshot → restore round-trip ──
        if (opts.snapshotDir && opts.midRestartAfterTick === tick) {
            const wantsBefore = world.data.wants.length;
            const clockBefore = world.data.clock.currentTick;
            const restored = WorldStateClass.restore(opts.snapshotDir);
            const ok = restored.data.wants.length === wantsBefore && restored.data.clock.currentTick === clockBefore;
            res.snapshotRoundTrip = {
                ok,
                wantsBefore,
                wantsAfter: restored.data.wants.length,
                clockBefore,
                clockAfter: restored.data.clock.currentTick,
            };
        }
    }

    // ── Counters that summarize the ledger ──
    res.wantsMutated = res.ledgerEvents.filter((e) => e.kind === 'mutate').length;
    const wantOwner = new Map(wants.map((w) => [w.id, w.characterId]));
    res.crossCharacterLeak = res.ledgerEvents.filter(
        (e) => (e.kind === 'mutate' || e.kind === 'close') && wantOwner.get(e.wantId) !== undefined && wantOwner.get(e.wantId) !== e.characterId,
    ).length;
    return res;
}
