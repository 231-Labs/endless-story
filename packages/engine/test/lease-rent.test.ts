/**
 * 租約/租金/逐客 (Stage 3) — the rent rail on the property/lease/key system.
 *
 * MONEY CONSERVATION IS SACRED: every 租金 move is a TRANSFER between two existing
 * ledger accounts (租客→屋主), never a mint. `auditSeasonEconomy(world)` must be []
 * after EVERY money move. Deterministic PLUMBING tests (hand-built ledgers +
 * FakeSceneAgent, no LLM / no credits):
 *
 *   1. rent flows 租客→屋主 at settle (tenant available ↓, owner ↑, conserves).
 *   2. a short tenant part-pays; the remainder rolls forward as chased debt,
 *      no overdraft, conserves.
 *   3. backward-compat: a bill with NO from/to still flows 班庫→市面 (troupe ↓,
 *      market ↑) — the generalization did not change default routing.
 *   4. seedHousing mints the rent bill (from/to/amount/creditor) + a 租約 registry
 *      entry + the tenant's standing key; a rent lease with NO economy throws.
 *   5. 逐客: a LANDLORD with a live 恨 want toward a soured 租客 of a rental they own
 *      (but do not live in) 換鎖 at day-end — the lease ends, its rent bill is
 *      dropped, the tenant is barred, and conservation is untouched.
 *   6. ownedScenesBy covers an owner-occupied home AND a rental; leases + a
 *      from/to bill survive a JSON round-trip and still conserve.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runTick } from '../src/tick.ts';
import { seedHousing } from '../src/core/housing.ts';
import { auditSeasonEconomy, settleSeasonDay, type SeasonEconomyData } from '../src/core/season-economy.ts';
import { WorldState, type CastMember, type WorldStateData } from '../src/world-state.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import type { ArchivePort } from '../src/ports.ts';

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** A cast member with the boilerplate filled in. */
function member(id: string, name: string, over: Partial<CastMember> = {}): CastMember {
    return { id, name, persona: name, gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...over };
}

/** A live hostile want (layer in 妒/怨/恨/仇), targeted — drives §7.78 souring. */
function hostileWant(over: { characterId: string; layer: string; desc: string; target: string }): Want {
    return newWant({
        characterId: over.characterId,
        layer: over.layer,
        desc: over.desc,
        target: over.target,
        weight: 0.8,
        sat: 0.2,
        resistance: 3,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    });
}

type Bill = NonNullable<SeasonEconomyData['bills']>[number];

/** A persisted account row (bigint fields as decimal strings, like persistEconomy). */
function acct(id: string, label: string, openingYuan: number, ownerType: 'character' | 'troupe' | 'business' = 'character') {
    return { id, ownerType, label, available: (BigInt(openingYuan) * 100n).toString(), reserved: '0', dailyFixedCost: '0', authorizedSpenderIds: [] as string[] };
}

/** Build a minimal SeasonEconomyData by hand (subunitsPerUnit 100). injected =
 *  Σ opening, reserved 0 — so `conservesProduction` holds at the seed. */
function buildEconomy(accounts: ReturnType<typeof acct>[], bills?: Bill[]): SeasonEconomyData {
    const accMap: Record<string, ReturnType<typeof acct>> = {};
    let injected = 0n;
    for (const a of accounts) {
        accMap[a.id] = a;
        injected += BigInt(a.available) + BigInt(a.reserved);
    }
    return {
        unitLabel: '圓',
        subunitsPerUnit: 100,
        marketAccountId: 'market',
        troupeAccountId: 'troupe',
        noticeSceneName: '街',
        wages: [],
        catalog: [],
        contractObjectIds: {},
        ...(bills ? { bills } : {}),
        state: { day: 1, accounts: accMap, ledger: [], injected: injected.toString(), settledDays: [] },
        contracts: {},
    };
}

const avail = (world: WorldState, id: string): bigint => BigInt(world.data.economy!.state.accounts[id].available);

