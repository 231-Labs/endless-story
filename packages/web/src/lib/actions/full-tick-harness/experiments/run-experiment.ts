/**
 * DRAMA-EFFECT ENGINE — parameterized runner.
 *
 * This is the narrative observatory (`narrative.harness.ts`) lifted from a hard-coded
 * world into a config-driven one. Given an `ExperimentConfig` it:
 *   1. seeds the world with the config's cast + stake (kind/targetIndex/capacity), via
 *      the extended `seedWorld` opts — so the dramatic SOIL is data, not code;
 *   2. installs the config's framing override (if any) on the event planner;
 *   3. runs `config.ticks` ticks of the real tick loop (`runTickLoopAction`), and per
 *      tick COLLECTS — instead of printing — ① chapters (POV + woven cut + gazette),
 *      ② a directed relationship-graph snapshot, ③ metrics (recall, edge/weight, tones);
 *   4. when `settle === 'relationship-evolve'`, evolves the directed tones from each
 *      tick's POVs first (`evolveRelationshipsFromScene`); when 'none', it skips the
 *      evolve step entirely (CONTROL — chapters only, no relationship overlay).
 *
 * It returns a structured `ExperimentResult` that `render-report.ts` turns into a
 * self-contained HTML report. Nothing here prints the narrative (the CLI logs only
 * progress) — the artifact IS the report.
 *
 * IMPORTANT — import order: this module imports `./narrative-setup` transitively first
 * (through the runner imports below) so the env + fake-client seam is installed before
 * the tick loop's sdk client is touched. Callers (lab.ts) must import THIS module before
 * anything that pulls the tick loop directly.
 */

// 1) Env + fake-chain seam FIRST (narrative-setup → narrative-env → harness-setup).
import {
    seedWorld,
    harnessChain,
    hasTextProviderKey,
} from '../narrative-setup';
import { CHAPTER_DUMP_DIR } from '../narrative-env';
// 2) The directed-relationship evolve + read-back (same as the observatory runner).
import {
    evolveRelationshipsFromScene,
    directedOutgoingEdges,
    type ScenePovInput,
    type EvolveRelationshipsResult,
} from '../relationship-evolve';
// 3) The framing-override seam on the event planner.
import { setFramingOverride } from '@/lib/chain/event-planner';
// 4) The tick loop + memory test hooks.
import { runTickLoopAction } from '@/lib/actions/tick-loop';
import { __drainNarrativeRecallHits, __resetNarrativeMemory } from '@/lib/chain/memory';
import { readdirSync, readFileSync } from 'node:fs';
import type { RelationshipTone } from '@endless-story/shared';
import type {
    CapturedChapter,
    ExperimentConfig,
    ExperimentResult,
    GraphEdge,
    GraphSnapshot,
    TickMetrics,
    TickRecord,
} from './types';

/* ── chapter-dump capture (woven cut 回 + gazette are NOT in TickLoopResult) ─────
 * Identical channel to narrative.harness.ts: the cut + gazette run in background-style
 * steps and dump to files; read the new ones each tick. */
const seenDumps = new Set<string>();

