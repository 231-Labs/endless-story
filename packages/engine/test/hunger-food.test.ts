/**
 * Hunger as a DRIVER of behaviour (餓了去食肆買東西吃) — the old agent-season
 * mealSpotFor/eat drive, re-expressed on the season economy:
 *
 *   · foodScenesOf — sceneId → the cheapest location-anchored meal (kind:'meal'
 *     with a sceneName). A meal WITHOUT a sceneName is buyable-anywhere and is
 *     NOT location food, so a seed whose meals are all unanchored (the shipped
 *     anchun fixture, whose 熱湯麵 carries no sceneName) yields an EMPTY map and
 *     the whole drive stays inert — backward compat.
 *   · the move-phase hunger PULL — a pressing, affordable belly outranks work.
 *   · 順路而食 — a hungry solvent character standing at the food scene eats
 *     deterministically through the SAME purchase path, once per day.
 *
 * All deterministic (FakeSceneAgent subclasses, no LLM). Authors its own food
 * frame (a meal WITH a sceneName) on top of the anchun frame — the shared
 * fixture is never edited, so every existing acceptance balance is untouched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { auditSeasonEconomy, foodScenesOf } from '../src/core/season-economy.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import type { WorldState } from '../src/world-state.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult } from '../src/ports.ts';

const YUAN = 100n;
const nullArchive: ArchivePort = { commit: async () => {} };

function deps(agent: FakeSceneAgent) {
    return {
        agent,
        recall: new LocalRecall(),
        archive: nullArchive,
        clock: new LocalClock(),
        economy: new LocalEconomy(),
    };
}

/** The shipped anchun world — its lone meal carries no sceneName. */
function buildSeasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

/** anchun frame + a food stall: a meal WITH a sceneName sold at 戲園前街 (a public
 *  street, location_index 0 — its own district). The shared fixture is untouched;
 *  only this local copy gains the anchored meal. */
function stageFoodWorld(): WorldState {
    const frame = buildAnchunAcceptanceFrame();
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

/** Records the rhythmHint every character's decideMove is handed, then stays. */
class RhythmCaptureAgent extends FakeSceneAgent {
    rhythmByName = new Map<string, string | undefined>();
    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.rhythmByName.set(input.name, input.rhythmHint);
        return { move: false, reason: 'capture: stay' };
    }
}

test('foodScenesOf: a sceneName-anchored meal maps its scene; an unanchored meal never does', () => {
    const world = stageFoodWorld();
    const map = foodScenesOf(world);
    assert.equal(map.size, 1, 'only the sceneName-anchored meal is a food scene');
    const frontStreetId = world.data.scenes.find((s) => s.name === '戲園前街')!.id;
    assert.equal(map.get(frontStreetId)?.id, 'meal-street-noodles', '戲園前街 → the anchored meal');
    // the anchun 熱湯麵 (meal-front-street) carries NO sceneName → never mapped.
    assert.ok(![...map.values()].some((item) => item.id === 'meal-front-street'), 'an unanchored meal is not location food');
});

test('foodScenesOf: the shipped anchun fixture (no sceneName meal) yields an empty map — the drive is inert', () => {
    assert.equal(foodScenesOf(buildSeasonWorld()).size, 0);
});

