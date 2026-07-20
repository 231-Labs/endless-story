/**
 * 看客成群 — the evening box office gets a REAL audience figure. Before this,
 * the settle line's 「到場 N 人」 counted TROUPE members on the boards, so a
 * 當紅戲班 read as "4 people attending, full-house acclaim". Opt-in per season
 * frame via `audienceHouse` (like performerBoost/castShareBps); off ⇒ the settle
 * line and takings stay byte-identical to before.
 *
 *   1) renownDrawPct — each PRESENT lead adds round(名頭 × 20) pct, capped at
 *      RENOWN_HOUSE_CAP; absent leads draw nothing;
 *   2) settle ON — the notice names 台上 (cast) and 看客 (paying house) as
 *      DISTINCT figures, audience = houseSeats × pct/100, the outcome carries
 *      `audience`, conserves, and is idempotent per day;
 *   3) settle OFF — the EXACT legacy string, byte-for-byte, no renown term,
 *      no audience field;
 *   4) houseSeats configures the full house (default 120), and the shipped
 *      spring-snow-market frame opts in.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import {
    RENOWN_HOUSE_CAP,
    auditSeasonEconomy,
    bankRehearsalAttendance,
    renownDrawPct,
    settleEveningPerformance,
} from '../src/core/season-economy.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';

const YUAN = 100n;

/** Canon slice of the spring-snow-market renown values for the two billed leads. */
const RENOWN_TABLE = {
    柳安春: { renown: 0.8, self: 0.55 },
    蘇映雪: { renown: 0.75, self: 0.6 },
};

// ── 1) the pure helper ───────────────────────────────────────────────────────

/** A minimal world whose cast carry assorted 名頭, for the pure helper. */
function drawWorld(): WorldState {
    const mk = (id: string, renown?: number) => ({
        id, name: id, persona: id,
        state: { fatigue: 0, hunger: 0, mood: 0 },
        coreIdentity: [] as string[], relationshipView: {} as Record<string, string>,
        ...(renown !== undefined ? { renown } : {}),
    });
    const data: WorldStateData = {
        sagaId: 'audience-house',
        sagaPremise: '一個戲班',
        cast: [
            mk('hot', 0.8), // 當紅 ⇒ +16
            mk('hotter', 0.9), // ⇒ +18
            mk('dim', 0.1), // 名頭黯淡 ⇒ +2
            mk('unsung'), // never seeded ⇒ the neutral 0.5 base ⇒ +10
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

test('1) renownDrawPct: each PRESENT lead adds round(名頭×20), capped; absent leads draw nothing', () => {
    const world = drawWorld();

    assert.equal(renownDrawPct(world, ['hot']), 16, '名頭 0.8 ⇒ round(0.8 × 20) = +16');
    assert.equal(renownDrawPct(world, ['dim']), 2, '名頭 0.1 ⇒ +2');
    assert.equal(renownDrawPct(world, ['unsung']), 10, 'a never-seeded lead draws from the neutral 0.5 base');

    // Capped at RENOWN_HOUSE_CAP so takings stay bounded.
    assert.equal(RENOWN_HOUSE_CAP, 30);
    assert.equal(renownDrawPct(world, ['hot', 'hotter']), 30, '16 + 18 = 34 → capped at 30');

    // Absent leads draw nothing: only the ids actually passed (= on the boards) count.
    assert.equal(renownDrawPct(world, ['hot']), 16, 'hotter is absent ⇒ no +18 — an absent 名角 draws no house');
    assert.equal(renownDrawPct(world, []), 0, 'no lead on the boards ⇒ 0');
});

// ── 2)–4) the settle (frame path) ────────────────────────────────────────────

/** Mirrors skill-boxoffice.test.ts's stageWorld, plus the 看客成群 opt-in and
 *  a canon renown table. The shared anchun fixture is never mutated. */
function stageWorld(opts: { audienceHouse?: boolean; houseSeats?: number; castShareBps?: number } = {}): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
        ...(opts.castShareBps ? { castShareBps: opts.castShareBps } : {}),
        ...(opts.audienceHouse ? { audienceHouse: true } : {}),
        ...(opts.houseSeats !== undefined ? { houseSeats: opts.houseSeats } : {}),
    };
    (frame as { renown?: typeof RENOWN_TABLE }).renown = RENOWN_TABLE;
    const world = buildWorldState(loadPresetFile('spring-snow'));
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
 *  rehearsed in daylight so the house is full. */
function boards(world: WorldState, names: string[]): void {
    const stage = venueId(world);
    const backstage = world.data.scenes.find((scene) => scene.name === '後台妝閣')!.id;
    for (const member of world.data.cast) world.moveCharacter(member.id, backstage);
    for (const name of names) world.moveCharacter(world.idByName(name)!, stage);
    bankRehearsalAttendance(world, 1); // 日午 rehearsal → full draw, no 70% penalty
}

test('2) audienceHouse on: 台上 and 看客 are distinct figures; 名頭 fills seats; conserves; idempotent', () => {
    const world = stageWorld({ audienceHouse: true });
    boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    assert.equal(world.data.economy!.performance!.audienceHouse, true, 'the opt-in key is persisted');

    const leads = ['柳安春', '蘇映雪'].map((name) => world.idByName(name)!);
    assert.equal(renownDrawPct(world, leads), 30, '柳 0.8 ⇒ +16, 蘇 0.75 ⇒ +15; 31 → capped at 30');

    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.performed, true);
    // pct = 100 + 30 (名頭引座) = 130 ⇒ 30 圓 × 1.3 = 39 圓; 看客 = 120 席 × 130% = 156.
    assert.equal(evening.takingsSubunits, 39n * YUAN, 'the 名頭-drawn house is REAL money');
    assert.equal(evening.audience, 156, 'audience = houseSeats × pct / 100 (default 120 seats)');
    assert.equal(
        evening.line,
        '【雲錦台戲台】今夜上燈開鑼，台上 4 人、領銜柳安春、蘇映雪，看客約 156 人：滿堂彩，票房 39 圓 入春雪社班庫。',
        '台上 (the cast) and 看客 (the paying house) are DISTINCT figures',
    );
    assert.equal(troupeFunds(world) - before, 39n * YUAN, 'the fuller house lands in the treasury');
    assert.deepEqual(auditSeasonEconomy(world), [], 'conservation holds — 名頭引座 is pct, never minted money');

    // Idempotent per day: a replay banks nothing.
    assert.equal(settleEveningPerformance(world, { day: 1, partIndex: 3 }), null, 'one show a night');
    assert.equal(troupeFunds(world), before + 39n * YUAN, 'the replay moved no money');
});

test('2b) audienceHouse on + castShare: the split notice names 台上 and 看客 too, and conserves', () => {
    const world = stageWorld({ audienceHouse: true, castShareBps: 2000 });
    boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.takingsSubunits, 39n * YUAN);
    assert.match(evening.line, /台上 4 人/);
    assert.match(evening.line, /看客約 156 人/);
    assert.match(evening.line, /班庫得/, 'the 分紅 tail survives the reworded head');
    assert.deepEqual(auditSeasonEconomy(world), [], 'the split settle conserves');
});

