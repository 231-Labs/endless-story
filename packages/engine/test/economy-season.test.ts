/**
 * Deterministic signed/rejected season controls — the ECONOMY_ENGINE_HANDOFF
 * acceptance run. Same spring-snow seed + anchun-after-curtain frame, three
 * scripted worlds:
 *   signed   — 柳安春 fills the partner slot (蘇映雪), both sign → splits pay out
 *   rejected — 柳安春 rejects → zero transfers, escrow returns
 *   ignored  — nobody acts → the deadline expires deterministically + aftermath
 * The objective worlds must diverge in the LEDGER (not just narration), conserve
 * money, survive snapshot/restore, and never double-settle. No LLM, no credits.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { auditSeasonEconomy, economyPerceptFor, enforceContractCommandPairing, settleSeasonDay, settleTenancyMoveIns } from '../src/core/season-economy.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { runTick, type TickReport } from '../src/tick.ts';
import { WorldState } from '../src/world-state.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const YUAN = 100n;
const nullArchive: ArchivePort = { commit: async () => {} };

function buildSeasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

function balances(world: WorldState): Record<string, bigint> {
    const out: Record<string, bigint> = {};
    for (const [id, account] of Object.entries(world.data.economy!.state.accounts)) {
        out[world.castById(id)?.name ?? account.label] = BigInt(account.available);
    }
    return out;
}

/** Drives the contract through beats: movers head for the paper, then act. */
class ContractScriptAgent extends FakeSceneAgent {
    private phase: 'lead' | 'partner' | 'done' = 'lead';
    private readonly mode: 'sign' | 'reject';
    constructor(mode: 'sign' | 'reject') {
        super();
        this.mode = mode;
    }

    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        if (input.name === '柳安春' || input.name === '蘇映雪') {
            const dressing = input.options.find((option) => option.name === '後台妝閣');
            if (dressing) return { move: true, targetSceneId: dressing.sceneId, reason: '去看契約' };
        }
        return { move: false, reason: 'stay' };
    }

    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        if (this.mode === 'reject' && this.phase === 'lead' && input.name === '柳安春') {
            this.phase = 'done';
            return {
                beat: '把那紙約書推回桌心，聲音不高，話卻是死的。',
                inner: '這錢救得了班子，救不了我。',
                economyCommands: [{ action: 'contract_reject', contractId: 'anchun-exclusive' }],
            };
        }
        if (this.mode === 'sign' && this.phase === 'lead' && input.name === '柳安春') {
            this.phase = 'partner';
            return {
                beat: '提筆蘸墨，先在搭檔欄落下一個名字，再簽了自己的。',
                inner: '要走這條路，就拉映雪一起走。',
                economyCommands: [
                    { action: 'contract_fill_partner', contractId: 'anchun-exclusive', partnerName: '蘇映雪' },
                    { action: 'contract_sign', contractId: 'anchun-exclusive' },
                ],
            };
        }
        if (this.mode === 'sign' && this.phase === 'partner' && input.name === '蘇映雪') {
            this.phase = 'done';
            return {
                beat: '接過筆，在聯名一欄簽下自己的本名。',
                inner: '她把名字給我，我便接住。',
                economyCommands: [{ action: 'contract_sign', contractId: 'anchun-exclusive' }],
            };
        }
        return super.actBeat(input);
    }
}

async function runDays(world: WorldState, agent: FakeSceneAgent, ticks: number): Promise<TickReport[]> {
    const deps = {
        agent,
        recall: new LocalRecall(),
        archive: nullArchive,
        clock: new LocalClock(),
        economy: new LocalEconomy(),
    };
    const reports: TickReport[] = [];
    for (let i = 0; i < ticks; i++) reports.push(await runTick(world, deps, { log: () => {} }));
    return reports;
}

