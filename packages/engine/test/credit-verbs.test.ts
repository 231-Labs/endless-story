/**
 * 借賒有據 (creditVerbs) — the credit verbs as REAL world physics.
 * Deterministic tests (FakeSceneAgent / direct EconomyPort commands, no LLM).
 *
 *   1. borrow through the REAL tick dispatch + a lending decideLend seat ⇒ the
 *      lender's money moves NOW and a dated 欠條 bill exists; conservation holds;
 *   2. borrow with NO decideLend seat ⇒ deterministic REFUSE: no money moves,
 *      the 婉拒 line is public canon, and the beat LANDS (never a replan);
 *   3. repay partial → capped-full ⇒ the oldest 欠條 shrinks (paidSubunits, the
 *      same representation the settle chases) then clears; over-repay never
 *      becomes a hidden gift; no debt ⇒ the 白給請用 pay refusal;
 *   4. 賒帳: a broke buyer at an allowsTab vendor still eats — effect applied,
 *      a real bill records the debt, NO transfer, conservation holds; the tab
 *      counts toward oncePerDay; a no-tab vendor keeps the old refusal;
 *   5. overdue 欠條 between two cast members spawns BOTH wants at settle exactly
 *      once (marker-dedup'd across a second settle);
 *   6. flag OFF ⇒ zero new behavior: borrow/repay rejected, the tab falls back
 *      to the old insufficient-funds fail, no percept/advert lines, no wants.
 *
 * Uses the committed showcase season JSON (spring-snow-market, whose 前街食肆
 * now authors `allowsTab`) for the market cases, and a tiny 2-person world with
 * a 1-tick day for the settle-idempotence case. The shared anchun acceptance
 * fixture is never touched.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { auditSeasonEconomy, creditAdvertFor, economyPerceptFor, seedSeasonEconomy } from '../src/core/season-economy.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import { newWant } from '../src/core/want-core.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import type { ArchivePort, LendDecideInput, LendDecideReply } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const YUAN = 100n;
const 前街食肆 = '前街食肆';
const nullArchive: ArchivePort = { commit: async () => {} };

function buildMarketWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    return world;
}

function bal(world: WorldState, id: string): bigint {
    return BigInt(world.data.economy!.state.accounts[id].available);
}

function bills(world: WorldState) {
    return world.data.economy!.bills ?? [];
}

function sceneId(world: WorldState, name: string): string {
    return world.data.scenes.find((scene) => scene.name === name)!.id;
}

async function runDays(world: WorldState, agent: FakeSceneAgent, ticks: number): Promise<string[]> {
    const deps = { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
    const logs: string[] = [];
    for (let i = 0; i < ticks; i++) await runTick(world, deps, { log: (line) => logs.push(line) });
    return logs;
}

/** 柳安春 opens the street scene (a seeded hottest want) and asks 蘇映雪 for a
 *  loan through the REAL beat channel. Records any replan rejection it is fed.
 *  Has NO decideLend seat, so the tick's deterministic default (REFUSE) applies. */
class BorrowScriptAgent extends FakeSceneAgent {
    rejections: string[] = [];
    private asked = false;
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        if (input.physicalRejection) this.rejections.push(input.physicalRejection);
        if (!this.asked && input.name === '柳安春' && input.others.some((other) => other.name === '蘇映雪')) {
            this.asked = true;
            return {
                beat: '搓著手，向映雪低聲開了口。',
                inner: '這幾日實在轉不開。',
                economyCommands: [{ action: 'borrow', toName: '蘇映雪', amountYuan: 5, dueDays: 10, memo: '周轉' }],
            };
        }
        return super.actBeat(input);
    }
}

/** BorrowScriptAgent + the LENDER's consent seat: agrees with one line. */
class LendingAgent extends BorrowScriptAgent {
    lendInputs: LendDecideInput[] = [];
    async decideLend(input: LendDecideInput): Promise<LendDecideReply | null> {
        this.lendInputs.push(input);
        return { lend: true, line: '拿去使，記著日子' };
    }
}

/** Market world with 柳安春 and 蘇映雪 co-present at 戲園前街, 柳 carrying the
 *  hottest want so he opens the scene (tension = weight×(1−sat)). */
