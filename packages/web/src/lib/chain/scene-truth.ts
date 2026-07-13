/**
 * Durable enacted-truth ledger.
 *
 * The physical scene loop freezes what happened before any POV is written. Each
 * scene gets an append-only bucket so a later spine resolver can compile the same
 * facts even after a server restart. `takeSceneTruth` atomically claims a bucket;
 * a concurrent next event can immediately start a fresh one under the original
 * name without being consumed by the earlier cut.
 *
 * Private scenes are never recorded. When CHARACTER_SESSION_KEY is configured,
 * the actor's inner line is encrypted at rest together with the objective beat.
 */

import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    randomUUID,
} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SceneTruthEntry {
    day?: number;
    characterId?: string;
    name: string;
    /** Objective beat — what the character did/said. */
    text: string;
    /** The actor's inner line behind the beat (fed as weave `intents`). */
    inner?: string;
}

interface EncryptedEntry {
    v: 1;
    encrypted: true;
    iv: string;
    tag: string;
    body: string;
}

const MAX_ENTRIES = 40;

function rootDir(): string {
    return process.env.SCENE_TRUTH_DIR
        ?? path.join(process.cwd(), 'data', 'scene-truth');
}

function ledgerKey(sagaId: string, sceneId: string): string {
    return `${sagaId}::${sceneId}`;
}

function bucketPath(sagaId: string, sceneId: string): string {
    const digest = createHash('sha256').update(ledgerKey(sagaId, sceneId)).digest('hex');
    return path.join(rootDir(), digest);
}

function encryptionKey(): Buffer | undefined {
    const raw = process.env.CHARACTER_SESSION_KEY?.trim();
    if (!raw) return undefined;
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
        throw new Error('CHARACTER_SESSION_KEY must be 32 bytes (hex or base64)');
    }
    return key;
}

function encode(entry: SceneTruthEntry, aad: string): string {
    const key = encryptionKey();
    if (!key) return JSON.stringify(entry);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([
        cipher.update(JSON.stringify(entry), 'utf8'),
        cipher.final(),
    ]);
    const payload: EncryptedEntry = {
        v: 1,
        encrypted: true,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        body: body.toString('base64'),
    };
    return JSON.stringify(payload);
}

function decode(raw: string, aad: string): SceneTruthEntry {
    const value = JSON.parse(raw) as SceneTruthEntry | EncryptedEntry;
    if (!('encrypted' in value)) return value;
    const key = encryptionKey();
    if (!key) throw new Error('CHARACTER_SESSION_KEY is required to read encrypted scene truth');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(value.body, 'base64')),
        decipher.final(),
    ]).toString('utf8')) as SceneTruthEntry;
}

function entryFiles(dir: string): string[] {
    try {
        return fs.readdirSync(dir)
            .filter((name) => name.endsWith('.json'))
            .sort();
    } catch {
        return [];
    }
}

export function recordSceneTruth(sagaId: string, sceneId: string, entry: SceneTruthEntry): void {
    const bucket = bucketPath(sagaId, sceneId);
    fs.mkdirSync(bucket, { recursive: true });
    // hrtime is monotonic on the host, including calls within the same ms.
    const stamp = `${String(Date.now()).padStart(13, '0')}-${process.hrtime.bigint().toString().padStart(20, '0')}`;
    const target = path.join(bucket, `${stamp}-${randomUUID()}.json`);
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, encode(entry, ledgerKey(sagaId, sceneId)), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, target);

    // Bound a scene that never resolves. Concurrent deletion is harmless: a
    // claimed bucket has already moved, and a missing file is simply skipped.
    const excess = entryFiles(bucket).slice(0, -MAX_ENTRIES);
    for (const name of excess) {
        try { fs.unlinkSync(path.join(bucket, name)); } catch { /* already claimed */ }
    }
}

/** Read-and-clear by atomically claiming the current scene ledger. */
export function takeSceneTruth(sagaId: string, sceneId: string): SceneTruthEntry[] {
    const bucket = bucketPath(sagaId, sceneId);
    const claimed = `${bucket}.claimed-${randomUUID()}`;
    try {
        fs.renameSync(bucket, claimed);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }

    const aad = ledgerKey(sagaId, sceneId);
    const entries: SceneTruthEntry[] = [];
    let consumed = false;
    try {
        for (const name of entryFiles(claimed).slice(-MAX_ENTRIES)) {
            entries.push(decode(fs.readFileSync(path.join(claimed, name), 'utf8'), aad));
        }
        consumed = true;
        return entries;
    } finally {
        if (consumed) {
            fs.rmSync(claimed, { recursive: true, force: true });
        } else if (!fs.existsSync(bucket)) {
            // A wrong/missing key must never destroy the only objective record.
            // Restore it so the operation can be retried with the correct key.
            fs.renameSync(claimed, bucket);
        }
    }
}

/** Test-only. Tests must point SCENE_TRUTH_DIR at their own temporary directory. */
export function __resetSceneTruth(): void {
    if (!process.env.SCENE_TRUTH_DIR) {
        throw new Error('__resetSceneTruth requires an explicit SCENE_TRUTH_DIR');
    }
    fs.rmSync(rootDir(), { recursive: true, force: true });
}
