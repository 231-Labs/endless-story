/**
 * 收入事件 — the inward half of the money loop, as MECHANISM.
 *
 * These tests exist because the diagnosed failure was precisely that income was
 * NOT mechanism: 工錢／分紅／月半結帳 were spoken about in beats and absent from the
 * ledger, so the cast waited for a payday that structurally could not arrive.
 * Each test therefore asserts a LEDGER ROW, not a line of prose.
 *
 * The other half of the brief was 「不要修掉稀缺」, so the tests also pin the
 * refusals: a dividend below its reserve floor pays nothing, a wage packet stops
 * when the pot runs dry, and a reckoning hands out consequences rather than
 * relief. All deterministic, no LLM.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { FORGIVE_DEBTOR_RENOWN, payDividend, payWagePacket, runReckoning } from '../src/core/income-events.ts';
import { auditSeasonEconomy, ledgerRows, yuanToSubunits } from '../src/core/season-economy.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

const balance = (world: WorldState, id: string): bigint => BigInt(world.data.economy!.state.accounts[id]!.available);

/** Set a balance for a scenario WITHOUT breaking conservation: `injected` moves by
 *  the same delta, exactly as if a patron had put that money in (or taken it out).
 *  Every test below then asserts conservation for real, instead of against a
 *  fixture that was already inconsistent. */
const setBalance = (world: WorldState, id: string, yuan: bigint): void => {
    const state = world.data.economy!.state;
    const delta = yuan * YUAN - BigInt(state.accounts[id]!.available);
    state.accounts[id]!.available = (yuan * YUAN).toString();
    state.injected = (BigInt(state.injected) + delta).toString();
};

/** Scenario worlds start with no outstanding paper, so a reckoning test measures
 *  the tab the test authored and nothing the shipped frame happened to carry. */
function clearBills(world: WorldState): void {
    world.data.economy!.bills = [];
}

/** The food stall's own pot. Opened through `setBalance` so `injected` moves with
 *  it and the conservation assertion below stays meaningful. */
function ensureVendor(world: WorldState, yuan: bigint): void {
    const state = world.data.economy!.state;
    state.accounts['前街食肆'] ??= {
        id: '前街食肆',
        ownerType: 'business',
        label: '前街食肆',
        available: '0',
        reserved: '0',
        dailyFixedCost: '0',
        authorizedSpenderIds: [],
    };
    setBalance(world, '前街食肆', yuan);
}

/** Conservation is the invariant every money test must also carry: a fix that
 *  makes people solvent by minting money is not a fix. */
function assertConserves(world: WorldState, note: string): void {
    assert.deepEqual(auditSeasonEconomy(world), [], note);
}

// ── 工錢 ─────────────────────────────────────────────────────────────────────

test('工錢發放: a wage packet moves real money and leaves a ledger row per hand', () => {
    const world = seasonWorld();
    const troupeId = world.data.economy!.troupeAccountId;
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    setBalance(world, troupeId, 40n);
    const before = { liu: balance(world, liu), su: balance(world, su), troupe: balance(world, troupeId) };

    const out = payWagePacket(world, {
        day: 1,
        nowTick: 0,
        id: 'test-wage',
        label: '班中工錢',
        perHeadYuan: 2,
        targetIds: [liu, su],
    });

    assert.ok(out.landed, 'the packet landed');
    assert.equal(balance(world, liu) - before.liu, 2n * YUAN);
    assert.equal(balance(world, su) - before.su, 2n * YUAN);
    assert.equal(before.troupe - balance(world, troupeId), 4n * YUAN, 'the pot paid exactly what the hands got');
    // The whole point: an auditor can POINT at the income in the ledger.
    const rows = ledgerRows(world).filter((row) => row.memo === '班中工錢');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.to).sort(), [liu, su].sort());
    assertConserves(world, '工錢 conserves');
});

test('工錢發放: an empty pot short-pays the LAST names and says so — it never mints', () => {
    const world = seasonWorld();
    const troupeId = world.data.economy!.troupeAccountId;
    const ids = [world.idByName('柳安春')!, world.idByName('蘇映雪')!, world.idByName('連翹')!].sort();
    setBalance(world, troupeId, 3n); // enough for one 2 圓 packet and a remainder

    const out = payWagePacket(world, { day: 1, nowTick: 0, id: 'thin-wage', label: '班中工錢', perHeadYuan: 2, targetIds: ids });

    assert.equal(out.paid.length, 1, 'only the first name in roster order got paid');
    assert.equal(out.paid[0].characterId, ids[0]);
    assert.ok(out.shortfallNote?.includes('見底'), 'the shortfall is stated, not swallowed');
    assert.ok(out.publicLines.some((line) => line.includes('欠著的是錢')), 'the world says who did not get paid');
    assert.ok(balance(world, troupeId) >= 0n, 'the pot never goes negative');
    assertConserves(world, 'a short payroll conserves');
});