test('3) audienceHouse absent: the settle is byte-identical legacy — no renown term, no 看客, no audience field', () => {
    const world = stageWorld();
    boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const before = troupeFunds(world);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    // The SAME canon renown table is seeded, but with the flag off 名頭 draws
    // nothing: pct stays 100 ⇒ the original 滿座 30 圓.
    assert.equal(evening.takingsSubunits, 30n * YUAN, 'no renown term when the flag is off');
    assert.equal(troupeFunds(world) - before, 30n * YUAN);
    assert.equal(
        evening.line,
        '【雲錦台戲台】今夜上燈開鑼，到場 4 人、領銜柳安春、蘇映雪：滿座，票房 30 圓 入春雪社班庫。',
        'the legacy notice, byte-for-byte (到場 wording, no 看客)',
    );
    assert.doesNotMatch(evening.line, /看客/);
    assert.equal(evening.audience, undefined, 'the outcome carries no audience figure');
    assert.equal(world.data.economy!.performance!.audienceHouse, undefined, 'the opt-in key is omitted when unset');
    assert.equal(world.data.economy!.performance!.houseSeats, undefined);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('4) houseSeats configures the full house (default 120); the shipped frame opts in', () => {
    const world = stageWorld({ audienceHouse: true, houseSeats: 200 });
    boards(world, ['柳安春', '蘇映雪', '江聞鶴', '連翹']);
    const evening = settleEveningPerformance(world, { day: 1, partIndex: 3 })!;
    assert.equal(evening.audience, 260, '200 席 × 130% = 260 看客');
    assert.match(evening.line, /看客約 260 人/);

    // The shipped spring-snow-market season turns the audience on at 120 席.
    const perf = loadSeasonFrameFile('spring-snow-market').economy?.performance;
    assert.equal(perf?.audienceHouse, true);
    assert.equal(perf?.houseSeats, 120);
});
