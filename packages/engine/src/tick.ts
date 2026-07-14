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
    jealousNightPursuit,
    newWant,
    nightSceneKind,
    yearningNightPursuit,
    tension,
} from './core/want-core.ts';
import { runSceneLoop, type SceneLoopCastMember } from './core/scene-loop.ts';
import { computeSpatialRouting } from './core/spatial-routing.ts';
import type { ArchivePort, CanonicalSceneEvent, ClockPort, RecallPort, SceneAgentPort } from './ports.ts';
import { deriveBeatPerceiverIds, projectEventBeatsForWitness } from './core/scene-perception.ts';
import type { WorldState } from './world-state.ts';

export interface TickDeps {
    agent: SceneAgentPort;
    recall: RecallPort;
    archive: ArchivePort;
    clock: ClockPort;
}

export interface TickOpts {
    /** Where WorldState snapshots to at tick end. Omit to skip snapshotting. */
    snapshotDir?: string;
    /** Log line sink (default console.log). */
    log?: (line: string) => void;
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
    /** Scene ids each awake character routed to this tick (night only). */
    routed: Record<string, string>;
    wove: boolean;
    episode: boolean;
    /** Frozen objective events produced this tick, before any POV interpretation. */
    events: CanonicalSceneEvent[];
    /** Read-only session projections, linked back to their frozen event. */
    eventPovs: TickEventPov[];
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
    const { agent, recall, archive, clock } = deps;
    const w = world.data;
    const c = w.clock;
    const nowTick = c.currentTick;
    const today = c.day;
    const night = clock.isNight(c);
    const dayEnd = clock.isDayEnd(c);
    const clockLabel = c.partOfDay;
    const wants = w.wants; // mutated in place; snapshot persists it

    log(`── tick ${nowTick} · day ${today} · ${clockLabel}${night ? ' · 夜' : ''} ──`);

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

    // 2) ROUTING — night: place by home + want-driven pursuit; dawn: disperse to work.
    const routed: Record<string, string> = {};
    if (night) {
        const idByName = new Map(w.cast.map((m) => [m.name, m.id]));
        const presentIds = new Set(w.cast.map((m) => m.id));
        const resolveTgt = (t: string) => (presentIds.has(t) ? t : idByName.get(t));
        const actors = w.cast.map((m) => {
            const jealous = jealousNightPursuit(wants, m.id, resolveTgt);
            const yearning = yearningNightPursuit(wants, m.id, resolveTgt);
            return {
                id: m.id,
                sceneId: w.roster[m.id],
                homeSceneId: w.homeByChar[m.id] ?? w.roster[m.id],
                fatigue: m.state.fatigue,
                pursue: jealous ?? yearning ?? undefined,
            };
        });
        const targets = computeSpatialRouting(
            actors,
            w.scenes.map((s) => ({ id: s.id, privacyLevel: s.privacyLevel })),
            true,
            (host, visitor) => world.welcome(host, visitor),
        );
        for (const [id, sid] of targets) {
            w.roster[id] = sid;
            routed[id] = sid;
        }
    } else if (c.tickOfDay === 0) {
        for (const m of w.cast) {
            const work = w.workByChar[m.id];
            if (work && w.roster[m.id] !== work) {
                w.roster[m.id] = work;
                routed[m.id] = work;
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
            if (!nightSceneKind(cs, info?.privacyLevel ?? 0, wants)) byScene.delete(sid);
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
    const eventPovs: TickEventPov[] = [];
    const events: CanonicalSceneEvent[] = [];

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
                    role: member.role,
                    bodyFact: member.gender,
                    ties,
                };
            }),
        );

        const loop = await runSceneLoop({
            sagaId: w.sagaId,
            sceneId: sid,
            sceneName,
            isPrivate,
            clock: clockLabel,
            cast: castWithMem,
            wants,
            tick: nowTick,
            agent,
        });

        // Freeze only after the existing scene checker has repaired hard prose
        // errors. The checker may edit text, never actors/order/count; structured
        // perception metadata remains attached to the original beat.
        if (loop.beats.length > 0 && ids.length > 1) {
            const reviewed = await agent.reviewScene({
                worldPremise: w.sagaPremise,
                venue: sceneName,
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

        const eventId = `${w.sagaId}:d${today}:t${nowTick}:${sid}`;
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
                departures: loop.moves.filter((move) => w.scenes.some((scene) => scene.name === move.toSceneName)).length,
                relationshipTurn: loop.intimacyAccepted,
            },
            beats: loop.beats.map((b) => ({
                characterId: b.characterId,
                name: b.name,
                text: b.text,
                addressed: b.addressed,
                audience: b.audience ?? 'scene',
                perceiverIds: deriveBeatPerceiverIds(b, ids.map((id) => ({ id, name: world.nameById(id) }))),
                inner: b.inner || undefined,
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

        // Apply scene-loop moves that resolve to a real scene (fake's sentinel ignored).
        for (const mv of loop.moves) {
            const dest = w.scenes.find((s) => s.name === mv.toSceneName);
            if (dest) w.roster[mv.characterId] = dest.id;
        }

        for (const id of loop.actedCharacterIds) if (!actedCharacterIds.includes(id)) actedCharacterIds.push(id);

        // Resolutions → aftermath wants.
        for (const rv of loop.resolved) {
            resolvedCount++;
            log(`  resolved: ${world.nameById(rv.want.characterId)}「${rv.want.desc}」${rv.note ? ` — ${rv.note}` : ''}`);
            const owner = world.castById(rv.want.characterId);
            if (!owner) continue;
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
        if (loop.beats.length) {
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
    };
}
