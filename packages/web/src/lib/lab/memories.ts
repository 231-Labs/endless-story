/**
 * 記憶編輯 — operator surgery on a run's LocalRecall store: list, add, forget.
 * Same coordination rule as world-config: only while the run is idle, and
 * always through ONE LocalRecall instance per store (the active run's own
 * instance when open, a fresh one over the file when cold) — LocalRecall
 * caches in memory and rewrites the whole file, so two instances would
 * clobber each other.
 */

import * as path from 'node:path';
import { LocalRecall, type MemoryKind, type WorldStateData } from '@endless-story/engine';
import { labManager } from './manager';
import { readJson, runDir } from './paths';
import { readRunMeta } from './store';

export interface LabMemory {
    seq: number;
    content: string;
    kind: MemoryKind;
    day: number;
    importance: number;
}

const EDITABLE_KINDS: MemoryKind[] = ['genesis', 'observation', 'relationship', 'dream', 'reflection', 'plan'];

export function recallFor(runId: string): { recall: LocalRecall; active: boolean } {
    const manager = labManager();
    manager.assertIdle(runId);
    const active = manager.get(runId);
    if (active) {
        // structural check, not instanceof: the manager singleton survives dev
        // HMR while module classes are re-instantiated per compilation
        const recall = active.deps.recall as LocalRecall;
        if (typeof recall.listMemories !== 'function' || typeof recall.forgetMemory !== 'function') {
            throw new Error('this run does not use LocalRecall');
        }
        return { recall, active: true };
    }
    const meta = readRunMeta(runId);
    if (!meta) throw new Error(`run not found: ${runId}`);
    const recall = new LocalRecall(path.join(runDir(runId), 'memory'), {
        embeddings: meta.config.realEmbeddings ? 'auto' : 'deterministic',
    });
    return { recall, active: false };
}

export function listRunMemories(runId: string, characterId: string): LabMemory[] {
    return recallFor(runId).recall.listMemories(characterId);
}

export async function addRunMemory(
    runId: string,
    input: { characterId: string; text: string; kind?: string; importance?: number; day?: number },
): Promise<LabMemory[]> {
    const { recall } = recallFor(runId);
    const kind = (EDITABLE_KINDS as string[]).includes(input.kind ?? '') ? (input.kind as MemoryKind) : 'genesis';
    const importance = Math.min(10, Math.max(1, Math.round(input.importance ?? 7)));
    const text = input.text.trim();
    if (!text) throw new Error('memory text cannot be empty');
    const activeDay = labManager().get(runId)?.world.data.clock.day;
    const coldDay = readJson<WorldStateData>(path.join(runDir(runId), 'state', 'world.json'))?.clock.day;
    const day = input.day ?? activeDay ?? coldDay ?? 1;
    await recall.remember(input.characterId, text, { kind, importance, day });
    return recall.listMemories(input.characterId);
}

export function forgetRunMemory(runId: string, characterId: string, seq: number): LabMemory[] {
    const { recall } = recallFor(runId);
    if (!recall.forgetMemory(characterId, seq)) throw new Error(`memory not found: seq ${seq}`);
    return recall.listMemories(characterId);
}
