/**
 * Cinema-lab filesystem layout — fully off-chain, server-side only.
 *
 * Everything the lab produces lives under one data root:
 *   <LAB_DATA_DIR>/
 *     runs/<runId>/     one engine run = one versioned directory
 *                       (run-manifest.json · state/ · memory/ · sessions/ ·
 *                        archive/ · dossiers/ · editorial/ · ticks.jsonl ·
 *                        lab-run.json · status.json)
 *     seeds/<id>.json   custom story presets authored in the lab UI
 *     seasons/<id>.json custom season frames authored in the lab UI
 *
 * In production mount a persistent volume and point LAB_DATA_DIR at it
 * (e.g. /data/cinema-lab on Zeabur) — a redeploy must not lose runs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export function labDataDir(): string {
    const env = process.env.LAB_DATA_DIR?.trim();
    return env ? path.resolve(env) : path.resolve(process.cwd(), 'data', 'cinema-lab');
}

export function labRunsRoot(): string {
    return path.join(labDataDir(), 'runs');
}

export function labSeedsDir(): string {
    return path.join(labDataDir(), 'seeds');
}

export function labSeasonsDir(): string {
    return path.join(labDataDir(), 'seasons');
}

const SAFE_ID = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,80}$/u;

/** Path-traversal guard for every id that becomes a directory or file name. */
export function assertSafeId(id: string, what = 'id'): string {
    if (!SAFE_ID.test(id) || id.includes('..')) throw new Error(`invalid ${what}: ${id}`);
    return id;
}

export function runDir(runId: string): string {
    return path.join(labRunsRoot(), assertSafeId(runId, 'run id'));
}

export function ensureDir(dir: string): string {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Atomic small-JSON write (temp + rename) so readers never see a torn file. */
export function writeJsonAtomic(file: string, value: unknown): void {
    ensureDir(path.dirname(file));
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
}

export function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
        return null;
    }
}
