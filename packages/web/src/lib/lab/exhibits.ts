/**
 * 展覽室 — showing experiment outputs that are not lab-format runs:
 *
 *   1. 館藏實驗報告 — markdown reports the repo already carries
 *      (packages/engine/experiments/**: report.md, *-report.md, and the
 *      agent-season per-window reports). Read-only, listed by scanning the
 *      experiments directory that ships inside the deploy image.
 *   2. 自上之展品 — free markdown uploaded from the UI, stored under
 *      $LAB_DATA_DIR/exhibits/ (survives redeploys on the volume).
 *
 * Adoption of engine-CLI run DIRECTORIES (state/archive/dossiers) is a
 * different door — see import.ts; those become real shelf runs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSafeId, ensureDir, labDataDir } from './paths';

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const MAX_SCAN_DEPTH = 4;

/** The experiments library that ships with the repo/image. */
export function repoReportsDir(): string | null {
    const env = process.env.LAB_REPORTS_DIR?.trim();
    const candidates = [
        env ? path.resolve(env) : null,
        path.resolve(process.cwd(), '..', 'engine', 'experiments'),
        path.resolve(process.cwd(), 'packages', 'engine', 'experiments'),
    ].filter((p): p is string => Boolean(p));
    for (const candidate of candidates) {
        try {
            if (fs.statSync(candidate).isDirectory()) return candidate;
        } catch { /* try next */ }
    }
    return null;
}

export interface RepoReport {
    /** Relative path inside the experiments dir — the stable id. */
    rel: string;
    title: string;
    bytes: number;
    mtime: string;
    /** A sibling self-contained HTML version, when the harness wrote one. */
    htmlRel?: string;
    /** A sibling cast-state.json — revivable into a steppable run. */
    castStateRel?: string;
}

function firstHeading(file: string): string | null {
    try {
        const head = fs.readFileSync(file, 'utf8').slice(0, 2000);
        const m = /^#\s+(.+)$/m.exec(head);
        return m ? m[1].trim() : null;
    } catch {
        return null;
    }
}

export function listRepoReports(): RepoReport[] {
    const root = repoReportsDir();
    if (!root) return [];
    const out: RepoReport[] = [];
    const walk = (dir: string, depth: number) => {
        if (depth > MAX_SCAN_DEPTH) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                walk(full, depth + 1);
                continue;
            }
            if (!/(^|-)report\.md$/.test(entry.name)) continue;
            const stat = fs.statSync(full);
            if (stat.size > MAX_REPORT_BYTES) continue;
            const rel = path.relative(root, full);
            const htmlSibling = full.replace(/\.md$/, '.html');
            const castStateSibling = path.join(path.dirname(full), 'cast-state.json');
            out.push({
                rel,
                title: firstHeading(full) ?? rel,
                bytes: stat.size,
                mtime: stat.mtime.toISOString(),
                htmlRel: fs.existsSync(htmlSibling) ? rel.replace(/\.md$/, '.html') : undefined,
                castStateRel: fs.existsSync(castStateSibling)
                    ? path.join(path.dirname(rel), 'cast-state.json')
                    : undefined,
            });
        }
    };
    walk(root, 0);
    return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function safeRepoPath(rel: string, ext: '.md' | '.html' | '.json'): string {
    const root = repoReportsDir();
    if (!root) throw new Error('experiments library not found on this host');
    if (!rel.endsWith(ext)) throw new Error(`path must end with ${ext}`);
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) throw new Error('path escapes the experiments library');
    return full;
}

export function readRepoReport(rel: string): string {
    return fs.readFileSync(safeRepoPath(rel, '.md'), 'utf8');
}

export function readRepoReportHtml(rel: string): string {
    return fs.readFileSync(safeRepoPath(rel, '.html'), 'utf8');
}

export function readRepoCastState(rel: string): string {
    return fs.readFileSync(safeRepoPath(rel, '.json'), 'utf8');
}

// ── uploaded exhibits ─────────────────────────────────────────────────────────

function uploadsDir(): string {
    return path.join(labDataDir(), 'exhibits');
}

export interface UploadedExhibit {
    id: string;
    title: string;
    bytes: number;
    mtime: string;
}

export function listUploadedExhibits(): UploadedExhibit[] {
    let files: string[];
    try {
        files = fs.readdirSync(uploadsDir()).filter((f) => f.endsWith('.md'));
    } catch {
        return [];
    }
    return files
        .map((file) => {
            const full = path.join(uploadsDir(), file);
            const stat = fs.statSync(full);
            const id = file.slice(0, -'.md'.length);
            return {
                id,
                title: firstHeading(full) ?? id,
                bytes: stat.size,
                mtime: stat.mtime.toISOString(),
            };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

export function saveUploadedExhibit(id: string, markdown: string): UploadedExhibit {
    assertSafeId(id, 'exhibit id');
    const body = markdown.trim();
    if (!body) throw new Error('exhibit is empty');
    if (Buffer.byteLength(body, 'utf8') > MAX_REPORT_BYTES) throw new Error('exhibit too large (>2MB)');
    ensureDir(uploadsDir());
    fs.writeFileSync(path.join(uploadsDir(), `${id}.md`), `${body}\n`, 'utf8');
    const stat = fs.statSync(path.join(uploadsDir(), `${id}.md`));
    return { id, title: /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? id, bytes: stat.size, mtime: stat.mtime.toISOString() };
}

export function readUploadedExhibit(id: string): string {
    assertSafeId(id, 'exhibit id');
    return fs.readFileSync(path.join(uploadsDir(), `${id}.md`), 'utf8');
}

export function deleteUploadedExhibit(id: string): void {
    assertSafeId(id, 'exhibit id');
    fs.rmSync(path.join(uploadsDir(), `${id}.md`), { force: true });
}
