import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveBeatPerceiverIds, projectEventBeatsForWitness } from '../src/core/scene-perception.ts';
import type { CanonicalSceneEvent } from '../src/ports.ts';

const cast = [
    { id: 'su', name: '蘇映雪' },
    { id: 'liu', name: '柳生春' },
    { id: 'jiang', name: '江聞鶴' },
];

test('addressed aside reaches only actor and addressee; outsider gets redacted physics', () => {
    const perceiverIds = deriveBeatPerceiverIds(
        { characterId: 'su', addressed: '柳生春', audience: 'addressed' },
        cast,
    );
    assert.deepEqual(perceiverIds, ['su', 'liu']);
    const event: CanonicalSceneEvent = {
        v: 1,
        id: 's:d1:t0:stage',
        sagaId: 's',
        day: 1,
        tick: 0,
        clock: '清晨',
        sceneId: 'stage',
        sceneName: '戲台',
        visibility: 'public',
        witnessIds: cast.map((c) => c.id),
        beats: [{
            characterId: 'su',
            name: '蘇映雪',
            text: '貼著她說：「只給你。」',
            addressed: '柳生春',
            audience: 'addressed',
            perceiverIds,
        }],
    };
    assert.match(projectEventBeatsForWitness(event, 'liu')[0].text, /只給你/);
    const outsider = projectEventBeatsForWitness(event, 'jiang')[0].text;
    assert.doesNotMatch(outsider, /只給你/);
    assert.match(outsider, /聽不清/);
});

test('invalid addressed-only target fails closed to the actor', () => {
    assert.deepEqual(
        deriveBeatPerceiverIds({ characterId: 'su', addressed: '不在場的人', audience: 'addressed' }, cast),
        ['su'],
    );
});