test('工錢發放 is idempotent per day — a replayed tick cannot double-pay', () => {
    const world = seasonWorld();
    const troupeId = world.data.economy!.troupeAccountId;
    const liu = world.idByName('柳安春')!;
    setBalance(world, troupeId, 40n);
    const req = { day: 1, nowTick: 0, id: 'once', label: '班中工錢', perHeadYuan: 2, targetIds: [liu] };

    payWagePacket(world, req);
    const afterFirst = balance(world, liu);
    payWagePacket(world, req);

    assert.equal(balance(world, liu), afterFirst, 'the repeated txn id was swallowed by the ledger');
    assertConserves(world, 'idempotent replay conserves');
});

// ── 分紅 ─────────────────────────────────────────────────────────────────────

test('分紅: only the SURPLUS above the reserve floor is shared, and it is shared exactly', () => {
    const world = seasonWorld();
    const data = world.data.economy!;
    const troupeId = data.troupeAccountId;
    const shares = [world.idByName('柳安春')!, world.idByName('蘇映雪')!].sort();
    data.state.accounts[troupeId]!.dailyFixedCost = (10n * YUAN).toString();
    setBalance(world, troupeId, 50n); // floor = 2 days × 10 圓 = 20 圓 ⇒ surplus 30 圓
    const before = shares.map((id) => balance(world, id));

    const out = payDividend(world, {
        day: 2,
        nowTick: 6,
        rule: {
            id: 'test-dividend',
            label: '散戲分紅',
            surplusShareBps: 4000, // 40% of 30 圓 = 12 圓
            reserveDays: 2,
            shares: shares.map((characterId) => ({ characterId, weightBps: 1 })),
        },
    });

    assert.ok(out.landed);
    assert.equal(BigInt(out.totalSubunits), 12n * YUAN, '40% of the 30 圓 surplus');
    assert.equal(balance(world, shares[0]) - before[0], 6n * YUAN);
    assert.equal(balance(world, shares[1]) - before[1], 6n * YUAN);
    assert.equal(balance(world, troupeId), 38n * YUAN, 'the pot kept its floor and the rest');
    assertConserves(world, '分紅 conserves');
});

test('分紅: a treasury under its floor shares NOTHING — scarcity is not smoothed away', () => {
    const world = seasonWorld();
    const data = world.data.economy!;
    const troupeId = data.troupeAccountId;
    data.state.accounts[troupeId]!.dailyFixedCost = (10n * YUAN).toString();
    setBalance(world, troupeId, 15n); // floor = 20 圓 ⇒ no surplus at all
    const liu = world.idByName('柳安春')!;
    const before = balance(world, liu);

    const out = payDividend(world, {
        day: 2,
        nowTick: 6,
        rule: { id: 'no-dividend', label: '散戲分紅', surplusShareBps: 10000, reserveDays: 2, shares: [{ characterId: liu, weightBps: 1 }] },
    });

    assert.equal(out.landed, false);
    assert.equal(balance(world, liu), before, 'nobody was paid out of a treasury that has nothing spare');
    assert.ok(out.publicLines[0]?.includes('沒有'), 'and the world is told why');
    assertConserves(world, 'a refused dividend conserves');
});

test('分紅: the integer remainder lands on the first beneficiary — no minting, no drift', () => {
    const world = seasonWorld();
    const data = world.data.economy!;
    const troupeId = data.troupeAccountId;
    const three = [world.idByName('柳安春')!, world.idByName('蘇映雪')!, world.idByName('連翹')!].sort();
    data.state.accounts[troupeId]!.dailyFixedCost = '0';
    setBalance(world, troupeId, 10n); // 10 圓 = 1000 分, /3 leaves a remainder

    const out = payDividend(world, {
        day: 2,
        nowTick: 6,
        rule: { id: 'remainder', label: '散戲分紅', surplusShareBps: 10000, reserveDays: 0, shares: three.map((characterId) => ({ characterId, weightBps: 1 })) },
    });

    const paid = out.paid.reduce((sum, row) => sum + BigInt(row.amountSubunits), 0n);
    assert.equal(paid, 1000n, 'every 分 of the pool reached somebody');
    assert.equal(BigInt(out.paid[0].amountSubunits), 334n, 'the odd 分 went to the first id, deterministically');
    assertConserves(world, 'remainder handling conserves');
});

