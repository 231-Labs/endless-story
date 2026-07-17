import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Private script library root (`endless-story-scripts`). */
export function scriptsRoot(): string | undefined {
    const root = process.env.ES_SCRIPTS_ROOT?.trim();
    return root ? path.resolve(root) : undefined;
}

/** Private research lab root (`endless-story-lab`). */
export function labRoot(): string | undefined {
    const root = process.env.ES_LAB_ROOT?.trim();
    return root ? path.resolve(root) : undefined;
}

export function defaultStoriesDir(): string {
    const root = scriptsRoot();
    if (root) return path.join(root, 'seeds');
    return path.resolve(fileURLToPath(import.meta.url), '../../../cli/scripts/stories');
}

export function defaultSeasonsDir(): string {
    const root = scriptsRoot();
    if (root) return path.join(root, 'seasons');
    return path.resolve(fileURLToPath(import.meta.url), '../../../cli/scripts/seasons');
}

export function activePresetId(): string | undefined {
    return process.env.ES_ACTIVE_PRESET?.trim() || undefined;
}

export function activeSeasonId(): string | undefined {
    return process.env.ES_ACTIVE_SEASON?.trim() || undefined;
}

/** Default engine run output under today's lab run folder when ES_LAB_ROOT is set. */
export function defaultLabRunDir(slug = 'engine-run'): string {
    const root = labRoot();
    if (!root) return './engine-run';
    const day = new Date().toISOString().slice(0, 10);
    return path.join(root, 'runs', day, slug);
}
