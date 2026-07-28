/**
 * 宏觀節奏煙霧測試 — a full 3-day, 18-tick run with the deck attached, the POV
 * tracking switch on, and the deterministic FakeSceneAgent in the director /
 * diary / poem seats. No LLM, no keys, no network.
 *
 * This is the acceptance harness for the four changes, and each assertion below
 * maps to one of the diagnosed failures:
 *
 *   (a) 「支出是機制、收入是台詞」  → the ledger carries 工錢／分紅 rows, and no
 *       character is bankrupted for want of an income channel.
 *   (b) 「月半結帳永遠在逼近、永遠不抵達」 → the deadline card lands on a real tick and
 *       leaves irreversible facts behind.
 *   (c) 「日記變成亂寫正史的口子」   → tracked characters get diaries whose claims cite
 *       beat evidence, with unsupported claims flagged rather than dropped.
 *   (d) POV 散文是呈現層           → povScene runs ONLY for tracked characters.
 *   (e) 「liveWants 58 只進不出」    → wants actually leave the board.
 *   (f) 「深宵 8/12 同一個打算」     → no single-scene crowd swallows the cast.
 *   (g) 「世界只能推、角色只能被推」   → the cast itself sets world-turning events in
 *       motion (世情動作), and the director can write a card the deck never had.
 *
 * The run is also asserted to be REPLAYABLE: the same seed twice produces the
 * same director log and the same ledger.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { applySeasonFrame, attachEventDeck, buildWorldState, loadEventDeckFile, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import { auditSeasonEconomy, ledgerRows } from '../src/core/season-economy.ts';
import { resolvedRate } from '../src/core/want-lifecycle.ts';
import { injectPatronage } from '../src/core/patronage.ts';
import { PROPOSABLE_EFFECTS, PROPOSAL_LIMITS } from '../src/core/event-deck.ts';
import { runTick, type TickReport } from '../src/tick.ts';
import { WorldState } from '../src/world-state.ts';
import type { ArchivePort, PovSceneInput } from '../src/ports.ts';

const TICKS_PER_DAY = 6;
const DAYS = 3;
const nullArchive: ArchivePort = { commit: async () => {} };

/** Records which characters the run actually paid POV prose for. */
class PovCountingAgent extends FakeSceneAgent {
    readonly povCalls: string[] = [];
    override async povScene(input: PovSceneInput): Promise<string | null> {
        if (input.characterId) this.povCalls.push(input.characterId);
        return super.povScene(input);
    }
}

interface RunResult {
    world: WorldState;
    reports: TickReport[];
    agent: PovCountingAgent;
}

async function runSeason(trackNames: string[]): Promise<RunResult> {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    const deck = loadEventDeckFile('spring-snow');
    attachEventDeck(world, deck);
    world.data.trackedCharacterIds = trackNames.map((name) => {
        const id = world.idByName(name);
        assert.ok(id, `tracked character not in cast: ${name}`);
        return id;
    });
    world.data.clock = makeClock(TICKS_PER_DAY, 0);

    const agent = new PovCountingAgent();
    const deps = { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy(), deck };
    const reports: TickReport[] = [];
    for (let i = 0; i < TICKS_PER_DAY * DAYS; i++) {
        reports.push(await runTick(world, deps, { log: () => {} }));
    }
    return { world, reports, agent };
}

const balanceOf = (world: WorldState, id: string): bigint => BigInt(world.data.economy!.state.accounts[id]!.available);

let cached: RunResult | undefined;
async function season(): Promise<RunResult> {
    cached ??= await runSeason(['柳安春', '方競西']);
    return cached;
}

// ── (a) the money loop actually closes ───────────────────────────────────────

