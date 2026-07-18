/**
 * Seed library — batch story-resource configuration for the cinema-lab.
 *
 * A "seed" is the same preset JSON the engine already consumes
 * (`packages/cli/scripts/stories/*.json`, or `$ES_SCRIPTS_ROOT/seeds` when the
 * private script library is mounted): saga premise + locations + scenes +
 * founding cast with persona / secret / genesis memories. The lab reads the
 * built-in library as-is and lets the UI author custom seeds beside it —
 * validated by actually building a WorldState from them (the engine's own
 * loader is the only truth about what a valid seed is).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildWorldState, defaultSeasonsDir, defaultStoriesDir, type RawPreset, type SeasonFrame } from '@endless-story/engine/preset';
import { assertSafeId, ensureDir, labSeasonsDir, labSeedsDir } from './paths';
import type { LabSeasonSummary, LabSeedSummary } from './types';

function listJsonIds(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.slice(0, -'.json'.length))
            .sort();
    } catch {
        return [];
    }
}

export function seedDirFor(source: 'builtin' | 'custom'): string {
    return source === 'builtin' ? defaultStoriesDir() : labSeedsDir();
}

export function seasonDirFor(source: 'builtin' | 'custom'): string {
    return source === 'builtin' ? defaultSeasonsDir() : labSeasonsDir();
}

function summarizeSeed(id: string, source: 'builtin' | 'custom', raw: RawPreset): LabSeedSummary {
    const cast = raw.founding_cast ?? [];
    const rawWithLocations = raw as RawPreset & { locations?: unknown[] };
    return {
        id,
        source,
        label: raw.label ?? raw.saga?.name,
        castCount: cast.length,
        sceneCount: raw.scenes?.length ?? 0,
        locationCount: Array.isArray(rawWithLocations.locations) ? rawWithLocations.locations.length : 0,
        memoryCount: cast.reduce((n, c) => n + (c.memories?.length ?? 0), 0),
        resources: (raw.drama_resources ?? []).map((r) => r.label),
    };
}

export function readSeedRaw(source: 'builtin' | 'custom', id: string): RawPreset {
    assertSafeId(id, 'seed id');
    const file = path.join(seedDirFor(source), `${id}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RawPreset;
}

export function readSeedText(source: 'builtin' | 'custom', id: string): string {
    assertSafeId(id, 'seed id');
    return fs.readFileSync(path.join(seedDirFor(source), `${id}.json`), 'utf8');
}

export function readSeasonText(source: 'builtin' | 'custom', id: string): string {
    assertSafeId(id, 'season id');
    return fs.readFileSync(path.join(seasonDirFor(source), `${id}.json`), 'utf8');
}

export function listSeeds(): LabSeedSummary[] {
    const out: LabSeedSummary[] = [];
    for (const source of ['builtin', 'custom'] as const) {
        for (const id of listJsonIds(seedDirFor(source))) {
            try {
                out.push(summarizeSeed(id, source, readSeedRaw(source, id)));
            } catch {
                // an unreadable file is skipped, never fatal for the list
            }
        }
    }
    return out;
}

export function listSeasons(): LabSeasonSummary[] {
    const out: LabSeasonSummary[] = [];
    for (const source of ['builtin', 'custom'] as const) {
        for (const id of listJsonIds(seasonDirFor(source))) {
            try {
                const raw = JSON.parse(
                    fs.readFileSync(path.join(seasonDirFor(source), `${id}.json`), 'utf8'),
                ) as SeasonFrame;
                out.push({ id, source, title: raw.title, centralQuestion: raw.centralQuestion });
            } catch {
                // skip unreadable frames
            }
        }
    }
    return out;
}

/**
 * Validate a seed the only way that cannot drift from the engine: parse it and
 * build a WorldState (pure, no I/O). Throws with the engine's own error text.
 */
export function validateSeedJson(text: string): { raw: RawPreset; summary: { cast: number; scenes: number } } {
    const raw = JSON.parse(text) as RawPreset;
    if (!raw.id || typeof raw.id !== 'string') throw new Error('seed JSON needs a string "id"');
    if (!raw.founding_cast?.length) throw new Error('seed has no founding_cast');
    if (!raw.scenes?.length) throw new Error('seed has no scenes');
    const world = buildWorldState(raw);
    return { raw, summary: { cast: world.data.cast.length, scenes: world.data.scenes.length } };
}

export function saveCustomSeed(id: string, text: string): LabSeedSummary {
    assertSafeId(id, 'seed id');
    const { raw } = validateSeedJson(text);
    ensureDir(labSeedsDir());
    fs.writeFileSync(path.join(labSeedsDir(), `${id}.json`), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return summarizeSeed(id, 'custom', raw);
}

export function saveCustomSeason(id: string, text: string): LabSeasonSummary {
    assertSafeId(id, 'season id');
    const raw = JSON.parse(text) as SeasonFrame;
    if (!raw.id || !raw.title || !raw.centralQuestion) {
        throw new Error('season frame needs id / title / centralQuestion');
    }
    ensureDir(labSeasonsDir());
    fs.writeFileSync(path.join(labSeasonsDir(), `${id}.json`), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return { id, source: 'custom', title: raw.title, centralQuestion: raw.centralQuestion };
}
