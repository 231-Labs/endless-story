/**
 * 生理需求降級 — the direct fix for the 糖粥 attractor.
 *
 * Diagnosed: 「糖粥」 appeared 149 times, and on one 深宵 tick eight of twelve
 * characters' 眼下打算 was to buy a bowl of it. Hunger — a need every character
 * shares, satisfiable in one place — was strong enough to out-compete everybody's
 * actual wants, and twelve distinct people converged on one errand.
 *
 * The fix is a CAP, not a deletion: hunger pulling one or two people to the stall
 * is the good scene (趙阿福's 賒帳 lives there); hunger pulling eight is a queue.
 * These tests pin the cap, and pin the three exemptions that must survive it —
 * especially the one that keeps the world's best material intact: a character who
 * cannot pay stays hungry.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { cheapestMeal, settleBackgroundNeeds, HUNGER_ONSTAGE_CAP, HUNGER_STARVING } from '../src/core/background-needs.ts';
import { HUNGER_SEEK } from '../src/core/stakes-brief.ts';
import { auditSeasonEconomy, foodScenesOf, mealsByScene, pickMealAt } from '../src/core/season-economy.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

/** The market season is the one that actually has 趙阿福's stall — i.e. the world
 *  the attractor was observed in. */
function streetWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    return world;
}

const setBalance = (world: WorldState, id: string, yuan: bigint): void => {
    const state = world.data.economy!.state;
    state.injected = (BigInt(state.injected) + yuan * YUAN - BigInt(state.accounts[id]!.available)).toString();
    state.accounts[id]!.available = (yuan * YUAN).toString();
};

/** Put the whole cast in the state that produced the attractor: hungry, solvent,
 *  and nowhere near the stall. */
function makeEveryoneHungryAndSolvent(world: WorldState): string[] {
    const foodScenes = foodScenesOf(world);
    const away = world.data.scenes.find((scene) => !foodScenes.has(scene.id))!;
    const ids: string[] = [];
    for (const member of world.data.cast) {
        member.state.hunger = 0.75; // above HUNGER_SEEK, below HUNGER_STARVING
        world.data.roster[member.id] = away.id;
        setBalance(world, member.id, 10n);
        ids.push(member.id);
    }
    return ids;
}

test('the attractor is CAPPED, not deleted: at most a couple keep the hunger stake', () => {
    const world = streetWorld();
    const ids = makeEveryoneHungryAndSolvent(world);
    assert.ok(ids.length >= 8, 'this is the twelve-character world the failure was observed in');

    const report = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });

    assert.equal(report.keptOnstageIds.length, HUNGER_ONSTAGE_CAP, 'exactly the cap keeps the stake');
    assert.equal(report.settledIds.length, ids.length - HUNGER_ONSTAGE_CAP, 'everybody else settled offstage');
    // Offstage means offstage: nobody moved, and it cost one clause each.
    for (const line of report.lines) assert.ok(line.length < 80, `a background need is a clause, not a scene: ${line}`);
    assert.deepEqual(auditSeasonEconomy(world), [], 'and the money it moved conserves');
});

test('a character who CANNOT pay stays hungry — scarcity is never smoothed away', () => {
    const world = streetWorld();
    makeEveryoneHungryAndSolvent(world);
    const broke = world.idByName('江聞鶴')!;
    setBalance(world, broke, 0n);
    const before = BigInt(world.data.economy!.state.accounts[broke]!.available);

    const report = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });

    assert.ok(report.keptOnstageIds.includes(broke), 'the stake stays live for the one who cannot buy his way out of it');
    assert.ok(!report.settledIds.includes(broke));
    assert.equal(BigInt(world.data.economy!.state.accounts[broke]!.available), before, 'and no money appeared to rescue him');
    assert.equal(world.castById(broke)!.state.hunger, 0.75, 'he is exactly as hungry as he was');
});

test('a starving character keeps their hunger in the frame — that far gone is its own drama', () => {
    const world = streetWorld();
    makeEveryoneHungryAndSolvent(world);
    const starving = world.idByName('唐桂蘭')!;
    world.castById(starving)!.state.hunger = HUNGER_STARVING;

    const report = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });

    assert.ok(report.keptOnstageIds.includes(starving));
    assert.ok(!report.settledIds.includes(starving));
});

test('a character already standing at the stall is left to 順路而食 — no double-feeding', () => {
    const world = streetWorld();
    makeEveryoneHungryAndSolvent(world);
    const atStall = world.idByName('趙阿福')!;
    const stallId = [...foodScenesOf(world).keys()][0];
    world.data.roster[atStall] = stallId;
    const before = BigInt(world.data.economy!.state.accounts[atStall]!.available);

    const report = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });

    assert.ok(report.keptOnstageIds.includes(atStall));
    assert.equal(
        BigInt(world.data.economy!.state.accounts[atStall]!.available),
        before,
        'the real purchase path (順路而食) will charge him, not this pass',
    );
});

test('below the seek threshold nothing happens, and nobody is charged twice in a day', () => {
    const world = streetWorld();
    makeEveryoneHungryAndSolvent(world);
    for (const member of world.data.cast) member.state.hunger = HUNGER_SEEK; // exactly at the bar, not past it

    assert.deepEqual(settleBackgroundNeeds(world, { day: 1, nowTick: 3 }).settledIds, [], 'a belly under the bar costs nothing');

    for (const member of world.data.cast) member.state.hunger = 0.75;
    const first = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });
    assert.ok(first.settledIds.length > 0);
    const balancesAfterFirst = first.settledIds.map((id) => BigInt(world.data.economy!.state.accounts[id]!.available));

    for (const member of world.data.cast) member.state.hunger = 0.95; // hungry again, same day
    const second = settleBackgroundNeeds(world, { day: 1, nowTick: 4 });

    assert.ok(
        first.settledIds.every((id) => !second.settledIds.includes(id)),
        'once per character per day — this pass can never become a money leak',
    );
    assert.deepEqual(
        first.settledIds.map((id) => BigInt(world.data.economy!.state.accounts[id]!.available)),
        balancesAfterFirst,
    );
});

