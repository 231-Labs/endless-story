/**
 * 食肆 as a REAL economic entity — the front-street market proving run.
 *
 * The engine already routes a purchase to `item.vendorAccountId ?? marketAccountId`
 * (multi-establishment, like a 歌女 drawing from 長三堂子). This test proves the
 * AUTHORED season uses that seam so money spent at the front-street stalls / at
 * 白家繡樓 flows to the SELLER, not into an abstract market sink — and that the
 * vendor OWNERS then draw their keep out of the stall's own takings on settle.
 *
 * It builds a world from the committed showcase season JSON
 * (packages/cli/scripts/seasons/spring-snow-market.json) atop the canonical
 * spring-snow preset, so it proves the exact shipped artifact seeds and conserves.
 * All deterministic — direct EconomyPort commands, no LLM, no credits. The shared
 * anchun acceptance fixture is never touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { auditSeasonEconomy, settleSeasonDay } from '../src/core/season-economy.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import type { WorldState } from '../src/world-state.ts';

const YUAN = 100n;
const 前街食肆 = '前街食肆';
const 白家繡樓 = '白家繡樓';
const MARKET = 'market';
const TROUPE = 'troupe';

/** The canonical spring-snow preset + the committed showcase season JSON. */
function buildMarketWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    return world;
}

function bal(world: WorldState, id: string): bigint {
    return BigInt(world.data.economy!.state.accounts[id].available);
}

function sceneId(world: WorldState, name: string): string {
    return world.data.scenes.find((scene) => scene.name === name)!.id;
}

function ledger(world: WorldState) {
    return world.data.economy!.state.ledger;
}

test('the committed season JSON seeds a conserving front-street economy with two vendor businesses', () => {
    const world = buildMarketWorld();
    assert.ok(world.data.economy, 'the season seeded a live ledger');
    assert.ok(world.data.economy!.state.accounts[前街食肆], '前街食肆 is a real first-class account');
    assert.ok(world.data.economy!.state.accounts[白家繡樓], '白家繡樓 is a real first-class account');
    // the two authored vendors resolved to cast members
    assert.ok(world.idByName('殷阿婆'), '賣花婆婆 殷阿婆 is in the cast');
    assert.ok(world.idByName('趙阿福'), '小吃攤主 趙阿福 is in the cast');
    // opening reserves as authored
    assert.equal(bal(world, 前街食肆), 30n * YUAN);
    assert.equal(bal(world, 白家繡樓), 60n * YUAN);
    assert.equal(bal(world, MARKET), 0n);
    assert.deepEqual(auditSeasonEconomy(world), [], 'the fresh frame conserves');
});

test('小吃 / 花 bought at 戲園前街 pay the SELLER (前街食肆), never the market sink', () => {
    const world = buildMarketWorld();
    const economy = new LocalEconomy();
    const frontStreet = sceneId(world, '戲園前街');
    const he = world.idByName('何阿喜')!; // works the front street — a natural customer

    assert.deepEqual(auditSeasonEconomy(world), []);
    const heBefore = bal(world, he);
    const shiBefore = bal(world, 前街食肆);
    const marketBefore = bal(world, MARKET);

    // a bowl of noodles (kind:'meal', sceneName 戲園前街 — lights the hunger spot)
    const noodle = economy.commitCommand(world, {
        actorId: he, sceneId: frontStreet, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'meal-frontstreet-noodle' },
        causeEventId: 'test:m1', seq: 0,
    });
    assert.equal(noodle.ok, true, noodle.reason);

    // a spray of 殷阿婆's 白蘭 (a bespoke gift affordance) — also routed to the stall
    const flower = economy.commitCommand(world, {
        actorId: he, sceneId: frontStreet, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'flower-frontstreet-bailan' },
        causeEventId: 'test:f1', seq: 0,
    });
    assert.equal(flower.ok, true, flower.reason);

    // buyer debited 3 + 1 = 4 圓
    assert.equal(heBefore - bal(world, he), 4n * YUAN, 'the buyer paid 4 圓 out of his own pocket');
    // the SELLER (前街食肆) was credited every 分 of it
    assert.equal(bal(world, 前街食肆) - shiBefore, 4n * YUAN, '前街食肆 took in the 4 圓');
    // and the abstract market sink got nothing
    assert.equal(bal(world, MARKET), marketBefore);
    assert.equal(bal(world, MARKET), 0n, 'no money leaked into the market sink');

    // the ledger routes both sales to 前街食肆, never market
    const sales = ledger(world).filter((txn) => txn.kind === 'purchase' && txn.from === he);
    assert.equal(sales.length, 2, 'two front-street purchases booked');
    assert.ok(sales.every((txn) => txn.to === 前街食肆), 'both front-street sales credit 前街食肆');
    assert.ok(!sales.some((txn) => txn.to === MARKET), 'no front-street sale credits the market');

    assert.deepEqual(auditSeasonEconomy(world), [], 'conservation holds after the purchases');
});

