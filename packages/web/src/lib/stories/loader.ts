'use server';

/**
 * Story preset discovery + loader (server-side, web).
 *
 * Reads JSON files from `packages/cli/scripts/stories/*.json`. The same
 * directory is the source of truth for cli's `bootstrap.ts` so admin
 * UI + cli stay in sync.
 *
 * Why under cli/ and not shared/? Old-repo convention; the dir is
 * conceptually a deploy resource.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StoryPreset } from '@endless-story/shared';

const STORIES_DIR = path.resolve(process.cwd(), '..', 'cli', 'scripts', 'stories');

export interface StoryPresetSummary {
    id: string;
    label: string;
    filename: string;
    recruitmentCount: number;
    locationCount: number;
    sceneCount: number;
}

export async function listStoryPresets(): Promise<StoryPresetSummary[]> {
    let files: string[];
    try {
        files = fs.readdirSync(STORIES_DIR).filter((f) => f.endsWith('.json'));
    } catch (err) {
        console.warn('[stories] cannot read', STORIES_DIR, err);
        return [];
    }
    const summaries: StoryPresetSummary[] = [];
    for (const filename of files.sort()) {
        try {
            const raw = fs.readFileSync(path.join(STORIES_DIR, filename), 'utf-8');
            const p = JSON.parse(raw) as StoryPreset;
            summaries.push({
                id: p.id,
                label: p.label,
                filename,
                recruitmentCount: p.recruitments?.length ?? 0,
                locationCount: p.locations?.length ?? 0,
                sceneCount: p.scenes?.length ?? 0,
            });
        } catch (err) {
            console.warn('[stories] skipping malformed preset', filename, err);
        }
    }
    return summaries;
}

export async function loadStoryPreset(id: string): Promise<StoryPreset> {
    // id may be either the slug ("spring-snow") or the filename ("spring-snow.json")
    const filename = id.endsWith('.json') ? id : `${id}.json`;
    const filepath = path.join(STORIES_DIR, filename);
    if (!fs.existsSync(filepath)) {
        throw new Error(`story preset not found: ${filename}`);
    }
    const raw = fs.readFileSync(filepath, 'utf-8');
    const preset = JSON.parse(raw) as StoryPreset;
    if (preset.id !== id.replace(/\.json$/, '')) {
        console.warn(`[stories] file ${filename} declares id="${preset.id}" — using as-is`);
    }
    return preset;
}
