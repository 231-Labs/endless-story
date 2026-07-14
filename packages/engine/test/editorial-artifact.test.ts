import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { writeTickDossiers } from '../src/dossier-artifact.ts';
import { refreshSeasonEditorial } from '../src/editorial-artifact.ts';

function report(tick: number, relationshipTurn = false) {
    const id = `spring-snow:d1:t${tick}:stage`;
    return {
        events: [{
            v: 1 as const,
            id,
            sagaId: 'spring-snow',
            day: 1,
            tick,
            clock: '午後',
            sceneId: 'stage',
            sceneName: '雲錦台',
            visibility: 'public' as const,
            witnessIds: ['liu', 'su'],
            editorialSignals: { resolvedWants: relationshipTurn ? 0 : 1, departures: 0, relationshipTurn },
            beats: [
                { characterId: 'liu', name: '柳生春', text: '把戲帖交到映雪手裡。', audience: 'scene' as const, perceiverIds: ['liu', 'su'] },
                { characterId: 'su', name: '蘇映雪', text: '接住戲帖，沒有退回去。', audience: 'scene' as const, perceiverIds: ['liu', 'su'] },
            ],
        }],
        eventPovs: [
            { characterId: 'liu', name: '柳生春', eventId: id, body: '她終於沒有把戲帖退回來。' },
            { characterId: 'su', name: '蘇映雪', eventId: id, body: '我接住的不是一張紙。' },
        ],
    };
}

test('periodic editor waits for two turns and only recomposes when selection changes', async (t) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'endless-editor-'));
    t.after(() => fs.rmSync(out, { recursive: true, force: true }));
    const cast = [
        { id: 'liu', name: '柳生春', role: '坤生', gender: '女' },
        { id: 'su', name: '蘇映雪', role: '花旦', gender: '女' },
    ];
    let compositions = 0;
    const compose = async () => {
        compositions++;
        return '# 季選集\n\n兩個轉折終於接成了一回。';
    };

    await writeTickDossiers(out, report(1), cast);
    const waiting = await refreshSeasonEditorial(out, compose);
    assert.equal(waiting.plan.publishable, false);
    assert.equal(compositions, 0);

    await writeTickDossiers(out, report(2, true), cast);
    const published = await refreshSeasonEditorial(out, compose);
    assert.equal(published.plan.publishable, true);
    assert.equal(published.anthologyWritten, true);
    assert.equal(compositions, 1);
    assert.match(fs.readFileSync(path.join(out, 'editorial', 'season-anthology.md'), 'utf8'), /兩個轉折/);

    const unchanged = await refreshSeasonEditorial(out, compose);
    assert.equal(unchanged.selectionChanged, false);
    assert.equal(unchanged.anthologyWritten, false);
    assert.equal(compositions, 1);
});
