/**
 * 名角滿座 — the THIRD box-office hang point. The stage craft (唱/身) of the
 * performers actually on the boards lifts the night's house, a conservation-safe
 * pct folded into the settle EXACTLY like the object boosts. Deterministic +
 * pure (skills are static ⇒ replay-stable); the number lives only in the ledger
 * math, never a prompt. Opt-in per frame (like castShareBps) so existing seasons
 * are byte-identical; a skill-less cast is unaffected either way.
 *
 *   1) performerSkillBoostPct — sums each present performer's BEST stage-skill
 *      level, caps at SKILL_HOUSE_CAP, ignores non-stage skills / skill-less /
 *      absent performers;
 *   2) settle with skills — skilled 名角 on stage draw a FULLER house than a
 *      skill-less cast (assert the takings delta), audits clean, conserves, and
 *      is idempotent per day;
 *   3) backward-compat — an un-opted frame with the SKILLED spring-snow cast
 *      settles to the EXACT object-boost number (30 圓), and a skill-less cast is
 *      likewise unaffected.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import {
    SKILL_HOUSE_CAP,
    auditSeasonEconomy,
    bankRehearsalAttendance,
    performerSkillBoostPct,
    settleEveningPerformance,
} from '../src/core/season-economy.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { WorldState, type Skill, type WorldStateData } from '../src/world-state.ts';

const YUAN = 100n;

// ── 1) the pure helper ───────────────────────────────────────────────────────

/** A minimal world whose cast carry assorted skills, for the pure helper. */
function boostWorld(): WorldState {
    const mk = (id: string, skills?: Skill[]) => ({
        id, name: id, persona: id,
        state: { fatigue: 0, hunger: 0, mood: 0 },
        coreIdentity: [] as string[], relationshipView: {} as Record<string, string>,
        ...(skills ? { skills } : {}),
    });
    const data: WorldStateData = {
        sagaId: 'skill-boxoffice',
        sagaPremise: '一個戲班',
        cast: [
            // best stage = max(唱5, 身3) = 5; the 風5 conduct skill is NOT stage-craft.
            mk('c0', [
                { name: '悲工', kind: '唱', style: 'x', level: 5 },
                { name: '文戲', kind: '身', style: 'y', level: 3 },
                { name: '清冷', kind: '風', style: 'z', level: 5 },
            ]),
            // best stage = 身2; the 談5 is ignored (not a stage kind).
            mk('c1', [
                { name: '身', kind: '身', style: 'a', level: 2 },
                { name: '圓場', kind: '談', style: 'b', level: 5 },
            ]),
            mk('c2', [{ name: '風', kind: '風', style: 'c', level: 4 }]), // no stage skill ⇒ 0
            mk('c3', undefined), // skill-less ⇒ 0
            mk('c5', [{ name: '一副好嗓', kind: '唱', style: 'd', level: 100 }]), // huge ⇒ hits the cap
        ],
        scenes: [{ id: 's0', name: '戲台', privacyLevel: 0 }],
        roster: {}, homeByChar: {}, workByChar: {},
        wants: [], edges: {},
        clock: makeClock(6, 2),
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [], objects: [],
    };
    return new WorldState(data);
}

test('1) performerSkillBoostPct: sums each present performer’s best stage level, capped, ignoring non-stage/skill-less/absent', () => {
    const world = boostWorld();

    // BEST (max) stage skill per performer — not a sum within a performer.
    assert.equal(performerSkillBoostPct(world, ['c0']), 5, 'max(唱5,身3)=5; the 風 conduct skill is not stage-craft');
    assert.equal(performerSkillBoostPct(world, ['c1']), 2, '身2 only; the 談5 is not a stage kind');
    assert.equal(performerSkillBoostPct(world, ['c2']), 0, 'a performer with no stage skill contributes 0');
    assert.equal(performerSkillBoostPct(world, ['c3']), 0, 'a skill-less performer contributes 0');

    // Summed ACROSS the present performers.
    assert.equal(performerSkillBoostPct(world, ['c0', 'c1', 'c2', 'c3']), 7, '5 + 2 + 0 + 0');

    // Absent performers (not in the present list / not in the cast) draw no house.
    assert.equal(performerSkillBoostPct(world, ['c0', 'ghost']), 5, 'an unknown id resolves to 0');
    assert.equal(performerSkillBoostPct(world, []), 0, 'nobody on the boards ⇒ 0');

    // Capped at SKILL_HOUSE_CAP so takings stay bounded.
    assert.equal(SKILL_HOUSE_CAP, 40);
    assert.equal(performerSkillBoostPct(world, ['c5']), 40, 'a single master is capped');
    assert.equal(performerSkillBoostPct(world, ['c0', 'c1', 'c5']), 40, '5 + 2 + 100 = 107 → capped at 40');
});

// ── 2) & 3) the settle (frame path) ──────────────────────────────────────────

/** Mirrors season-production.test.ts's stageWorld, plus the 名角滿座 opt-in.
 *  Cast comes from the SKILLED spring-snow canon; the anchun frame is untouched. */
function stageWorld(performerBoost: boolean, strictStructured = false): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
        ...(performerBoost ? { performerBoost: true } : {}),
    };
    const world = buildWorldState(
        loadPresetFile('spring-snow'),
        undefined,
        6,
        strictStructured ? { strictStructured: true } : {},
    );
    applySeasonFrame(world, frame);
    return world;
}

function venueId(world: WorldState): string {
    return world.data.scenes.find((scene) => scene.name === '雲錦台戲台')!.id;
}

