/**
 * FileArchive — the ArchivePort for local-first runs. Writes each artifact as a
 * markdown file under `<dir>/`, named so a day's story reads in order:
 *   d<day>-t<tick>-<kind>-<slug>-<seq>.md
 * 手卷 (shoujuan) = live scene beats, 織回 (chapter) = woven tick chapter,
 * 日終 (episode) = day compression, pov = per-character angle. M2 swaps in a
 * chain-commitment + Walrus adapter behind the same contract.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchiveArtifact, ArchivePort } from '../../ports.ts';

const KIND_LABEL: Record<ArchiveArtifact['kind'], string> = {
    shoujuan: '手卷',
    chapter: '織回',
    episode: '日終',
    pov: 'POV',
};

function slug(s: string): string {
    return s.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 12) || 'x';
}

export class FileArchive implements ArchivePort {
    private seq = 0;
    private readonly dir: string;
    constructor(dir: string) {
        this.dir = dir;
    }

    async commit(a: ArchiveArtifact): Promise<void> {
        fs.mkdirSync(this.dir, { recursive: true });
        const n = String(this.seq++).padStart(4, '0');
        const file = `d${a.day}-t${a.tick}-${a.kind}-${slug(a.name)}-${n}.md`;
        const header = `# 〔${KIND_LABEL[a.kind]}〕${a.name}  (day ${a.day} · tick ${a.tick})\n\n---\n\n`;
        fs.writeFileSync(path.join(this.dir, file), header + a.body.trim() + '\n');
    }
}
