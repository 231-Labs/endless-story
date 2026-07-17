#!/usr/bin/env -S npx tsx
/**
 * Skeleton: propose a publication draft from lab runs + scripts stories.
 *
 *   ES_LAB_ROOT=~/endless-story-lab ES_SCRIPTS_ROOT=~/endless-story-scripts \
 *     pnpm --filter @endless-story/cli pub:propose -- --topic "economy physics pilot"
 *
 * Writes lab/publications/drafts/<id>.md + manifest.json. Review in drafts/, move to ready/ manually.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { labRoot, scriptsRoot, today, writeJson } from './lib/workspace-paths.ts';

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const topic = arg('--topic') ?? 'untitled';
const id = `${today()}-${topic.replace(/\s+/g, '-').slice(0, 48)}`;
const drafts = path.join(labRoot(), 'publications', 'drafts');
const outMd = path.join(drafts, `${id}.md`);
const outManifest = path.join(drafts, `${id}.manifest.json`);

const runDirs = fs.existsSync(path.join(labRoot(), 'runs'))
    ? fs.readdirSync(path.join(labRoot(), 'runs'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `runs/${d.name}`)
    : [];

const storyDirs = fs.existsSync(path.join(scriptsRoot(), 'stories'))
    ? fs.readdirSync(path.join(scriptsRoot(), 'stories'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `stories/${d.name}`)
    : [];

const body = [
    `# ${topic}`,
    '',
    `> Auto-proposed ${today()}. Edit before moving to \`publications/ready/\`.`,
    '',
    '## Sources to weave',
    '',
    ...runDirs.map((r) => `- lab run: \`${r}\``),
    ...storyDirs.map((s) => `- script story: \`${s}\``),
    '',
    '## Outline',
    '',
    '1. Hook — what happened in the world (cite a story excerpt)',
    '2. Mechanism — what the engine enforced (cite a lab conclusion)',
    '3. Takeaway — what this means for InkRay / Medium readers',
    '',
    '## Draft',
    '',
    '_Replace this section after curator pass._',
    '',
].join('\n');

fs.mkdirSync(drafts, { recursive: true });
fs.writeFileSync(outMd, body);
writeJson(outManifest, {
    id,
    topic,
    status: 'draft',
    created: today(),
    targets: ['medium', 'inkray'],
    sources: [
        ...runDirs.map((ref) => ({ type: 'run', ref: `endless-story-lab/${ref}` })),
        ...storyDirs.map((ref) => ({ type: 'story', ref: `endless-story-scripts/${ref}` })),
    ],
});

console.log(`draft → ${outMd}`);
console.log(`manifest → ${outManifest}`);
