/**
 * Scene interaction loop — orchestrates one scene's multi-beat exchange per tick
 * (§2.48): co-present characters take turns as open actions, each responding to
 * whoever was addressed; the engine updates wants (satGain, heat/frust, privacy-
 * dropped resistance §2.45) and judges resolution strictly (§2.31). Engine state
 * math lives here; all LLM calls live in runner (beat.ts). Server-only.
 */

import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';
import { pickNextActor } from './scene-routing.ts';

/** The two agent calls a scene needs — injectable so composition tests can run
 *  the REAL loop with a scripted agent (no LLM, no runner resolution). */
export type SceneAgent = Pick<typeof CharacterAgentNs, 'actBeat' | 'judgeWantResolved'> & {
    /** Stateless repair lane for a proposal rejected by objective validation.
     *  The rejected draft must not enter the character's durable session. */
    replanBeat?: typeof CharacterAgentNs.actBeat;
};

/** Production default: resolved lazily so importing this module stays
 *  node-clean (the runner package uses `.js` specifiers node --test can't load). */
async function defaultAgent(): Promise<SceneAgent> {
    const mod = await import('@endless-story/runner');
    return mod.characterAgent;
}
import {
    WANT,
    applyBeat,
    forcingPressure,
    isBondLayer,
    tension,
    type Want,
} from './want-core.ts';

export interface SceneLoopCastMember {
    characterId: string;
    name: string;
    persona: string;
    memories?: string[];
    stateLine?: string;
    /** This character's own private inner-life secret; never another actor's. */
    innerSecret?: string;
    /** 行當 — shown to co-present speakers so address forms have footing. */
    role?: string;
    /** Items this member carries (隨身物). `from` = giver's name/id. The SALIENCE
     *  GATE decides per scene whether an item is even mentioned to the actor:
     *  a gift surfaces when its giver is co-present; anything else only through
     *  a low-frequency deterministic ambient window. Bringing one out remains
     *  the character's own in-scene choice. */
    carried?: Array<{ desc: string; from?: string; newUntil?: number }>;
    /** Short in-world phrase for this member's 身/sex — threaded into the intimacy
     *  register so a consummate beat is gender-correct for ANY pairing (data-driven,
     *  never name-special-cased). */
    bodyFact?: string;
    /** STANDING for the advance affordance (bond-gated by the caller): without
     *  it the world simply never deals this actor the advance card — courting
     *  happens through scenes and confidences first. Default true (probes). */
    advanceReady?: boolean;
    /** This member's OWN canon feeling toward each co-present member, keyed by
     *  their characterId (e.g. 你對TA：師承). From the lived+felt graph, never
     *  the reverse edge — no omniscience about others' feelings. */
    ties?: Record<string, string>;
    /** Actor-specific objective affordances at this venue. */
    objects?: Array<{ id: string; label: string; state?: string; container?: string }>;
    sceneHint?: string;
    /** Pre-scoped season money ledger (own purse / authorized treasury view /
     *  contract terms / purchasable items here); refreshed by beforeBeat. */
    economyLine?: string;
}

