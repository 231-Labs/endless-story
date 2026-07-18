/**
 * 認領 — adopt an engine-CLI run directory as a first-class shelf run.
 *
 * Lab run dirs and engine CLI run dirs are byte-compatible (same manifest,
 * same state/archive/dossiers layout). A directory dropped under
 * $LAB_DATA_DIR/runs/<name>/ — rsync'd from ES_LAB_ROOT, copied from a local
 * `--out`, whatever — just lacks lab-run.json. Adoption infers the config
 * from the run's own provenance manifest + world snapshot and writes the
 * registry files. Honest limits: a run recorded with another provider can be
 * VIEWED and READ fully; continuing it (走拍) still enforces the engine's
 * provenance check and will refuse under a mismatched provider.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorldStateData } from '@endless-story/engine';
import { labRunsRoot, readJson, runDir, writeJsonAtomic } from './paths';
import { readSeedRaw } from './seeds';
import { writeRunStatus } from './store';
import { readTickRecords } from './artifacts';
import type { LabRunConfig, LabRunMeta } from './types';

interface ManifestSlice {
    preset?: string;
    season?: string;
    realLlm?: boolean;
    relationshipFallback?: boolean;
    provider?: string;
    model?: string;
}

export interface OrphanRun {
    dir: string;
    hasWorld: boolean;
    hasArchive: boolean;
    hasDossiers: boolean;
    day?: number;
    tick?: number;
    preset?: string;
    realLlm?: boolean;
}

/** Directories under runs/ that are engine runs but not yet on the shelf. */
export function listOrphanRuns(): OrphanRun[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(labRunsRoot(), { withFileTypes: true });
    } catch {
        return [];
    }
    const out: OrphanRun[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(labRunsRoot(), entry.name);
        if (fs.existsSync(path.join(dir, 'lab-run.json'))) continue;
        const world = readJson<WorldStateData>(path.join(dir, 'state', 'world.json'));
        const hasArchive = fs.existsSync(path.join(dir, 'archive'));
        const hasDossiers = fs.existsSync(path.join(dir, 'dossiers'));
        if (!world && !hasArchive) continue; // not an engine run
        const manifest = readJson<ManifestSlice>(path.join(dir, 'run-manifest.json'));
        out.push({
            dir: entry.name,
            hasWorld: Boolean(world),
            hasArchive,
            hasDossiers,
            day: world?.clock.day,
            tick: world?.clock.currentTick,
            preset: manifest?.preset ?? world?.sagaId,
            realLlm: manifest?.realLlm,
        });
    }
    return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

function seedSourceFor(presetId: string): 'builtin' | 'custom' {
    try {
        readSeedRaw('builtin', presetId);
        return 'builtin';
    } catch {
        try {
            readSeedRaw('custom', presetId);
            return 'custom';
        } catch {
            return 'builtin'; // live view degrades gracefully without the seed
        }
    }
}

export function adoptRun(dirName: string, title?: string, note?: string): LabRunMeta {
    const dir = runDir(dirName);
    if (fs.existsSync(path.join(dir, 'lab-run.json'))) throw new Error(`already on the shelf: ${dirName}`);
    const world = readJson<WorldStateData>(path.join(dir, 'state', 'world.json'));
    const hasArchive = fs.existsSync(path.join(dir, 'archive'));
    if (!world && !hasArchive) throw new Error(`not an engine run (no state/world.json, no archive/): ${dirName}`);

    const manifest = readJson<ManifestSlice>(path.join(dir, 'run-manifest.json'));
    const presetId = manifest?.preset ?? world?.sagaId ?? 'spring-snow';
    const config: LabRunConfig = {
        presetId,
        seedSource: seedSourceFor(presetId),
        seasonId: manifest?.season || undefined,
        seasonSource: 'builtin',
        llm: manifest?.realLlm ? 'real' : 'fake',
        relationshipFallback: manifest?.relationshipFallback ?? Boolean(world?.relationshipFallback),
        ticksPerDay: world?.clock.ticksPerDay ?? 6,
        realEmbeddings: false,
    };
    const meta: LabRunMeta = {
        id: dirName,
        title: title?.trim() || dirName,
        note: note?.trim()
            || `認領的外來卷${manifest?.provider ? ` · 原錄於 ${manifest.provider}/${manifest.model}` : ''}`,
        createdAt: new Date().toISOString(),
        config,
    };
    writeJsonAtomic(path.join(dir, 'lab-run.json'), meta);

    if (world) {
        writeRunStatus(dirName, {
            day: world.clock.day,
            tick: world.clock.currentTick,
            partOfDay: world.clock.partOfDay,
            liveWants: world.wants.filter((w) => !w.retired).length,
            castCount: world.cast.length,
            sceneCount: world.scenes.length,
            eventsTotal: readTickRecords(dirName).reduce((n, r) => n + r.events.length, 0),
            updatedAt: new Date().toISOString(),
        });
    }
    return meta;
}
