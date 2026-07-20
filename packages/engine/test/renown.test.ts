/**
 * 口碑 (renown) — the two-layer reputation vector: PUBLIC 名頭 (renownOf,
 * observable by all) and PRIVATE 自視 (selfRegardOf, how they rate themselves,
 * may diverge). Deterministic (no LLM):
 *
 *   · seedRenown — table override wins per field; a name absent takes a ROLE
 *     default; idempotent (a resumed world keeps its earned values).
 *   · bumpRenown/bumpSelfRegard — clamp 0..1, no-op on unknown id.
 *   · renownLabel/selfRegardLabel — threshold descriptors for percepts.
 *   · the box-office hook — a settled full house LIFTS the leads' renown, a 停鑼
 *     LOWERS it; 口碑 is NOT money, so `auditSeasonEconomy` stays [] throughout.
 *   · renown/selfRegard round-trip through snapshot/restore (plain JSON).
 *
 * Authors its own performance + renown frame on top of the shared anchun
 * fixture (never edited), so existing acceptance balances are untouched.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { seedRenown } from '../src/core/renown.ts';
import {
    auditSeasonEconomy,
    bankRehearsalAttendance,
    settleEveningPerformance,
} from '../src/core/season-economy.ts';
import { WorldState, renownLabel, selfRegardLabel } from '../src/world-state.ts';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≈ ${b}`);

/** A canon renown table (a slice of the spring-snow-market values). */
const RENOWN_TABLE = {
    柳安春: { renown: 0.8, self: 0.55 }, // 當紅卻怕不夠好
    蘇映雪: { renown: 0.75, self: 0.6 },
};

/** anchun frame + a nightly performance + a renown table. The shared fixture is
 *  never mutated — only this local copy carries the performance/renown blocks. */
function renownWorld(withTable = true): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
    };
    if (withTable) (frame as { renown?: typeof RENOWN_TABLE }).renown = RENOWN_TABLE;
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

function venueId(world: WorldState): string {
    return world.data.scenes.find((scene) => scene.name === '雲錦台戲台')!.id;
}

test('seedRenown: a table value WINS per field; a name absent takes the role default', () => {
    const world = renownWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const shen = world.idByName('沈雪笙')!; // NOT in the table → 班主 role default (0.6 / 0.6)
    near(world.renownOf(liu), 0.8, '柳安春 renown from table');
    near(world.selfRegardOf(liu), 0.55, '柳安春 self-regard from table (diverges from renown)');
    near(world.renownOf(su), 0.75);
    near(world.renownOf(shen), 0.6, '沈雪笙 takes the 班主 role default');
    near(world.selfRegardOf(shen), 0.6);
});

test('seedRenown is idempotent per field — a resumed world keeps earned values', () => {
    const world = renownWorld();
    const liu = world.idByName('柳安春')!;
    world.bumpRenown(liu, 0.1); // 0.8 → 0.9 (an earned climb)
    seedRenown(world, RENOWN_TABLE); // re-seed (as a resume would) must NOT reset it
    near(world.renownOf(liu), 0.9, 'a re-seed does not overwrite an already-set value');
});

test('selfRegardOf falls back to renown when self is unseeded', () => {
    // A world with NO table: role defaults set both, so self is always defined. Prove
    // the accessor fallback directly on a bare cast member instead.
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const liu = world.idByName('柳安春')!;
    assert.equal(world.castById(liu)!.renown, undefined, 'no seed yet');
    assert.equal(world.renownOf(liu), 0.5, 'absent renown ⇒ neutral 0.5');
    assert.equal(world.selfRegardOf(liu), 0.5, 'absent self-regard ⇒ falls back to renown');
    world.castById(liu)!.renown = 0.9;
    assert.equal(world.selfRegardOf(liu), 0.9, 'self-regard still tracks renown until moved');
});

