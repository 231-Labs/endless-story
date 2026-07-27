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
import {
    announceReckoning,
    fallbackStance,
    FAVOUR_DEBT_DAYS,
    PATIENCE_CALLS,
    payDividend,
    payWagePacket,
    reckoningSeats,
    runReckoning,
} from '../src/core/income-events.ts';
import { reputationOf, settleReputationForBill, tabAllowedFor } from '../src/core/reputation.ts';
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
//
// The reckoning MOVES NO MONEY. That is the design correction these tests pin:
// 「打死不還」 has to be a position a character can actually hold, so refusing must
// cost something other than the money being taken anyway. What it costs is the
// name — and that is the creditor's to decide, not the clock's.

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

test('月半結帳 NEVER debits: a solvent debtor who did not pay keeps every 分', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);
    const before = balance(world, liu);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳', stances: { tab: 'press' } });

    assert.ok(out.landed);
    assert.equal(balance(world, liu), before, 'the engine took nothing — the choice stays his');
    const bill = world.data.economy!.bills![0];
    assert.equal(bill.paidSubunits, '0', 'and the debt still stands');
    assertConserves(world, 'a reckoning that moves no money conserves trivially');
});

test('預告: the whole street learns the day, and every debtor gets a dated 心事 that can RESOLVE', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);

    const notice = announceReckoning(world, { day: 1, nowTick: 3, dueDay: 3, label: '月半結帳' });

    assert.ok(notice.publicLine?.includes('第 3 日'), 'the day is common knowledge');
    assert.ok(notice.publicLine?.includes('柳安春'), 'and so is who is on the 摺子');
    assert.equal(notice.privateNotices[0].characterId, liu);
    assert.match(notice.privateNotices[0].text, /沒有人會從你手裡把錢拿走/, 'the debtor is told the choice is theirs');
    const want = notice.spawnedWants[0];
    assert.ok(want, 'a dated 心事 was planted');
    assert.equal(want.dueDay, 3);
    assert.deepEqual(want.completion, { kind: 'bill-cleared', billId: 'tab' }, 'settling it themselves RESOLVES it');
});

test('說到做到: clearing the tab during the window is recorded as its own kind of name', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);
    // Called once at an earlier reckoning, then settled by the character themselves.
    world.data.debtCalls = [{ billId: 'tab', day: 1, stance: 'press', debtorId: liu }];
    world.data.economy!.bills![0].paidSubunits = world.data.economy!.bills![0].amountSubunits;
    const renownBefore = world.renownOf(liu);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });

    assert.equal(out.facts[0].kind, 'kept');
    assert.ok(world.renownOf(liu) > renownBefore, 'paying up is worth something to a name');
    assert.ok(out.publicLines.some((line) => line.includes('自己清了')));
});

test('免了: the creditor tears up the paper — no money moves, and a 人情 takes its place', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 0n);
    oweTab(world, liu, 6);
    const vendorBefore = balance(world, '前街食肆');

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳', stances: { tab: 'forgive' } });

    assert.equal(out.facts[0].kind, 'forgiven');
    assert.equal(balance(world, '前街食肆'), vendorBefore, 'the creditor ate the loss; nothing was collected');
    assert.equal(world.data.economy!.bills![0].paidSubunits, world.data.economy!.bills![0].amountSubunits, '免帳 closes the tab for good');
    assert.ok(world.selfRegardOf(liu) < 1, 'being let off privately stings');
    const favour = out.spawnedWants.find((want) => want.layer === '虧欠');
    assert.ok(favour, 'a 人情 want was planted');
    assert.equal(favour!.dueDay, 2 + FAVOUR_DEBT_DAYS);
    // The street records that they were let off — 賒帳資格 is NOT revoked.
    assert.equal(reputationOf(world, liu, 'debt-forgiven').length, 1);
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'a forgiven debt closes no door');
});

