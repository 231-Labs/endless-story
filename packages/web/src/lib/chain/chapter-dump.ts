/**
 * Local chapter dump — a validation channel, NOT a product feature.
 *
 * When `ES_CHAPTER_DUMP_DIR` is set, every generated piece of prose (genesis
 * prologue / POV / encounter / event cut / gazette) is also written to a markdown
 * file in that dir, with a metadata header. No-op when the env var is unset, so it
 * is inert in production. Failures are swallowed — dumping must never affect a run.
 *
 * Why: chapter generation needs the LLM + (for the real prose) on-chain characters,
 * so it can only run on the operator's machine. Dumping to files lets a localhost
 * run be reviewed offline / committed to a branch / shared — no manual copy-paste,
 * and it works in DRY-RUN (no Walrus/commit cost) since the prose is produced before
 * anchoring. Pair with `world-loop --dry-run` for a zero-on-chain content preview.
 */

import { mkdirSync, writeFileSync } from 'node:fs';

const DIR = process.env.ES_CHAPTER_DUMP_DIR;

export type ChapterDumpKind = 'genesis' | 'pov' | 'encounter' | 'cut' | 'gazette';

export interface ChapterDumpMeta {
    kind: ChapterDumpKind;
    /** narrative day, if known (for ordering the files). */
    day?: number;
    /** subject display name (character, or scene for a cut). */
    name?: string;
    role?: string;
    scene?: string;
    /** anything extra worth recording (e.g. "與蘇映雪 · 戀慕", contest result). */
    note?: string;
    /** whether this was a real (anchored) run or a dry preview. */
    dryRun?: boolean;
}

let seq = 0;

function slug(s: string | undefined): string {
    return (s ?? '').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 32) || 'x';
}

/** Write one chapter to `$ES_CHAPTER_DUMP_DIR` as markdown. No-op if unset/empty. */
export function dumpChapter(meta: ChapterDumpMeta, body: string): void {
    if (!DIR) return;
    const text = (body ?? '').trim();
    if (!text) return;
    try {
        mkdirSync(DIR, { recursive: true });
        seq += 1;
        const day = String(meta.day ?? 0).padStart(3, '0');
        const file = `${DIR}/d${day}-${meta.kind}-${slug(meta.name)}-${String(seq).padStart(4, '0')}.md`;
        const header = [
            `# 〔${meta.kind}〕${meta.name ?? ''}${meta.role ? `（${meta.role}）` : ''}`,
            meta.scene ? `- 場景：${meta.scene}` : '',
            meta.day != null ? `- 日：${meta.day}` : '',
            meta.note ? `- 註：${meta.note}` : '',
            meta.dryRun != null ? `- ${meta.dryRun ? '預演（未上鏈）' : '正式（已上鏈）'}` : '',
            `- 字數：${text.length}`,
            '',
            '---',
            '',
        ]
            .filter(Boolean)
            .join('\n');
        writeFileSync(file, `${header}${text}\n`);
    } catch {
        /* dumping must never break a run */
    }
}