test('繡品 credits 白家繡樓 (the 繡樓, not the market)', () => {
    const world = buildMarketWorld();
    const economy = new LocalEconomy();
    const su = world.idByName('蘇映雪')!;
    const suScene = world.data.roster[su];

    const suBefore = bal(world, su);
    const louBefore = bal(world, 白家繡樓);

    const kerchief = economy.commitCommand(world, {
        actorId: su, sceneId: suScene, witnessIds: [su], day: 1,
        command: { action: 'purchase', itemId: 'embroidery-baijia-kerchief' },
        causeEventId: 'test:k1', seq: 0,
    });
    assert.equal(kerchief.ok, true, kerchief.reason);

    assert.equal(suBefore - bal(world, su), 4n * YUAN, 'the buyer paid 4 圓 for the 繡帕');
    assert.equal(bal(world, 白家繡樓) - louBefore, 4n * YUAN, '白家繡樓 took the 4 圓');
    assert.equal(bal(world, MARKET), 0n, 'the 繡帕 money did not fall into the market sink');

    const sale = ledger(world).find((txn) => txn.kind === 'purchase' && txn.from === su)!;
    assert.equal(sale.to, 白家繡樓, 'the 繡帕 sale credits 白家繡樓');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('on settle the 攤販 owners draw their wage FROM 前街食肆 — owner income traces to the stall takings', () => {
    const world = buildMarketWorld();
    const economy = new LocalEconomy();
    const frontStreet = sceneId(world, '戲園前街');
    const he = world.idByName('何阿喜')!;
    const yin = world.idByName('殷阿婆')!;   // 賣花婆婆
    const zhao = world.idByName('趙阿福')!;  // 小吃攤主

    // a customer eats at the stall — real money enters 前街食肆's pot
    const bought = economy.commitCommand(world, {
        actorId: he, sceneId: frontStreet, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'meal-frontstreet-noodle' },
        causeEventId: 'test:s1', seq: 0,
    });
    assert.equal(bought.ok, true, bought.reason);
    assert.equal(bal(world, 前街食肆), 33n * YUAN, '30 圓 opening + 3 圓 takings');

    const yinBefore = bal(world, yin);
    const zhaoBefore = bal(world, zhao);
    const shiBefore = bal(world, 前街食肆);

    settleSeasonDay(world, { day: 1, nowTick: 5 });

    // both owners were paid a daily wage, drawn OUT OF 前街食肆 (the pot the sale fed)
    const stallWages = ledger(world).filter((txn) => txn.kind === 'wage' && txn.from === 前街食肆);
    assert.equal(stallWages.length, 2, '前街食肆 paid two owner wages');
    const paidTo = new Set(stallWages.map((txn) => txn.to));
    assert.ok(paidTo.has(yin), '殷阿婆 drew her wage from 前街食肆');
    assert.ok(paidTo.has(zhao), '趙阿福 drew his wage from 前街食肆');

    // their pockets grew by (2 圓 wage − 1 圓 daily) = +1 圓, sourced from the stall's takings
    assert.equal(bal(world, yin) - yinBefore, 1n * YUAN, '殷阿婆 nets +1 圓 from the stall');
    assert.equal(bal(world, zhao) - zhaoBefore, 1n * YUAN, '趙阿福 nets +1 圓 from the stall');
    // the stall funded 2×2 圓 wages + 3 圓 fixed cost = 7 圓 from its OWN pot
    assert.equal(shiBefore - bal(world, 前街食肆), 7n * YUAN, '前街食肆 paid its wages + costs itself');

    // the troupe 班庫 paid NEITHER vendor — each establishment pays its own hands
    const troupePaid = new Set(ledger(world).filter((txn) => txn.kind === 'wage' && txn.from === TROUPE).map((txn) => txn.to));
    assert.ok(!troupePaid.has(yin) && !troupePaid.has(zhao), '班庫 pays only its own troupe hands, not the vendors');

    assert.deepEqual(auditSeasonEconomy(world), [], 'conservation holds through settlement');
});

test('the 白家繡樓 takings likewise settle to its owner 白韻秋, off the troupe books', () => {
    const world = buildMarketWorld();
    const economy = new LocalEconomy();
    const su = world.idByName('蘇映雪')!;
    const bai = world.idByName('白韻秋')!;

    // a 繡帕 order feeds 白家繡樓
    const kerchief = economy.commitCommand(world, {
        actorId: su, sceneId: world.data.roster[su], witnessIds: [su], day: 1,
        command: { action: 'purchase', itemId: 'embroidery-baijia-kerchief' },
        causeEventId: 'test:e1', seq: 0,
    });
    assert.equal(kerchief.ok, true, kerchief.reason);
    assert.equal(bal(world, 白家繡樓), 64n * YUAN, '60 圓 opening + 4 圓 order');

    settleSeasonDay(world, { day: 1, nowTick: 5 });

    // 白韻秋's 例錢 comes out of 白家繡樓, never the 班庫
    const louWages = ledger(world).filter((txn) => txn.kind === 'wage' && txn.to === bai);
    assert.ok(louWages.length > 0, '白韻秋 drew a wage');
    assert.ok(louWages.every((txn) => txn.from === 白家繡樓), '白韻秋 is paid by 白家繡樓, not the troupe');
    assert.deepEqual(auditSeasonEconomy(world), []);
});