/**
 * Base world: 屋主(owner) lives in & owns 屋主宅(s-ownhome); 租客(tenant) lives in the
 * 小廂房(s-rental) they do NOT own; 旁人(other) loiters on the public 街(s-street).
 * Override per case. accessSeeded: true skips the §2.96 social seed so each case's
 * access state is exactly what it declares.
 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'lease',
        sagaPremise: '一個戲班',
        cast: [member('owner', '屋主'), member('tenant', '租客', { gender: '男' }), member('other', '旁人')],
        scenes: [
            { id: 's-street', name: '街', privacyLevel: 1 },
            { id: 's-rental', name: '小廂房', privacyLevel: 3 },
            { id: 's-ownhome', name: '屋主宅', privacyLevel: 3 },
        ],
        roster: { owner: 's-ownhome', tenant: 's-rental', other: 's-street' },
        homeByChar: { owner: 's-ownhome', tenant: 's-rental', other: 's-street' },
        workByChar: { owner: 's-street', tenant: 's-street', other: 's-street' },
        wants: [],
        edges: {},
        bonds: [],
        establishedPairs: [],
        clock: makeClock(6, 0),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
        accessSeeded: true,
    };
    return new WorldState({ ...base, ...over });
}

// ── 1) rent flows 租客→屋主 at settle ────────────────────────────────────────────
test('1) rent flows tenant→owner at settle; conservation holds', () => {
    const rentBill: Bill = {
        id: 'rent-s-rental', label: '小廂房租金', amountSubunits: '300', dueDay: 1,
        fromAccountId: 'tenant', toAccountId: 'owner', creditor: '屋主', paidSubunits: '0',
    };
    const world = makeWorld({
        economy: buildEconomy(
            [acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 0, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 10)],
            [rentBill],
        ),
    });
    assert.deepEqual(auditSeasonEconomy(world), [], 'seeding a rent bill moves no money');

    const before = { tenant: avail(world, 'tenant'), owner: avail(world, 'owner') };
    settleSeasonDay(world, { day: 1, nowTick: 5 });

    assert.equal(before.tenant - avail(world, 'tenant'), 300n, 'the tenant paid 3 圓 rent');
    assert.equal(avail(world, 'owner') - before.owner, 300n, 'the owner received 3 圓 rent');
    assert.equal(world.data.economy!.bills![0].paidSubunits, '300', 'the rent is marked paid in full');
    assert.deepEqual(auditSeasonEconomy(world), [], 'rent is a transfer — conservation holds');
});

// ── 2) a short tenant part-pays; the remainder rolls forward ──────────────────────
test('2) a tenant short on rent part-pays, the remainder rolls forward as debt', () => {
    const rentBill: Bill = {
        id: 'rent-s-rental', label: '小廂房租金', amountSubunits: '300', dueDay: 1,
        fromAccountId: 'tenant', toAccountId: 'owner', creditor: '屋主', paidSubunits: '0',
    };
    const world = makeWorld({
        economy: buildEconomy(
            [acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 0, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 1)],
            [rentBill],
        ),
    });

    settleSeasonDay(world, { day: 1, nowTick: 5 });

    assert.equal(avail(world, 'tenant'), 0n, 'the tenant paid all it had — no overdraft');
    assert.equal(avail(world, 'owner'), 100n, 'the owner received the 1 圓 the tenant could muster');
    const bill = world.data.economy!.bills![0];
    assert.equal(bill.paidSubunits, '100', 'only 1 圓 of the 3 圓 rent was paid');
    assert.equal(BigInt(bill.amountSubunits) - BigInt(bill.paidSubunits), 200n, 'the 2 圓 shortfall rolls forward as chased debt');
    assert.deepEqual(auditSeasonEconomy(world), [], 'a partial pay still conserves');
});

// ── 3) backward-compat: a bill with NO from/to still flows 班庫→市面 ───────────────
test('3) backward-compat: a bill with no from/to routes 班庫→市面 as before', () => {
    const oldBill: Bill = { id: 'yuehang', label: '錢莊月息', amountSubunits: '200', dueDay: 1, creditor: '錢莊', paidSubunits: '0' };
    const world = makeWorld({
        economy: buildEconomy(
            [acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 5, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 0)],
            [oldBill],
        ),
    });

    const before = { troupe: avail(world, 'troupe'), market: avail(world, 'market') };
    settleSeasonDay(world, { day: 1, nowTick: 5 });

    assert.equal(before.troupe - avail(world, 'troupe'), 200n, 'the troupe treasury paid the old bill (default payer)');
    assert.equal(avail(world, 'market') - before.market, 200n, 'the market received it (default payee)');
    assert.deepEqual(auditSeasonEconomy(world), [], 'default routing conserves');
});

// ── 4) seedHousing mints the rent bill + 租約 registry + the tenant's key ─────────
test('4) seedHousing on a rent lease mints the bill, the lease registry and the standing key', () => {
    const world = makeWorld({
        economy: buildEconomy([acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 0, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 10)]),
    });

    seedHousing(world, [{
        sceneName: '小廂房',
        ownerNames: ['屋主'],
        lease: { tenantName: '租客', keyObjectId: 'key-rental', keyLabel: '小廂房的門鑰', rentYuan: 3, rentDueDay: 3 },
    }]);

    // the rent bill: correct id/from/to/amount/creditor/due, unpaid
    const bill = world.data.economy!.bills!.find((b) => b.id === 'rent-s-rental');
    assert.ok(bill, 'a rent bill was minted');
    assert.equal(bill!.fromAccountId, 'tenant', 'the 租客 pays');
    assert.equal(bill!.toAccountId, 'owner', 'the 屋主 receives');
    assert.equal(bill!.amountSubunits, '300', '3 圓 → 300 分');
    assert.equal(bill!.dueDay, 3);
    assert.equal(bill!.creditor, '屋主', 'the creditor label is the owner');
    assert.equal(bill!.paidSubunits, '0');

    // the 租約 registry ties deed + tenant + rent
    assert.deepEqual(world.data.leases!['s-rental'], { ownerId: 'owner', tenantId: 'tenant', rentBillId: 'rent-s-rental' });

    // stage-1 behaviour intact: the tenant holds a standing key + the physical key object
    assert.ok(world.keysHeldBy('tenant').some((k) => k.sceneId === 's-rental' && k.kind === 'standing'), 'the 租客 holds a standing key');
    assert.equal(world.objectById('key-rental')?.keyFor, 's-rental', 'the physical key object names its lock');
    assert.deepEqual(world.ownersOf('s-rental'), ['owner'], 'the deed is recorded on the owner');

    // seeding rent moves no money
    assert.deepEqual(auditSeasonEconomy(world), [], 'minting a future rent bill conserves');
});

test('4b) a rent lease with no economy throws [housing]', () => {
    const world = makeWorld({ economy: undefined }); // no season money physics
    assert.throws(
        () => seedHousing(world, [{
            sceneName: '小廂房',
            ownerNames: ['屋主'],
            lease: { tenantName: '租客', keyObjectId: 'key-rental', rentYuan: 3 },
        }]),
        /\[housing\] lease of "小廂房" bears rent but the world has no economy/,
    );
});

// ── 5) 逐客 — a landlord evicts a soured tenant of a rental they own ───────────────
test('5) 逐客: a landlord rekeys a soured tenant of a rental they own but do not live in', async () => {
    // 屋主 owns the 小廂房(s-rental) by deed but lives in 屋主宅; 租客 lives in the 小廂房
    // with a standing key + a rent-bearing lease. 屋主 now carries a live 恨 want aimed
    // at the 租客. Day-end (深宵, night) → §7.78 逐客 runs: the lease ends, the rent bill
    // is dropped, the tenant is barred. No economy dep passed, so no settle interferes.
    const rentBill: Bill = {
        id: 'rent-s-rental', label: '小廂房租金', amountSubunits: '300', dueDay: 3,
        fromAccountId: 'tenant', toAccountId: 'owner', creditor: '屋主', paidSubunits: '0',
    };
    const world = makeWorld({
        propertyOwners: { 's-rental': ['owner'], 's-ownhome': ['owner'] },
        accessGrants: { 's-rental': { standing: ['tenant'], oneTime: [] } },
        leases: { 's-rental': { ownerId: 'owner', tenantId: 'tenant', rentBillId: 'rent-s-rental' } },
        economy: buildEconomy(
            [acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 0, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 10)],
            [rentBill],
        ),
        wants: [hostileWant({ characterId: 'owner', layer: '恨', desc: '這租客背了我，容不得他再住下去', target: 'tenant' })],
        clock: makeClock(6, 5), // 深宵 — day-end, night (the 恨 want is not decayed away)
    });
    assert.equal(world.canEnter('tenant', 's-rental'), true, 'the tenant may enter before the turn sours');

    // the world carries economy, so the tick requires a LocalEconomy dep; the day-1
    // settle skips the rent (dueDay 3 > day 1), so nothing but 逐客 touches the bill.
    await runTick(world, { ...deps(new FakeSceneAgent()), economy: new LocalEconomy() }, { log: () => {} });

    assert.equal(world.canEnter('tenant', 's-rental'), false, '屋主 換了鎖 — the tenant is barred');
    assert.equal(world.data.leases!['s-rental'], undefined, 'the lease is terminated');
    assert.equal(world.data.economy!.bills!.some((b) => b.id === 'rent-s-rental'), false, 'the future rent bill is dropped');
    assert.deepEqual(auditSeasonEconomy(world), [], 'dropping an unpaid future bill moves no money — conservation holds');
});

// ── 6) ownedScenesBy + JSON round-trip ───────────────────────────────────────────
test('6) ownedScenesBy covers home AND rental; leases + a from/to bill round-trip and conserve', () => {
    const rentBill: Bill = {
        id: 'rent-s-rental', label: '小廂房租金', amountSubunits: '300', dueDay: 3,
        fromAccountId: 'tenant', toAccountId: 'owner', creditor: '屋主', paidSubunits: '0',
    };
    const world = makeWorld({
        propertyOwners: { 's-rental': ['owner'], 's-ownhome': ['owner'] },
        accessGrants: { 's-rental': { standing: ['tenant'], oneTime: [] } },
        leases: { 's-rental': { ownerId: 'owner', tenantId: 'tenant', rentBillId: 'rent-s-rental' } },
        economy: buildEconomy(
            [acct('market', '市面', 0, 'business'), acct('troupe', '班庫', 0, 'troupe'), acct('owner', '屋主', 0), acct('tenant', '租客', 10)],
            [rentBill],
        ),
    });

    // the deed-holder owns their own home AND the rental they let out
    assert.deepEqual(world.ownedScenesBy('owner').sort(), ['s-ownhome', 's-rental']);
    assert.deepEqual(world.ownedScenesBy('tenant'), [], 'the 租客 owns nothing');
    assert.deepEqual(world.rentalsBy('owner'), [{ sceneId: 's-rental', tenantId: 'tenant', rentBillId: 'rent-s-rental' }]);

    // the whole world JSON round-trips; leases + the from/to bill survive intact
    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)) as WorldStateData);
    assert.deepEqual(restored.data.leases, world.data.leases, 'the 租約 registry survives snapshot/restore');
    const restoredBill = restored.data.economy!.bills!.find((b) => b.id === 'rent-s-rental')!;
    assert.equal(restoredBill.fromAccountId, 'tenant', 'the bill payer survives the round-trip');
    assert.equal(restoredBill.toAccountId, 'owner', 'the bill payee survives the round-trip');
    assert.deepEqual(auditSeasonEconomy(restored), [], 'the round-tripped world still conserves');
});