test('signed control: the final signature settles the splits atomically', async () => {
    const world = buildSeasonWorld();
    await runDays(world, new ContractScriptAgent('sign'), 6); // day 1

    const contract = world.data.economy!.contracts['anchun-exclusive'];
    assert.equal(contract.status, 'settled');
    assert.equal(contract.partnerSlot.filledBy, world.idByName('蘇映雪'));

    // 柳 12 + 80片酬 + 2工錢 − 3食宿；蘇 20 + 50 + 2 − 3；班庫 42 + 140 − 8薪 − 10雜支
    const funds = balances(world);
    assert.equal(funds['柳安春'], 91n * YUAN);
    assert.equal(funds['蘇映雪'], 69n * YUAN);
    assert.equal(funds['春雪社班庫'], 164n * YUAN);
    assert.equal(funds['華光影片社'], 130n * YUAN);
    assert.equal(BigInt(world.data.economy!.state.accounts.huaguang.reserved), 0n);

    // every payout carries the causing beat event id
    const payouts = world.data.economy!.state.ledger.filter((txn) => txn.kind === 'contract-payout');
    assert.equal(payouts.length, 3);
    assert.ok(payouts.every((txn) => txn.causeEventId.includes(':b')));

    // the contract paper's objective state mirrors the ledger
    assert.match(world.objectById('anchun-exclusive-contract')?.state ?? '', /已簽署生效/);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('rejected control: zero transfers, escrow returns, different objective world', async () => {
    const world = buildSeasonWorld();
    await runDays(world, new ContractScriptAgent('reject'), 6);

    const contract = world.data.economy!.contracts['anchun-exclusive'];
    assert.equal(contract.status, 'rejected');

    const funds = balances(world);
    assert.equal(funds['柳安春'], 11n * YUAN); // 12 + 2 − 3, no片酬
    assert.equal(funds['蘇映雪'], 19n * YUAN); // 20 + 2 − 3
    assert.equal(funds['春雪社班庫'], 24n * YUAN); // 42 − 8薪 − 10雜支
    assert.equal(funds['華光影片社'], 400n * YUAN);
    assert.equal(
        world.data.economy!.state.ledger.filter((txn) => txn.kind === 'contract-payout').length,
        0,
    );
    assert.match(world.objectById('anchun-exclusive-contract')?.state ?? '', /拒簽/);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('signed vs rejected: the same seed forks into different worlds by exactly the splits', async () => {
    const signed = buildSeasonWorld();
    await runDays(signed, new ContractScriptAgent('sign'), 6);
    const rejected = buildSeasonWorld();
    await runDays(rejected, new ContractScriptAgent('reject'), 6);

    const s = balances(signed);
    const r = balances(rejected);
    assert.equal(s['柳安春'] - r['柳安春'], 80n * YUAN);
    assert.equal(s['蘇映雪'] - r['蘇映雪'], 50n * YUAN);
    assert.equal(s['春雪社班庫'] - r['春雪社班庫'], 140n * YUAN);
    assert.equal(r['華光影片社'] - s['華光影片社'], 270n * YUAN);
});

test('ignored control: the deadline expires deterministically and the aftermath is perceived', async () => {
    const world = buildSeasonWorld();
    // 3 full days of nobody signing + 1 aftermath tick (day 4 morning)
    const reports = await runDays(world, new FakeSceneAgent(), 19);

    const contract = world.data.economy!.contracts['anchun-exclusive'];
    assert.equal(contract.status, 'expired');
    assert.equal(balances(world)['華光影片社'], 400n * YUAN);
    assert.match(world.objectById('anchun-exclusive-contract')?.state ?? '', /逾期/);

    // mounting pressure is objective and PERIODIC: day 2 stays quiet (sundries
    // covered), day 3 stacks unpaid wages + the 錢莊 bill + the expired offer
    const day2 = reports[11].economyNotices ?? [];
    assert.equal(day2.length, 0, `day-2 should be quiet, got: ${day2.join(' / ')}`);
    const day3 = reports[17].economyNotices ?? [];
    assert.ok(day3.some((line) => line.includes('班庫見底')), `day-3 wage notice missing: ${day3.join(' / ')}`);
    assert.ok(day3.some((line) => line.includes('錢莊月息與屋租') && line.includes('記在')), `day-3 bill notice missing: ${day3.join(' / ')}`);
    assert.ok(day3.some((line) => line.includes('期限已過')), `expiry notice missing: ${day3.join(' / ')}`);

    // the aftermath tick delivers the settlement as a canonical world event
    const aftermath = reports[18];
    assert.ok(
        aftermath.events.some((event) => event.id.includes(':scheduled:economy-day-3')),
        'day-3 settlement posts as a next-morning canonical event',
    );
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('percepts are knowledge- and authority-scoped', () => {
    const world = buildSeasonWorld();
    const liu = world.idByName('柳安春')!;
    const shen = world.idByName('沈雪笙')!;
    const jin = world.idByName('金鳳')!;

    const liuPercept = economyPerceptFor(world, liu, world.data.roster[liu])!;
    assert.match(liuPercept, /你身上有 12 圓/);
    assert.match(liuPercept, /可撐約 4 日/);
    assert.match(liuPercept, /無權動用春雪社班庫/);
    assert.match(liuPercept, /柳安春得 80 圓、聯名搭檔得 50 圓、春雪社班庫得 140 圓/);
    assert.match(liuPercept, /你是這份契約的當事人/);
    assert.match(liuPercept, /contract_fill_partner/);

    const shenPercept = economyPerceptFor(world, shen, world.data.roster[shen])!;
    assert.match(shenPercept, /春雪社班庫現有 42 圓/);
    assert.match(shenPercept, /你有權核准班庫用度/);
    assert.match(shenPercept, /班庫若見底，這班就得散/);
    assert.match(shenPercept, /帳期在身：錢莊月息與屋租/);
    assert.doesNotMatch(shenPercept, /你是這份契約的當事人/);

    const jinPercept = economyPerceptFor(world, jin, world.data.roster[jin])!;
    assert.doesNotMatch(jinPercept, /班庫現有/);
    assert.match(jinPercept, /核准權在沈雪笙/);

    // stakes are knowledge-scoped: a wage-drawer knows her livelihood hangs on
    // the troupe; 金鳳 (not on the payroll) carries no such line
    const lian = world.idByName('連翹')!;
    assert.match(economyPerceptFor(world, lian, world.data.roster[lian])!, /你的工錢喫住都繫在/);
    assert.doesNotMatch(jinPercept, /工錢喫住/);
});

test('a light pay packet escalates the livelihood stakes in the percept', () => {
    const world = buildSeasonWorld();
    // 班主 legally drains the pot to 6 圓, so day-1 wages (8 圓 due) prorate short
    const economy = new LocalEconomy();
    const shen = world.idByName('沈雪笙')!;
    const drained = economy.commitCommand(world, {
        actorId: shen, sceneId: world.data.roster[shen], witnessIds: [shen], day: 1,
        command: { action: 'pay', toName: 'market', amountYuan: 36, fromAccount: 'troupe', memo: '付清舊料帳' },
        causeEventId: 'test:drain', seq: 0,
    });
    assert.equal(drained.ok, true, drained.reason);
    settleSeasonDay(world, { day: 1, nowTick: 5 });

    const lian = world.idByName('連翹')!;
    const percept = economyPerceptFor(world, lian, world.data.roster[lian])!;
    assert.match(percept, /班中俸已經發不足/);
    assert.match(percept, /各自另尋出路/);
});

test('a purchase changes the world, respects prices, and is once-per-day', async () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const liu = world.idByName('柳安春')!;
    const stage = world.data.roster[liu]; // 雲錦台戲台 (work)
    const witnesses = [liu];

    // meal: pays 3 圓 and objectively relieves hunger
    world.castById(liu)!.state.hunger = 0.9;
    const meal = economy.commitCommand(world, {
        actorId: liu, sceneId: stage, witnessIds: witnesses, day: 1,
        command: { action: 'purchase', itemId: 'meal-front-street' },
        causeEventId: 'test:e1', seq: 0,
    });
    assert.equal(meal.ok, true, meal.reason);
    assert.ok(world.castById(liu)!.state.hunger < 0.4);
    assert.equal(BigInt(world.data.economy!.state.accounts[liu].available), 9n * YUAN);

    const again = economy.commitCommand(world, {
        actorId: liu, sceneId: stage, witnessIds: witnesses, day: 1,
        command: { action: 'purchase', itemId: 'meal-front-street' },
        causeEventId: 'test:e2', seq: 0,
    });
    assert.equal(again.ok, false);
    assert.match(again.reason!, /今日已經用過一次/);

    // repair: fixes the registered prop (real object-state change, versioned)
    const before = world.objectById('worn-huqin')!.version;
    const repair = economy.commitCommand(world, {
        actorId: liu, sceneId: stage, witnessIds: witnesses, day: 1,
        command: { action: 'purchase', itemId: 'repair-huqin' },
        causeEventId: 'test:e3', seq: 0,
    });
    assert.equal(repair.ok, true, repair.reason);
    assert.match(world.objectById('worn-huqin')!.state!, /可上台伴奏/);
    assert.equal(world.objectById('worn-huqin')!.version, before + 1);

    // production investment spawns a real production object — needs troupe money
    const denied = economy.commitCommand(world, {
        actorId: liu, sceneId: stage, witnessIds: witnesses, day: 1,
        command: { action: 'purchase', itemId: 'stage-new-play', fromAccount: 'troupe' },
        causeEventId: 'test:e4', seq: 0,
    });
    assert.equal(denied.ok, false);
    assert.match(denied.reason!, /spending authority|無.*權/);

    const shen = world.idByName('沈雪笙')!;
    const invested = economy.commitCommand(world, {
        actorId: shen, sceneId: stage, witnessIds: [shen], day: 1,
        command: { action: 'purchase', itemId: 'stage-new-play', fromAccount: 'troupe' },
        causeEventId: 'test:e5', seq: 0,
    });
    assert.equal(invested.ok, false); // 班庫 42 圓 < 60 圓 — poverty is real
    assert.match(invested.reason!, /holds|needs/);
    assert.equal(world.objectById('new-play-fund'), undefined);

    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('sponsorship needs the beneficiary\'s consent — 金鳳 may refuse 白韻秋 and accept the troupe', () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const bai = world.idByName('白韻秋')!;
    const jin = world.idByName('金鳳')!;
    const shen = world.idByName('沈雪笙')!;
    const oldHome = world.data.homeByChar[jin];
    const at = (id: string) => world.data.roster[id];

    // 白韻秋 pays: money escrows, but 金鳳's home does NOT move yet
    const offer = economy.commitCommand(world, {
        actorId: bai, sceneId: at(bai), witnessIds: [bai], day: 1,
        command: { action: 'purchase', itemId: 'sponsor-jinfeng-move' },
        causeEventId: 'test:s1', seq: 0,
    });
    assert.equal(offer.ok, true, offer.reason);
    assert.match(offer.publicLines[0], /允不允由金鳳自己/);
    assert.equal(world.data.homeByChar[jin], oldHome, 'no consent, no move');
    assert.equal(BigInt(world.data.economy!.state.accounts[bai].reserved), 25n * YUAN);
    const baiSponsorId = `sponsor:sponsor-jinfeng-move:d1:${bai}`;
    assert.equal(world.data.economy!.contracts[baiSponsorId].status, 'offered');

    // while an offer is pending, nobody can double-book the room
    const shove = economy.commitCommand(world, {
        actorId: shen, sceneId: at(shen), witnessIds: [shen], day: 1,
        command: { action: 'purchase', itemId: 'sponsor-jinfeng-move', fromAccount: 'troupe' },
        causeEventId: 'test:s2', seq: 0,
    });
    assert.equal(shove.ok, false);
    assert.match(shove.reason!, /正等當事人答覆/);

    // 金鳳 sees the offer in her percept and it is HERS to answer
    const jinPercept = economyPerceptFor(world, jin, at(jin))!;
    assert.match(jinPercept, /白韻秋出資/);
    assert.match(jinPercept, /你是這份契約的當事人/);

    // she refuses: escrow returns, home untouched
    const refused = economy.commitCommand(world, {
        actorId: jin, sceneId: at(jin), witnessIds: [jin], day: 1,
        command: { action: 'contract_reject', contractId: baiSponsorId },
        causeEventId: 'test:s3', seq: 0,
    });
    assert.equal(refused.ok, true, refused.reason);
    assert.equal(world.data.homeByChar[jin], oldHome);
    assert.equal(BigInt(world.data.economy!.state.accounts[bai].available), 80n * YUAN);
    assert.equal(BigInt(world.data.economy!.state.accounts[bai].reserved), 0n);

    // the troupe (via 班主) offers instead — 金鳳 signs: she gets a LEASE, not a teleport
    const troupeOffer = economy.commitCommand(world, {
        actorId: shen, sceneId: at(shen), witnessIds: [shen], day: 1,
        command: { action: 'purchase', itemId: 'sponsor-jinfeng-move', fromAccount: 'troupe' },
        causeEventId: 'test:s4', seq: 0,
    });
    assert.equal(troupeOffer.ok, true, troupeOffer.reason);
    const troupeSponsorId = 'sponsor:sponsor-jinfeng-move:d1:troupe';
    const accepted = economy.commitCommand(world, {
        actorId: jin, sceneId: at(jin), witnessIds: [jin], day: 1,
        command: { action: 'contract_sign', contractId: troupeSponsorId },
        causeEventId: 'test:s5', seq: 0,
    });
    assert.equal(accepted.ok, true, accepted.reason);
    assert.equal(BigInt(world.data.economy!.state.accounts.troupe.available), 17n * YUAN); // 42 − 25
    assert.equal(BigInt(world.data.economy!.state.accounts.market.available), 25n * YUAN);

    // money moved, lease in hand — but home does NOT change until she goes there
    assert.equal(world.data.homeByChar[jin], oldHome, 'a lease is not a move');
    const lease = world.objectById('jinfeng-room-lease')!;
    assert.equal(lease.carriedBy, jin);
    assert.match(economyPerceptFor(world, jin, at(jin))!, /你已賃定【後進廂房】/);

    // nothing happens while she stays away…
    assert.deepEqual(settleTenancyMoveIns(world), []);

    // …she packs the tuberose pot and walks over: NOW the home commits
    const pot = world.objectById('wanxiangyu-pot')!;
    pot.carriedBy = jin;
    world.moveCharacter(jin, world.data.scenes.find((scene) => scene.name === '後進廂房')!.id);
    const moves = settleTenancyMoveIns(world);
    assert.equal(moves.length, 1);
    assert.equal(world.sceneNameById(world.data.homeByChar[jin]), '後進廂房');
    assert.match(moves[0].line, /憑租契遷入/);
    assert.match(moves[0].line, /晚香玉/);
    assert.equal(world.data.economy!.tenancies!['jinfeng-room-lease'], undefined, 'tenancy settles once');
    assert.deepEqual(settleTenancyMoveIns(world), [], 'move-in is idempotent');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('contract paper: handling is free physics, only its state belongs to the ledger', () => {
    const world = buildSeasonWorld();

    // 江聞鶴 picking the paper up / handing it over needs no ledger command
    enforceContractCommandPairing(world, [{ objectId: 'anchun-exclusive-contract' }], undefined);
    enforceContractCommandPairing(world, [{ objectId: 'anchun-exclusive-contract' }], []);

    // prose rewriting the signature state without a command is the v14 failure
    assert.throws(
        () => enforceContractCommandPairing(world, [{ objectId: 'anchun-exclusive-contract', state: '已簽妥' }], []),
        /簽署狀態由帳本決定/,
    );

    // state change paired with the actual ledger command passes
    enforceContractCommandPairing(
        world,
        [{ objectId: 'anchun-exclusive-contract', state: '柳安春落筆' }],
        [{ action: 'contract_sign', contractId: 'anchun-exclusive' }],
    );

    // non-contract objects are never the economy's business
    enforceContractCommandPairing(world, [{ objectId: 'worn-huqin', state: '斷得更徹底' }], []);
});

test('aid is acknowledged publicly and bills fall due on their day, not daily', () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const bai = world.idByName('白韻秋')!;

    // 白韻秋 tops the treasury up once — and her own percept shows the outgoing
    const aid = economy.commitCommand(world, {
        actorId: bai, sceneId: world.data.roster[bai], witnessIds: [bai], day: 1,
        command: { action: 'pay', toName: '班庫', amountYuan: 10, memo: '替班裡墊一手' },
        causeEventId: 'test:a1', seq: 0,
    });
    assert.equal(aid.ok, true, aid.reason);
    const baiPercept = economyPerceptFor(world, bai, world.data.roster[bai])!;
    assert.match(baiPercept, /你今日已出帳共 10 圓/);
    assert.match(baiPercept, /同一筆缺口不必重複去填/);

    // day-1 settle acknowledges the aid with the donor's name and new runway
    const settle1 = settleSeasonDay(world, { day: 1, nowTick: 5 });
    assert.ok(
        settle1.publicNotices.some((line) => line.includes('白韻秋') && line.includes('接濟') && line.includes('可再撐')),
        `aid acknowledgment missing: ${settle1.publicNotices.join(' / ')}`,
    );

    // the 錢莊 bill is not charged before its due day…
    assert.ok(!settle1.publicNotices.some((line) => line.includes('錢莊月息與屋租')));
    settleSeasonDay(world, { day: 2, nowTick: 11 });

    // …and on day 3 it collects (short → the remainder stands as chased debt)
    const settle3 = settleSeasonDay(world, { day: 3, nowTick: 17 });
    assert.ok(
        settle3.publicNotices.some((line) => line.includes('錢莊月息與屋租')),
        `bill notice missing: ${settle3.publicNotices.join(' / ')}`,
    );
    const bill = world.data.economy!.bills![0];
    assert.ok(BigInt(bill.paidSubunits) > 0n, 'the due collects what exists');
    assert.deepEqual(auditSeasonEconomy(world), []);

    // 班主 sees the standing debt in his percept
    const shen = world.idByName('沈雪笙')!;
    if (BigInt(bill.paidSubunits) < BigInt(bill.amountSubunits)) {
        assert.match(economyPerceptFor(world, shen, world.data.roster[shen])!, /帳期在身：錢莊月息與屋租/);
    }
});

test('an unanswered sponsorship expires at its deadline and the escrow returns', () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const bai = world.idByName('白韻秋')!;
    const jin = world.idByName('金鳳')!;
    const offer = economy.commitCommand(world, {
        actorId: bai, sceneId: world.data.roster[bai], witnessIds: [bai], day: 1,
        command: { action: 'purchase', itemId: 'sponsor-jinfeng-move' },
        causeEventId: 'test:x1', seq: 0,
    });
    assert.equal(offer.ok, true, offer.reason);

    // day-1 settle: deadline (day 2) not yet passed — still pending
    settleSeasonDay(world, { day: 1, nowTick: 5 });
    const sponsorId = `sponsor:sponsor-jinfeng-move:d1:${bai}`;
    assert.equal(world.data.economy!.contracts[sponsorId].status, 'offered');

    // day-2 settle: expired, escrow back (80 − 25押 + 25退 − 兩日食宿 5×2 = 70), home unchanged
    const settle2 = settleSeasonDay(world, { day: 2, nowTick: 11 });
    assert.equal(world.data.economy!.contracts[sponsorId].status, 'expired');
    assert.ok(settle2.publicNotices.some((line) => line.includes('期限已過')));
    assert.equal(BigInt(world.data.economy!.state.accounts[bai].available), 70n * YUAN);
    assert.equal(BigInt(world.data.economy!.state.accounts[bai].reserved), 0n);
    assert.equal(world.sceneNameById(world.data.homeByChar[jin]), '金鳳寓所');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('economy state survives snapshot/restore byte-for-byte and never double-settles', async () => {
    const world = buildSeasonWorld();
    await runDays(world, new ContractScriptAgent('sign'), 6);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'economy-snapshot-'));
    try {
        world.snapshot(dir);
        const restored = WorldState.restore(dir);
        assert.deepEqual(restored.data.economy, world.data.economy);
        assert.deepEqual(auditSeasonEconomy(restored), []);

        // re-settling the already-settled day is a no-op (idempotent settlement)
        const before = JSON.stringify(restored.data.economy);
        const rerun = settleSeasonDay(restored, { day: 1, nowTick: 5 });
        assert.equal(rerun.settled, false);
        assert.equal(JSON.stringify(restored.data.economy), before);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('counter-offer: an accepted demand amends the terms, grants a grace day, and the deal that died in v15 signs', () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const shen = world.idByName('沈雪笙')!;
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const at = (id: string) => world.data.roster[id];
    const paperScene = world.objectById('anchun-exclusive-contract')!.sceneId;
    for (const id of [shen, liu, su]) world.moveCharacter(id, paperScene);

    // 金鳳 is a true outsider — refused with a named, actionable message;
    // 沈雪笙 stewards the beneficiary treasury, so HIS standing is real
    const jin = world.idByName('金鳳')!;
    world.moveCharacter(jin, paperScene);
    const outsider = economy.commitCommand(world, {
        actorId: jin, sceneId: paperScene, witnessIds: [jin], day: 3,
        command: { action: 'contract_counter', contractId: 'anchun-exclusive', demand: '加錢' },
        causeEventId: 'test:c0', seq: 0,
    });
    assert.equal(outsider.ok, false);
    assert.match(outsider.reason!, /插不上手/);
    assert.match(outsider.reason!, /柳安春/);
    const stewardSign = economy.commitCommand(world, {
        actorId: shen, sceneId: paperScene, witnessIds: [shen], day: 3,
        command: { action: 'contract_sign', contractId: 'anchun-exclusive' },
        causeEventId: 'test:c0b', seq: 0,
    });
    assert.equal(stewardSign.ok, false, 'standing to negotiate is not a pen');
    assert.match(stewardSign.reason!, /簽不了別人的約/);

    const countered = economy.commitCommand(world, {
        actorId: liu, sceneId: paperScene, witnessIds: [liu, shen], day: 3,
        command: { action: 'contract_counter', contractId: 'anchun-exclusive', demand: '那張半卸妝校樣不許用，肖像須另拍定妝照' },
        causeEventId: 'test:c1', seq: 0,
    });
    assert.equal(countered.ok, true, countered.reason);
    assert.match(countered.publicLines[0], /還價/);

    // one demand at a time; and her percept shows it pending
    const second = economy.commitCommand(world, {
        actorId: liu, sceneId: paperScene, witnessIds: [liu], day: 3,
        command: { action: 'contract_counter', contractId: 'anchun-exclusive', demand: '再加一百圓' },
        causeEventId: 'test:c2', seq: 0,
    });
    assert.equal(second.ok, false);
    assert.match(economyPerceptFor(world, liu, at(liu))!, /還價待覆/);

    // overnight (day-3 settle): the demand matches the authored policy → terms
    // amend, the deadline stretches past the old midnight, no expiry tonight
    const settle3 = settleSeasonDay(world, { day: 3, nowTick: 17 });
    assert.ok(settle3.publicNotices.some((line) => line.includes('條款照辦')), settle3.publicNotices.join(' / '));
    const amended = world.data.economy!.contracts['anchun-exclusive'];
    assert.equal(amended.status, 'offered', 'the accepted amendment outlives the old deadline');
    assert.equal(amended.deadlineDay, 4);
    assert.ok(amended.terms.some((term) => term.includes('定妝照')));

    // day 4: partner named, everyone signs the amended paper — it settles
    for (const [actor, command] of [
        [liu, { action: 'contract_fill_partner', contractId: 'anchun-exclusive', partnerName: '蘇映雪' }],
        [liu, { action: 'contract_sign', contractId: 'anchun-exclusive' }],
        [su, { action: 'contract_sign', contractId: 'anchun-exclusive' }],
    ] as const) {
        const done = economy.commitCommand(world, {
            actorId: actor, sceneId: paperScene, witnessIds: [actor], day: 4,
            command: command as never, causeEventId: `test:c3:${actor}:${command.action}`, seq: 0,
        });
        assert.equal(done.ok, true, done.reason);
    }
    assert.equal(world.data.economy!.contracts['anchun-exclusive'].status, 'settled');

    // the paper's object id works as an alias, and re-signing a done deal is
    // harmless confirmation — both v16 live crash shapes
    const aliasSign = economy.commitCommand(world, {
        actorId: liu, sceneId: paperScene, witnessIds: [liu], day: 4,
        command: { action: 'contract_sign', contractId: 'anchun-exclusive-contract' },
        causeEventId: 'test:c4', seq: 0,
    });
    assert.equal(aliasSign.ok, true, aliasSign.reason);
    assert.match(aliasSign.publicLines[0], /約早生效無誤/);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('counter-offer: a demand outside the policy is refused and the clock stays', () => {
    const world = buildSeasonWorld();
    const economy = new LocalEconomy();
    const liu = world.idByName('柳安春')!;
    const paperScene = world.objectById('anchun-exclusive-contract')!.sceneId;
    world.moveCharacter(liu, paperScene);
    const countered = economy.commitCommand(world, {
        actorId: liu, sceneId: paperScene, witnessIds: [liu], day: 3,
        command: { action: 'contract_counter', contractId: 'anchun-exclusive', demand: '預付款再加一百圓' },
        causeEventId: 'test:r1', seq: 0,
    });
    assert.equal(countered.ok, true, countered.reason);
    const settle3 = settleSeasonDay(world, { day: 3, nowTick: 17 });
    assert.ok(settle3.publicNotices.some((line) => line.includes('不改')), settle3.publicNotices.join(' / '));
    const c = world.data.economy!.contracts['anchun-exclusive'];
    assert.equal(c.status, 'expired', 'refused counter leaves the original midnight in force');
    assert.equal(c.pendingCounter, undefined);
    assert.deepEqual(auditSeasonEconomy(world), []);
});

test('deadline-day percept does the time arithmetic the agents cannot', () => {
    const world = buildSeasonWorld();
    world.data.clock = makeClock(6, 13); // day 3 (deadline day) 日午
    const liu = world.idByName('柳安春')!;
    const percept = economyPerceptFor(world, liu, world.data.roster[liu])!;
    assert.match(percept, /限期就在今夜子夜/);
    assert.match(percept, /還餘 4 個時辰/);
});
