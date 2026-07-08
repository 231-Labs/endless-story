/**
 * Season Two harness — the FULL integrated season. Same four-layer pipeline as
 * Season One (its own tick loop; core tick.ts untouched), but the flat open-action
 * "排新戲" (everyone free-writes → amateur mush) is REPLACED by the `packages/troupe`
 * production STATE MACHINE as the professional backbone (production-spine.ts),
 * tick-paced under the decrementing 会串 deadline.
 *
 * Two layers run in PARALLEL every tick:
 *   • PRODUCTION spine (professional): on each DAY tick the Showrunner injects the
 *     deadline and the 班主 advances the production one stage; the skilled member
 *     does that stage's work (script / 詞 / rehearse), gated by craft skill;
 *     REHEARSING is mandatory and yields takes + a staged 戲中戲 章回; PREMIERED
 *     renders that performance chapter at 会串. Two seams are wired in the spine:
 *     want-contested casting, and the full relational field into the lyricist.
 *   • CHARACTER layer (emergent): living-want per-tick self-rewrite, relationships,
 *     daily-life actions, and NIGHT routing — so 床戲 forms on the off-production
 *     nights the flat season never produced. Production fills troupe members' days;
 *     nights + off-hours leave room for trysts.
 *
 * The storyteller weaves a per-tick 章回 as before; the production's rehearsal /
 * premiere chapters join the season's chapter stream.
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
import { makeSeasonConfig, PROLOGUE, type SeasonConfig } from './showrunner.ts';
import { ProductionSpine, type CastingBid, type CiMeta, type StageStep } from './production-spine.ts';

export interface SeasonDeps {
    agent: SceneAgentPort;
    /** troupe production LLM (its own Ask: mock in the smoke, GLM-4.6 in the real run). */
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
}

export interface TickActionRec {
    actor: string;
    kind: string;
    target?: string;
    prose: string;
}

/** Production-based season razor — a pure state-machine predicate (never a
 *  character-arc outcome): the season is complete when a production reached
 *  PREMIERED with a script, ≥2 cast, a score, 詞, and real rehearsal takes. */
export interface SeasonPredicateV2 {
    complete: boolean;
    components: { hasBrief: boolean; hasScript: boolean; castAtLeastTwo: boolean; scored: boolean; versified: boolean; rehearsed: boolean; premiered: boolean };
}