function readNewDumps(): CapturedChapter[] {
    if (!CHAPTER_DUMP_DIR) return [];
    let files: string[];
    try {
        files = readdirSync(CHAPTER_DUMP_DIR);
    } catch {
        return [];
    }
    const out: CapturedChapter[] = [];
    for (const f of files.sort()) {
        if (seenDumps.has(f) || !f.endsWith('.md')) continue;
        seenDumps.add(f);
        const m = f.match(/^d\d+-([a-z]+)-(.*)-\d+\.md$/);
        const kind = m?.[1] ?? '?';
        let body = '';
        try {
            body = readFileSync(`${CHAPTER_DUMP_DIR}/${f}`, 'utf8');
        } catch {
            /* ignore */
        }
        const divider = body.indexOf('\n---\n');
        const text = divider >= 0 ? body.slice(divider + 5).trim() : body.trim();
        const nameLine = body.match(/^# 〔[a-z]+〕(.+)$/m);
        out.push({ kind, name: (nameLine?.[1] ?? '').trim(), body: text });
    }
    return out;
}

/** id→name over the seeded fake cast. */
function castNameOf(id: string): string {
    return harnessChain.characters.get(id)?.name ?? `${id.slice(0, 8)}…`;
}

/** Snapshot the whole cast's directed relationship graph (nodes + edges). */
async function snapshotGraph(): Promise<GraphSnapshot> {
    const nodes = [...harnessChain.characters.values()].map((c) => ({ id: c.id, name: c.name }));
    const edges: GraphEdge[] = [];
    for (const c of harnessChain.characters.values()) {
        const outs = await directedOutgoingEdges(c.id, castNameOf).catch(() => []);
        for (const e of outs) {
            edges.push({
                fromId: c.id,
                fromName: c.name,
                toId: e.toId,
                toName: e.toName,
                tone: e.tone,
                weight: e.weight,
            });
        }
    }
    return { nodes, edges };
}

/** Tone distribution + totals over a graph snapshot. */
function metricsFor(
    graph: GraphSnapshot,
    recallHits: number,
    seededThisTick: number,
): TickMetrics {
    const toneCounts: Partial<Record<RelationshipTone, number>> = {};
    let weightSum = 0;
    for (const e of graph.edges) {
        toneCounts[e.tone] = (toneCounts[e.tone] ?? 0) + 1;
        weightSum += e.weight;
    }
    return {
        recallHits,
        edgeCount: graph.edges.length,
        weightSum,
        seededThisTick,
        toneCounts,
    };
}

/**
 * Evolve the directed tones from this tick's POVs (mirrors the observatory runner's
 * `evolveAndPrint`, but returns a count instead of printing). Returns the number of
 * directed edges seeded this tick across all of the tick's events.
 */
async function evolveFromTick(
    r: Awaited<ReturnType<typeof runTickLoopAction>>,
): Promise<number> {
    const povById = new Map<string, string>();
    for (const p of r.povs ?? []) {
        if (p.chapter && p.chapter.trim()) povById.set(p.characterId, p.chapter.trim());
    }
    const events = (r.storylets && r.storylets.length ? r.storylets : r.storylet ? [r.storylet] : [])
        .filter((s) => s && s.characterIds && s.characterIds.length >= 2);

    let seeded = 0;
    for (const ev of events) {
        // Include every co-present cast member (the beloved has no POV but must be a
        // valid edge target — same reasoning as the observatory runner).
        const sceneCast = harnessChain.scenes.get(ev.sceneId)?.characterIds ?? [];
        const allIds = Array.from(new Set([...ev.characterIds, ...sceneCast]));
        const participants: ScenePovInput[] = allIds.map((id) => ({
            characterId: id,
            name: castNameOf(id),
            pov: povById.get(id) ?? '',
        }));
        if (participants.filter((p) => p.pov).length < 2) continue;
        const res: EvolveRelationshipsResult = await evolveRelationshipsFromScene({
            participants,
            sceneId: ev.sceneId,
            eventLabel: ev.label,
        }).catch((e): EvolveRelationshipsResult => ({
            seeded: 0,
            proposed: 0,
            error: e instanceof Error ? e.message : String(e),
        }));
        seeded += res.seeded;
    }
    return seeded;
}

export interface RunExperimentOptions {
    /** progress callback (per-tick), so the CLI can show life without owning the loop. */
    onTick?: (tick: number, totalTicks: number, note: string) => void;
}

/**
 * Run one experiment end to end and return its structured result. No-throw per tick
 * (a tick that throws is recorded as an empty tick so the report still renders).
 */
export async function runExperiment(
    config: ExperimentConfig,
    options: RunExperimentOptions = {},
): Promise<ExperimentResult> {
    const onTick = options.onTick ?? (() => {});

    // Fresh memory + a world seeded around the config's stake/cast.
    __resetNarrativeMemory();
    seedWorld({
        cast: config.cast.count,
        withResource: true,
        stake: {
            kind: config.stake.kind,
            targetIndex: config.stake.targetIndex,
            capacity: config.stake.capacity,
        },
    });

    // Install the framing override (if any), interpolating {target} with the focus name.
    const target = harnessChain.characters.get(
        [...harnessChain.characters.keys()][
            Math.min(Math.max(0, config.stake.targetIndex), harnessChain.characters.size - 1)
        ],
    );
    if (config.framingOverride) {
        const label = config.framingOverride.replaceAll('{target}', target?.name ?? '那個人');
        setFramingOverride(label);
    } else {
        setFramingOverride(null);
    }

    const usedRealLLM = hasTextProviderKey();
    const perTick: TickRecord[] = [];

    try {
        for (let i = 0; i < config.ticks; i++) {
            const tick = i + 1;
            let r: Awaited<ReturnType<typeof runTickLoopAction>> | null = null;
            try {
                r = await runTickLoopAction({ povAll: true });
            } catch (e) {
                onTick(tick, config.ticks, `tick threw: ${e instanceof Error ? e.message : String(e)}`);
            }

            const recallHits = __drainNarrativeRecallHits();

            // ── chapters: POVs from the result + cut/gazette from the dump channel ──
            const chapters: CapturedChapter[] = [];
            for (const p of r?.povs ?? []) {
                if (p.chapter && p.chapter.trim()) {
                    chapters.push({ kind: 'pov', name: p.name, body: p.chapter.trim() });
                }
            }
            chapters.push(...readNewDumps());

            // ── events that opened this tick (context for the snapshot) ──
            const events = (r?.storylets && r.storylets.length ? r.storylets : r?.storylet ? [r.storylet] : [])
                .filter((s): s is NonNullable<typeof s> => Boolean(s))
                .map((s) => ({ label: s.label, names: s.names }));

            // ── evolve directed tones (unless this is the 'none' control) ──
            let seededThisTick = 0;
            if (config.settle === 'relationship-evolve' && r) {
                seededThisTick = await evolveFromTick(r);
            }

            // ── snapshot the directed graph AFTER the evolve step ──
            const graph = await snapshotGraph();
            const metrics = metricsFor(graph, recallHits, seededThisTick);
            perTick.push({ tick, events, chapters, graph, metrics });

            onTick(
                tick,
                config.ticks,
                `chapters=${chapters.length} edges=${metrics.edgeCount} ` +
                    `seeded=${seededThisTick} recall=${recallHits}`,
            );
        }
    } finally {
        // Always clear the override so a later run in the same process starts clean.
        setFramingOverride(null);
    }

    const finalGraph = perTick.length ? perTick[perTick.length - 1].graph : { nodes: [], edges: [] };
    return { config, usedRealLLM, perTick, finalGraph };
}
