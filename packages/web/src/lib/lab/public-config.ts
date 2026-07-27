/**
 * Public 春雪社 surface — which lab run strangers see, and the featured
 * cast that opens the 名帖. Off-chain only; Sui is a later adapter.
 *
 * Resolution order for the featured run id:
 *   1. LAB_PUBLIC_RUN_ID env
 *   2. $LAB_DATA_DIR/public.json → { runId }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { labDataDir, readJson, runDir, writeJsonAtomic, assertSafeId } from './paths';

/** Opening trio for stranger 名帖 — others appear after scene discovery. */
export const FEATURED_CAST_NAMES = ['柳安春', '蘇映雪', '金鳳'] as const;

export interface LabPublicConfig {
    /** Featured run id strangers land on. Null when nothing is curated yet. */
    runId: string | null;
    /** Brand label shown in guest chrome. */
    brand: string;
    /** Opening 名帖 names (display names, matched against live cast). */
    featuredCastNames: readonly string[];
}

interface PublicJson {
    runId?: string;
    brand?: string;
    featuredCastNames?: string[];
}

function publicJsonPath(): string {
    return path.join(labDataDir(), 'public.json');
}

export function readPublicJson(): PublicJson | null {
    return readJson<PublicJson>(publicJsonPath());
}

/** True when the run directory exists (meta may still be incomplete). */
export function publicRunExists(runId: string): boolean {
    try {
        return fs.existsSync(runDir(runId));
    } catch {
        return false;
    }
}

export function resolvePublicConfig(): LabPublicConfig {
    const file = readPublicJson();
    const envId = process.env.LAB_PUBLIC_RUN_ID?.trim();
    const runId = (envId || file?.runId?.trim() || '') || null;
    const featuredCastNames =
        file?.featuredCastNames?.filter((n) => n.trim()).length
            ? file.featuredCastNames.map((n) => n.trim())
            : [...FEATURED_CAST_NAMES];
    return {
        runId: runId && publicRunExists(runId) ? runId : null,
        brand: file?.brand?.trim() || '春雪社',
        featuredCastNames,
    };
}

/** Featured run id only — throws if unset / missing on disk when required. */
export function requirePublicRunId(): string {
    const { runId } = resolvePublicConfig();
    if (!runId) throw new Error('no public run curated (set LAB_PUBLIC_RUN_ID or public.json)');
    if (!publicRunExists(runId)) throw new Error(`public run not found: ${runId}`);
    return runId;
}

export function isPublicRunId(runId: string): boolean {
    const { runId: featured } = resolvePublicConfig();
    return Boolean(featured && featured === runId);
}

/** True when LAB_PUBLIC_RUN_ID is set — UI writes to public.json won't override it. */
export function publicRunPinnedByEnv(): boolean {
    return Boolean(process.env.LAB_PUBLIC_RUN_ID?.trim());
}

/**
 * Curate the featured public run by writing $LAB_DATA_DIR/public.json.
 * Does not clear LAB_PUBLIC_RUN_ID — if env is set, resolvePublicConfig still prefers it.
 */
export function writePublicConfig(patch: {
    runId: string | null;
    brand?: string;
    featuredCastNames?: string[];
}): LabPublicConfig {
    const prev = readPublicJson() ?? {};
    const next: PublicJson = {
        brand: patch.brand?.trim() || prev.brand || '春雪社',
        featuredCastNames:
            patch.featuredCastNames?.length
                ? patch.featuredCastNames
                : prev.featuredCastNames?.length
                  ? prev.featuredCastNames
                  : [...FEATURED_CAST_NAMES],
    };
    if (patch.runId) {
        const id = assertSafeId(patch.runId, 'run id');
        if (!publicRunExists(id)) throw new Error(`run not found: ${id}`);
        next.runId = id;
    } else {
        // Explicit clear — omit runId so resolve falls through (unless env pins).
        delete next.runId;
    }
    writeJsonAtomic(publicJsonPath(), next);
    return resolvePublicConfig();
}