test('a world with no location-anchored meal is wholly inert (backward compatible)', () => {
    // The shipped anchun fixture's lone meal carries no sceneName, so it has no
    // food venue at all — the same condition the rest of the hunger machinery
    // treats as "this world has no food drive".
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    for (const member of world.data.cast) member.state.hunger = 0.95;
    assert.equal(cheapestMeal(world), undefined);

    const report = settleBackgroundNeeds(world, { day: 1, nowTick: 3 });

    assert.deepEqual(report.settledIds, []);
    assert.deepEqual(report.lines, []);
    assert.equal(report.spentSubunits, '0');
});

test('the pass is deterministic: the hungriest keep the stake, ties broken by id', () => {
    const build = (): WorldState => {
        const world = streetWorld();
        makeEveryoneHungryAndSolvent(world);
        // A clear hunger ordering so "who stays onstage" is not a coin flip.
        world.castById(world.idByName('蘇映雪')!)!.state.hunger = 0.88;
        world.castById(world.idByName('柳安春')!)!.state.hunger = 0.86;
        return world;
    };
    const a = settleBackgroundNeeds(build(), { day: 1, nowTick: 3 });
    const b = settleBackgroundNeeds(build(), { day: 1, nowTick: 3 });

    assert.deepEqual(a.settledIds, b.settledIds);
    assert.deepEqual(a.lines, b.lines);
    const world = build();
    const kept = settleBackgroundNeeds(world, { day: 1, nowTick: 3 }).keptOnstageIds;
    assert.deepEqual(
        kept.map((id) => world.nameById(id)),
        ['蘇映雪', '柳安春'],
        'the two hungriest keep it',
    );
});

// ── 菜單 (the 糖粥 attractor's actual cause) ─────────────────────────────────

test('攤子上有幾樣，engine 就看得見幾樣 —— 不是只看得見最便宜那樣', () => {
    // The stall sold two dishes and the map that fed both the eat-in-passing and
    // the offstage settle collapsed it to ONE (the cheapest). A live season then
    // bought 糖粥 137 times, which read as a hunger attractor and was really the
    // engine being unable to see the rest of the menu.
    const world = streetWorld();
    const stall = world.data.scenes.find((scene) => scene.name === '戲園前街')!.id;
    const menu = mealsByScene(world).get(stall) ?? [];
    assert.ok(menu.length >= 5, `攤子只看得見 ${menu.length} 樣`);
    assert.ok(menu.some((item) => item.spawnsObject), '買到的那一份要是世上的東西');
    // cheapest-first, so the floor price is menu[0]
    for (let i = 1; i < menu.length; i++) {
        assert.ok(BigInt(menu[i].priceSubunits) >= BigInt(menu[i - 1].priceSubunits));
    }
    assert.equal(foodScenesOf(world).get(stall)!.id, menu[0].id, '「這裡吃得起嗎」問的還是最便宜那樣');
});

test('挑一樣吃：同一攤同一天，一班人不會點同一碗', () => {
    const world = streetWorld();
    const stall = world.data.scenes.find((scene) => scene.name === '戲園前街')!.id;
    const rich = 100n * 100n;
    const chosen = new Set(
        world.activeCast().map((member) => pickMealAt(world, stall, member.id, rich, 1)?.id),
    );
    assert.ok(chosen.size >= 4, `十三個人只點出 ${chosen.size} 樣`);

    // 同一個人也不會天天吃同一樣
    const liu = world.idByName('柳安春')!;
    const acrossDays = new Set([1, 2, 3, 4, 5, 6].map((day) => pickMealAt(world, stall, liu, rich, day)?.id));
    assert.ok(acrossDays.size >= 3, `一個人六天只吃了 ${acrossDays.size} 樣`);

    // 確定性：同一個人同一天，永遠同一碗（seed 可重放）
    assert.equal(pickMealAt(world, stall, liu, rich, 3)?.id, pickMealAt(world, stall, liu, rich, 3)?.id);

    // 錢還是有分別的：只剩一圓的人搆不到貴的
    const broke = pickMealAt(world, stall, liu, 100n, 1)!;
    assert.equal(BigInt(broke.priceSubunits), 100n, '一圓就只買得起一圓的');
});

test('spawnsObject 活著走過季框轉換 —— 逐欄對映最會漏的就是新欄位', () => {
    // It was dropped exactly once already: SeasonCatalogItem grew `spawnsObject`,
    // the JSON carried it, and `applySeasonEconomy` mapped field by field without
    // it — so a stall full of new dishes produced no food anybody could hold, and
    // nothing errored. Same failure shape as the create-run route dropping deckId.
    const world = streetWorld();
    const withObject = world.data.economy!.catalog.filter((item) => item.spawnsObject);
    assert.ok(withObject.length >= 5, '季框裡寫了 spawnsObject 的吃食都該還在');
    for (const item of withObject) {
        assert.ok(item.spawnsObject!.label.trim(), `${item.id} 的物件沒有名字`);
        assert.ok(item.spawnsObject!.state.trim(), `${item.id} 的物件沒有狀態`);
    }
});