function borrowStage(): { world: WorldState; liu: string; su: string } {
    const world = buildMarketWorld();
    world.data.creditVerbs = true;
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const street = sceneId(world, '戲園前街');
    world.data.roster[liu] = street;
    world.data.roster[su] = street;
    const want = newWant({
        characterId: liu,
        layer: '生計',
        desc: '要尋映雪周轉幾個錢',
        target: '蘇映雪',
        weight: 0.95,
        sat: 0.1,
        resistance: 3,
        kind: 'narrative',
        source: 'genesis', // keeps the fake genesis from re-seeding 柳
        bornTick: 0,
    });
    world.data.wants.push(want);
    return { world, liu, su };
}

test('1) borrow through the tick dispatch + lending seat ⇒ transfer NOW + a dated 欠條 bill; conservation holds', async () => {
    const { world, liu, su } = borrowStage();
    const agent = new LendingAgent();
    const logs = await runDays(world, agent, 2);

    // The LENDER was asked — with real state, before any money moved.
    assert.equal(agent.lendInputs.length, 1, 'exactly one ask reached the lender seat');
    const seat = agent.lendInputs[0];
    assert.equal(seat.lenderName, '蘇映雪', 'the seat is the LENDER, not the asker');
    assert.equal(seat.borrowerName, '柳安春', 'the lender hears the asker as they know them');
    assert.equal(seat.amountYuan, 5);
    assert.equal(seat.dueDays, 10);
    assert.equal(seat.memo, '周轉');
    assert.equal(seat.lenderBalanceYuan, 20, 'the lender reads their own purse in whole 圓');
    assert.equal(seat.existingDebtYuan, 0, 'no 舊帳 yet');

    // Money moved NOW, lender→borrower, through the conserving transfer.
    assert.equal(bal(world, liu), 17n * YUAN, '柳 12 + 5 borrowed');
    assert.equal(bal(world, su), 15n * YUAN, '蘇 20 − 5 lent');
    const txn = world.data.economy!.state.ledger.find((t) => t.kind === 'transfer' && t.memo.startsWith('告借'));
    assert.ok(txn, 'the loan is a real ledger transfer with the 告借 memo');
    assert.equal(txn!.from, su);
    assert.equal(txn!.to, liu);
    assert.equal(BigInt(txn!.amount), 5n * YUAN);

    // The bill IS the debt instrument — the exact shape the settle chases.
    const loan = bills(world).find((bill) => bill.id.startsWith('loan:'));
    assert.ok(loan, 'a loan bill exists');
    assert.equal(loan!.fromAccountId, liu, 'the borrower pays it');
    assert.equal(loan!.toAccountId, su, 'the lender collects it');
    assert.equal(loan!.dueDay, 11, 'day 1 + dueDays 10');
    assert.equal(loan!.creditor, '蘇映雪');
    assert.equal(BigInt(loan!.amountSubunits), 5n * YUAN);
    assert.equal(loan!.paidSubunits, '0');
    assert.match(loan!.label, /欠蘇映雪5圓（周轉）/);

    assert.ok(logs.some((line) => line.includes('告借') && line.includes('應了') && line.includes('第11日為期')), 'the lend lands as a public 銀錢 line');
    assert.equal(agent.rejections.length, 0, 'no replan was ever triggered');
    assert.deepEqual(auditSeasonEconomy(world), [], 'a loan conserves (the bill is a promise, not money)');
});