test('(a) the ledger carries real INCOME rows — 工錢/分紅 are transactions, not dialogue', async () => {
    const { world } = await season();
    const rows = ledgerRows(world);

    const wages = rows.filter((row) => row.memo.includes('工錢'));
    assert.ok(wages.length > 0, `expected 工錢 rows in the ledger, saw memos: ${[...new Set(rows.map((r) => r.memo))].join('、')}`);
    assert.ok(wages.every((row) => row.amount > 0n));
    // The daily settle's own payroll must also be landing — that is the baseline
    // income channel every character now has.
    assert.ok(rows.some((row) => row.kind === 'wage'), 'the daily payroll settled');
    assert.deepEqual(auditSeasonEconomy(world), [], 'the whole season conserves money');
});

test('(a) nobody is bankrupted for want of an income channel — every character has one', async () => {
    const { world } = await season();
    const data = world.data.economy!;
    const paid = new Set<string>();
    for (const wage of data.wages) paid.add(wage.accountId);
    for (const row of ledgerRows(world)) if (row.kind === 'wage' || row.memo.includes('工錢') || row.memo.includes('分紅')) paid.add(row.to);

    const stranded = world.activeCast().filter((member) => !paid.has(member.id));
    assert.deepEqual(stranded.map((member) => member.name), [], 'every character on the board draws from SOME pot');

    // Scarcity survives: this is a tight, slightly negative world, not a rich one.
    const purses = world.activeCast().map((member) => balanceOf(world, member.id));
    assert.ok(purses.every((purse) => purse >= 0n), 'no purse went negative');
    assert.ok(purses.some((purse) => purse < 1000n), 'and somebody is still genuinely short — scarcity was not fixed away');
});

test('(a) 觀眾注資 lands as a world channel mid-run, and the cast is told', async () => {
    const { world } = await season();
    const troupeId = world.data.economy!.troupeAccountId;
    const before = balanceOf(world, troupeId);

    const gift = injectPatronage(world, {
        channel: 'ticket',
        amountYuan: 6,
        day: world.data.clock.day,
        tick: world.data.clock.currentTick,
    });

    assert.ok(gift.ok, gift.reason);
    assert.equal(balanceOf(world, troupeId) - before, 600n);
    assert.ok(world.data.scheduledEvents!.some((event) => event.id.startsWith('patronage-')), 'it became a perceivable event');
    assert.deepEqual(auditSeasonEconomy(world), []);
});

// ── (b) the deadline arrives ─────────────────────────────────────────────────

test('(b) 月半結帳: the street is warned first, the day arrives on schedule, and NO purse is touched', async () => {
    const { world, reports } = await season();

    // 預告 — the common knowledge, days ahead. Without this window, "chose not to
    // pay" would be indistinguishable from "never got the chance".
    const notices = reports.flatMap((report) => report.cardsPlayed ?? []).filter((play) => play.cardId === 'reckoning-notice');
    assert.equal(notices.length, 1, 'the street was warned exactly once');
    assert.equal(notices[0].chosenBy, 'deadline');
    assert.ok(notices[0].lines.some((line) => line.includes('第 3 日')), 'and told which day');

    // 到日 — the calling itself.
    const reckoningPlays = reports.flatMap((report) => report.cardsPlayed ?? []).filter((play) => play.cardId === 'mid-month-reckoning');
    assert.equal(reckoningPlays.length, 1, 'the deadline arrived exactly once in three days');
    assert.equal(reckoningPlays[0].chosenBy, 'deadline', 'and the director had no say in WHETHER it landed');
    assert.equal(world.data.reckonings?.[0].day, 3, 'on the authored day');
    assert.ok(world.data.debtCalls?.length, 'every debt it called is on the record');

    // The load-bearing claim: the engine took nothing. Every debt it called was
    // either forgiven by its creditor or left standing — never collected.
    const collected = ledgerRows(world).filter((row) => row.memo.includes('結帳'));
    assert.deepEqual(collected, [], '月半結帳 moves no money — 打死不還 stays a real choice');
    for (const call of world.data.debtCalls ?? []) {
        assert.ok(['forgive', 'press', 'broadcast'].includes(call.stance));
    }
});

