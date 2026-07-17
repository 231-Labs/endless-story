#!/usr/bin/env -S npx tsx
/**
 * Move a finished engine run from staging into endless-story-lab.
 *
 *   ES_LAB_ROOT=~/endless-story-lab pnpm --filter @endless-story/cli lab:publish -- \
 *     --staging ./engine-run --slug economy-smoke
 *
 * Writes runs/<YYYY-MM-DD>/<slug>/raw/ + manifest.json. Optionally commits in the lab repo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { labRoot, today, writeJson } from './lib/workspace-paths.ts';

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const staging = path.resolve(arg('--staging') ?? './engine-run');
const slug = arg('--slug') ?? path.basename(staging);
const commit = process.argv.includes('--commit');
const dest = path.join(labRoot(), 'runs', today(), slug);
const raw = path.join(dest, 'raw');

if (!fs.existsSync(staging)) {
    console.error(`staging not found: ${staging}`);
    process.exit(1);
}

fs.mkdirSync(raw, { recursive: true });
for (const entry of fs.readdirSync(staging)) {
    const from = path.join(staging, entry);
    const to = path.join(raw, entry);
    fs.cpSync(from, to, { recursive: true });
}

let engineCommit: string | undefined;
try {
    engineCommit = execSync('git rev-parse HEAD', { cwd: path.resolve(import.meta.dirname, '../../..'), encoding: 'utf-8' }).trim();
} catch {
    engineCommit = undefined;
}

writeJson(path.join(dest, 'manifest.json'), {
    id: slug,
    migrated: today(),
    source: {
        staging,
        engineRepo: 'endless-story',
        engineCommit,
        preset: process.env.ES_ACTIVE_PRESET ?? null,
        season: process.env.ES_ACTIVE_SEASON ?? null,
    },
    artifacts: ['raw/'],
});

console.log(`published → ${dest}`);

if (commit) {
    execSync(`git add "${dest}" && git commit -m "lab: publish run ${slug}"`, { cwd: labRoot(), stdio: 'inherit' });
    console.log('committed in lab repo (git push manually)');
}
