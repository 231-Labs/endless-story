/**
 * Durable per-character LLM sessions.
 *
 * The physics engine owns what happened; this store owns only what one
 * character was told and how that character answered.  A session is keyed by
 * (sagaId, characterId), so two casts can never share a transcript by name.
 * Files are replaced atomically and re-opened on every process start.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SessionMessage {
    role: 'user' | 'assistant';
    content: string;
    /** Immutable world event/percept this turn came from, when applicable. */
    eventId?: string;
    at: string;
}

export interface CharacterSessionIdentity {
    sagaId: string;
    characterId: string;
    characterName: string;
    /** Stable seed identity. Dynamic world state must arrive as a percept. */
    canon: string;
}

export interface CharacterSessionSnapshot extends CharacterSessionIdentity {
    v: 1;
    canonHash: string;
    summary?: string;
    messages: SessionMessage[];
    revision: number;
    updatedAt: string;
}

export interface SessionCompletionInput {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens: number;
    temperature: number;
}

export interface CharacterSessionModel {
    complete(input: SessionCompletionInput): Promise<string>;
}

export interface RespondOptions {
    eventId?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface ProjectOptions extends RespondOptions {
    /** Extra task boundary for a read-only projection such as a POV chapter. */
    instruction: string;
}

interface EncryptedSessionEnvelope {
    v: 1;
    alg: 'aes-256-gcm';
    iv: string;
    tag: string;
    ciphertext: string;
}

const DEFAULT_BUDGET = 24_000;
const SUMMARY_KEEP_TURNS = 8;

function hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function keyOf(identity: Pick<CharacterSessionIdentity, 'sagaId' | 'characterId'>): string {
    return hash(`${identity.sagaId}\0${identity.characterId}`).slice(0, 32);
}

function systemPrompt(s: CharacterSessionSnapshot): string {
    return [
        s.canon,
        '',
        '你是一個持續活在世界裡的人，不是每回重新開場的作者。',
        '你只知道這個 session 親歷、被告知或記住的事；別替不在場的人補內心，別引用未投遞給你的事件。',
        s.summary ? `\n【較早的親歷摘要】\n${s.summary}` : '',
    ].filter(Boolean).join('\n');
}

function transcriptChars(messages: SessionMessage[]): number {
    return messages.reduce((n, m) => n + m.content.length, 0);
}

/** File-backed store with strict identity collision checks. */
export class FileCharacterSessionStore {
    readonly dir: string;
    private readonly encryptionKey?: Buffer;

    constructor(dir: string, encryptionKey?: string) {
        this.dir = dir;
        this.encryptionKey = encryptionKey ? decodeEncryptionKey(encryptionKey) : undefined;
    }

    private file(identity: Pick<CharacterSessionIdentity, 'sagaId' | 'characterId'>): string {
        return path.join(this.dir, `${keyOf(identity)}.json`);
    }

    load(identity: CharacterSessionIdentity): CharacterSessionSnapshot | null {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file(identity), 'utf8')) as CharacterSessionSnapshot | EncryptedSessionEnvelope;
            const raw = isEncryptedEnvelope(parsed)
                ? this.decrypt(parsed, identity)
                : parsed;
            if (raw.v !== 1 || raw.sagaId !== identity.sagaId || raw.characterId !== identity.characterId) {
                throw new Error('character session identity collision');
            }
            // System canon is intentionally written once. Later profile copy may
            // evolve, but reopening a session must not silently rewrite its past.
            return raw;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw err;
        }
    }

    save(snapshot: CharacterSessionSnapshot): void {
        fs.mkdirSync(this.dir, { recursive: true });
        const file = this.file(snapshot);
        const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        const stored = this.encryptionKey ? this.encrypt(snapshot) : snapshot;
        fs.writeFileSync(temp, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
        fs.renameSync(temp, file);
    }

    private encrypt(snapshot: CharacterSessionSnapshot): EncryptedSessionEnvelope {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
        cipher.setAAD(Buffer.from(keyOf(snapshot), 'utf8'));
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(snapshot), 'utf8'),
            cipher.final(),
        ]);
        return {
            v: 1,
            alg: 'aes-256-gcm',
            iv: iv.toString('base64'),
            tag: cipher.getAuthTag().toString('base64'),
            ciphertext: ciphertext.toString('base64'),
        };
    }

    private decrypt(envelope: EncryptedSessionEnvelope, identity: CharacterSessionIdentity): CharacterSessionSnapshot {
        if (!this.encryptionKey) throw new Error('character session is encrypted but CHARACTER_SESSION_KEY is missing');
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            this.encryptionKey,
            Buffer.from(envelope.iv, 'base64'),
        );
        decipher.setAAD(Buffer.from(keyOf(identity), 'utf8'));
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
            decipher.final(),
        ]).toString('utf8');
        return JSON.parse(plaintext) as CharacterSessionSnapshot;
    }
}

function isEncryptedEnvelope(value: CharacterSessionSnapshot | EncryptedSessionEnvelope): value is EncryptedSessionEnvelope {
    return (value as EncryptedSessionEnvelope).alg === 'aes-256-gcm';
}