test('2) borrow with NO seat ⇒ deterministic REFUSE: no money, a 婉拒 public line, and NOT a replan', async () => {
    const { world, liu, su } = borrowStage();
    const agent = new BorrowScriptAgent(); // no decideLend ⇒ the tick's conservative default refuses
    const logs = await runDays(world, agent, 2);

    assert.equal(bal(world, liu), 12n * YUAN, 'no money reached the asker');
    assert.equal(bal(world, su), 20n * YUAN, 'the would-be lender kept every 分');
    assert.ok(!world.data.economy!.state.ledger.some((t) => t.memo.startsWith('告借')), 'no loan transfer was booked');
    assert.ok(!bills(world).some((bill) => bill.id.startsWith('loan:')), 'no 欠條 was written');

    // The refusal is a REAL social event, not an illegal command.
    assert.ok(logs.some((line) => line.includes('開口告借') && line.includes('婉拒')), 'the 婉拒 line is public canon');
    assert.equal(agent.rejections.length, 0, 'the beat landed — a refused loan never replans');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('3) repay: partial shrinks the oldest 欠條, an over-repay is capped at what is owed, no debt ⇒ 白給請用 pay', () => {
    const world = buildMarketWorld();
    world.data.creditVerbs = true;
    const economy = new LocalEconomy();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const scene = world.data.roster[su];
    world.data.roster[liu] = scene; // 告借是當面開口的事

    const lent = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'borrow', toName: '蘇映雪', amountYuan: 10 },
        causeEventId: 'test:borrow', seq: 0,
        lendVerdict: { lend: true, line: '拿去' },
    });
    assert.equal(lent.ok, true, lent.reason);
    const loan = bills(world).find((bill) => bill.id.startsWith('loan:'))!;
    assert.equal(loan.dueDay, 16, 'default dueDays 15 ⇒ day 1 + 15');
    assert.equal(bal(world, liu), 22n * YUAN);
    assert.deepEqual(auditSeasonEconomy(world), []);

    // partial: the bill shrinks by paidSubunits — the SAME representation the settle chases.
    const part = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'repay', toName: '蘇映雪', amountYuan: 4 },
        causeEventId: 'test:repay1', seq: 0,
    });
    assert.equal(part.ok, true, part.reason);
    assert.equal(loan.paidSubunits, (4n * YUAN).toString(), 'the oldest open bill absorbed the partial repay');
    assert.ok(part.publicLines[0].includes('欠條上還記著'), part.publicLines[0]);
    assert.equal(bal(world, liu), 18n * YUAN);
    assert.equal(bal(world, su), 14n * YUAN);
    assert.deepEqual(auditSeasonEconomy(world), []);

    // over-repay: capped at what is owed (6 圓) — never a hidden gift.
    const clear = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'repay', toName: '蘇映雪', amountYuan: 20 },
        causeEventId: 'test:repay2', seq: 0,
    });
    assert.equal(clear.ok, true, clear.reason);
    assert.equal(loan.paidSubunits, loan.amountSubunits, 'the 欠條 is fully cleared');
    assert.ok(clear.publicLines[0].includes('兩清'), clear.publicLines[0]);
    assert.equal(bal(world, liu), 12n * YUAN, 'only the owed 6 圓 moved — back to the opening purse');
    assert.equal(bal(world, su), 20n * YUAN, 'the lender is made exactly whole');
    assert.deepEqual(auditSeasonEconomy(world), []);

    // nothing owed any more ⇒ repay refuses toward pay.
    const none = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'repay', toName: '蘇映雪', amountYuan: 1 },
        causeEventId: 'test:repay3', seq: 0,
    });
    assert.equal(none.ok, false);
    assert.match(none.reason!, /白給請用 pay/);
});