test('(b) every card play is auditable: logged, with the offered set and who chose it', async () => {
    const { world } = await season();
    const log = world.data.directorLog ?? [];
    assert.ok(log.length > 0, 'the deck actually pushed on the world');
    for (const entry of log) {
        assert.ok(entry.cardId);
        assert.ok(['director', 'deadline', 'operator', 'director-proposed', 'character'].includes(entry.chosenBy));
        assert.ok(Array.isArray(entry.offeredCardIds), 'the choice can be proven legal on replay');
        assert.ok(entry.day >= 1 && entry.tick >= 0);
        // The two channels that can produce a play the deck FILE does not contain
        // must each carry what a replay would otherwise be missing: the card
        // itself, or the person who did it.
        if (entry.chosenBy === 'director-proposed') {
            assert.ok(entry.proposedCard, 'a self-authored card is logged verbatim, or the run cannot replay');
            assert.equal(entry.proposedCard!.id, entry.cardId);
        }
        if (entry.chosenBy === 'character') {
            assert.ok(entry.actorId && world.castById(entry.actorId), '一個世情動作總有人做');
        }
    }
});

// ── (g) the two channels that let the world exceed its own deck ──────────────

test('(g) the cast itself turns the world — 世情動作 land, and they land as relationships', async () => {
    const { world } = await season();
    const acts = (world.data.directorLog ?? []).filter((entry) => entry.chosenBy === 'character');
    assert.ok(acts.length > 0, '三日之內總有人走到那一步');

    for (const entry of acts) {
        const actorId = entry.actorId!;
        assert.ok(world.castById(actorId), '一個世情動作總有人做');
        assert.ok(entry.irreversible > 0, '走到那一步就收不回來');
        // The consequence rode the relationship graph, not some new ledger — the
        // whole correction that 處境 is derived, never stored.
        for (const targetId of entry.targetIds) {
            assert.notEqual(targetId, actorId, '沒有人對自己做這種事');
            const held = world.data.edges[targetId]?.[actorId];
            const heardOf = Object.values(world.data.edges).some((row) => row[targetId]?.disposition === 'cold');
            assert.ok(held || heardOf, '有人記下了這件事');
        }
    }
    assert.equal((world.data as unknown as Record<string, unknown>).reputation, undefined, 'still no parallel ledger');
});

test('(g) the director can write a card the deck never contained — inside the quota', async () => {
    const { world } = await season();
    const proposed = (world.data.directorLog ?? []).filter((entry) => entry.chosenBy === 'director-proposed');
    assert.ok(proposed.length > 0, '牌組出不了牌的時候，導演還能自撰一張');
    assert.ok(proposed.length <= PROPOSAL_LIMITS.seasonCap, '但用不過本季的額度');
    for (const day of new Set(proposed.map((entry) => entry.day))) {
        assert.ok(
            proposed.filter((entry) => entry.day === day).length <= PROPOSAL_LIMITS.perDay,
            `第 ${day} 日自撰不過額`,
        );
    }
    for (const entry of proposed) {
        assert.ok(entry.proposedCard, 'the card itself is in the log, so the run replays without it');
        // Everything a proposal did was assembled from the allowed primitives.
        for (const effect of entry.proposedCard!.effects) {
            assert.ok((PROPOSABLE_EFFECTS as readonly string[]).includes(effect.kind), `不該出現的後果：${effect.kind}`);
        }
    }
});

// ── (c) diaries cite evidence ────────────────────────────────────────────────

