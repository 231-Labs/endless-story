import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EpistemicDossierBundle } from '@endless-story/shared';
import { anthologyCandidateFromDossier, planSeasonAnthology } from '../src/services/storyteller-chapter/anthology.ts';

function dossier(input: {
    id: string;
    day: number;
    cast: string[];
    resolvedWants?: number;
    departures?: number;
    relationshipTurn?: boolean;
    objectChanges?: number;
    contested?: boolean;
}): EpistemicDossierBundle {
    return {
        v: 1,
        event: {
            slug: input.id,
            saga: 'spring-snow',
            day: input.day,
            scene: '雲錦台',
            title: input.id,
            kicker: '同一件事',
            summary: `${input.id} 摘要`,
            hero: '/scene.webp',
            heroAlt: '場景',
            canonFacts: ['柳生春：落下一句話。'],
            editorialSignals: {
                resolvedWants: input.resolvedWants ?? 0,
                departures: input.departures ?? 0,
                relationshipTurn: input.relationshipTurn ?? false,
                objectChanges: input.objectChanges,
            },
        },
        manifest: {
            v: 1,
            eventId: input.id,
            canonHead: input.id,
            evidence: [],
            perspectives: input.cast.map((characterId) => ({
                id: `${input.id}:${characterId}`,
                characterId,
                characterName: characterId,
                role: '戲班人',
                portrait: '/portrait.webp',
                lead: `${characterId}記得的並不相同。`,
                passages: [{ id: `${input.id}:${characterId}:p0`, text: '我記得那一刻。', claimIds: [`${input.id}:${characterId}:c0`] }],
                claims: [{
                    id: `${input.id}:${characterId}:c0`,
                    text: '我以為她另有所指。',
                    epistemicMode: 'inferred',
                    relation: input.contested ? 'reinterprets' : 'unresolved',
                    review: input.contested ? 'contested' : 'unresolved',
                    editorialNote: '客觀層不能證明動機。',
                    evidenceRefs: [],
                }],
            })),
        },
    };
}

test('epistemically rich banter is development, never promoted to a turning point', () => {
    const candidate = anthologyCandidateFromDossier(dossier({
        id: 'spring-snow:d2:t6:stage',
        day: 2,
        cast: ['liu', 'su', 'jin', 'qiao'],
        contested: true,
    }));
    assert.equal(candidate.role, 'development');
    assert.equal(planSeasonAnthology([dossier({
        id: 'spring-snow:d2:t6:stage', day: 2, cast: ['liu', 'su'], contested: true,
    })]).publishable, false);
});

test('two objective turns publish, with at most one cast-linked bridge between them', () => {
    const first = dossier({ id: 'spring-snow:d1:t1:stage', day: 1, cast: ['liu', 'su'], resolvedWants: 1 });
    const unrelated = dossier({ id: 'spring-snow:d1:t2:kitchen', day: 1, cast: ['cook', 'qiao'], contested: true });
    const bridge = dossier({ id: 'spring-snow:d1:t3:stage', day: 1, cast: ['liu', 'su'], contested: true });
    const quiet = dossier({ id: 'spring-snow:d1:t4:stage', day: 1, cast: ['liu', 'su'] });
    const second = dossier({ id: 'spring-snow:d1:t5:stage', day: 1, cast: ['liu', 'su'], relationshipTurn: true });

    const plan = planSeasonAnthology([first, unrelated, bridge, quiet, second]);
    assert.equal(plan.publishable, true);
    assert.deepEqual(plan.selected.map((pick) => pick.eventId), [
        'spring-snow:d1:t1:stage',
        'spring-snow:d1:t3:stage',
        'spring-snow:d1:t5:stage',
    ]);
    assert.equal(plan.selected[1].role, 'development');
    assert.ok(plan.omitted.some((item) => item.eventId === unrelated.manifest.eventId));
    assert.ok(plan.omitted.some((item) => item.eventId === quiet.manifest.eventId));
});

test('registered object mutation is an objective turn, not static banter', () => {
    const candidate = anthologyCandidateFromDossier(dossier({
        id: 'spring-snow:d1:t2:wardrobe', day: 1, cast: ['liu', 'tang'], objectChanges: 2,
    }));
    assert.equal(candidate.role, 'turning_point');
    assert.equal(candidate.signals.objectChanges, 2);
    assert.ok(candidate.score >= 14);
});