function decodeEncryptionKey(value: string): Buffer {
    const trimmed = value.trim();
    const key = /^[0-9a-f]{64}$/i.test(trimmed)
        ? Buffer.from(trimmed, 'hex')
        : Buffer.from(trimmed, 'base64');
    if (key.length !== 32) throw new Error('CHARACTER_SESSION_KEY must be 32 bytes (64 hex chars or base64)');
    return key;
}

/**
 * Registry serialises calls per character. Different characters may still run
 * concurrently; the same character can never lose a turn to a write race.
 */
export class PersistentCharacterSessions {
    private readonly tails = new Map<string, Promise<void>>();
    readonly store: FileCharacterSessionStore;
    readonly model: CharacterSessionModel;
    readonly charBudget: number;

    constructor(
        store: FileCharacterSessionStore,
        model: CharacterSessionModel,
        charBudget = DEFAULT_BUDGET,
    ) {
        this.store = store;
        this.model = model;
        this.charBudget = charBudget;
    }

    private initial(identity: CharacterSessionIdentity): CharacterSessionSnapshot {
        const now = new Date().toISOString();
        return {
            v: 1,
            ...identity,
            canonHash: hash(identity.canon),
            messages: [],
            revision: 0,
            updatedAt: now,
        };
    }

    inspect(identity: CharacterSessionIdentity): CharacterSessionSnapshot {
        return this.store.load(identity) ?? this.initial(identity);
    }

    private async locked<T>(identity: CharacterSessionIdentity, work: () => Promise<T>): Promise<T> {
        const key = keyOf(identity);
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release!: () => void;
        const tail = new Promise<void>((resolve) => { release = resolve; });
        const queued = previous.then(() => tail);
        this.tails.set(key, queued);
        await previous;
        try {
            return await work();
        } finally {
            release();
            if (this.tails.get(key) === queued) this.tails.delete(key);
        }
    }

    private async compact(snapshot: CharacterSessionSnapshot): Promise<void> {
        if (transcriptChars(snapshot.messages) <= this.charBudget) return;
        // Never compact away the current percept merely because one prompt is
        // long. Compaction starts only when there is a genuine older tranche.
        if (snapshot.messages.length <= SUMMARY_KEEP_TURNS) return;
        const cut = Math.max(2, snapshot.messages.length - SUMMARY_KEEP_TURNS);
        const old = snapshot.messages.slice(0, cut);
        if (!old.length) return;
        const summary = await this.model.complete({
            system: '把一個角色較早的親歷壓成第一人稱記憶。保留人物關係、承諾、誤解、未解心事與事件 id；不可加入新事實。',
            messages: [{
                role: 'user',
                content: `${snapshot.summary ? `【原摘要】\n${snapshot.summary}\n\n` : ''}【較早對話】\n${old.map((m) => `${m.role}:${m.content}`).join('\n')}`,
            }],
            maxTokens: 900,
            temperature: 0.2,
        });
        snapshot.summary = summary.trim();
        snapshot.messages = snapshot.messages.slice(cut);
    }

    async observe(identity: CharacterSessionIdentity, percept: string, eventId?: string): Promise<void> {
        await this.locked(identity, async () => {
            const snapshot = this.inspect(identity);
            if (eventId && snapshot.messages.some((m) => m.role === 'user' && m.eventId === eventId)) return;
            snapshot.messages.push({ role: 'user', content: percept, eventId, at: new Date().toISOString() });
            await this.compact(snapshot);
            snapshot.revision += 1;
            snapshot.updatedAt = new Date().toISOString();
            this.store.save(snapshot);
        });
    }

    async respond(identity: CharacterSessionIdentity, percept: string, options: RespondOptions = {}): Promise<string> {
        return this.locked(identity, async () => {
            const snapshot = this.inspect(identity);
            snapshot.messages.push({ role: 'user', content: percept, eventId: options.eventId, at: new Date().toISOString() });
            await this.compact(snapshot);
            const reply = await this.model.complete({
                system: systemPrompt(snapshot),
                messages: snapshot.messages.map(({ role, content }) => ({ role, content })),
                maxTokens: options.maxTokens ?? 480,
                temperature: options.temperature ?? 0.95,
            });
            snapshot.messages.push({ role: 'assistant', content: reply.trim(), eventId: options.eventId, at: new Date().toISOString() });
            snapshot.revision += 1;
            snapshot.updatedAt = new Date().toISOString();
            this.store.save(snapshot);
            return reply.trim();
        });
    }

    /** Read the lived transcript to write a POV, without teaching the character that prose happened. */
    async project(identity: CharacterSessionIdentity, prompt: string, options: ProjectOptions): Promise<string> {
        return this.locked(identity, async () => {
            const snapshot = this.inspect(identity);
            return (await this.model.complete({
                system: `${systemPrompt(snapshot)}\n\n【此刻任務】${options.instruction}`,
                messages: [
                    ...snapshot.messages.map(({ role, content }) => ({ role, content })),
                    { role: 'user' as const, content: prompt },
                ],
                maxTokens: options.maxTokens ?? 1500,
                temperature: options.temperature ?? 0.8,
            })).trim();
        });
    }
}