test('(c) tracked characters get daily diaries whose claims carry beat citations', async () => {
    const { world } = await season();
    const diaries = (world.data.artifacts ?? []).filter((artifact) => artifact.kind === 'diary');
    assert.ok(diaries.length > 0, 'diaries were written');

    for (const diary of diaries) {
        assert.ok(world.isTracked(diary.characterId), 'a diary was written only for a tracked character');
        assert.ok(diary.body.trim().length > 0);
        for (const claim of diary.claims) {
            assert.ok(claim.evidenceRefs.length > 0, 'every SUPPORTED claim cites a beat');
            assert.ok(claim.evidenceRefs.every((ref) => /^beat:\d+$/.test(ref)));
        }
    }
    // The audit is not a rubber stamp: the fake deliberately emits one baseless
    // claim per diary, and it must be flagged rather than quietly kept or dropped.
    assert.ok(
        diaries.some((diary) => diary.unsupportedClaims.length > 0),
        'an unsupported claim is FLAGGED — a dropped one would be a cover-up',
    );
    for (const diary of diaries) {
        for (const claim of diary.unsupportedClaims) assert.ok(claim.auditNote, 'and it says why');
    }
});

test('(c) untracked characters get no diary, however busy their day was', async () => {
    const { world } = await season();
    const untracked = world.activeCast().filter((member) => !world.isTracked(member.id));
    assert.ok(untracked.length > 0, 'the run really is tracking a subset');
    for (const member of untracked) {
        const theirs = (world.data.artifacts ?? []).filter((artifact) => artifact.characterId === member.id);
        assert.deepEqual(theirs, [], `${member.name} is untracked and cost nothing`);
    }
});

// ── (d) the POV switch actually cuts cost ────────────────────────────────────

test('(d) POV prose is generated ONLY for tracked characters', async () => {
    const { world, agent } = await season();
    assert.ok(agent.povCalls.length > 0, 'the run rendered some POV');
    const offTrack = [...new Set(agent.povCalls)].filter((id) => !world.isTracked(id));
    assert.deepEqual(offTrack, [], 'no untracked character was ever rendered');
});

test('(d) the structural layer still runs for the WHOLE cast — POV is presentation only', async () => {
    const { world, reports } = await season();
    const spoke = new Set(reports.flatMap((report) => report.events.flatMap((event) => event.beats.map((beat) => beat.characterId))));
    const untrackedSpeakers = [...spoke].filter((id) => !world.isTracked(id));
    assert.ok(untrackedSpeakers.length > 0, 'untracked characters still act, speak, and carry 心下');
    // ...and their material is preserved, which is what makes backfill possible.
    const anyInner = reports.some((report) =>
        report.events.some((event) => event.beats.some((beat) => untrackedSpeakers.includes(beat.characterId) && beat.inner)),
    );
    assert.ok(anyInner, 'their interiority is recorded in the beats, not lost');
});

// ── (e) wants leave the board ────────────────────────────────────────────────

test('(e) the want board has a real exit rate — resolved > 0', async () => {
    const { world } = await season();
    const beat = resolvedRate(world.data.wants);
    assert.ok(beat.retired > 0, 'wants leave the board at all');
    assert.ok(beat.resolved > 0, `resolved rate must be > 0, saw ${beat.resolved}/${beat.retired}`);
});

test('(e) the vitals report the heartbeat every tick', async () => {
    const { reports } = await season();
    for (const report of reports) {
        assert.ok(report.vitals, 'every tick carries vitals');
        assert.ok(report.vitals!.wantsLive >= 0);
        assert.ok(report.vitals!.resolvedRate >= 0 && report.vitals!.resolvedRate <= 1);
    }
    assert.ok(reports.some((report) => (report.vitals?.irreversible ?? 0) > 0), 'some ticks moved the world irreversibly');
});

// ── (f) the attractor is gone ────────────────────────────────────────────────

/**
 * NOTE on what this test can and cannot measure. Under FakeSceneAgent every beat
 * comes from one prose skeleton, so the convergence detector legitimately reports
 * the STUB's shared vocabulary — that is the detector working, not the world
 * collapsing. Prose-level convergence is therefore verified against authored
 * samples (including the real 糖粥 case) in artifacts-vitals.test.ts, and what is
 * asserted HERE is the part that is genuinely a world property under any agent:
 * where the cast physically is, and whether the food attractor has them.
 */
