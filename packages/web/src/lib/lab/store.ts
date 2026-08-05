/**
 * Run registry — every cinema-lab run is one directory under runs/, and that
 * directory IS the version unit: engine provenance (run-manifest.json), the
 * per-tick world snapshot, memories, sessions, archive and dossiers all travel
 * together. Version management on top is deliberately simple and honest:
 *
 *   - lab-run.json   who created it, from which seed, with which wiring
 *   - status.json    cheap latest clock/wants counters for lists
 *   - fork           copy the directory at an idle moment → a sibling run with
 *                    parentRunId/forkedAtTick lineage (a branch, first-class)
 *
 * Nothing here talks to the engine at runtime — that is manager.ts's job.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, labRunsRoot, readJson, runDir, writeJsonAtomic } from './paths';
import type { LabRunConfig, LabRunMeta, LabRunStatusFile } from './types';

const RUN_META_FILE = 'lab-run.json';
const RUN_STATUS_FILE = 'status.json';

/** Directories/files that constitute a run's durable state (fork copies these). */
const RUN_PAYLOAD = [
    'run-manifest.json',
    'season-frame.json',
    'ticks.jsonl',
    'state',
    'memory',
    'sessions',
    'archive',
    'dossiers',
    'editorial',
    'postprocess-failures',
] as const;

function slugify(title: string): string {
    const base = title
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return base || 'run';
}

export function newRunId(title: string): string {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 6);
    return `${stamp}-${slugify(title)}-${rand}`;
}

export function readRunMeta(runId: string): LabRunMeta | null {
    return readJson<LabRunMeta>(path.join(runDir(runId), RUN_META_FILE));
}

export function readRunStatus(runId: string): LabRunStatusFile | null {
    return readJson<LabRunStatusFile>(path.join(runDir(runId), RUN_STATUS_FILE));
}

/** Overwrite lab-run.json wholesale — callers pass a full, already-merged meta
 *  (mirrors `writeRunStatus`'s shape for the sibling file). */
export function writeRunMeta(runId: string, meta: LabRunMeta): void {
    writeJsonAtomic(path.join(runDir(runId), RUN_META_FILE), meta);
}

/** 「活著」開關——落 lab-run.json；呼叫端（control route）另需知會 manager 的
 *  driver registry（`armIfAlive`）去掛上或摘下巡佇列 interval。 */
export function setRunAlive(runId: string, alive: boolean): LabRunMeta {
    const meta = readRunMeta(runId);
    if (!meta) throw new Error(`run not found: ${runId}`);
    const next: LabRunMeta = { ...meta, alive };
    writeRunMeta(runId, next);
    return next;
}

export function writeRunStatus(runId: string, status: LabRunStatusFile): void {
    writeJsonAtomic(path.join(runDir(runId), RUN_STATUS_FILE), status);
}

export function listRunIds(): string[] {
    try {
        return fs
            .readdirSync(labRunsRoot(), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .filter((id) => fs.existsSync(path.join(labRunsRoot(), id, RUN_META_FILE)))
            .sort()
            .reverse();
    } catch {
        return [];
    }
}

export function createRun(input: {
    title: string;
    note?: string;
    config: LabRunConfig;
    parentRunId?: string;
    forkedAtTick?: number;
    id?: string;
    /** mirror 卷的紀元錨點（創卷真實毫秒）。tick 卷／未給即缺席。 */
    epochRealMs?: number;
}): LabRunMeta {
    const id = input.id ?? newRunId(input.title);
    const dir = runDir(id);
    if (fs.existsSync(path.join(dir, RUN_META_FILE))) throw new Error(`run already exists: ${id}`);
    ensureDir(dir);
    const meta: LabRunMeta = {
        id,
        title: input.title.trim() || id,
        note: input.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
        parentRunId: input.parentRunId,
        forkedAtTick: input.forkedAtTick,
        config: input.config,
        ...(input.epochRealMs !== undefined ? { epochRealMs: input.epochRealMs } : {}),
    };
    writeJsonAtomic(path.join(dir, RUN_META_FILE), meta);
    return meta;
}

/**
 * Fork = copy the run's durable payload into a fresh sibling directory.
 * The caller (manager) must guarantee the source run is idle — copying a
 * mid-tick directory would fork a torn world.
 */
export function forkRun(sourceId: string, input: { title: string; note?: string }): LabRunMeta {
    const source = readRunMeta(sourceId);
    if (!source) throw new Error(`run not found: ${sourceId}`);
    const status = readRunStatus(sourceId);
    const meta = createRun({
        title: input.title,
        note: input.note,
        config: source.config,
        parentRunId: sourceId,
        forkedAtTick: status?.tick,
        // 分卷沿用母卷的紀元——日期連續，不是「岔出去就重新起算」。alive 不承接：
        // 新卷是靜場開的，driver 要操作者自己重新按下「活著」。
        epochRealMs: source.epochRealMs,
    });
    const from = runDir(sourceId);
    const to = runDir(meta.id);
    for (const item of RUN_PAYLOAD) {
        const src = path.join(from, item);
        if (fs.existsSync(src)) fs.cpSync(src, path.join(to, item), { recursive: true });
    }
    if (status) writeRunStatus(meta.id, status);
    return meta;
}

/** Permanent removal. The caller (manager) must close the run first. */
export function deleteRun(runId: string): void {
    fs.rmSync(runDir(runId), { recursive: true, force: true });
}

export function updateRunNote(runId: string, patch: { title?: string; note?: string }): LabRunMeta {
    const meta = readRunMeta(runId);
    if (!meta) throw new Error(`run not found: ${runId}`);
    const next: LabRunMeta = {
        ...meta,
        title: patch.title?.trim() ? patch.title.trim() : meta.title,
        note: patch.note !== undefined ? patch.note.trim() || undefined : meta.note,
    };
    writeJsonAtomic(path.join(runDir(runId), RUN_META_FILE), next);
    return next;
}
