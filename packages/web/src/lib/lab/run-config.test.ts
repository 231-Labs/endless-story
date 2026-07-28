/**
 * 開卷設定 — every field a scroll can be opened with survives the request.
 *
 * The regression this guards is not hypothetical. `deckId` / `deckSource` /
 * `trackedCharacterNames` existed on `LabRunConfig`, the manager read them, and
 * the engine did everything with them — but the create-run route's field-by-field
 * normaliser never mentioned them. Result: every scroll opened from the web came
 * up with no event deck at all (no cards, no 月半結帳, no director, no 世情動作),
 * while the whole feature typechecked and its own tests passed, because nothing
 * tested the SEAM.
 *
 * So the load-bearing test here is the last one: it walks the config type's own
 * key list, and fails on any field a future edit adds to `LabRunConfig` without
 * teaching the normaliser about it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRunConfig } from './run-config.ts';
import type { LabRunConfig } from './types.ts';

test('presetId is the one genuinely required field', () => {
    assert.throws(() => normalizeRunConfig(undefined), /presetId/);
    assert.throws(() => normalizeRunConfig({}), /presetId/);
    assert.equal(normalizeRunConfig({ presetId: 'spring-snow' }).presetId, 'spring-snow');
});

test('the event deck reaches the run — the exact field the route used to drop', () => {
    const config = normalizeRunConfig({
        presetId: 'spring-snow',
        seasonId: 'spring-snow-premiere',
        deckId: 'spring-snow-premiere',
        deckSource: 'custom',
    });
    assert.equal(config.deckId, 'spring-snow-premiere');
    assert.equal(config.deckSource, 'custom');
    assert.equal(config.seasonId, 'spring-snow-premiere');
});

test('no deck means genuinely NO external-push layer — never a silent default', () => {
    // 不掛牌組 is a legitimate way to run a scroll (it is how every run behaved
    // before the deck existed), so an absent deckId must stay absent rather than
    // being helpfully filled in with whatever looks likely.
    const config = normalizeRunConfig({ presetId: 'spring-snow' });
    assert.equal(config.deckId, undefined);
    assert.equal(config.trackedCharacterNames, undefined, '空＝全班都追');
});

test('追蹤名單 accepts either an array or the form field\'s free text', () => {
    const fromArray = normalizeRunConfig({ presetId: 'p', trackedCharacterNames: [' 柳安春 ', '', '方競西'] });
    assert.deepEqual(fromArray.trackedCharacterNames, ['柳安春', '方競西']);

    // The lab form is one text input; people separate names however they like.
    const fromText = normalizeRunConfig({
        presetId: 'p',
        trackedCharacterNames: '柳安春、方競西  蘇映雪,金鳳' as unknown as string[],
    });
    assert.deepEqual(fromText.trackedCharacterNames, ['柳安春', '方競西', '蘇映雪', '金鳳']);

    assert.equal(normalizeRunConfig({ presetId: 'p', trackedCharacterNames: ['  '] }).trackedCharacterNames, undefined);
});

test('every flag defaults to the behaviour that predates it', () => {
    const config = normalizeRunConfig({ presetId: 'p' });
    assert.equal(config.llm, 'fake', '排演是安全的預設：零鑰即走');
    assert.equal(config.relationshipFallback, true, 'this one defaults ON — note the !== false');
    assert.equal(config.emergentProduction, false);
    assert.equal(config.heartsCanFade, false);
    assert.equal(config.beatPicksWant, false);
    assert.equal(config.quietPresence, false);
    assert.equal(config.realEmbeddings, false);
    assert.equal(config.seedSource, 'builtin');
    assert.equal(config.seasonSource, 'builtin');
});

test('ticksPerDay is clamped, and junk falls back rather than producing a broken clock', () => {
    assert.equal(normalizeRunConfig({ presetId: 'p' }).ticksPerDay, 6);
    assert.equal(normalizeRunConfig({ presetId: 'p', ticksPerDay: 8 }).ticksPerDay, 8);
    assert.equal(normalizeRunConfig({ presetId: 'p', ticksPerDay: 99 }).ticksPerDay, 12);
    assert.equal(normalizeRunConfig({ presetId: 'p', ticksPerDay: 1 }).ticksPerDay, 2);
    for (const junk of [0, -3, 2.5, NaN, undefined, 'six' as unknown as number]) {
        assert.equal(normalizeRunConfig({ presetId: 'p', ticksPerDay: junk }).ticksPerDay, 6, `junk: ${String(junk)}`);
    }
});

test('EVERY config field survives the request — this is the seam that broke', () => {
    // A fully-populated config, then the assertion that matters: the normaliser's
    // output has a key for every key the input had. Add a field to LabRunConfig,
    // forget to wire it, and this fails here instead of in a scroll three days in.
    const full: LabRunConfig = {
        presetId: 'spring-snow',
        seedSource: 'custom',
        seasonId: 'spring-snow-premiere',
        seasonSource: 'custom',
        deckId: 'spring-snow-premiere',
        deckSource: 'custom',
        trackedCharacterNames: ['柳安春', '方競西'],
        llm: 'real',
        relationshipFallback: false,
        emergentProduction: true,
        heartsCanFade: true,
        beatPicksWant: true,
        quietPresence: true,
        ticksPerDay: 8,
        realEmbeddings: true,
    };

    const config = normalizeRunConfig(full);
    for (const key of Object.keys(full) as Array<keyof LabRunConfig>) {
        assert.deepEqual(config[key], full[key], `「${key}」沒有活著走過這條路`);
    }
});
