/**
 * Felt layer — project the want ledger into directed relationship edges.
 *
 * A want with a target IS a declared feeling (白韻秋 愛→柳生春), so the graph
 * should not have to re-infer it from scene prose. The lived layer
 * (relationship-evolve seeds, judged from enacted scenes) stays the record of
 * what interaction did to a tie; this layer is the character's inner ground
 * truth. Both flow through the same read seam and coexist per (pair, tone):
 * 白→柳 can be 戀慕 (felt) AND 戒備 (lived) at once — feelings are composite.
 *
 * Mechanical (no LLM): layer tag → tone lookup, composite tags (愛/妒) fan out
 * to several tones, edge weight tracks the want's live tension. Non-relational
 * layers (志/職/日常/…) project nothing — a want ABOUT someone is not yet a
 * feeling TOWARD them.
 */

import type { RelationshipEdge, RelationshipTone } from '@endless-story/shared';
import { normalizeLayer, type Want } from './want-core.ts';

/** Relational feeling tags → tone. Everything absent here projects no edge. */
const LAYER_TONE: ReadonlyArray<[RegExp, RelationshipTone]> = [
    [/愛|情|戀|慕/, 'romance'],
    [/護|虧欠|恩/, 'affection'],
    [/妒|疑/, 'tension'],
    [/怨|恨/, 'estrangement'],
];

/** Only wants still hot enough to color the graph project an edge. */
const TENSION_FLOOR = 0.15;

export function tonesForLayer(rawLayer: string | undefined): RelationshipTone[] {
    const layer = normalizeLayer(rawLayer);
    if (layer === '其他') return [];
    const tones: RelationshipTone[] = [];
    // Composite tags (愛/妒) carry several feelings at once — fan out per part.
    for (const part of layer.split(/[/／·、]/)) {
        for (const [re, tone] of LAYER_TONE) {
            if (re.test(part) && !tones.includes(tone)) tones.push(tone);
        }
    }
    return tones;
}

export interface ProjectOptions {
    /** Resolve a want's free-text target (a NAME like 柳生春, or an id) to a
     *  character id; return undefined to skip the want. */
    resolveTargetId: (target: string) => string | undefined;
    /** Narrative day stamped on the edges (edges require lastUpdatedDay). */
    currentDay?: number;
}

/**
 * Pure projection: wants → directed felt edges. Deterministic, read-side only
 * (never writes the store or the chain). Same (from,to,tone) from several wants
 * keeps the strongest.
 */
export function projectWantEdges(wants: readonly Want[], opts: ProjectOptions): RelationshipEdge[] {
    const byKey = new Map<string, RelationshipEdge>();
    for (const w of wants) {
        if (w.retired || !w.target) continue;
        const tension = w.weight * (1 - w.sat);
        if (tension < TENSION_FLOOR) continue;
        const toId = opts.resolveTargetId(w.target.trim());
        if (!toId || toId === w.characterId) continue;
        for (const tone of tonesForLayer(w.layer)) {
            const weight = Math.max(1, Math.min(10, Math.round(tension * 10)));
            const edge: RelationshipEdge = {
                fromId: w.characterId,
                toId,
                tone,
                weight,
                label: w.layer,
                // The want in the character's own words is the hover quote.
                summary: w.desc,
                lastUpdatedDay: opts.currentDay ?? 0,
                origin: 'felt',
            };
            const key = `${edge.fromId}::${edge.toId}::${tone}`;
            const prev = byKey.get(key);
            if (!prev || edge.weight > prev.weight) byKey.set(key, edge);
        }
    }
    return [...byKey.values()];
}

/**
 * Read seam: merge lived (chain) edges with felt projections. Distinct tones on
 * the same pair coexist; the same (from,to,tone) keeps the heavier edge (a lived
 * seed that already carries scene history beats a projection of equal strength).
 */
export function mergeFeltEdges(
    lived: readonly RelationshipEdge[],
    felt: readonly RelationshipEdge[],
): RelationshipEdge[] {
    const byKey = new Map<string, RelationshipEdge>();
    for (const e of lived) {
        byKey.set(`${e.fromId}::${e.toId}::${e.tone ?? 'none'}`, e);
    }
    for (const e of felt) {
        const key = `${e.fromId}::${e.toId}::${e.tone ?? 'none'}`;
        const prev = byKey.get(key);
        if (!prev || e.weight > prev.weight) byKey.set(key, e);
    }
    return [...byKey.values()];
}