export interface SeasonResultV2 {
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
    // ── chapters / weave ──
    chapterByTick: Array<string | null>;
    publicWeaveTicks: number[];
    productionChapterTicks: number[];
    privateNightScenes: number;
    nightSceneKinds: string[];
    episodesProduced: number;
    finaleChapter: string | null;
    // ── box-office ──
    boxOffice: BoxOfficeResult | null;
    boxOfficeRepeat: BoxOfficeResult | null;
    // ── living-want / ledger ──
    ledgerEvents: LedgerEvent[];
    wantsMutated: number;
    crossCharacterLeak: number;
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

export async function runSeasonV2(deps: SeasonDeps, opts: SeasonOpts = {}): Promise<SeasonResultV2> {
    const log = opts.log ?? (() => {});
    const { agent, troupeAsk, recall, archive, clock } = deps;
    const presetId = opts.presetId ?? 'spring-snow';
    const classicKey = opts.classicKey ?? 'baishe';
    const totalTicks = opts.totalTicks ?? 10;
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

    const wants = world.data.wants;

    const res: SeasonResultV2 = {
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
        chapterByTick: new Array(totalTicks).fill(null),
        publicWeaveTicks: [],
        productionChapterTicks: [],
        privateNightScenes: 0,
        nightSceneKinds: [],
        episodesProduced: 0,
        finaleChapter: null,
        boxOffice: null,
        boxOfficeRepeat: null,
        ledgerEvents: [],
        wantsMutated: 0,
        crossCharacterLeak: 0,
        memoriesPerCast: {},
        recallUsed: false,
        snapshotRoundTrip: null,
        actionsByTick: [],
    };

    // thick-memories check — count authored memories per cast member from the preset.
    for (const c of raw.founding_cast ?? []) res.memoriesPerCast[c.name] = (c.memories ?? []).length;

    const sharedLog: string[] = [];

    const sceneCast = async (ids: string[], today: number): Promise<SceneLoopCastMember[]> =>
        Promise.all(
            ids.map(async (id) => {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                if (recalls.length) res.recallUsed = true;
                const ties: Record<string, string> = {};
                for (const o of ids) {
                    if (o === id) continue;
                    const tone = world.data.edges[id]?.[o]?.tone;
                    if (tone) ties[o] = `你對TA：${tone}`;
                }
                return { characterId: id, name: m.name, persona: m.persona, memories: recalls.map((r) => r.text).slice(0, 6), stateLine: stateLine(m.state.fatigue, m.state.hunger), innerSecret: m.secret, role: m.role, ties };
            }),
        );

    const rewriteFor = async (id: string, sceneText: string, tick: number): Promise<void> => {
        const live = world.liveWantsOf(id);
        if (live.length === 0) return;
        const m = world.castById(id)!;
        const reply = await agent.rewriteWantLedger({ name: m.name, persona: m.persona, secret: m.secret, wants: live.map((w) => ({ id: w.id, layer: w.layer, desc: w.desc })), sceneText });
        applyRewrite(wants, id, reply, tick, res.ledgerEvents, castNames);
    };

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
        log(`── tick ${tick} · day ${today} · ${clockLabel}${night ? ' · 夜' : ''} · 距會串 ${daysLeft} 天 ──`);

        // ============================ FINALE ============================
        if (tick === totalTicks - 1) {
            // The staged 戲中戲 章回 IS the premiere performance chapter (produced at
            // REHEARSING). Render it at 会串; also fold in the cast POVs for texture.
            const stagedChapter = spine.prod.chapter ?? '';
            const povLines = (spine.prod.takes ?? []).map((t) => `〔${t.actorName}飾${t.partName}〕${t.pov}`);
            const finaleChapter = stagedChapter || (await agent.weaveTickChapter({ clock: clockLabel, lines: povLines.slice(-16) })) || `【${clockLabel}·會串】\n${povLines.join('\n')}`;
            res.finaleChapter = finaleChapter;
            res.chapterByTick[tick] = finaleChapter;
            res.productionChapterTicks.push(tick);
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
            res.boxOffice = computeBoxOffice(audience, { contributions }, repute);
            res.boxOfficeRepeat = computeBoxOffice(audience, { contributions }, repute);
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
            // Nights are OFF-production — pure character layer, so 床戲 has room.
            const presentIds = new Set(world.data.cast.map((m) => m.id));
            const resolveTgt = (t: string) => (presentIds.has(t) ? t : idByName(t));
            const actors = world.data.cast.map((m) => ({ id: m.id, sceneId: world.data.roster[m.id], homeSceneId: world.data.homeByChar[m.id] ?? world.data.roster[m.id], fatigue: m.state.fatigue, pursue: jealousNightPursuit(wants, m.id, resolveTgt) ?? yearningNightPursuit(wants, m.id, resolveTgt) ?? undefined }));
            const targets = computeSpatialRouting(actors, world.data.scenes.map((s) => ({ id: s.id, privacyLevel: s.privacyLevel })), true, (host, visitor) => world.welcome(host, visitor));
            for (const [id, sid] of targets) world.data.roster[id] = sid;
            if (process.env.SEASON_DEBUG) {
                for (const a of actors) {
                    const love = wants.find((w) => w.characterId === a.id && /愛|情/.test(w.layer) && !w.retired);
                    log(`  [dbg] ${world.nameById(a.id)} pursue=${a.pursue ? world.nameById(a.pursue.id) + (a.pursue.intrude ? '(intrude)' : '') : '-'} → ${world.sceneNameById(world.data.roster[a.id])} | love=${love ? `${love.desc.slice(0, 8)} tgt=${love.target} heat=${love.heat} frust=${love.frust} sat=${love.sat.toFixed(2)}` : '-'}`);
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
                const loop = await runSceneLoop({ sceneId: sid, sceneName: world.sceneNameById(sid), isPrivate: true, clock: clockLabel, cast: await sceneCast(ids, today), wants, tick, agent });
                if (loop.beats.length === 0) continue;
                res.privateNightScenes++;
                res.nightSceneKinds.push(kind);
                const who = ids.map((id) => world.nameById(id)).join('、');
                for (const b of loop.beats) nightLines.push(`[${world.sceneNameById(sid)}·私] ${b.name}：${b.text}`);
                log(`  夜場（${kind}）: ${who} 掩門入內——不入公開的日回。`);
                for (const cid of new Set(loop.beats.map((b) => b.characterId))) await rewriteFor(cid, loop.beats.map((b) => `${b.name}：${b.text}`).join('\n'), tick);
            }
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
            // (1) PROFESSIONAL: advance the production ONE stage under deadline pressure.
            let productionChapterThisTick: string | null = null;
            if (!spine.premiered) {
                const step = await spine.step(troupeAsk, daysLeft, tick);
                res.stagesSeen.push(step.from);
                log(`  [製作] ${step.from} → ${step.to} · ${step.who}`);
                log(`         ${step.log}`);
                if (step.from === 'REHEARSING' && spine.prod.chapter) {
                    productionChapterThisTick = spine.prod.chapter; // the staged 戲中戲 章回 joins the stream
                    res.productionChapterTicks.push(tick);
                }
            }

            // (2) CHARACTER layer: daily-life actions (play-work now handled by the
            //     spine, so play-kinds just mean "busy at the production"; seek_person
            //     forms the lived public scenes that weave the per-tick 章回).
            const awake = world.data.cast.map((m) => m.id);
            const actions: TickActionRec[] = [];
            const seekPairs: Array<{ seeker: string; target: string }> = [];

            for (const id of awake) {
                const m = world.castById(id)!;
                const hot = world.liveWantsOf(id)[0];
                const recalls = hot ? await recall.recall(id, hot.desc, 3, today) : [];
                if (recalls.length) res.recallUsed = true;
                const choice = await agent.chooseAction({ name: m.name, persona: m.persona, role: m.role, secret: m.secret, wants: world.liveWantsOf(id).map((w) => ({ layer: w.layer, desc: w.desc, target: w.target })), memories: recalls.map((r) => r.text).slice(0, 5), worldFact, sharedLog: sharedLog.slice(-14), playSummary: spine.summaryLine(), castNames });
                actions.push({ actor: m.name, kind: choice.kind, target: choice.target, prose: choice.prose });

                if (choice.kind === 'seek_person' && choice.target) {
                    const tid = idByName(choice.target);
                    if (tid && tid !== id) seekPairs.push({ seeker: id, target: tid });
                } else if (choice.kind === 'propose_play' || choice.kind === 'join_play' || choice.kind === 'compose' || choice.kind === 'rehearse') {
                    log(`  排戲: ${m.name} 忙著新戲的活（${choice.kind}）——併入製作台，不另起草台戲。`);
                } else {
                    log(`  私事: ${m.name} — ${choice.prose.slice(0, 24)}…`);
                }
            }
            res.actionsByTick.push(actions);

            // Form co-presence groups from seek pairs.
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
            // Daily-life co-presence: awake characters not in a seek pair share a
            // backstage daily scene (the CHARACTER layer — relationships + daily life,
            // NOT play-building, which the production spine owns). This is what keeps
            // every character's living wants alive so 床戲 forms on off-production
            // nights (without it, only the seek-scene handful ripen and no clean
            // night pair emerges).
            const dailyLifeGroup = awake.filter((id) => !groupOf(id));
            if (dailyLifeGroup.length >= 2) groups.push(new Set(dailyLifeGroup));

            const publicBeats: SceneBeat[] = [];
            let gi = 0;
            const rewrittenText = new Map<string, string>();
            for (const g of groups) {
                const ids = [...g];
                if (ids.length < 2) continue;
                const sceneName = '雲錦台戲台';
                const loop = await runSceneLoop({ sceneId: `d${tick}-g${gi++}`, sceneName, isPrivate: false, clock: clockLabel, stake: tick === 0 ? '堂會的客與報館的人都在座，台上台下都有眼睛。' : undefined, cast: await sceneCast(ids, today), wants, tick, agent });
                for (const b of loop.beats) {
                    publicBeats.push(b);
                    log(`  [${sceneName}] ${b.name}：${b.text}`);
                }
                const sceneText = loop.beats.map((b) => `${b.name}：${b.text}`).join('\n');
                for (const cid of new Set(loop.beats.map((b) => b.characterId))) rewrittenText.set(cid, sceneText);
                for (const b of loop.beats) await recall.remember(b.characterId, `〔${sceneName}〕${b.text}`, { kind: 'chapter', importance: 5, day: today });
            }

            // Per-tick 章回: the production's staged chapter is the headline the day it
            // lands; otherwise weave the lived public beats. Always non-null on a day
            // tick (there is always at least a seek scene or the production chapter).
            const publicLines = publicBeats.map((b) => `[雲錦台戲台] ${b.name}：${b.text}`);
            dayLines.push(`【${clockLabel}】`, ...publicLines);
            const dailyWeave = publicLines.length > 0 ? ((await agent.weaveTickChapter({ clock: clockLabel, lines: publicLines.slice(-12) })) ?? `【${clockLabel}·回】\n${publicLines.join('\n')}`) : null;
            if (dailyWeave) res.publicWeaveTicks.push(tick);
            const chap = productionChapterThisTick ?? dailyWeave ?? `【${clockLabel}·回】（本拍眾人各忙各的，暫無公開場面）`;
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

        // ── Day-end episode (public material only) ──
        if (dayEnd && dayLines.filter((l) => l.startsWith('[')).length >= 1) {
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
    return res;
}
