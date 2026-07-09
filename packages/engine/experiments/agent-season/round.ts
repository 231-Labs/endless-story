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
    type Want,
    type WorldClock,
    type SceneLoopCastMember,
    type RecallPort,
    type SceneAgentPort,
} from '../../src/index.ts';
import {
    type Char,
    areEstablishedLovers,
    isPublicVenue,
    venueByName,
    VENUES,
    WORLD_PREMISE,
} from './world.ts';
import {
    rhythmPull,
    activeVenues,
    isDeepNight,
    isNightPart,
    type RehearsalCall,
} from './rhythm.ts';
import { applyRoundHealth, bodyLine, HEALTH } from './health.ts';
import { hottest, type Planner, type ToolCall } from './agent-turn.ts';

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
    beats: Array<{ name: string; text: string; inner: string }>;
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
    interactIntent: { target: string; intent: string } | null;
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
}

export interface SeasonResult {
    rounds: RoundRecord[];
    scenes: SceneRecord[];
    surfaced: SurfacedMemory[];
    reh: RehearsalCall;
    rehearsalGathering: Array<{ tick: number; part: string; venue: string; members: string[] }>;
    timeToolUses: number;
    deaths: string[];
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
        ties,
    };
}

async function doInteract(
    a: Char,
    b: Char,
    intent: string,
    clock: WorldClock,
    night: boolean,
    agent: SceneAgentPort,
    recall: RecallPort,
    tags: Map<string, Map<string, string>>,
    surfacedOut: SurfacedMemory[],
): Promise<SceneRecord> {
    const venue = a.venue;
    const isPrivate = !isPublicVenue(venue); // a home / private venue → private
    const established = areEstablishedLovers(a, b);
    // RELATIONSHIP-DEPENDENT intimacy: established lovers alone in a private venue
    // at night → consummate register (a real 床戲 is correct for THIS pair);
    // everyone else → default restrained (forbidden/unconfessed stays held).
    const consummate = established && isPrivate && night;
    const cast = [castMember(a, [b]), castMember(b, [a])];
    const wants = [...a.wants, ...b.wants];
    const clockLabel = `第${clock.day}日·${clock.partOfDay}`;

    const loop = await runSceneLoop({
        sceneId: `d${clock.day}p${clock.tickOfDay}-${a.id}`,
        sceneName: venue,
        isPrivate,
        clock: clockLabel,
        stake: `${a.name}${intent}。`,
        emotionalStance: consummate ? 'consummate' : undefined,
        etiquette: WORLD_PREMISE, // pinned era facts colour every beat (anti-anachronism)
        cast,
        wants,
        tick: clock.currentTick,
        agent, // inject the SceneAgentPort (fake or runner) — never fall back to the runner default
    });

    const beats = loop.beats.map((x) => ({ name: x.name, text: x.text, inner: x.inner }));
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

    return {
        venue,
        day: clock.day,
        part: clock.partOfDay,
        isPublic: isPublicVenue(venue),
        isPrivate,
        consummate,
        intimacyGate: loop.intimacyGateOpened,
        participants: [a.name, b.name],
        beats,
        resolved,
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

// ── night consolidation (reflect for everyone, scheduled at 深宵) ─────────────
async function nightConsolidate(
    c: Char,
    byId: Map<string, Char>,
    day: number,
    tick: number,
    agent: SceneAgentPort,
    castNames: string[],
): Promise<string[]> {
    const updated: string[] = [];
    const interactions = [...c.todayLedger.keys()]
        .map((oid) => {
            const o = byId.get(oid);
            if (!o) return null;
            return {
                otherId: oid,
                otherName: o.name,
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
    return updated;
}

// ── ONE 時辰-ROUND ────────────────────────────────────────────────────────────
export async function runRound(
    clock: WorldClock,
    deps: SeasonDeps,
    tags: Map<string, Map<string, string>>,
    out: { surfaced: SurfacedMemory[]; rehearsalGathering: SeasonResult['rehearsalGathering']; timeToolUses: { n: number } },
): Promise<RoundRecord> {
    const { cast, planner, agent, recall, clockPort, log, reh } = deps;
    const part = clock.partOfDay;
    const night = clockPort.isNight(clock);
    const deep = isDeepNight(part);
    const byId = new Map(cast.map((c) => [c.id, c]));
    const byName = new Map(cast.map((c) => [c.name, c]));
    const castNames = cast.map((c) => c.name);

    for (const c of cast) c.sceneThisRound = false;

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
                    log(`  〔班主號令〕${banzhu.name}（在 ${rp.venue}）傳話排戲：「${dec.line}」`);
                }
            }
        }
    }

    // (a) determine ACTIVE characters (rhythm + hot-want override + health rest).
    const active: Char[] = [];
    for (const c of cast) {
        if (c.dead) continue;
        const pull = rhythmPull(c, part, reh);
        let isActive = pull.active;
        // Hot-want override (§2.43 pull, not command): 柳 leaves home at 深宵 to
        // settle the 了斷 with 金鳳 — UNLESS they've already met today (no phantom).
        if (!isActive && c.id === '柳生春' && deep) {
            const hot = hottest(c);
            const jin = byName.get('金鳳');
            if (hot?.layer === '情' && !hot.retired && jin && !c.addressedToday.has(jin.id)) isActive = true;
        }
        // Worn-down characters at night rest to recover (sleep's teeth): skip the
        // turn so health recovers, unless they are the one chasing the reckoning.
        if (isActive && night && c.health <= HEALTH.wornAt && c.id !== '柳生春') isActive = false;
        if (isActive) active.push(c);
    }

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

    // FAST-FORWARD an empty 時辰.
    if (active.length === 0) {
        roundRec.fastForward = true;
        roundRec.passLine = deep
            ? '夜深了，梨園上下各自歸寢，一夜無話。'
            : part === '清晨'
              ? '天光未亮，戲子夜工，滿園還在夢裡，一時無話。'
              : '這個時辰無人在外走動，一時無話。';
        for (const c of cast) if (!c.dead) applyRoundHealth(c, false, 0); // everyone rests → recover
        log(`  〔過場〕${roundRec.passLine}`);
        return roundRec;
    }

    // (b) PASS A — placement + solo tools (each active char is an agent).
    const ordered = [...active].sort((x, y) => (tension(hottest(y) ?? zeroW()) - tension(hottest(x) ?? zeroW())));
    for (const c of ordered) {
        const from = c.venue;
        const pull = rhythmPull(c, part, reh);
        const hot = hottest(c);
        const hotTarget = hot?.target;
        const query = hot ? `${hot.desc}${hot.target ? ' ' + hot.target : ''}` : c.persona;
        out.timeToolUses.n += 1; // the grounding time query (every turn orients to 時辰)
        const autoRecall = await doRecall(c, query, recall, clock.day, tags, hotTarget, 'plan', hot?.desc ?? '', out.surfaced);

        const preview = cast.filter((o) => o.id !== c.id && !o.dead && o.venue === (pull.venue ?? c.venue));
        const plan = await planner.plan({ char: c, byId, present: preview, clock, night, pull, recalled: autoRecall, reh });

        let interactIntent: Placement['interactIntent'] = null;
        let timeQueried = true;
        let moved = false;
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
                if (t.target) interactIntent = { target: t.target, intent: t.intent ?? '說幾句話' };
            }
        }
        // Default rhythm placement if the agent didn't move (rhythm is the pull).
        if (!moved && pull.venue && c.venue !== pull.venue) c.venue = pull.venue;

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
    }

    // rehearsal gathering proof: troupe co-located at a work venue this 時辰.
    if (reh.announced) {
        for (const v of ['雲錦台戲台', '練功房']) {
            const members = active.filter((c) => c.occupation === 'troupe' && c.venue === v).map((c) => c.name);
            if (members.length >= 2) out.rehearsalGathering.push({ tick: clock.currentTick, part, venue: v, members });
        }
    }

    // (c)+(d) PASS B — group by venue, run CONCURRENT scenes (dedup pairs, cap).
    const scenes: SceneRecord[] = [];
    const venuesWithActive = [...new Set(active.map((c) => c.venue))];
    for (const venue of venuesWithActive) {
        const members = active.filter((c) => c.venue === venue);
        for (const p of roundRec.placements) {
            if (scenes.length >= deps.maxScenesPerRound) break;
            if (!p.interactIntent) continue;
            const a = byName.get(p.char);
            if (!a || a.venue !== venue || a.sceneThisRound) continue;
            const b = byName.get(p.interactIntent.target) ?? [...byName.values()].find((x) => p.interactIntent!.target.includes(x.name));
            if (!b || b.dead) continue;
            const coPresent = members.some((m) => m.id === b.id);
            if (!coPresent) {
                // MISSED CONNECTION — but never a phantom after they already met today.
                if (!a.addressedToday.has(b.id)) {
                    log(`    · ${a.name} 想在 ${venue} 找 ${b.name}，撲了個空（${b.name}此刻在 ${b.venue}）。`);
                }
                continue;
            }
            if (b.sceneThisRound) continue;
            const scene = await doInteract(a, b, p.interactIntent.intent, clock, night, agent, recall, tags, out.surfaced);
            scenes.push(scene);
            log(`    · ${a.name}×${b.name} @ ${venue}${scene.isPrivate ? '（私）' : ''}${scene.consummate ? '〔床〕' : ''} — ${scene.beats.length} 拍${scene.resolved.length ? `，了結：${scene.resolved.join('；')}` : ''}`);
            for (const bt of scene.beats) log(`         ${bt.name}：${bt.text}`);
            // EPISODIC MEMORY for co-present OBSERVERS (what they saw others do).
            const first = scene.beats[0];
            for (const obs of members) {
                if (obs.id === a.id || obs.id === b.id || obs.dead) continue;
                await writeMem(recall, obs.id, `第${clock.day}日·${clock.partOfDay}，我在${venue}看見${a.name}同${b.name}${first ? `：${first.text.slice(0, 36)}` : '對上了話'}。`, 3, clock.day);
            }
        }
    }
    roundRec.scenes = scenes;
    roundRec.sceneVenues = [...new Set(scenes.map((s) => s.venue))];

    // (e) WEAVE the 時辰's PUBLIC scenes into one 章回.
    const publicScenes = scenes.filter((s) => s.isPublic);
    if (publicScenes.length) {
        const lines = publicScenes.flatMap((s) => s.beats.map((b) => `[${s.venue}] ${b.name}：${b.text}`));
        try {
            roundRec.chapter = await agent.weaveTickChapter({ clock: `第${clock.day}日·${part}`, lines });
        } catch {
            roundRec.chapter = null;
        }
    }

    // health for the round: active drain, others recover.
    for (const c of cast) {
        if (c.dead) continue;
        const inScenes = scenes.filter((s) => s.participants.includes(c.name)).length;
        const died = applyRoundHealth(c, active.includes(c), inScenes);
        if (died) {
            roundRec.deaths.push(c.name);
            log(`  〔歿〕${c.name} 積勞成疾，油盡燈枯，歿於第${clock.day}日·${part}。`);
        }
    }

    // (f) 深宵 = scheduled night consolidation for everyone, then per-day reset.
    if (deep) {
        for (const c of cast) {
            if (c.dead) continue;
            const updated = await nightConsolidate(c, byId, clock.day, clock.currentTick, agent, castNames);
            if (updated.length) roundRec.consolidations.push({ char: c.name, updated });
            decayWants(c.wants);
        }
        for (const c of cast) {
            c.todayLedger.clear();
            c.scenesToday = 0;
            c.addressedToday.clear();
        }
        log(`  ── 第${clock.day}日終（深宵覆蓋自我模型 + 心事自改 + 反省）──`);
    } else {
        for (const c of active) decayWants(c.wants);
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
    const out = { surfaced: [] as SurfacedMemory[], rehearsalGathering: [] as SeasonResult['rehearsalGathering'], timeToolUses: { n: 0 } };
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
    }
    return {
        rounds,
        scenes: allScenes,
        surfaced: out.surfaced,
        reh: deps.reh,
        rehearsalGathering: out.rehearsalGathering,
        timeToolUses: out.timeToolUses.n,
        deaths,
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
    if (t.tool === 'recall') return `recall(${t.query ?? ''})`;
    return 'time';
}

let _zero: Want | null = null;
function zeroW(): Want {
    if (!_zero) _zero = { weight: 0, sat: 0 } as Want;
    return _zero;
}
