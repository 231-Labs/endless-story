/**
 * Still-compiler tests. The pure heat-gate (selectStillBeats) + prompt are the
 * logic-heavy parts and get full coverage; runOnce orchestration is tested with
 * an injected mock render + anchor (no live image model / chain).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    selectStillBeats,
    buildStillPrompt,
    heatPaletteHint,
    compileStills,
    type CaptureStillsInput,
    type CompileStillsDeps,
} from '../src/services/still-compiler/select.ts';

type Heat = { cinnabar: number; jade: number; mute: number };
const h = (cinnabar: number, jade = 0, mute = 0): Heat => ({ cinnabar, jade, mute });

// ─── selectStillBeats (the heat gate) ────────────────────────────────

test('selectStillBeats: empty / undefined → no beats', () => {
    assert.deepEqual(selectStillBeats([]), []);
    assert.deepEqual(selectStillBeats(undefined), []);
});

test('selectStillBeats: threshold 0 + alwaysClimax captures all, capped chronologically', () => {
    const beats = [h(1), h(2), h(3)];
    assert.deepEqual(selectStillBeats(beats, { tensionThreshold: 0, maxPerEvent: 5 }), [0, 1, 2]);
});

test('selectStillBeats: only beats crossing threshold qualify', () => {
    const beats = [h(1), h(8), h(2), h(9)];
    // threshold 5, no climax → beats 1 and 3
    assert.deepEqual(
        selectStillBeats(beats, { tensionThreshold: 5, alwaysClimax: false, maxPerEvent: 5 }),
        [1, 3],
    );
});

test('selectStillBeats: alwaysClimax pins the last beat even below threshold', () => {
    const beats = [h(9), h(1), h(0)]; // only beat 0 crosses; last (2) is calm
    assert.deepEqual(
        selectStillBeats(beats, { tensionThreshold: 5, alwaysClimax: true, maxPerEvent: 5 }),
        [0, 2],
    );
});

test('selectStillBeats: over the cap keeps highest-cinnabar AND pins the climax', () => {
    // beats: 0=hi 1=mid 2=top 3=low(climax). cap 2, alwaysClimax → keep top + climax.
    const beats = [h(7), h(5), h(9), h(1)];
    const got = selectStillBeats(beats, { tensionThreshold: 0, maxPerEvent: 2, alwaysClimax: true });
    assert.deepEqual(got, [2, 3]); // top (2) + climax (3), chronological
});

test('selectStillBeats: cap without climax keeps the N highest, chronological', () => {
    const beats = [h(7), h(5), h(9), h(1)];
    const got = selectStillBeats(beats, { tensionThreshold: 0, maxPerEvent: 2, alwaysClimax: false });
    assert.deepEqual(got, [0, 2]); // 9 and 7 → indices 2,0 → sorted 0,2
});

test('selectStillBeats: maxPerEvent 0 with climax still yields the climax (min 1)', () => {
    const beats = [h(1), h(2)];
    assert.deepEqual(selectStillBeats(beats, { maxPerEvent: 0, alwaysClimax: true }), [1]);
    assert.deepEqual(selectStillBeats(beats, { maxPerEvent: 0, alwaysClimax: false }), []);
});

// ─── prompt / palette ────────────────────────────────────────────────

test('heatPaletteHint: dominant axis picks the palette', () => {
    assert.match(heatPaletteHint(h(9, 1, 1)), /硃紅/);
    assert.match(heatPaletteHint({ cinnabar: 1, jade: 9, mute: 1 }), /青碧/);
    assert.match(heatPaletteHint({ cinnabar: 1, jade: 1, mute: 9 }), /素淡/);
    assert.equal(heatPaletteHint({ cinnabar: 0, jade: 0, mute: 0 }), '');
    assert.equal(heatPaletteHint(undefined), '');
});

test('buildStillPrompt: includes cast, scene, beat, and the no-text guard', () => {
    const p = buildStillPrompt({
        cast: '孟雲屏（青衣）、柳生春（小生）',
        sceneName: '後台',
        beatText: '兩人對視無言',
        heat: h(9),
    });
    assert.match(p, /孟雲屏（青衣）、柳生春（小生）/);
    assert.match(p, /後台/);
    assert.match(p, /兩人對視無言/);
    assert.match(p, /硃紅/); // heat palette folded in
    assert.match(p, /無任何文字/); // NO_TEXT guard
});

// ─── runOnce orchestration (mock render + anchor) ────────────────────

const baseInput: CaptureStillsInput = {
    sagaId: '0xsaga',
    eventId: '0xevent',
    eventTx: '0xtx',
    sceneId: '0xscene',
    sceneName: '斷橋',
    involvedCharacterIds: ['0xa', '0xb'],
    cast: '甲（小生）、乙（花旦）',
    beatTexts: ['初遇', '爭執', '訣別'],
    beatHeat: [h(2), h(8), h(9)],
    tensionThreshold: 5,
    maxPerEvent: 3,
};

const mockDeps = (over: Partial<CompileStillsDeps> = {}): CompileStillsDeps => ({
    render: async ({ characterIds }) => ({
        ok: true,
        bytes: new Uint8Array([1, 2, 3]),
        usedCharacterIds: characterIds,
    }),
    anchor: async (items) => items.map((_, i) => ({ blobId: `blob${i}`, commitmentId: `cmt${i}` })),
    now: () => '2026-06-14T00:00:00.000Z',
    ...over,
});

test('compileStills: no cast → skip', async () => {
    const r = await compileStills({ ...baseInput, involvedCharacterIds: [] }, mockDeps());
    assert.equal(r.skipReason, 'no_cast');
    assert.equal(r.stills.length, 0);
});

test('compileStills: no qualifying beats (high threshold, no climax) → skip', async () => {
    const r = await compileStills(
        { ...baseInput, tensionThreshold: 999, alwaysClimax: false },
        mockDeps(),
    );
    assert.equal(r.skipReason, 'no_qualifying_beats');
});

test('compileStills: dryRun builds prompts + beats but renders/anchors nothing', async () => {
    let renderCalls = 0;
    const r = await compileStills(
        { ...baseInput, dryRun: true },
        mockDeps({
            render: async (a) => {
                renderCalls += 1;
                return { ok: true, bytes: new Uint8Array([1]), usedCharacterIds: a.characterIds };
            },
        }),
    );
    assert.equal(renderCalls, 0);
    assert.equal(r.anchored, false);
    assert.deepEqual(r.capturedBeats, [1, 2]); // beats ≥5: 1,2 (climax 2 already in)
    assert.equal(r.prompts.length, 2);
    assert.equal(r.stills.length, 2);
    assert.equal(r.stills[0].fullBlobId, ''); // not uploaded on dryRun
    assert.equal(r.stills[0].eventId, '0xevent');
});

test('compileStills: happy path renders per beat, anchors the batch, stamps provenance', async () => {
    const r = await compileStills(baseInput, mockDeps());
    assert.equal(r.anchored, true);
    assert.deepEqual(r.capturedBeats, [1, 2]);
    assert.equal(r.stills.length, 2);
    assert.equal(r.stills[0].beatIndex, 1);
    assert.equal(r.stills[1].beatIndex, 2);
    assert.equal(r.stills[0].fullBlobId, 'blob0');
    assert.equal(r.stills[1].fullBlobId, 'blob1');
    assert.equal(r.stills[0].eventTx, '0xtx');
    assert.deepEqual(r.stills[0].involvedCharacterIds, ['0xa', '0xb']);
    assert.deepEqual(r.stills[0].heat, h(8)); // beat 1's heat
    assert.equal(r.stills[0].createdAt, '2026-06-14T00:00:00.000Z');
});

test('compileStills: all renders fail → render_failed with errors', async () => {
    const r = await compileStills(
        baseInput,
        mockDeps({ render: async () => ({ ok: false, usedCharacterIds: [], skipped: 'no_anchors' }) }),
    );
    assert.equal(r.skipReason, 'render_failed');
    assert.equal(r.anchored, false);
    assert.ok((r.errors ?? []).length >= 1);
});

test('compileStills: a partial render failure still anchors the successes', async () => {
    let n = 0;
    const r = await compileStills(
        baseInput,
        mockDeps({
            render: async (a) => {
                n += 1;
                return n === 1
                    ? { ok: false, usedCharacterIds: [], skipped: 'empty_image' }
                    : { ok: true, bytes: new Uint8Array([9]), usedCharacterIds: a.characterIds };
            },
        }),
    );
    assert.equal(r.anchored, true);
    assert.equal(r.stills.length, 1); // only the 2nd beat survived
    assert.equal(r.stills[0].beatIndex, 2);
    assert.ok((r.errors ?? []).length === 1);
});

test('compileStills: non-dryRun with anchor=null → no_signer', async () => {
    const r = await compileStills(baseInput, {
        render: async (a) => ({ ok: true, bytes: new Uint8Array([1]), usedCharacterIds: a.characterIds }),
        anchor: null,
        now: () => 'x',
    });
    assert.equal(r.skipReason, 'no_signer');
});