test('4) 賒帳: a broke buyer at the allowsTab 食肆 still eats — bill, no transfer, oncePerDay holds; a no-tab vendor keeps the old fail', () => {
    const world = buildMarketWorld();
    world.data.creditVerbs = true;
    const economy = new LocalEconomy();
    const street = sceneId(world, '戲園前街');
    const he = world.idByName('何阿喜')!;

    // drain his purse the conserving way (a real pay, not a state poke).
    const drained = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'pay', toName: '白韻秋', amountYuan: 6, memo: '還人情' },
        causeEventId: 'test:drain', seq: 0,
    });
    assert.equal(drained.ok, true, drained.reason);
    assert.equal(bal(world, he), 0n);
    world.castById(he)!.state.hunger = 1;

    const shiBefore = bal(world, 前街食肆);
    const tab = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'meal-frontstreet-tangzhou' },
        causeEventId: 'test:tab1', seq: 0,
    });
    assert.equal(tab.ok, true, tab.reason);
    assert.ok(tab.publicLines[0].includes('賒下一份'), tab.publicLines[0]);

    // the EFFECT landed (the meal is real) …
    assert.ok(Math.abs(world.castById(he)!.state.hunger - 0.4) < 1e-9, 'the meal relieved hunger');
    // … but NO money moved: a bill is a promise, not money.
    assert.equal(bal(world, he), 0n, 'the broke buyer paid nothing now');
    assert.equal(bal(world, 前街食肆), shiBefore, 'the vendor was not credited yet');
    assert.ok(!world.data.economy!.state.ledger.some((t) => t.kind === 'purchase' && t.from === he), 'no purchase txn was booked');
    const bill = bills(world).find((candidate) => candidate.id.startsWith('tab:meal-frontstreet-tangzhou:'))!;
    assert.ok(bill, 'the tab is a REAL bill the settle will chase');
    assert.equal(bill.fromAccountId, he);
    assert.equal(bill.toAccountId, 前街食肆);
    assert.equal(BigInt(bill.amountSubunits), 1n * YUAN);
    assert.equal(bill.dueDay, 16, 'tabDueDays default 15 ⇒ day 1 + 15');
    assert.match(bill.label, /^賒/);
    assert.deepEqual(auditSeasonEconomy(world), [], 'a tab conserves — nothing minted');

    // oncePerDay counts the tab: the same meal cannot be had twice today.
    const again = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'meal-frontstreet-tangzhou' },
        causeEventId: 'test:tab2', seq: 0,
    });
    assert.equal(again.ok, false);
    assert.match(again.reason!, /今日已經用過一次/);

    // a vendor WITHOUT allowsTab (白家繡樓) keeps the exact old insufficient fail.
    const noTab = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'embroidery-baijia-kerchief' },
        causeEventId: 'test:notab', seq: 0,
    });
    assert.equal(noTab.ok, false, 'no tab at the 繡樓 — broke stays refused');
    assert.ok(!bills(world).some((candidate) => candidate.id.startsWith('tab:embroidery')), 'and no bill appeared');
});

/** Two-person world with a 1-tick day (every tick settles): 甲 owes 乙 a 6 圓
 *  欠條 already past due, and holds nothing to pay it with. */
function makeDebtWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'credit-verbs',
        sagaPremise: '一條街',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [{ id: 's0', name: '前廳', privacyLevel: 1 }],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's0', c1: 's0' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        bonds: [],
        establishedPairs: [],
        clock: makeClock(1, 1), // ticksPerDay 1 ⇒ EVERY tick is a day-end settle; starts day 2
        accessSeeded: true,
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    const world = new WorldState({ ...base, ...over });
    seedSeasonEconomy(world, {
        noticeScene: '前廳',
        troupe: { label: '班庫', openingYuan: 0, authorizedSpenderNames: [] },
        characterDefaults: { openingYuan: 0, dailyFixedCostYuan: 0 },
        characters: [{ name: '乙', openingYuan: 20 }],
    }, 'credit-verbs-test');
    world.data.economy!.bills = [{
        id: 'loan:test',
        label: '欠乙6圓',
        amountSubunits: '600',
        dueDay: 1, // already due; 甲 holds 0 ⇒ the chase leaves it owing = OVERDUE
        creditor: '乙',
        paidSubunits: '0',
        fromAccountId: 'c0',
        toAccountId: 'c1',
    }];
    return world;
}

