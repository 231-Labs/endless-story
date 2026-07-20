/**
 * 利害簡報 (buildStakesBrief) — the movement hint is now a NEUTRAL BRIEFING, not a
 * single-winner priority cascade. This pins the Part-2 fix directly on the pure
 * helper: a mover with a show today AND a pressing hunger must see BOTH the
 * show/生計 stake (the piece the old cascade never surfaced) AND a neutral hunger
 * line — and must NOT carry the old『旁的事等吃過再說』forced-first framing.
 *
 * Deterministic + LLM-free: buildStakesBrief is pure. Authors its own performance
 * + anchored-meal frame on top of the shared anchun fixture (never edited).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { buildStakesBrief } from '../src/core/stakes-brief.ts';
import { foodScenesOf, troupePlayerIds } from '../src/core/season-economy.ts';
import { templeScenesOf } from '../src/core/temple-prayer.ts';
import type { WorldState } from '../src/world-state.ts';

/** anchun frame + a nightly show + an anchored 戲園前街 meal (a food scene). */
function briefWorld(): WorldState {
    const frame = buildAnchunAcceptanceFrame();
    (frame as { economy: { performance?: object } }).economy.performance = {
        venueScene: '雲錦台戲台',
        leadNames: ['柳安春', '蘇映雪'],
        minCast: 4,
        fullHouseYuan: 30,
    };
    frame.economy!.catalog!.push({
        id: 'meal-street-noodles',
        label: '前街餛飩擔一碗餛飩',
        priceYuan: 3,
        kind: 'meal',
        sceneName: '戲園前街',
        effect: { kind: 'relieve-hunger' },
        oncePerDay: true,
    });
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, frame);
    return world;
}

/** Assemble the brief for one member with the tick's precomputed inputs. */
function briefFor(world: WorldState, name: string, clockLabel: string) {
    const venueId = world.data.scenes.find((s) => s.name === '雲錦台戲台')!.id;
    const backstage = world.data.scenes.find((s) => s.name === '後台妝閣')!.id;
    const member = world.castById(world.idByName(name)!)!;
    return buildStakesBrief({
        world,
        member,
        currentSceneId: backstage, // away from both the venue and the food scene
        clockLabel,
        nowTick: world.data.clock.currentTick,
        liveWants: [],
        wants: [],
        options: [],
        bonds: world.bondGraph(),
        foodScenes: foodScenesOf(world),
        templeScenes: templeScenesOf(world),
        rehearsalToday: { day: world.data.clock.day, title: '回雪', venueSceneId: venueId },
        rehearsalTroupe: troupePlayerIds(world),
        rehearsalVenueName: '雲錦台戲台',
    });
}

test('a show today + hunger yields BOTH the show/生計 line and a NEUTRAL hunger line (no forced-first)', () => {
    const world = briefWorld();
    const liu = world.idByName('柳安春')!; // a billed lead
    world.castById(liu)!.state.hunger = 0.7; // pressing; liu holds 12 圓 → the 3 圓 meal is affordable

    const brief = briefFor(world, '柳安春', '黃昏')!;
    assert.ok(brief, '柳安春 got a brief');

    // the missing piece — tonight's show is surfaced as a livelihood stake
    assert.match(brief, /開鑼時人要在台上/, 'the show line names 開鑼 on the boards');
    assert.match(brief, /一場票房是全班的生計/, 'the show line surfaces the livelihood stake');
    assert.match(brief, /領銜/, '柳安春 is framed as 領銜 (a lead)');
    // 口碑 rides alongside the show
    assert.match(brief, /名頭/, 'the reputation stake is surfaced');

    // hunger is present, but NEUTRAL and demoted — never forced first
    assert.match(brief, /墊墊/, 'a neutral hunger line is present');
    assert.doesNotMatch(brief, /旁的事等吃過再說/, 'the old forced-first framing is gone (demotion guard)');
    assert.doesNotMatch(brief, /空著肚子做不了活/, 'no eat-first framing');

    // ordering: livelihood/reputation read BEFORE appetite
    assert.ok(brief.indexOf('生計') < brief.indexOf('墊墊'), 'livelihood reads before appetite');
});

test('the show line is gated to SHOW_PARTS — 清晨 carries no show stake', () => {
    const world = briefWorld();
    const brief = briefFor(world, '柳安春', '清晨') ?? '';
    assert.doesNotMatch(brief, /開鑼時人要在台上/, '清晨 is too early to brief the night show');
});

test('a non-troupe outsider gets no show/生計 stake (their living is elsewhere)', () => {
    const world = briefWorld();
    // 方競西 (記者, 申報館) is not on the 班庫 payroll nor a lead → not troupe.
    assert.ok(!troupePlayerIds(world).has(world.idByName('方競西')!), '方競西 is not troupe');
    const brief = briefFor(world, '方競西', '黃昏') ?? '';
    assert.doesNotMatch(brief, /一場票房是全班的生計/, 'a non-troupe hand carries no troupe-show stake');
});