// ── 月半結帳 ─────────────────────────────────────────────────────────────────

/** Give the world one outstanding tab owed by a named character. */
function oweTab(world: WorldState, debtorId: string, yuan: number, id = 'tab'): void {
    const data = world.data.economy!;
    (data.bills ??= []).push({
        id,
        label: '前街食肆賒帳',
        amountSubunits: yuanToSubunits(world, yuan).toString(),
        dueDay: 99, // deliberately far off — the reckoning must PULL IT FORWARD
        paidSubunits: '0',
        creditor: '趙阿福',
        fromAccountId: debtorId,
        toAccountId: '前街食肆',
    });
}

test('月半結帳: a solvent debtor is settled in full, and the tab is closed', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    clearBills(world);
    ensureVendor(world, 0n);
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });

    assert.ok(out.landed);
    assert.equal(out.facts.length, 1);
    assert.equal(out.facts[0].kind, 'paid');
    assert.equal(balance(world, liu), 14n * YUAN, 'the debt really left the purse');
    const bill = world.data.economy!.bills![0];
    assert.equal(bill.paidSubunits, bill.amountSubunits, 'the tab is closed');
    assertConserves(world, 'a settled reckoning conserves');
});

test('月半結帳: an insolvent debtor with a name worth keeping is 免帳 — and now owes a 人情', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    clearBills(world);
    ensureVendor(world, 50n); // a creditor solvent enough to have the CHOICE to forgive
    setBalance(world, liu, 0n);
    world.castById(liu)!.renown = 0.8; // above FORGIVE_DEBTOR_RENOWN
    assert.ok(world.renownOf(liu) >= FORGIVE_DEBTOR_RENOWN);
    oweTab(world, liu, 6);
    const renownBefore = world.renownOf(liu);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });

    assert.equal(out.facts[0].kind, 'forgiven');
    // Irreversible: the paper is torn up. The tab can never be collected again.
    const bill = world.data.economy!.bills![0];
    assert.equal(bill.paidSubunits, bill.amountSubunits, '免帳 closed the tab for good');
    // And the consequence is written back into state + 心事, not narrated.
    assert.equal(world.renownOf(liu), renownBefore, '免帳 costs no public standing');
    assert.ok(world.selfRegardOf(liu) < 0.8, 'being let off privately stings');
    const favour = out.spawnedWants.find((want) => want.layer === '虧欠');
    assert.ok(favour, 'a 人情 want was planted');
    assert.equal(favour!.dueDay, 2 + 7, 'and it carries a deadline, so it must leave the board');
    assertConserves(world, 'a forgiven reckoning conserves');
});

test('月半結帳: an insolvent debtor with no name to protect is 當眾催帳 — 名頭 really drops', () => {
    const world = seasonWorld();
    const axi = world.idByName('何阿喜')!;
    clearBills(world);
    ensureVendor(world, 50n); // a creditor solvent enough to have the CHOICE to forgive
    setBalance(world, axi, 0n);
    world.castById(axi)!.renown = 0.2; // below the bar
    oweTab(world, axi, 6);
    const renownBefore = world.renownOf(axi);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });

    assert.equal(out.facts[0].kind, 'dunned');
    assert.ok(world.renownOf(axi) < renownBefore, '體面 was really lost, in state');
    // The debt is NOT written off — being dunned is worse than being forgiven.
    const bill = world.data.economy!.bills![0];
    assert.ok(BigInt(bill.paidSubunits) < BigInt(bill.amountSubunits), 'the tab still stands');
    assert.ok(out.spawnedWants.some((want) => want.layer === '體面'), 'a 撿回臉面 want was planted');
    assert.ok(out.publicLines.some((line) => line.includes('圍看的人')), 'it happened in public');
    assertConserves(world, 'a dunned reckoning conserves');
});

test('月半結帳 is idempotent per day, and pulls FAR-DATED tabs forward (the deadline really arrives)', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    clearBills(world);
    ensureVendor(world, 0n);
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6); // dueDay 99 — a normal settle would never touch it on day 2

    const first = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });
    const afterFirst = balance(world, liu);
    const second = runReckoning(world, { day: 2, nowTick: 11, label: '月半結帳' });

    assert.ok(first.landed, 'the far-dated tab was pulled forward and forced to an answer');
    assert.equal(second.duplicate, true, 'a second call the same day is a no-op');
    assert.deepEqual(second.facts, []);
    assert.equal(balance(world, liu), afterFirst, 'and charges nothing twice');
    assert.equal(world.data.reckonings?.length, 1);
});
