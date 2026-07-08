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
    tension,
    type Want,
} from './want-core.ts';

export interface SceneLoopCastMember {
    characterId: string;
    name: string;
    persona: string;
    memories?: string[];
    stateLine?: string;
    /** 行當 — shown to co-present speakers so address forms have footing. */
    role?: string;
    /** This member's OWN canon feeling toward each co-present member, keyed by
     *  their characterId (e.g. 你對TA：師承). From the lived+felt graph, never
     *  the reverse edge — no omniscience about others' feelings. */
    ties?: Record<string, string>;
}

export interface SceneLoopInput {
    sceneId: string;
    sceneName: string;
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

export async function runSceneLoop(input: SceneLoopInput): Promise<SceneLoopResult> {
    const result: SceneLoopResult = { beats: [], moves: [], resolved: [], actedCharacterIds: [], intimacyGateOpened: false };
    const present = [...input.cast];
    if (present.length === 0) return result;
    const agent = input.agent ?? (await defaultAgent());

    const solo = present.length === 1;
    const maxTurns = input.maxTurns ?? (solo ? 1 : input.isPrivate ? 5 : 4);
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
        const privateAlone =
            input.isPrivate &&
            present.length === 2 &&
            !!w.target &&
            others.some((o) => o.name === w.target || o.characterId === w.target);
        const gateBeat = privateAlone && /愛|情/.test(w.layer);
        if (gateBeat) result.intimacyGateOpened = true;

        const r = await agent.actBeat({
            name: actor.name,
            persona: actor.persona,
            memories: actor.memories,
            tone: input.tone,
            clock: input.clock,
            sceneName: input.sceneName,
            isPrivate: input.isPrivate,
            others: others.map((o) => ({
                name: o.name,
                role: o.role,
                tie: actor!.ties?.[o.characterId],
            })),
            stake: turn === 0 ? input.stake : undefined,
            want: { desc: w.desc, target: w.target },
            forcing: levelAt(w, effR),
            privateAlone,
            sceneLog: log.slice(-5).join('\n'),
            stateLine: actor.stateLine,
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