test('bumpRenown / bumpSelfRegard clamp 0..1 and no-op on an unknown id', () => {
    const world = renownWorld();
    const liu = world.idByName('柳安春')!;
    world.bumpRenown(liu, 5); // 0.8 + 5 → clamp 1
    assert.equal(world.renownOf(liu), 1);
    world.bumpRenown(liu, -5); // 1 - 5 → clamp 0
    assert.equal(world.renownOf(liu), 0);
    world.bumpSelfRegard(liu, 5);
    assert.equal(world.selfRegardOf(liu), 1);
    world.bumpSelfRegard(liu, -5);
    assert.equal(world.selfRegardOf(liu), 0);
    // no-op on unknown id (no throw, nothing created)
    world.bumpRenown('nobody', 0.5);
    world.bumpSelfRegard('nobody', 0.5);
    assert.equal(world.castById('nobody'), undefined);
});

test('renownLabel / selfRegardLabel — threshold descriptors', () => {
    assert.equal(renownLabel(0.9), '名滿上海');
    assert.equal(renownLabel(0.8), '名滿上海');
    assert.equal(renownLabel(0.65), '名頭正盛');
    assert.equal(renownLabel(0.5), '小有名氣');
    assert.equal(renownLabel(0.4), '小有名氣');
    assert.equal(renownLabel(0.25), '無甚名氣');
    assert.equal(renownLabel(0.1), '名頭黯淡');
    assert.equal(renownLabel(0), '名頭黯淡');
    // the inner voice, same thresholds
    assert.equal(selfRegardLabel(0.85), '自負得很');
    assert.equal(selfRegardLabel(0.1), '心裡發虛');
});

test('box office: a full house LIFTS the on-stage leads’ renown; audit stays []', () => {
    const world = renownWorld();
    const stage = venueId(world);
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const before = { liuR: world.renownOf(liu), liuS: world.selfRegardOf(liu), suR: world.renownOf(su) };

    // rehearsed full house of both leads + two hands → 滿座 (pct 100)
    for (const name of ['柳安春', '蘇映雪', '江聞鶴', '連翹']) world.moveCharacter(world.idByName(name)!, stage);
    bankRehearsalAttendance(world, 1); // 日午 rehearsal → no 70% penalty

    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, true);
    near(world.renownOf(liu), before.liuR + 0.05, '柳安春 renown lifted by a full house');
    near(world.selfRegardOf(liu), before.liuS + 0.03, 'a rousing house nudges self-regard');
    near(world.renownOf(su), before.suR + 0.05, '蘇映雪 lifted too (on the boards)');
    assert.deepEqual(auditSeasonEconomy(world), [], '口碑 is not money — audit clean');
});

test('box office: 停鑼 (no lead on stage) DENTS the billed leads’ renown; audit stays []', () => {
    const world = renownWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const before = { liuR: world.renownOf(liu), liuS: world.selfRegardOf(liu), suR: world.renownOf(su) };

    // pull BOTH leads OFF the boards (柳安春's own work scene is the venue) → no lead
    // on stage → 停鑼, box office 0.
    const backstage = world.data.scenes.find((s) => s.name === '後台妝閣')!.id;
    world.moveCharacter(liu, backstage);
    world.moveCharacter(su, backstage);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, false);
    near(world.renownOf(liu), before.liuR - 0.06, 'a cancelled show dents the billed lead’s name');
    near(world.selfRegardOf(liu), before.liuS - 0.04, 'and stings self-regard');
    near(world.renownOf(su), before.suR - 0.06, 'both billed leads take the hit');
    assert.deepEqual(auditSeasonEconomy(world), [], '停鑼 moves no money — audit clean');
});

test('renown / selfRegard round-trip through snapshot / restore', () => {
    const world = renownWorld();
    const liu = world.idByName('柳安春')!;
    world.bumpRenown(liu, 0.05);
    world.bumpSelfRegard(liu, -0.1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renown-snapshot-'));
    try {
        world.snapshot(dir);
        const restored = WorldState.restore(dir);
        near(restored.renownOf(liu), world.renownOf(liu), 'renown survives JSON');
        near(restored.selfRegardOf(liu), world.selfRegardOf(liu), 'self-regard survives JSON');
        assert.deepEqual(auditSeasonEconomy(restored), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