export interface SceneLoopInput {
    /** Saga namespace for persistent character-session isolation. */
    sagaId?: string;
    sceneId: string;
    sceneName: string;
    /** The venue's physical description (anti-teleport grounding for beats). */
    sceneHint?: string;
    isPrivate: boolean;
    clock: string;
    /** External pressure line, injected on the first beat only. */
    stake?: string;
    /** Saga tone line (profile/soul). */
    tone?: string;
    /** Canon honorifics facts (identity guardrail). */
    etiquette?: string;
    timeCharter?: string;
    /** Saga emotional stance; 'consummate' unlocks the adult beat register
     *  when (and only when) the intimacy gate opens for a beat. */
    emotionalStance?: string;
    cast: SceneLoopCastMember[];
    /** Full formal cast vocabulary for detecting stale-session vocatives. */
    castNames?: string[];
    /** The saga's full want array (live + retired; mutated in place). */
    wants: Want[];
    tick: number;
    /** Turn caps; defaults match §2.48 (private scenes run longer). */
    maxTurns?: number;
    /** This scene CONTINUES a still-warm encounter (same pair, same private venue,
     *  the immediately preceding tick): the first beat picks up mid-moment — no fresh
     *  entrance, no re-locking the door. Keyed purely on (pair, venue, consecutive
     *  tick) by the caller — fully general. */
    continuation?: boolean;
    /** The last beats of the prior scene in a continuation, as opening context. */
    priorTail?: string;
    /** Open the scene on THIS member (e.g. a confider must say their piece on
     *  page — the first rendered beat was landing on the listener's reaction,
     *  so the confidence itself never transferred). Later turns route normally. */
    firstActorId?: string;
    /** Injectable agent (composition tests script it); omit → runner LLM agent. */
    agent?: SceneAgent;
    /** Refresh actor-specific affordances immediately before each turn. */
    beforeBeat?: (actor: SceneLoopCastMember) => void | Promise<void>;
    /** Validate/commit structured side effects immediately after each beat so
     * the next actor sees the new world, not the scene's starting snapshot. */
    onBeat?: (beat: SceneBeat) => void | Promise<void>;
}

export interface SceneBeat {
    sceneId: string;
    characterId: string;
    name: string;
    text: string;
    inner: string;
    addressed?: string;
    audience?: 'scene' | 'addressed';
    objectEffects?: CharacterAgentNs.BeatObjectEffect[];
    economyCommands?: CharacterAgentNs.BeatEconomyCommand[];
}

export interface SceneLoopResult {
    beats: SceneBeat[];
    /** @deprecated Cross-scene movement is committed before scene play through
     *  decideMove. Kept empty for snapshot/API compatibility. */
    moves: Array<{ characterId: string; toSceneName: string }>;
    /** Wants answered irreversibly this scene (already retired). */
    resolved: Array<{ want: Want; note?: string }>;
    /** Everyone who acted (feeds the actor-fatigue ledger). */
    actedCharacterIds: string[];
    /** True when some beat ran privateAlone on a love-layer want — the ex-ante
     *  intimacy gate. Content rating (ex post) is the caller's judge call. */
    intimacyGateOpened: boolean;
    /** An in-scene advance→accept happened: the pair BECAME lovers here (an
     *  event, not a verdict) — callers record it as established. */
    intimacyAccepted: boolean;
    /** Beat index where the accept landed (for the on-page 床 test). */
    acceptedAtBeat?: number;
    /** Who dropped the curtain (their close beat), if anyone. */
    closedBy?: string;
    /** How it ended: their close / the hour ran out / people drained away. */
    endReason?: 'close' | 'hour' | 'drained';
}

/** §2.45: privacy drops the wall — alone with the want's target in a private
 *  scene, resistance falls by 3 (floor 2). Derived, not a knob. */
export function effectiveResistance(w: Want, input: Pick<SceneLoopInput, 'isPrivate' | 'cast'>): number {
    if (!input.isPrivate || input.cast.length !== 2 || !w.target) return w.resistance;
    const other = input.cast.find((c) => c.characterId !== w.characterId);
    return other && (w.target === other.name || w.target === other.characterId)
        ? Math.max(2, w.resistance - 3)
        : w.resistance;
}

type EffLevel = 'idle' | 'pressing' | 'edge' | 'breaking';
function levelAt(w: Want, effR: number): EffLevel {
    const p = forcingPressure(w);
    if (p >= effR + WANT.breakingMargin) return 'breaking';
    if (p >= effR) return 'edge';
    if (p >= effR * WANT.pressingAt) return 'pressing';
    return 'idle';
}

/** §2.46: public crumbs never feed a love want — it stays hungry until private. */
function satGainFor(w: Want, isPrivate: boolean): number {
    const isLove = /愛|情/.test(w.layer);
    return isLove && !isPrivate ? 0.05 : 0.16;
}

const hottestOf = (wants: ReadonlyArray<Want>, characterId: string): Want | null => {
    let best: Want | null = null;
    for (const w of wants) {
        if (w.retired || w.characterId !== characterId) continue;
        if (!best || tension(w) > tension(best)) best = w;
    }
    return best;
};

