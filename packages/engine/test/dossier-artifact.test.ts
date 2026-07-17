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
    editorialSignals: { resolvedWants: 1, departures: 0, relationshipTurn: false },
    beats: [
        { characterId: 'su', name: '蘇映雪', text: '把溫茶推到生春手邊。', audience: 'scene' as const, perceiverIds: ['su', 'liu', 'qiao'] },
        { characterId: 'liu', name: '柳安春', text: '接過茶盞，偏頭一笑。', audience: 'scene' as const, perceiverIds: ['su', 'liu', 'qiao'] },
    ],
};

test('a tick event compiles into the same grounded header the UI parses', async () => {
    const [artifact] = await compileTickDossiers({
        events: [publicEvent],
        eventPovs: [
            { characterId: 'su', name: '蘇映雪', eventId: publicEvent.id, body: '我只當她又在逞強。' },
            { characterId: 'liu', name: '柳安春', eventId: publicEvent.id, body: '那盞茶比話暖。' },
            { characterId: 'outsider', name: '場外人', eventId: publicEvent.id, body: '我什麼都知道。' },
        ],
    }, [
        { id: 'su', name: '蘇映雪', role: '花旦' },
        { id: 'liu', name: '柳安春', role: '坤生' },
    ]);

    assert.ok(artifact);
    assert.equal(artifact.bundle.manifest.perspectives.length, 2, 'non-witness POV must be dropped');
    assert.equal(artifact.bundle.manifest.evidence.filter((e) => e.visibility === 'public').length, 2);
    assert.equal(artifact.bundle.manifest.canonHead, publicEvent.id);
    assert.equal(artifact.bundle.event.editorialSignals?.resolvedWants, 1);
    const parsed = parseDossierHeader(artifact.content);
    assert.equal(parsed.bundle?.manifest.eventId, publicEvent.id);
    assert.match(parsed.body, /蘇映雪：把溫茶推到生春手邊/);
});

test('private or single-POV events never become public dossiers', async () => {
    const lonePov = [{ characterId: 'su', name: '蘇映雪', eventId: publicEvent.id, body: '只我一人。' }];
    assert.deepEqual(await compileTickDossiers({ events: [publicEvent], eventPovs: lonePov }, []), []);
    assert.deepEqual(await compileTickDossiers({
        events: [{ ...publicEvent, visibility: 'private' as const }],
        eventPovs: [
            ...lonePov,
            { characterId: 'liu', name: '柳安春', eventId: publicEvent.id, body: '只她知道。' },
        ],
    }, []), []);
});

test('real curator supplies bespoke leads, mixed review states, and passage-level claim mapping', async () => {
    const curator = {
        async curateDossier(event: any, perspectives: any[]) {
            assert.deepEqual(perspectives.map((perspective) => perspective.bodyFact), ['女', '女']);
            return perspectives.map((perspective) => ({
                ...perspective,
                lead: perspective.characterId === 'su'
                    ? '她把遞出去的那盞茶當作收手，卻被掌心留下的溫度拆穿。'
                    : '她原只想接一盞茶，最後握住的卻是師姐沒敢說完的半句話。',
                claims: [
                    {
                        id: `${event.id}:claim:${perspective.characterId}:0`,
                        text: '她親眼看見茶盞被推到生春手邊。',
                        epistemicMode: 'observed',
                        relation: 'supports',
                        review: 'verified',
                        editorialNote: '客觀逐拍第一拍直接記錄了遞茶動作，因此這一部分可以核對。',
                        evidenceRefs: [`${event.id}:beat:0`],
                    },
                    {
                        id: `${event.id}:claim:${perspective.characterId}:1`,
                        text: '她把偏頭一笑理解成沒有說出口的回應。',
                        epistemicMode: 'inferred',
                        relation: 'reinterprets',
                        review: 'contested',
                        editorialNote: '笑確實發生，但它是不是回應只存在角色自己的理解裡。',
                        evidenceRefs: [`${event.id}:beat:1`, `${event.id}:session:${perspective.characterId}`],
                    },
                ],
                passageClaimIds: {
                    0: [
                        `${event.id}:claim:${perspective.characterId}:0`,
                        `${event.id}:claim:${perspective.characterId}:1`,
                    ],
                },
            }));
        },
    };
    const [artifact] = await compileTickDossiers({
        events: [publicEvent],
        eventPovs: [
            { characterId: 'su', name: '蘇映雪', eventId: publicEvent.id, body: '我只當她又在逞強。' },
            { characterId: 'liu', name: '柳安春', eventId: publicEvent.id, body: '那盞茶比話暖。' },
        ],
    }, [
        { id: 'su', name: '蘇映雪', role: '花旦', gender: '女' },
        { id: 'liu', name: '柳安春', role: '坤生', gender: '女' },
    ], curator);

    assert.notEqual(artifact.bundle.manifest.perspectives[0].lead, artifact.bundle.manifest.perspectives[1].lead);
    assert.deepEqual(artifact.bundle.manifest.perspectives[0].claims.map((claim) => claim.review), ['verified', 'contested']);
    assert.equal(artifact.bundle.manifest.perspectives[0].passages[0].claimIds.length, 2);
});
