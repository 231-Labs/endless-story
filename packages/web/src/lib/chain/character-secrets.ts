/**
 * Character inner-life secret store — off-chain, per-character, durable via the
 * `web/data/*.json` file-store pattern (want-store.ts): process cache + lazy
 * file load + write-through. Founding-cast secrets (spring-snow.json
 * founding_cast[].secret) are seeded here at mint time so POV / plan /
 * want-engine scene prompts can inject them WITHOUT ever putting them in the
 * on-chain description — and they must survive a server restart, or the 心底
 * block silently vanishes from every prompt until the next reseed.
 *
 * Perception boundary: a row is keyed by its owner's characterId only. Callers
 * must look it up per-character and thread it into that character's OWN prompt
 * call — never into a shared/co-present prompt (see RULES.md P4).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'character-secrets.json');

/** characterId → secret. */
type SecretFile = Record<string, string>;

let cache: SecretFile | null = null;

function load(): SecretFile {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as SecretFile;
    } catch {
        cache = {};
    }
    return cache;
}

function save(all: SecretFile): void {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(all, null, 1));
    } catch (err) {
        console.warn('[character-secrets] save failed:', err instanceof Error ? err.message : err);
    }
}

export function setCharacterSecret(characterId: string, secret: string): void {
    const trimmed = secret.trim();
    if (!trimmed) return;
    const all = load();
    all[characterId] = trimmed;
    save(all);
}

export function getCharacterSecret(characterId: string): string | undefined {
    return load()[characterId];
}

/** Reset cache AND file (tests / harness isolation). */
export function clearCharacterSecrets(): void {
    cache = {};
    save(cache);
}

/** Test-only: drop the process cache so a fresh file state is re-read. */
export function __resetCharacterSecretCache(): void {
    cache = null;
}
