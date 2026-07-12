/**
 * Living-want self-rewrite — the VALIDATED mechanism promoted out of
 * experiments/rewrite-ab.ts into the engine core (RUNNER_V2 §9 "活的想要"; A/B
 * result: cross-tick repetition 0.536 → 0.235, zero-forcing self-organization,
 * budget held, provenance ~100%). Meaning becomes character-owned; numbers stay
 * engine-owned.
 *
 * Pure + node-clean: this module holds the reply SHAPE and the deterministic
 * `applyRewrite` that mutates a want ledger. The LLM call that PRODUCES a reply
 * lives behind SceneAgentPort.rewriteWantLedger (fake or runner adapter). This is
 * scene-scoped by construction — the caller only ever hands a character what it
 * just did / the one scene it was in, so omniscience can't leak in.
 */

import { newWant, type Want } from './want-core.ts';

/** One decision about a single existing want after a scene/action closes. */
export interface RewriteDecision {
    id: string;
    action: 'keep' | 'mutate' | 'close';
    /** New ≤30-char first-person desc, only for `mutate`. */
    newDesc?: string;
    note?: string;
}

/** At most one newly-stirred thread the scene/action raised. */
export interface RewriteSpawn {
    desc: string;
    layer?: string;
}

/**
 * Input for world/lifecycle-driven want REGENERATION — distinct from the scene-scoped
 * rewrite above. This runs nightly for EVERY character, even one who had no scene, so a
 * character never flatlines once their personal arc resolves: a just-settled want can
 * seed its next phase (milestone → successor), and ambient pressure (the finale
 * deadline, being broke/hungry, the collective task, the year closing on a life that is
 * finite) can stir a fresh want. There is NO artificial floor — a want appears only if
 * one of these REAL pressures genuinely stirs one; a character with live wants and no
 * acute pressure gets nothing.
 */
export interface RegenerateWantInput {
    name: string;
    persona: string;
    secret?: string;
    coreIdentity: string[];
    /** the character's still-live wants (layer + desc). */
    liveWants: Array<{ layer: string; desc: string }>;
    /** descs of wants this character JUST resolved — the milestone → successor seed. */
    justResolved: string[];
    /** ambient EXTERNAL pressure: the finale deadline, being broke/hungry, the
     *  collective task — the world pressing on TA, not a personal want already held. */
    worldPressure: string;
    /** FINITUDE: seasons already lived, the year closing, chances thinning — the
     *  character knows time is limited (lifecycle awareness, the antidote to a want
     *  that drifts forever). */
    lifecycle: string;
    /** UNFINISHED LIFE THREADS: the character's own remembered threads FURTHEST
     *  from their current wants (orthogonal sample via pickOrthogonalThreads) —
     *  the door out of a single-axis loop where a resolved 台心 want forever
     *  spawns the next 台心 want. Optional; empty = source unavailable. */
    otherThreads?: string[];
}

/** Character-level n-grams of a Chinese text (punctuation/space stripped). */
function grams(s: string, n = 4): Set<string> {
    const clean = s.replace(/[\s「」『』，。！？；：、—…·()（）\[\]]/g, '');
    const out = new Set<string>();
    for (let i = 0; i + n <= clean.length; i++) out.add(clean.slice(i, i + n));
    return out;
}

/**
 * ORTHOGONAL THREAD SAMPLER — pick the K memories LEAST like the character's
 * current wants (lowest char-4-gram overlap; ties keep input order). This is the
 * mechanical diversity injection for want regeneration: a single-axis character's
 * persona/secret always point the same way, so the door to their OTHER life
 * threads (learning to read, the biscuit-tin savings, an unspoken debt) must be
 * opened from their own memory, not from the theme already burning. Pure.
 */
export function pickOrthogonalThreads(
    memories: ReadonlyArray<string>,
    wantDescs: ReadonlyArray<string>,
    k = 3,
): string[] {
    if (!memories.length) return [];
    const wantGrams = new Set<string>();
    for (const d of wantDescs) for (const g of grams(d)) wantGrams.add(g);
    const scored = memories.map((m, i) => {
        const g = grams(m);
        let hit = 0;
        for (const x of g) if (wantGrams.has(x)) hit += 1;
        return { m, i, overlap: g.size ? hit / g.size : 0 };
    });
    scored.sort((a, b) => a.overlap - b.overlap || a.i - b.i);
    return scored.slice(0, k).map((x) => x.m);
}

/** The full reply the agent returns for one character's ledger. */
export interface RewriteReply {
    decisions: RewriteDecision[];
    spawn?: RewriteSpawn;
}

/** What the agent needs to rewrite ONE character's ledger. Scene-scoped: the
 *  caller supplies only this character's own live wants + the single thing it
 *  just did (a scene's beats, or its own open action) — never the whole world. */
export interface RewriteLedgerInput {
    name: string;
    persona: string;
    secret?: string;
    /** The live wants being rewritten (id + layer + current desc). */
    wants: Array<{ id: string; layer: string; desc: string }>;
    /** Verbatim text of the ONE scene/action this rewrite reflects on. */
    sceneText: string;
}

/** A mutation/spawn/close record — feeds the desc-history report + counters. */
export interface LedgerEvent {
    tick: number;
    characterId: string;
    kind: 'mutate' | 'close' | 'spawn' | 'spawn-rejected';
    wantId: string;
    fromDesc?: string;
    toDesc?: string;
    note?: string;
}

