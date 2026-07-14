import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    FileCharacterSessionStore,
    PersistentCharacterSessions,
    type CharacterSessionIdentity,
    type CharacterSessionModel,
} from '../src/session/character-session.ts';

class RecordingModel implements CharacterSessionModel {
    calls: Array<{ system: string; messages: Array<{ role: string; content: string }> }> = [];
    async complete(input: Parameters<CharacterSessionModel['complete']>[0]): Promise<string> {
        this.calls.push({ system: input.system, messages: input.messages });
        if (input.system.includes('壓成第一人稱記憶')) return '我記得舊約、誤會與 event-old。';
        return `答${this.calls.length}`;
    }
}

const liu: CharacterSessionIdentity = {
    sagaId: 'spring-snow',
    characterId: 'liu',
    characterName: '柳生春',
    canon: '你就是柳生春。英氣風流的坤生。',
};

test('persistent character session resumes after process-style registry restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-restart-'));
    const firstModel = new RecordingModel();
    const first = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), firstModel);
    await first.respond(liu, '我在戲臺看見金鳳。', { eventId: 'event-1' });

    const secondModel = new RecordingModel();
    const second = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), secondModel);
    await second.respond(liu, '第二天她沒有來。', { eventId: 'event-2' });

    const sent = secondModel.calls.at(-1)!.messages.map((m) => m.content).join('\n');
    assert.match(sent, /我在戲臺看見金鳳/);
    assert.match(sent, /第二天她沒有來/);
    assert.equal(second.inspect(liu).revision, 2);
});

test('same-named characters in different sagas never share a transcript', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-isolation-'));
    const model = new RecordingModel();
    const sessions = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), model);
    const other = { ...liu, sagaId: 'another-saga' };

    await sessions.respond(liu, '春雪社的秘密。', { eventId: 'a' });
    await sessions.respond(other, '另一個世界的事。', { eventId: 'b' });

    const secondCall = model.calls.at(-1)!.messages.map((m) => m.content).join('\n');
    assert.doesNotMatch(secondCall, /春雪社的秘密/);
    assert.match(secondCall, /另一個世界的事/);
    assert.equal(sessions.inspect(liu).messages.length, 2);
    assert.equal(sessions.inspect(other).messages.length, 2);
});

test('compaction keeps a grounded memoir and the recent turns', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-compact-'));
    const model = new RecordingModel();
    const sessions = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), model, 80);
    for (let i = 0; i < 8; i++) {
        await sessions.respond(liu, `event-${i}：${'很長的親歷'.repeat(8)}`, { eventId: `event-${i}` });
    }

    const snapshot = sessions.inspect(liu);
    assert.match(snapshot.summary ?? '', /event-old/);
    assert.ok(snapshot.messages.some((m) => m.eventId === 'event-7'), 'recent event remains verbatim');
    assert.ok(snapshot.messages.length < 16, 'older turns were folded');
});

test('POV projection reads the lived transcript but does not append editorial prose', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-project-'));
    const model = new RecordingModel();
    const sessions = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), model);
    await sessions.observe(liu, '【客觀事件 event-3】金鳳撕了票。', 'event-3');
    const before = sessions.inspect(liu);
    const prose = await sessions.project(liu, '寫我眼中的這一幕。', {
        eventId: 'event-3',
        instruction: '第一人稱，只寫知道的事。',
    });
    const after = sessions.inspect(liu);

    assert.match(prose, /^答/);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.messages, before.messages);
    assert.match(model.calls.at(-1)!.messages.map((m) => m.content).join('\n'), /金鳳撕了票/);
});

test('session files retain event ids as auditable provenance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-file-'));
    const sessions = new PersistentCharacterSessions(new FileCharacterSessionStore(dir), new RecordingModel());
    await sessions.respond(liu, '看見一盞燈滅了。', { eventId: 'tx:event-9' });
    const files = await import('node:fs').then((fs) => fs.readdirSync(dir));
    const raw = readFileSync(join(dir, files[0]), 'utf8');
    assert.match(raw, /tx:event-9/);
    assert.match(raw, /看見一盞燈滅了/);
});

test('encrypted session store survives restart without leaving private prose at rest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'es-session-encrypted-'));
    const key = '7a'.repeat(32);
    const first = new PersistentCharacterSessions(
        new FileCharacterSessionStore(dir, key),
        new RecordingModel(),
    );
    await first.respond(liu, '這句私話不可明文落盤。', { eventId: 'private-1' });
    const files = await import('node:fs').then((fs) => fs.readdirSync(dir));
    const raw = readFileSync(join(dir, files[0]), 'utf8');
    assert.doesNotMatch(raw, /私話不可明文/);
    assert.match(raw, /aes-256-gcm/);

    const reopened = new PersistentCharacterSessions(
        new FileCharacterSessionStore(dir, key),
        new RecordingModel(),
    );
    assert.match(reopened.inspect(liu).messages[0].content, /私話不可明文/);
    assert.throws(
        () => new FileCharacterSessionStore(dir).load(liu),
        /CHARACTER_SESSION_KEY is missing/,
    );
});