test('當面催: a private humiliation — the debt stands, the street stays out of it', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);
    const renownBefore = world.renownOf(liu);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳', stances: { tab: 'press' } });

    assert.equal(out.facts[0].kind, 'pressed');
    assert.ok(world.renownOf(liu) < renownBefore, 'some standing was lost');
    assert.deepEqual(reputationOf(world, liu, 'debt-refused'), [], 'but nothing was said to the street');
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'and the door stays open');
    assert.ok(out.publicLines.some((line) => line.includes('話沒往外傳')));
    assert.ok(out.spawnedWants.some((want) => want.desc.includes('趁話還沒傳出去')), 'he now has a reason to settle it');
});

test('傳出去: the name travels, the 賒帳 door shuts — and STILL no money is taken', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);
    const before = balance(world, liu);
    const renownBefore = world.renownOf(liu);

    const out = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳', stances: { tab: 'broadcast' } });

    assert.equal(out.facts[0].kind, 'broadcast');
    assert.equal(balance(world, liu), before, '打死不還 is a position he can actually hold');
    assert.equal(world.data.economy!.bills![0].paidSubunits, '0', 'the debt stands');
    // The cost is the name, and it is a fact other people hold.
    const marks = reputationOf(world, liu, 'debt-refused');
    assert.equal(marks.length, 1);
    assert.ok(marks[0].knownByIds.length > 1, 'the street heard it');
    assert.ok(marks[0].note.includes('手裡不是沒有'), 'and it records that he COULD have paid');
    assert.ok(world.renownOf(liu) < renownBefore - 0.1, '名頭 drops hard');
    // And it is a door closing, not an adjective.
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), false, '賒帳資格 revoked at the vendor he stiffed');
    assert.equal(tabAllowedFor(world, liu, '白家繡樓'), true, 'but only at the one he stiffed');
    assertConserves(world, 'no money moved');
});

test('洗刷: paying late reopens the door, though the ledger keeps the record', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6);
    runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳', stances: { tab: 'broadcast' } });
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), false);

    // He changes his mind and settles it.
    world.data.economy!.bills![0].paidSubunits = world.data.economy!.bills![0].amountSubunits;
    settleReputationForBill(world, 'tab', 5);

    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'the door reopens');
    assert.deepEqual(reputationOf(world, liu), [], 'and it stops nagging him');
    assert.equal(world.data.reputation!.length, 1, 'but the record of what was said remains');
});

test('打死不還 escalates: the deterministic fallback runs out of patience', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 0n); // genuinely cannot pay — the lenient branch
    world.castById(liu)!.renown = 0.8;
    oweTab(world, liu, 6);

    const seat = () => reckoningSeats(world, { day: 2 })[0];
    assert.equal(fallbackStance(seat(), world), 'forgive', 'a solvent creditor forgives somebody who truly cannot pay');

    // Now he CAN pay and simply has not.
    setBalance(world, liu, 20n);
    assert.equal(fallbackStance(seat(), world), 'press', 'first time: a word to his face');
    world.data.debtCalls = [{ billId: 'tab', day: 2, stance: 'press', debtorId: liu }];
    assert.equal(fallbackStance(seat(), world), 'broadcast', 'second time with money in hand: the word goes out');
    world.data.debtCalls.push({ billId: 'tab', day: 3, stance: 'broadcast', debtorId: liu });
    setBalance(world, liu, 0n);
    assert.equal(fallbackStance(seat(), world), 'broadcast', `past ${PATIENCE_CALLS} calls, patience is finite either way`);
});

test('月半結帳 is idempotent per day, and pulls FAR-DATED tabs forward (the deadline really arrives)', () => {
    const world = seasonWorld();
    clearBills(world);
    ensureVendor(world, 50n);
    const liu = world.idByName('柳安春')!;
    setBalance(world, liu, 20n);
    oweTab(world, liu, 6); // dueDay 99 — a normal settle would never touch it on day 2

    const first = runReckoning(world, { day: 2, nowTick: 10, label: '月半結帳' });
    const second = runReckoning(world, { day: 2, nowTick: 11, label: '月半結帳' });

    assert.ok(first.landed, 'the far-dated tab was pulled forward and called');
    assert.equal(second.duplicate, true, 'a second call the same day is a no-op');
    assert.deepEqual(second.facts, []);
    assert.equal(world.data.reckonings?.length, 1);
    assert.equal(world.data.debtCalls?.length, 1, 'and the debt was only called once');
});