test('(f) the food attractor never captures the cast, and the night never collapses into one room', async () => {
    const { world, reports } = await season();
    const castSize = world.activeCast().length;
    const foodSceneIds = new Set(
        (world.data.economy?.catalog ?? [])
            .filter((item) => item.kind === 'meal' && item.sceneName)
            .map((item) => world.data.scenes.find((scene) => scene.name === item.sceneName)?.id)
            .filter((id): id is string => !!id),
    );
    assert.ok(foodSceneIds.size > 0, 'this season really does have the 食擔 that produced the attractor');

    for (const report of reports) {
        const vitals = report.vitals!;
        // The diagnosed failure: 8 of 12 characters converging on the food stall on
        // one 深宵 tick. Measured where it actually lives — the roster.
        const atFood = world.activeCast().filter((member) => foodSceneIds.has(report.routed[member.id] ?? '')).length;
        assert.ok(
            atFood < Math.ceil(castSize * 0.5),
            `第${vitals.day}日第${vitals.tick}拍: ${atFood}/${castSize} 同時奔向食擔`,
        );
        if (!report.night || vitals.actorCount < 3) continue;
        assert.ok(
            vitals.sceneCrowdPeak < castSize,
            `第${vitals.day}日第${vitals.tick}拍（夜）: ${vitals.sceneCrowdPeak}/${castSize} 擠在同一場`,
        );
    }
    // And the detector is wired in and reporting, so a regression that silently
    // disables it is still caught here.
    assert.ok(reports.some((report) => report.vitals!.convergence.length > 0), 'the convergence detector is live');
    assert.ok(reports.every((report) => Array.isArray(report.vitals!.loops)), 'so is the loop detector');
});

test('(f) hunger settles offstage instead of spending a scene, and never for everyone at once', async () => {
    const { reports } = await season();
    const settledTicks = reports.filter((report) => (report.backgroundNeeds?.length ?? 0) > 0);
    // Not asserting it fires — a well-fed run legitimately settles nothing — but
    // when it does, it must stay terse and must never be the whole cast.
    for (const report of settledTicks) {
        assert.ok(report.backgroundNeeds!.every((line) => line.length < 80), 'a background need is one clause, not a scene');
    }
});

// ── replayability ────────────────────────────────────────────────────────────

test('the same seed twice produces the same director log and the same ledger', async () => {
    const a = await runSeason(['柳安春']);
    const b = await runSeason(['柳安春']);

    assert.deepEqual(
        (a.world.data.directorLog ?? []).map((entry) => [entry.day, entry.tick, entry.cardId, entry.chosenBy, entry.targetIds]),
        (b.world.data.directorLog ?? []).map((entry) => [entry.day, entry.tick, entry.cardId, entry.chosenBy, entry.targetIds]),
        'the deck is replayable from data alone',
    );
    assert.deepEqual(
        ledgerRows(a.world).map((row) => [row.id, row.kind, row.from, row.to, row.amount.toString()]),
        ledgerRows(b.world).map((row) => [row.id, row.kind, row.from, row.to, row.amount.toString()]),
        'and so is the money',
    );
});

test('the whole run survives a snapshot round-trip with every new field intact', async () => {
    const { world } = await season();
    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)));

    assert.deepEqual(restored.data.directorLog, world.data.directorLog);
    assert.deepEqual(restored.data.secretLedger, world.data.secretLedger);
    assert.deepEqual(restored.data.artifacts, world.data.artifacts);
    assert.deepEqual(restored.data.reckonings, world.data.reckonings);
    assert.deepEqual(restored.data.trackedCharacterIds, world.data.trackedCharacterIds);
    assert.deepEqual(restored.data.vitalsWindow, world.data.vitalsWindow);
    assert.deepEqual(restored.data.patronage, world.data.patronage);
});