test('hunger pull: a hungry, solvent character away from the food spot is pulled to eat first', async () => {
    const world = stageFoodWorld();
    world.data.clock = makeClock(6, 1); // day 1 日午 — daytime, no day-start rehearsal call
    const liu = world.idByName('柳安春')!;  // works at 雲錦台戲台 — a different district from the stall
    const su = world.idByName('蘇映雪')!;   // well-fed control
    const shen = world.idByName('沈雪笙')!; // hungry-but-broke control
    world.castById(liu)!.state.hunger = 0.7;
    world.castById(su)!.state.hunger = 0.1;
    world.castById(shen)!.state.hunger = 0.7;
    world.data.economy!.state.accounts[shen]!.available = '100'; // 1 圓 < the 3 圓 meal

    const agent = new RhythmCaptureAgent();
    await runTick(world, deps(agent), { log: () => {} });

    // hungry + solvent + away → the strongest pull names the stall, the meal, its
    // price, and frames it as eat-first.
    const liuHint = agent.rhythmByName.get('柳安春');
    assert.ok(liuHint, '柳安春 got a rhythm hint');
    assert.match(liuHint!, /戲園前街/, 'the hunger pull names the food scene');
    assert.match(liuHint!, /餛飩/, 'the hunger pull names the meal');
    assert.match(liuHint!, /3 圓/, 'the hunger pull names the price');
    assert.match(liuHint!, /墊墊肚子|趁早去吃/, 'the hunger pull frames eating as first');

    // a well-fed character gets no food pull.
    const suHint = agent.rhythmByName.get('蘇映雪');
    assert.ok(suHint !== undefined, '蘇映雪 got a rhythm hint');
    assert.doesNotMatch(suHint!, /墊墊肚子/, 'a well-fed character is not pulled to eat');

    // a broke hungry character gets no food pull (can't afford it).
    const shenHint = agent.rhythmByName.get('沈雪笙');
    assert.ok(shenHint !== undefined, '沈雪笙 got a rhythm hint');
    assert.doesNotMatch(shenHint!, /墊墊肚子/, 'a character who cannot afford the meal is not pulled to it');
});

test('順路而食: a hungry, solvent character at the food scene eats deterministically, once per day', async () => {
    const world = stageFoodWorld();
    world.data.clock = makeClock(6, 1); // day 1 日午 — not day-end, so settlement never touches balances
    const axi = world.idByName('何阿喜')!; // works at 戲園前街 (the food scene)
    assert.equal(world.sceneNameById(world.data.roster[axi]), '戲園前街', '何阿喜 starts at the stall');
    world.castById(axi)!.state.hunger = 0.6;
    const before = BigInt(world.data.economy!.state.accounts[axi]!.available);

    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });

    const afterEat = BigInt(world.data.economy!.state.accounts[axi]!.available);
    assert.equal(before - afterEat, 3n * YUAN, '何阿喜 paid the 3 圓 meal price');
    // relieve-hunger cut 0.6 (0.6 → 0) before the day's +0.12 state advance; without
    // the meal he would have climbed to ~0.72, so a low reading proves the relief landed.
    assert.ok(world.castById(axi)!.state.hunger < 0.2, 'relieve-hunger dropped his hunger');
    const eatLines = world.data.dayAccum.lines.filter((l) => l.startsWith('[食]') && l.includes('何阿喜'));
    assert.equal(eatLines.length, 1, 'exactly one [食] day-log line');
    assert.match(eatLines[0], /餛飩/, 'the [食] line names the meal');
    assert.deepEqual(auditSeasonEconomy(world), [], 'the meal purchase conserves money');

    // a second same-day tick does NOT double-buy — the meal is once-per-day.
    world.castById(axi)!.state.hunger = 0.9; // hungry again, still standing at the stall
    await runTick(world, deps(new FakeSceneAgent()), { log: () => {} });
    assert.equal(
        BigInt(world.data.economy!.state.accounts[axi]!.available),
        afterEat,
        'the once-per-day rejection is swallowed — no second charge',
    );
    assert.equal(
        world.data.dayAccum.lines.filter((l) => l.startsWith('[食]') && l.includes('何阿喜')).length,
        1,
        'no second [食] line the same day',
    );
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('backward compat: the shipped anchun frame drives no hunger pull and no auto-eat', async () => {
    const world = buildSeasonWorld();
    const axi = world.idByName('何阿喜')!;
    world.data.clock = makeClock(6, 1);
    world.castById(axi)!.state.hunger = 0.95; // ravenous — but no meal is location-anchored
    const before = BigInt(world.data.economy!.state.accounts[axi]!.available);

    const agent = new RhythmCaptureAgent();
    await runTick(world, deps(agent), { log: () => {} });

    // no sceneName'd meal ⇒ empty food map ⇒ nobody is pulled to eat and nobody auto-eats.
    for (const hint of agent.rhythmByName.values()) {
        if (hint) assert.doesNotMatch(hint, /墊墊肚子/, 'no food pull without a location-anchored meal');
    }
    assert.equal(BigInt(world.data.economy!.state.accounts[axi]!.available), before, 'no auto-eat without a food scene');
    assert.ok(!world.data.dayAccum.lines.some((l) => l.startsWith('[食]')), 'no [食] line without a food scene');
});