test('5) an overdue 欠條 between cast spawns BOTH wants at settle — exactly once across two settles', async () => {
    const world = makeDebtWorld({ creditVerbs: true });
    const agent = new FakeSceneAgent();
    const logs = await runDays(world, agent, 1); // day-2 settle: chase pays 0 ⇒ overdue

    const debtorWants = world.data.wants.filter((w) => !w.retired && w.characterId === 'c0' && w.desc.includes('過了期'));
    const creditorWants = world.data.wants.filter((w) => !w.retired && w.characterId === 'c1' && w.desc.includes('咽不平'));
    assert.equal(debtorWants.length, 1, 'the debtor carries the 虧欠 want');
    assert.equal(debtorWants[0].layer, '虧欠');
    assert.equal(debtorWants[0].target, '乙', 'aimed at the creditor');
    assert.match(debtorWants[0].desc, /欠著乙的6圓/);
    assert.equal(creditorWants.length, 1, 'the creditor carries the 催討 want');
    assert.equal(creditorWants[0].layer, '催討');
    assert.equal(creditorWants[0].target, '甲', 'aimed at the debtor');
    assert.deepEqual(world.data.economy!.debtWantsSpawned, ['loan:test:debtor', 'loan:test:creditor'], 'both sides marked spawned');
    assert.ok(logs.some((line) => line.includes('欠條生怨')), 'the spawn is logged');

    await runDays(world, agent, 1); // day-3 settle chases the SAME bill again
    assert.equal(world.data.wants.filter((w) => w.desc.includes('過了期')).length, 1, 'idempotent: no duplicate 虧欠 want');
    assert.equal(world.data.wants.filter((w) => w.desc.includes('咽不平')).length, 1, 'idempotent: no duplicate 催討 want');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('6) flag OFF ⇒ zero new behavior: verbs rejected, tab falls back, no advert/percept lines, no wants', async () => {
    // (a) borrow / repay are rejected even with a willing verdict in hand.
    const world = buildMarketWorld(); // creditVerbs unset
    const economy = new LocalEconomy();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const scene = world.data.roster[su];
    world.data.roster[liu] = scene;
    const borrow = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'borrow', toName: '蘇映雪', amountYuan: 5 },
        causeEventId: 'test:off-borrow', seq: 0,
        lendVerdict: { lend: true },
    });
    assert.equal(borrow.ok, false, 'borrow is rejected with the flag off');
    const repay = economy.commitCommand(world, {
        actorId: liu, sceneId: scene, witnessIds: [liu, su], day: 1,
        command: { action: 'repay', toName: '蘇映雪', amountYuan: 5 },
        causeEventId: 'test:off-repay', seq: 0,
    });
    assert.equal(repay.ok, false, 'repay is rejected with the flag off');
    // (the frame's own seeded 租金 bill rides the array; no CREDIT bill may appear)
    assert.ok(!bills(world).some((bill) => bill.id.startsWith('loan:') || bill.id.startsWith('tab:')), 'no credit bill appeared');

    // (b) the tab is inert: a broke buyer at the allowsTab 食肆 gets the OLD fail.
    const street = sceneId(world, '戲園前街');
    const he = world.idByName('何阿喜')!;
    const drained = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'pay', toName: '白韻秋', amountYuan: 6 },
        causeEventId: 'test:off-drain', seq: 0,
    });
    assert.equal(drained.ok, true, drained.reason);
    const broke = economy.commitCommand(world, {
        actorId: he, sceneId: street, witnessIds: [he], day: 1,
        command: { action: 'purchase', itemId: 'meal-frontstreet-tangzhou' },
        causeEventId: 'test:off-tab', seq: 0,
    });
    assert.equal(broke.ok, false, 'the old insufficient-funds refusal, byte-for-byte path');
    assert.ok(!bills(world).some((bill) => bill.id.startsWith('tab:')), 'no tab bill appeared');

    // (c) no advertisement, no percept lines — even with a hand-written personal bill.
    assert.equal(creditAdvertFor(world, liu, [liu, su]), undefined, 'nothing is 亮牌 with the flag off');
    world.data.economy!.bills = [{
        id: 'loan:off', label: '欠蘇映雪3圓', amountSubunits: '300', dueDay: 1,
        creditor: '蘇映雪', paidSubunits: '0', fromAccountId: liu, toAccountId: su,
    }];
    const percept = economyPerceptFor(world, liu, scene) ?? '';
    assert.ok(!percept.includes('你欠著'), 'the debt line stays silent with the flag off');
    assert.ok(!(economyPerceptFor(world, he, street) ?? '').includes('可賒'), 'the tab note stays silent with the flag off');
    assert.deepEqual(auditSeasonEconomy(world), []);

    // (d) the settle spawns NO wants for an overdue cast-to-cast bill (lease compat).
    const debtWorld = makeDebtWorld(); // creditVerbs unset
    await runDays(debtWorld, new FakeSceneAgent(), 1);
    assert.ok(!debtWorld.data.wants.some((w) => w.desc.includes('過了期') || w.desc.includes('咽不平')), 'no 欠條 wants with the flag off');
    assert.equal(debtWorld.data.economy!.debtWantsSpawned, undefined, 'no markers either');
});
