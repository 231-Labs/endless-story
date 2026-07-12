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
export type SceneAgent = Pick<typeof CharacterAgentNs, 'actBeat' | 'judgeWantResolved'>;

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
    /** This member's OWN canon feeling toward each co-present member, keyed by
     *  their characterId (e.g. 你對TA：師承). From the lived+felt graph, never
     *  the reverse edge — no omniscience about others' feelings. */
    ties?: Record<string, string>;
}

export interface SceneLoopInput {
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
    /** Saga emotional stance; 'consummate' unlocks the adult beat register
     *  when (and only when) the intimacy gate opens for a beat. */
    emotionalStance?: string;
    cast: SceneLoopCastMember[];
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
    /** Injectable agent (composition tests script it); omit → runner LLM agent. */
    agent?: SceneAgent;
}

export interface SceneBeat {
    sceneId: string;
    characterId: string;
    name: string;
    text: string;
    inner: string;
    addressed?: string;
}

export interface SceneLoopResult {
    beats: SceneBeat[];
    /** Characters who asked to leave, with their destination scene name. */
    moves: Array<{ characterId: string; toSceneName: string }>;
    /** Wants answered irreversibly this scene (already retired). */
    resolved: Array<{ want: Want; note?: string }>;
    /** Everyone who acted (feeds the actor-fatigue ledger). */
    actedCharacterIds: string[];
    /** True when some beat ran privateAlone on a love-layer want — the ex-ante
     *  intimacy gate. Content rating (ex post) is the caller's judge call. */
    intimacyGateOpened: boolean;
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
    const result: SceneLoopResult = { beats: [], moves: [], resolved: [], actedCharacterIds: [], intimacyGateOpened: false };
    const present = [...input.cast];
    if (present.length === 0) return result;
    const agent = input.agent ?? (await defaultAgent());

    const solo = present.length === 1;
    // A consummate scene (established lovers, private, at night) earns MANY more beats —
    // it is the emotional/physical climax and needs room to actually escalate into a real
    // dramatic scene, not fade at the threshold. The bed-probe (bed-probe-long.ts) showed
    // ~24 beats still escalate without degrading. TUNABLE via SEASON_BED_CAP (default 16);
    // a hard ceiling of 32 keeps cost BOUNDED (never runaway). Restrained/public stay tight.
    const consummateCap = Math.min(32, Math.max(1, Math.floor(Number(process.env.SEASON_BED_CAP ?? '16')) || 16));
    const maxTurns = input.maxTurns ?? (solo ? 1 : input.emotionalStance === 'consummate' ? consummateCap : input.isPrivate ? 5 : 4);
    const log: string[] = [];
    const actedWants = new Map<string, Want>();
    /** In-scene beat counts — feeds turn routing so a duel can't monopolize. */
    const beatsBy = new Map<string, number>();

    let actor: SceneLoopCastMember | undefined = present.reduce((b, c) => {
        const wb = hottestOf(input.wants, b.characterId);
        const wc = hottestOf(input.wants, c.characterId);
        return (wc ? tension(wc) : -1) > (wb ? tension(wb) : -1) ? c : b;
    });

    for (let turn = 0; turn < maxTurns; turn++) {
        if (!actor) break;
        const w = hottestOf(input.wants, actor.characterId);
        if (!w) break;
        w.heat += 1;
        const effR = effectiveResistance(w, { isPrivate: input.isPrivate, cast: present });
        const others = present.filter((c) => c.characterId !== actor!.characterId);
        // A consummate scene = established lovers, private, the two of them alone. Their
        // love-want may already be SETTLED (e.g. the debt got reckoned earlier that day),
        // so we do NOT require a live 愛/情 want to open the intimacy register — old lovers
        // going to bed need no unmet want to justify it. This is safely scoped: the
        // 'consummate' stance is only ever set for the established-lover night 床 scene.
        const consummateScene =
            input.emotionalStance === 'consummate' && input.isPrivate && present.length === 2;
        const privateAlone =
            input.isPrivate &&
            present.length === 2 &&
            (consummateScene || (!!w.target && others.some((o) => o.name === w.target || o.characterId === w.target)));
        const gateBeat = privateAlone && (consummateScene || /愛|情/.test(w.layer));
        if (gateBeat) result.intimacyGateOpened = true;

        const r = await agent.actBeat({
            name: actor.name,
            persona: actor.persona,
            memories: actor.memories,
            tone: input.tone,
            clock: input.clock,
            sceneName: input.sceneName,
            sceneHint: input.sceneHint,
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
            etiquette: input.etiquette,
            consummate: gateBeat && input.emotionalStance === 'consummate',
        });

        log.push(`${actor.name}：${r.beat}`);
        result.beats.push({
            sceneId: input.sceneId,
            characterId: actor.characterId,
            name: actor.name,
            text: r.beat,
            inner: r.inner,
            addressed: r.addressed,
        });
        if (!result.actedCharacterIds.includes(actor.characterId)) result.actedCharacterIds.push(actor.characterId);
        actedWants.set(w.id, w);
        beatsBy.set(actor.characterId, (beatsBy.get(actor.characterId) ?? 0) + 1);

        w.recent += 1;
        w.sat = Math.min(1, w.sat + satGainFor(w, input.isPrivate));
        if (forcingPressure(w) >= effR) w.frust += 1;
        if (w.recent >= WANT.saturateAt) w.sat = Math.min(1, w.sat + WANT.saturationBump);

        if (r.move && r.move !== input.sceneName) {
            result.moves.push({ characterId: actor.characterId, toSceneName: r.move });
            const idx = present.findIndex((c) => c.characterId === actor!.characterId);
            if (idx >= 0) present.splice(idx, 1);
            if (present.length < 2) break;
            actor = present[0];
            continue;
        }
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
        const effR = effectiveResistance(w, { isPrivate: input.isPrivate, cast: input.cast });
        if (forcingPressure(w) < effR) continue;
        const owner = input.cast.find((c) => c.characterId === w.characterId);
        if (!owner) continue;
        const verdict = await agent.judgeWantResolved({
            name: owner.name,
            wantDesc: w.desc,
            beats: log,
        });
        if (verdict.resolved) {
            applyBeat(w, input.wants, { gain: '小', resolved: true, resolvedNote: verdict.note }, input.tick);
            result.resolved.push({ want: w, note: verdict.note });
        }
    }

    return result;
}
