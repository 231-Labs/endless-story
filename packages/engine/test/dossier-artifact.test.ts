import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDossierHeader } from '@endless-story/runner/services/event-dossier/compile';
import { compileTickDossiers } from '../src/dossier-artifact.ts';

const publicEvent = {
    v: 1 as const,
    id: 'spring-snow:d1:t0:stage',
    sagaId: 'spring-snow',
    day: 1,
    tick: 0,
    clock: '清晨',
    sceneId: 'stage',
    sceneName: '雲錦台戲台',
    visibility: 'public' as const,
    witnessIds: ['su', 'liu', 'qiao'],
    beats: [
        { characterId: 'su', name: '蘇映雪', text: '把溫茶推到生春手邊。', audience: 'scene' as const, perceiverIds: ['su', 'liu', 'qiao'] },
        { characterId: 'liu', name: '柳生春', text: '接過茶盞，偏頭一笑。', audience: 'scene' as const, perceiverIds: ['su', 'liu', 'qiao'] },
    ],
};

test('a tick event compiles into the same grounded header the UI parses', () => {
    const [artifact] = compileTickDossiers({
        events: [publicEvent],
        eventPovs: [
            { characterId: 'su', name: '蘇映雪', eventId: publicEvent.id, body: '我只當她又在逞強。' },
            { characterId: 'liu', name: '柳生春', eventId: publicEvent.id, body: '那盞茶比話暖。' },
            { characterId: 'outsider', name: '場外人', eventId: publicEvent.id, body: '我什麼都知道。' },
        ],
    }, [
        { id: 'su', name: '蘇映雪', role: '花旦' },
        { id: 'liu', name: '柳生春', role: '坤生' },
    ]);

    assert.ok(artifact);
    assert.equal(artifact.bundle.manifest.perspectives.length, 2, 'non-witness POV must be dropped');
    assert.equal(artifact.bundle.manifest.evidence.filter((e) => e.visibility === 'public').length, 2);
    assert.equal(artifact.bundle.manifest.canonHead, publicEvent.id);
    const parsed = parseDossierHeader(artifact.content);
    assert.equal(parsed.bundle?.manifest.eventId, publicEvent.id);
    assert.match(parsed.body, /蘇映雪：把溫茶推到生春手邊/);
});

test('private or single-POV events never become public dossiers', () => {
    const lonePov = [{ characterId: 'su', name: '蘇映雪', eventId: publicEvent.id, body: '只我一人。' }];
    assert.deepEqual(compileTickDossiers({ events: [publicEvent], eventPovs: lonePov }, []), []);
    assert.deepEqual(compileTickDossiers({
        events: [{ ...publicEvent, visibility: 'private' as const }],
        eventPovs: [
            ...lonePov,
            { characterId: 'liu', name: '柳生春', eventId: publicEvent.id, body: '只她知道。' },
        ],
    }, []), []);
});