const ROMANTIC_HOSTILE = /愛|情|戀|慕|恨|妒|怨|敵|仇|虧|愧|償/;

/** Best-effort JSON extraction from a possibly-noisy LLM reply (last valid
 *  brace-block wins). Shared by adapters that call an LLM for the reply. */
export function extractRewriteJson(raw: string): Record<string, unknown> | null {
    const blocks = raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(blocks[i]) as Record<string, unknown>;
        } catch {
            /* try an earlier block */
        }
    }
    return null;
}

/** Coerce a raw parsed object into a validated RewriteReply. */
export function coerceRewriteReply(obj: Record<string, unknown> | null | undefined): RewriteReply {
    const o = obj ?? {};
    const decisions: RewriteDecision[] = Array.isArray(o.decisions)
        ? (o.decisions as any[]).map((d) => ({
              id: String(d?.id ?? ''),
              action: (['keep', 'mutate', 'close'].includes(d?.action) ? d.action : 'keep') as RewriteDecision['action'],
              newDesc: typeof d?.newDesc === 'string' ? d.newDesc.trim() : undefined,
              note: typeof d?.note === 'string' ? d.note.trim() : undefined,
          }))
        : [];
    let spawn: RewriteSpawn | undefined;
    const sp = o.spawn as any;
    if (sp && typeof sp.desc === 'string' && sp.desc.trim()) {
        spawn = { desc: sp.desc.trim(), layer: typeof sp.layer === 'string' ? sp.layer.trim() : undefined };
    }
    return { decisions, spawn };
}

/**
 * Apply one character's living-want rewrite to the shared want ledger, in place.
 * Scalars (weight/sat/resistance) stay engine-owned and untouched; only the
 * `desc` text mutates, wants close, and at most one new thread spawns under a
 * ≤4-live-want budget. Every change is recorded in `events` for the counters.
 *
 * Pure aside from mutating `wants`/`events`; deterministic given its inputs.
 */
export function applyRewrite(
    wants: Want[],
    characterId: string,
    reply: RewriteReply,
    tick: number,
    events: LedgerEvent[],
    castNames: ReadonlyArray<string> = [],
): void {
    const byId = new Map(wants.map((w) => [w.id, w]));
    for (const d of reply.decisions) {
        const w = byId.get(d.id);
        if (!w || w.retired || w.characterId !== characterId) continue;
        if (d.action === 'mutate') {
            const nd = (d.newDesc ?? '').trim();
            if (nd && nd.length <= 30 && nd !== w.desc) {
                events.push({ tick, characterId, kind: 'mutate', wantId: w.id, fromDesc: w.desc, toDesc: nd, note: d.note });
                w.desc = nd; // scalars untouched — meaning changes, numbers don't
            }
        } else if (d.action === 'close') {
            events.push({ tick, characterId, kind: 'close', wantId: w.id, fromDesc: w.desc, note: d.note });
            w.retired = true;
            w.resolvedTick = tick;
            w.resolvedNote = d.note;
        }
    }
    // Spawn (max 1), enforcing the ≤4-live-want budget per character.
    if (reply.spawn) spawnWant(wants, characterId, reply.spawn, tick, events, castNames);
}

/**
 * Add at most one new want onto a shared ledger under the ≤4-live-want budget, deriving
 * target + resistance the SAME way for every caller (the scene-scoped rewrite AND the
 * nightly world/lifecycle regeneration). A romantic/hostile want that names another
 * character gets high resistance (8) so it cannot resolve in a single beat; everything
 * else gets the base 4. Records a spawn / spawn-rejected event. Returns whether a want
 * was actually added. Pure aside from mutating `wants`/`events`.
 */
export function spawnWant(
    wants: Want[],
    characterId: string,
    spawn: RewriteSpawn,
    tick: number,
    events: LedgerEvent[],
    castNames: ReadonlyArray<string> = [],
): boolean {
    const raw = spawn.desc.trim();
    // A want desc is a short label — an over-long line is TRUNCATED to 30, never dropped,
    // so a genuine want (e.g. a forced regeneration for a wantless character) can't be lost
    // to verbosity. Only the ≤4-live budget can still reject a spawn.
    const desc = raw.length > 30 ? raw.slice(0, 30) : raw;
    const liveNow = wants.filter((w) => !w.retired && w.characterId === characterId).length;
    if (desc.length > 0 && liveNow < 4) {
        const namesOther = castNames.some((n) => n !== characterId && desc.includes(n));
        const hot = ROMANTIC_HOSTILE.test(desc) || ROMANTIC_HOSTILE.test(spawn.layer ?? '');
        const resistance = namesOther && hot ? 8 : 4;
        const target = castNames.find((n) => n !== characterId && desc.includes(n));
        const w = newWant({
            characterId,
            layer: spawn.layer || '其他',
            desc,
            target,
            weight: 0.5,
            sat: 0.2,
            resistance,
            kind: 'narrative',
            source: 'owner',
            bornTick: tick,
        });
        wants.push(w);
        events.push({ tick, characterId, kind: 'spawn', wantId: w.id, toDesc: desc, note: `layer=${w.layer} R=${resistance}` });
        return true;
    }
    if (raw.length > 0) {
        // With truncation, the only remaining rejection is a full ledger.
        events.push({ tick, characterId, kind: 'spawn-rejected', wantId: '-', toDesc: raw, note: 'budget≥4' });
    }
    return false;
}