function troupeFunds(world: WorldState): bigint {
    return BigInt(world.data.economy!.state.accounts.troupe.available);
}

/** Put an EXACT set of named performers on the boards (everyone else backstage),
 *  rehearsed in daylight so the house is full. Returns the on-stage ids. */
function boards(world: WorldState, names: string[]): string[] {
    const stage = venueId(world);
    const backstage = world.data.scenes.find((scene) => scene.name === '後台妝閣')!.id;
    for (const member of world.data.cast) world.moveCharacter(member.id, backstage);
    const ids = names.map((name) => world.idByName(name)!);
    for (const id of ids) world.moveCharacter(id, stage);
    bankRehearsalAttendance(world, 1); // 日午 rehearsal → full draw, no 70% penalty
    return ids;
}

test('2) skilled 名角 on the boards lift the house above a skill-less cast; conserves; idempotent per day', () => {
    // Skilled settle — 柳/蘇/江/連 each carry a level-5 唱 or 身 ⇒ +5 apiece = +20%.
    const world = stageWorld(true);
    const present = boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    assert.equal(performerSkillBoostPct(world, present), 20, '4 × best-stage-5 = +20% house');

    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, true);
    // pct = 100 + 20 = 120 ⇒ 30 圓 × 1.2 = 36 圓 (the takings, all external-in).
    assert.equal(evening.takingsSubunits, 36n * YUAN);
    assert.equal(troupeFunds(world) - before, 36n * YUAN, 'the fuller house is REAL money into the treasury');
    assert.match(evening.line, /滿堂彩/, 'a 名角 house reads as 滿堂彩 (pct ≥ 110)');
    assert.deepEqual(auditSeasonEconomy(world), [], 'conservation holds after the boosted settle');

    // Idempotent per day: a replay banks nothing.
    assert.equal(settleEveningPerformance(world, { day: 1, partIndex: 3 }), null, 'one show a night');
    assert.equal(troupeFunds(world), before + 36n * YUAN, 'the replay moved no money');

    // The SAME settle with a skill-less cast ⇒ boost 0 ⇒ the plain 30 圓 house.
    const bare = stageWorld(true);
    for (const member of bare.data.cast) delete member.skills;
    const bareOn = boards(bare, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    assert.equal(performerSkillBoostPct(bare, bareOn), 0, 'no stage skill ⇒ no boost');
    const bareBefore = troupeFunds(bare);
    const bareEvening = settleEveningPerformance(bare, { day: 1, partIndex: 3 })!;
    assert.equal(bareEvening.takingsSubunits, 30n * YUAN);
    assert.equal(troupeFunds(bare) - bareBefore, 30n * YUAN);
    assert.deepEqual(auditSeasonEconomy(bare), []);

    // The delta is PURELY the talent — exactly the +20% (= 6 圓) fuller house.
    assert.ok(evening.takingsSubunits! > bareEvening.takingsSubunits!, '名角 draw a fuller house');
    assert.equal(evening.takingsSubunits! - bareEvening.takingsSubunits!, 6n * YUAN, 'skilled − skill-less = the +20% boost');
});

test('3) backward-compat: an un-opted frame with the SKILLED cast settles to the exact object-boost number (30 圓)', () => {
    // The existing box-office path: no performerBoost opt-in, so even the SKILLED
    // spring-snow cast draws exactly the object-boost test's 30 圓 — byte-identical.
    const world = stageWorld(false);
    boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.takingsSubunits, 30n * YUAN, 'un-opted ⇒ the original 滿座 30 圓');
    assert.equal(troupeFunds(world) - before, 30n * YUAN);
    assert.match(evening.line, /滿座/);
    assert.equal(world.data.economy!.performance!.performerBoost, undefined, 'the opt-in key is omitted when unset');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('STRICT performance boost reads object stateTags and keeps state prose as a shadow', () => {
    const tagged = stageWorld(false, true);
    const taggedObject = tagged.objectById('anchun-exclusive-contract')!;
    taggedObject.stateTags = ['box-office-ready'];
    tagged.data.economy!.performance!.boosts = [{
        objectId: taggedObject.id,
        stateIncludes: '這句刻意不會命中',
        requiredStateTag: 'box-office-ready',
        pct: 10,
    }];
    boards(tagged, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const taggedSettle = settleEveningPerformance(tagged, { day: 1, partIndex: 3 })!;
    assert.equal(taggedSettle.takingsSubunits, 33n * YUAN);
    assert.ok(
        tagged.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'performance-object-state' &&
                event.legacy === false &&
                event.structured === true,
        ),
    );

    const proseOnly = stageWorld(false, true);
    const proseObject = proseOnly.objectById('anchun-exclusive-contract')!;
    proseObject.state = '尚未簽署';
    proseOnly.data.economy!.performance!.boosts = [{
        objectId: proseObject.id,
        stateIncludes: '尚未簽署',
        requiredStateTag: 'box-office-ready',
        pct: 10,
    }];
    boards(proseOnly, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const proseSettle = settleEveningPerformance(
        proseOnly,
        { day: 1, partIndex: 3 },
    )!;
    assert.equal(proseSettle.takingsSubunits, 30n * YUAN);
    assert.ok(
        proseOnly.data.structuredMonitor?.divergences.some(
            (event) =>
                event.kind === 'performance-object-state' &&
                event.legacy === true &&
                event.structured === false,
        ),
    );
    assert.deepEqual(auditSeasonEconomy(tagged), []);
    assert.deepEqual(auditSeasonEconomy(proseOnly), []);
});
