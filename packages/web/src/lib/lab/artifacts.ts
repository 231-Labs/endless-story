/**
 * Run artifact readers — the dossier / chapter / episode / POV surface of a
 * lab run, read straight from the run directory the engine wrote. Compilers
 * live in engine/runner; this file only lists, parses and serves.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDossierHeader } from '@endless-story/runner/services/event-dossier';
import type { EpistemicDossierBundle } from '@endless-story/shared';
import { assertSafeId, runDir } from './paths';
import type { LabTickRecord } from './types';

export type ArchiveKind = 'shoujuan' | 'chapter' | 'episode' | 'pov';

export interface ArchiveEntry {
    file: string;
    kind: ArchiveKind;
    day: number;
    tick: number;
    slug: string;
    seq: number;
}

const ARCHIVE_FILE = /^d(\d+)-t(\d+)-(shoujuan|chapter|episode|pov)-(.+)-(\d+)\.md$/;

export function readTickRecords(runId: string): LabTickRecord[] {
    const file = path.join(runDir(runId), 'ticks.jsonl');
    let text: string;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        return [];
    }
    const out: LabTickRecord[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            out.push(JSON.parse(line) as LabTickRecord);
        } catch {
            // a torn trailing line (crash mid-append) is skipped
        }
    }
    return out;
}

export function tailTickRecords(runId: string, n: number): LabTickRecord[] {
    const all = readTickRecords(runId);
    return all.slice(-n);
}

/** Flatten tick records into live-beat shapes (seq/ts assigned by the caller) —
 *  used to backfill the live feed for cold runs and freshly-opened runs. */
export function beatsFromTickRecords(
    records: LabTickRecord[],
): Array<{
    day: number;
    tick: number;
    clock: string;
    sceneId: string;
    sceneName: string;
    isPrivate: boolean;
    characterId: string;
    name: string;
    text: string;
    inner?: string;
    kind?: 'beat' | 'world';
}> {
    const out: ReturnType<typeof beatsFromTickRecords> = [];
    for (const record of records) {
        for (const event of record.events) {
            const isPrivate = event.visibility === 'private';
            for (const beat of event.beats) {
                out.push({
                    day: record.day,
                    tick: record.tick,
                    clock: record.partOfDay,
                    sceneId: event.sceneId,
                    sceneName: event.sceneName,
                    isPrivate,
                    characterId: beat.characterId,
                    name: beat.name,
                    text: beat.text,
                    inner: beat.inner,
                    kind: beat.characterId === '__world__' ? 'world' : 'beat',
                });
            }
        }
    }
    return out;
}

export function listArchiveEntries(runId: string): ArchiveEntry[] {
    const dir = path.join(runDir(runId), 'archive');
    let files: string[];
    try {
        files = fs.readdirSync(dir);
    } catch {
        return [];
    }
    const out: ArchiveEntry[] = [];
    for (const file of files) {
        const m = ARCHIVE_FILE.exec(file);
        if (!m) continue;
        out.push({
            file,
            day: Number(m[1]),
            tick: Number(m[2]),
            kind: m[3] as ArchiveKind,
            slug: m[4],
            seq: Number(m[5]),
        });
    }
    return out.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
}

export function readArchiveEntry(runId: string, file: string): string {
    if (!ARCHIVE_FILE.test(file)) throw new Error(`not an archive file: ${file}`);
    return fs.readFileSync(path.join(runDir(runId), 'archive', file), 'utf8');
}

export interface DossierListItem {
    slug: string;
    file: string;
    eventId: string;
    title: string;
    day: number;
    scene: string;
    perspectives: string[];
}

export function listDossiers(runId: string): DossierListItem[] {
    const dir = path.join(runDir(runId), 'dossiers');
    let files: string[];
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
        return [];
    }
    const out: DossierListItem[] = [];
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const bundle = parseDossierHeader(content).bundle;
            if (!bundle) continue;
            out.push({
                slug: file.slice(0, -'.md'.length),
                file,
                eventId: bundle.event.slug,
                title: bundle.event.title,
                day: bundle.event.day,
                scene: bundle.event.scene,
                perspectives: bundle.manifest.perspectives.map((p) => p.characterName),
            });
        } catch {
            // unreadable dossier: skip from the list
        }
    }
    return out.sort((a, b) => a.day - b.day || a.eventId.localeCompare(b.eventId));
}

export function readDossier(runId: string, slug: string): { bundle: EpistemicDossierBundle; body: string } | null {
    assertSafeId(slug, 'dossier slug');
    const file = path.join(runDir(runId), 'dossiers', `${slug}.md`);
    let content: string;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch {
        return null;
    }
    const parsed = parseDossierHeader(content);
    if (!parsed.bundle) return null;
    return { bundle: parsed.bundle, body: parsed.body };
}

export interface EditorialView {
    anthology?: string;
    selection?: unknown;
    objectiveAudit?: unknown;
}

export function readEditorial(runId: string): EditorialView {
    const dir = path.join(runDir(runId), 'editorial');
    const view: EditorialView = {};
    try {
        view.anthology = fs.readFileSync(path.join(dir, 'season-anthology.md'), 'utf8');
    } catch { /* not yet written */ }
    try {
        view.selection = JSON.parse(fs.readFileSync(path.join(dir, 'season-selection.json'), 'utf8'));
    } catch { /* not yet written */ }
    try {
        view.objectiveAudit = JSON.parse(fs.readFileSync(path.join(dir, 'objective-audit.json'), 'utf8'));
    } catch { /* not yet written */ }
    return view;
}