/** SALIENCE GATE for carried items (隨身物): mention an item to its carrier only
 *  when the scene gives it a reason to exist — its GIVER is co-present — or through
 *  a sparse deterministic ambient window (~1 in 4 scenes), so a keepsake colours
 *  the scenes it belongs in without hijacking every beat (gift-probe: a naive
 *  every-beat mention put the fan in 5/6 beats of an accounting talk). */
function carriedInScene(
    actor: SceneLoopCastMember,
    others: SceneLoopCastMember[],
    tick: number,
): string[] | undefined {
    if (!actor.carried?.length) return undefined;
    const out: string[] = [];
    for (let i = 0; i < actor.carried.length; i++) {
        const it = actor.carried[i];
        const giverHere = !!it.from && others.some((o) => o.name === it.from || o.characterId === it.from);
        // A JUST-RECEIVED item stays on the mind for its first ticks (a fan's gift
        // from OUTSIDE the cast has no co-present giver — this window is its way in).
        const fresh = it.newUntil != null && tick < it.newUntil;
        let h = tick + i * 7;
        for (const ch of actor.characterId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const ambient = h % 4 === 0;
        if (giverHere || fresh || ambient) out.push(it.desc);
    }
    return out.length ? out : undefined;
}

export async function runSceneLoop(input: SceneLoopInput): Promise<SceneLoopResult> {
    const result: SceneLoopResult = { beats: [], moves: [], resolved: [], actedCharacterIds: [], intimacyGateOpened: false, intimacyAccepted: false };
    const present = [...input.cast];
    if (present.length === 0) return result;
    const agent = input.agent ?? (await defaultAgent());

    const solo = present.length === 1;
    // A register scene has NO narrative cap: the close beat is the one true exit — the
    // pair decides where the night ends (a M/F first night self-closed at 11; a F/F
    // 16-beat psychological duel hit the old wall still clothed). What remains is a
    // RUNAWAY BACKSTOP only (cost fuse, never a curtain): default 32, hard 64.
    // TUNABLE via SEASON_BED_CAP. Restrained/public scenes stay tight.
    const consummateCap = Math.min(64, Math.max(1, Math.floor(Number(process.env.SEASON_BED_CAP ?? '32')) || 32));
    let maxTurns = input.maxTurns ?? (solo ? 1 : input.emotionalStance === 'consummate' ? consummateCap : input.isPrivate ? 5 : 4);
    const log: string[] = [];
    const actedWants = new Map<string, Want>();
    /** In-scene beat counts — feeds turn routing so a duel can't monopolize. */
    const beatsBy = new Map<string, number>();

    let actor: SceneLoopCastMember | undefined =
        (input.firstActorId && present.find((c) => c.characterId === input.firstActorId)) ||
        present.reduce((b, c) => {
            const wb = hottestOf(input.wants, b.characterId);
            const wc = hottestOf(input.wants, c.characterId);
            return (wc ? tension(wc) : -1) > (wb ? tension(wb) : -1) ? c : b;
        });

    // In-scene intimacy negotiation (no judge, no status gate): an 'advance'
    // puts an overture on the table; the OTHER's 'accept' opens the register,
    // a 'decline' clears it — both honoured. Seed-established pairs at night
    // start with the register open (old lovers renegotiate nothing).
    let registerOpen = input.emotionalStance === 'consummate' && input.isPrivate;
    let pendingAdvanceBy: string | null = null;
    for (let turn = 0; turn < maxTurns; turn++) {
        if (!actor) break;
        await input.beforeBeat?.(actor);
        let w = hottestOf(input.wants, actor.characterId);
        let synthetic = false;
        if (!w) {
            // A settled heart still finishes the scene: an actor with NO live want
            // (e.g. everything resolved that morning) acts on presence alone instead
            // of KILLING the scene mid-exchange (the 大會串 once died at 1 beat
            // because the lead's wants were all retired by noon). Synthetic want:
            // no ledger bookkeeping, pure presence.
            synthetic = true;
            w = {
                id: `presence-${actor.characterId}`,
                characterId: actor.characterId,
                layer: '當下',
                desc: '把眼前這一場好好走完',
                weight: 0.3,
                sat: 0.5,
                sat0: 0.5,
                resistance: 6,
                heat: 0,
                frust: 0,
                recent: 0,
                kind: 'narrative',
                source: 'genesis',
                bornTick: input.tick,
            };
        }
        if (!synthetic) w.heat += 1;
        const effR = effectiveResistance(w, { isPrivate: input.isPrivate, cast: present });
        const others = present.filter((c) => c.characterId !== actor!.characterId);
        // A consummate scene = established lovers, private, the two of them alone. Their
        // love-want may already be SETTLED (e.g. the debt got reckoned earlier that day),
        // so we do NOT require a live 愛/情 want to open the intimacy register — old lovers
        // going to bed need no unmet want to justify it. This is safely scoped: the
        // 'consummate' stance is only ever set for the established-lover night 床 scene.
        const consummateScene = (registerOpen || (input.emotionalStance === 'consummate' && input.isPrivate)) && present.length === 2;
        const privateAlone =
            input.isPrivate &&
            present.length === 2 &&
            (consummateScene || (!!w.target && others.some((o) => o.name === w.target || o.characterId === w.target)));
        const gateBeat = privateAlone && (consummateScene || /愛|情/.test(w.layer));
        if (gateBeat) result.intimacyGateOpened = true;

        const beatInput: CharacterAgentNs.ActBeatInput = {
            sagaId: input.sagaId,
            characterId: actor.characterId,
            perceptId: input.sagaId ? `${input.sagaId}:t${input.tick}:${input.sceneId}:turn${turn}` : undefined,
            name: actor.name,
            persona: actor.persona,
            memories: actor.memories,
            tone: input.tone,
            clock: input.clock,
            sceneName: input.sceneName,
            sceneHint: actor.sceneHint ?? input.sceneHint,
            objects: actor.objects,
            isPrivate: input.isPrivate,
            others: others.map((o) => ({
                name: o.name,
                role: o.role,
                tie: actor!.ties?.[o.characterId],
                bodyFact: o.bodyFact,
            })),
            bodyFact: actor.bodyFact,
            carried: carriedInScene(actor, others, input.tick),
            // Continuation context rides only on the FIRST beat (picking up mid-moment);
            // later beats are the ongoing exchange and need no re-entry note.
            continuation: turn === 0 ? input.continuation : undefined,
            priorTail: turn === 0 ? input.priorTail : undefined,
            stake: turn === 0 ? input.stake : undefined,
            want: { desc: w.desc, target: w.target },
            forcing: levelAt(w, effR),
            privateAlone,
            sceneLog: log.slice(-5).join('\n'),
            stateLine: actor.stateLine,
            innerSecret: actor.innerSecret,
            economyLine: actor.economyLine,
            etiquette: input.etiquette,
            timeCharter: input.timeCharter,
            consummate: (registerOpen && input.isPrivate && present.length === 2) || (gateBeat && input.emotionalStance === 'consummate'),
            intimacyOffered: pendingAdvanceBy != null && pendingAdvanceBy !== actor.characterId,
            intimacyPossible: input.isPrivate && present.length === 2 && !registerOpen && actor.advanceReady !== false,
        };

        let r!: CharacterAgentNs.BeatResult;
        let acceptedBeat!: SceneBeat;
        let beatLanded = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                await input.beforeBeat?.(actor);
                beatInput.sceneHint = actor.sceneHint ?? input.sceneHint;
                beatInput.objects = actor.objects;
                beatInput.economyLine = actor.economyLine;
            }
            r = attempt > 0 && agent.replanBeat
                ? await agent.replanBeat(beatInput)
                : await agent.actBeat(beatInput);
            // There is exactly one authority for changing venue: the autonomous
            // movement phase that ran before this scene. It deals the character a
            // clamped list of scene ids, validates the choice, then commits the
            // roster transition. A free-text scene beat must never become a second,
            // unvalidated movement channel. Legacy models may still emit `move`;
            // reject that draft before it reaches onBeat/session/canon and replan
            // statelessly at the already-committed venue.
            if (r.move && r.move !== input.sceneName) {
                if (attempt >= 2) break;
                beatInput.physicalRejection =
                    `你的位置已在本 tick 的移動階段提交為「${input.sceneName}」。` +
                    `這一拍不能再前往「${r.move}」；若想離場，可 close 收住此場，下一 tick 再從合法選項決定去處。`;
                continue;
            }
            const structuredAddressee = r.addressed
                ? others.find((candidate) => r.addressed === candidate.name || r.addressed?.includes(candidate.name))
                : undefined;
            const openingVocative = (input.castNames ?? present.map((candidate) => candidate.name)).find((name) => {
                const aliases = [name, ...(name.length >= 3 ? [name.slice(1)] : [])];
                return aliases.some((alias) => {
                    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return new RegExp(`[「『“\"]\\s*${escaped}[，,：:]`).test(r.beat);
                });
            });
            if (
                (r.addressed && !structuredAddressee) ||
                (openingVocative && structuredAddressee && openingVocative !== structuredAddressee.name)
            ) {
                if (attempt >= 2) break;
                beatInput.physicalRejection =
                    `你這一拍的結構化對象是「${structuredAddressee?.name ?? r.addressed ?? '無'}」，` +
                    `但開口卻叫了「${openingVocative ?? r.addressed}」。只能回應此刻同場的人，不可混入上一場的對話對象。`;
                continue;
            }
            acceptedBeat = {
                sceneId: input.sceneId,
                characterId: actor.characterId,
                name: actor.name,
                text: r.beat,
                inner: r.inner,
                addressed: r.addressed,
                audience: r.audience,
                objectEffects: r.objectEffects,
                economyCommands: r.economyCommands,
            };
            try {
                await input.onBeat?.(acceptedBeat);
                beatLanded = true;
                break;
            } catch (error) {
                if (attempt >= 2) break;
                beatInput.physicalRejection = error instanceof Error ? error.message : String(error);
            }
        }

        // A beat that cannot satisfy world physics in three drafts does not get
        // to kill a live season: every guard held, nothing invalid entered
        // canon, and the stubborn intent simply fails to happen. The character
        // falls silent this beat; the log says so out loud (four live runs died
        // on this class of stalemate before this rule).
        if (!beatLanded) {
            log.push(`[跳拍] ${actor.name}這一拍三改仍違世界物理，沒能落地，只得按下不表。`);
            continue;
        }

        log.push(`${actor.name}：${r.beat}`);
        // DAWN PRESSURE (world fact, not a director): some pairs structurally cannot
        // close (an uncapped 金柳 replay rode its debt-loop straight into the 32 fuse,
        // sailing PAST its own perfect curtain). Deep into a register night the sky
        // starts paling in the scene log — the world states time, they decide the end.
        if (registerOpen && turn === Math.floor((consummateCap * 3) / 4)) {
            log.push('（夜已深透，天光快要透進來了）');
        }
        result.beats.push(acceptedBeat);
        if (!result.actedCharacterIds.includes(actor.characterId)) result.actedCharacterIds.push(actor.characterId);
        if (synthetic) {
            // presence-only beat: no want ledger to update
        }
        // Intimacy negotiation bookkeeping (their choices, honoured verbatim).
        if (input.isPrivate && present.length === 2) {
            if (r.intimacy === 'accept' && pendingAdvanceBy && pendingAdvanceBy !== actor.characterId) {
                registerOpen = true;
                result.intimacyAccepted = true;
                result.intimacyGateOpened = true;
                result.acceptedAtBeat = result.beats.length - 1;
                pendingAdvanceBy = null;
                // The register opened MID-scene: the cap must open with it, or the
                // world grants permission but not time (a negotiated first night was
                // getting cut at the 5-beat private default while seed-established
                // pairs enjoyed the full ceiling). Close remains their exit.
                if (!input.maxTurns && maxTurns < consummateCap) maxTurns = consummateCap;
            } else if (r.intimacy === 'decline') {
                pendingAdvanceBy = null;
            } else if (r.intimacy === 'advance') {
                pendingAdvanceBy = actor.characterId;
            }
        }
        // The actor's own ending: a close beat (sleep/farewell/enough) wraps the
        // scene — length is theirs, the cap above is only a ceiling.
        if (r.close) {
            result.closedBy = actor.name;
            result.endReason = 'close';
            break;
        }
        if (!synthetic) actedWants.set(w.id, w);
        beatsBy.set(actor.characterId, (beatsBy.get(actor.characterId) ?? 0) + 1);

        w.recent += 1;
        w.sat = Math.min(1, w.sat + satGainFor(w, input.isPrivate));
        if (forcingPressure(w) >= effR) w.frust += 1;
        if (w.recent >= WANT.saturateAt) w.sat = Math.min(1, w.sat + WANT.saturationBump);

        if (solo) break;

        const candidates = present.filter((c) => c.characterId !== actor!.characterId);
        const addressed = r.addressed
            ? candidates.find((c) => c.name === r.addressed || r.addressed!.includes(c.name))
            : undefined;
        const nextId = pickNextActor(
            candidates.map((c) => {
                const hot = hottestOf(input.wants, c.characterId);
                return {
                    characterId: c.characterId,
                    tension: hot ? tension(hot) : -1,
                    beatsTaken: beatsBy.get(c.characterId) ?? 0,
                    isAddressed: c.characterId === addressed?.characterId,
                };
            }),
        );
        actor = candidates.find((c) => c.characterId === nextId);
    }

    // H3d co-presence heat: a bond (love/debt) want warms just by sharing the
    // stage with its target, even when a rivalry was the scene's driver. Without
    // this a love want that never wins the driver seat stays frozen at idle and
    // never reaches the night pair / breaking. Applied once per scene, only when
    // the target is actually present, and skipped for a want already heated as
    // this scene's driver (actedWants) so it isn't double-counted.
    const presentIds = new Set(present.map((c) => c.characterId));
    const presentNames = new Set(present.map((c) => c.name));
    for (const w of input.wants) {
        if (w.retired || actedWants.has(w.id)) continue;
        if (!presentIds.has(w.characterId) || !isBondLayer(w.layer) || !w.target) continue;
        if (presentIds.has(w.target) || presentNames.has(w.target)) {
            w.heat += WANT.bondCopresenceHeat;
        }
    }

    // Strict resolve pass: only edge-level acted wants are even judged (§2.31).
    // Private is ALREADY easier (effR drops 3 in a private 2-person pair, §2.45),
    // so a heart/debt want tends to settle privately — without gating public
    // resolution behind breaking, which starves resolution when the night pair
    // fails to form (H3c: don't make public harder until the private path lands).
    for (const w of actedWants.values()) {
        if (w.retired) continue;
        // A targeted want is only judged where its target actually IS: a semantic
        // match once resolved 金鳳's debt-want inside a 江柳 scene (wrong person).
        if (w.target && !presentIds.has(w.target) && !presentNames.has(w.target)) continue;
        // RESOLUTION NEEDS HISTORY (anti vow-inflation): a matter of the heart is
        // not settled the first time it is touched — the want must have been truly
        // WORKED (≥4 acted beats over its life) before the judge is even consulted.
        // A ten-year debt was clearing in a single scene; every scene played like a
        // season finale because the fastest road to progress was an instant 終身誓.
        if (w.heat < 4) continue;
        const effR = effectiveResistance(w, { isPrivate: input.isPrivate, cast: input.cast });
        if (forcingPressure(w) < effR) continue;
        const owner = input.cast.find((c) => c.characterId === w.characterId);
        if (!owner) continue;
        const verdict = await agent.judgeWantResolved({
            name: owner.name,
            ownerBody: owner.bodyFact,
            wantDesc: w.desc,
            beats: log,
        });
        if (verdict.resolved) {
            applyBeat(w, input.wants, { gain: '小', resolved: true, resolvedNote: verdict.note }, input.tick);
            result.resolved.push({ want: w, note: verdict.note });
        }
    }

    if (!result.endReason) result.endReason = present.length < 2 ? 'drained' : 'hour';
    return result;
}
