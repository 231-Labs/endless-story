/**
 * 自撰的牌 + 世情動作 — the two doors through the deck's ceiling, and the fences
 * around each of them.
 *
 * The deck's whole point is that nothing can happen which its author did not
 * write. That is also its limit: a season can only be as surprising as the
 * person who wrote the cards, and a cast can only ever be pushed, never push.
 * These two channels open that up — the director may assemble a card the deck
 * never contained, and a character may DO one of the drastic, world-turning
 * things (報官, 當眾翻臉, 撂挑子, 逐出班子) instead of only wanting to.
 *
 * Both are dangerous in exactly the same way, so both are fenced in exactly the
 * same way, and that is what these tests pin:
 *
 *   · the consequences are assembled from the SAME finite effect primitives —
 *     neither channel can express anything an authored card could not;
 *   · magnitudes and rates are the ENGINE's, never the model's;
 *   · what somebody may reach for is computed by the engine and offered; an id
 *     that was never offered is refused, with a reason, in the log;
 *   · every play lands in the same `directorLog`, carrying whatever a replay
 *     would otherwise be missing (the self-authored card itself, or the actor).
 *
 * If a test here starts passing while asserting less, an LLM has quietly gained
 * write access to world state again.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadEventDeckFile, loadPresetFile, validateEventDeck } from '../src/preset.ts';
import {
    ACTOR_SENTINEL,
    availableActsFor,
    canPropose,
    playAct,
    playCard,
    PROPOSABLE_EFFECTS,
    PROPOSAL_LIMITS,
    validateProposal,
    type CardProposal,
    type CharacterAct,
    type EventCard,
    type EventDeck,
} from '../src/core/event-deck.ts';
import { bondOf } from '../src/core/bond-graph.ts';
import { HEARSAY_MARK } from '../src/core/standing.ts';
import { WorldState } from '../src/world-state.ts';

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.economy!.bills = [];
    return world;
}

const deckOf = (over: Partial<EventDeck> = {}): EventDeck => ({
    id: 'test-deck',
    cards: [{ id: 'filler', label: '墊底', trigger: {}, targeting: { mode: 'none' }, effects: [{ kind: 'percept', text: '無事' }] }],
    ...over,
});

const play = (world: WorldState, deck: EventDeck, card: EventCard, over: Record<string, unknown> = {}) =>
    playCard(world, deck, { card, chosenBy: 'director-proposed', day: 3, nowTick: 12, clock: '黃昏', ...over });

// ══ 1. 自撰的牌 ═══════════════════════════════════════════════════════════════

test('the closed categories are closed BY CONSTRUCTION, not by a runtime check', () => {
    // Money, payroll, the roster and 見報 are absent from the allow-list itself.
    // A director who could mint income could dissolve every scarcity the season
    // is built on, so this is the assertion that actually protects the economy.
    for (const forbidden of ['wage-packet', 'dividend', 'patronage', 'reckoning', 'reckoning-notice', 'cast-enter', 'cast-exit', 'publish-secret', 'standing']) {
        assert.ok(!(PROPOSABLE_EFFECTS as readonly string[]).includes(forbidden), `${forbidden} must never be proposable`);
    }
});

test('a proposal within bounds becomes a real, playable one-shot card', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const draft: CardProposal = {
        label: '巷口的野貓叫了一夜',
        note: '睡不好的人各有各的緣故',
        targetIds: [liu],
        effects: [
            { kind: 'percept', text: '後巷的野貓叫了整夜，前街幾家的燈都比平日晚熄。' },
            { kind: 'want', layer: '事務', desc: '把那隻貓弄走' },
        ],
    };

    const verdict = validateProposal(world, draft, { day: 3, seq: 1 });
    assert.equal(verdict.ok, true, verdict.problems.join('；'));
    assert.deepEqual(verdict.targetIds, [liu]);
    assert.equal(verdict.card!.trigger.maxPlays, 1, '自撰的牌只打一次');
    assert.deepEqual(verdict.card!.trigger.onDays, [3], 'and only on the day it was proposed');

    const result = play(world, deckOf(), verdict.card!);
    assert.equal(result.played, true);
    assert.equal(result.percepts.length, 1);
    assert.ok(world.data.wants.some((want) => want.characterId === liu && want.desc === '把那隻貓弄走'));
});

test('a proposal is refused — with reasons — for an effect kind it may not use', () => {
    const world = seasonWorld();
    const verdict = validateProposal(
        world,
        {
            label: '天上掉下一筆錢',
            effects: [
                { kind: 'percept', text: '街上議論紛紛。' },
                { kind: 'wage-packet', label: '額外的工錢', perHeadYuan: 50 },
            ],
        },
        { day: 3, seq: 1 },
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.card, undefined, 'nothing playable comes back');
    assert.ok(verdict.problems.some((problem) => problem.includes('wage-packet')));
});

test('magnitudes are CLAMPED, not trusted — the caps are the engine\'s', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const verdict = validateProposal(
        world,
        {
            label: '一夜成名',
            targetIds: [liu],
            effects: [
                { kind: 'renown', delta: 5 },
                { kind: 'self-regard', delta: -99 },
                { kind: 'bill', id: 'huge', label: '天價的帳', amountYuan: 5000, dueInDays: 900, fromAccountId: '@target' },
                { kind: 'weather', label: '天崩', housePct: 900 },
            ],
        },
        { day: 3, seq: 1 },
    );
    assert.equal(verdict.ok, true, verdict.problems.join('；'));
    const effects = verdict.card!.effects;
    assert.equal((effects[0] as { delta: number }).delta, PROPOSAL_LIMITS.renownDelta);
    assert.equal((effects[1] as { delta: number }).delta, -PROPOSAL_LIMITS.selfRegardDelta);
    assert.equal((effects[2] as { amountYuan: number }).amountYuan, PROPOSAL_LIMITS.billYuan);
    assert.equal((effects[2] as { dueInDays: number }).dueInDays, PROPOSAL_LIMITS.billDueDays);
    assert.equal((effects[3] as { housePct: number }).housePct, PROPOSAL_LIMITS.weatherHousePct.max);
});

test('a proposal may only aim at people who exist, and a bill only at its own target', () => {
    const world = seasonWorld();
    const ghost = validateProposal(
        world,
        { label: '找一個不存在的人', targetIds: ['沒有這個人'], effects: [{ kind: 'percept', text: '無事發生。' }] },
        { day: 3, seq: 1 },
    );
    assert.equal(ghost.ok, false);
    assert.ok(ghost.problems.some((problem) => problem.includes('不在班中')));

    // A bill aimed at the troupe treasury would be a director quietly spending
    // the company's money, so the sentinel is the ONLY payer a proposal may name.
    const raid = validateProposal(
        world,
        {
            label: '班庫掏錢',
            targetIds: [world.idByName('柳安春')!],
            effects: [{ kind: 'bill', id: 'raid', label: '不明來歷的帳', amountYuan: 3, dueInDays: 3, fromAccountId: '春雪社班庫' }],
        },
        { day: 3, seq: 1 },
    );
    assert.equal(raid.ok, false);
    assert.ok(raid.problems.some((problem) => problem.includes('@target')));
});

test('names resolve to ids, so a director naming 柳安春 aims at 柳安春', () => {
    const world = seasonWorld();
    const verdict = validateProposal(
        world,
        { label: '點名', targetIds: ['柳安春'], effects: [{ kind: 'percept', text: '有人被點了名。' }] },
        { day: 3, seq: 1 },
    );
    assert.deepEqual(verdict.targetIds, [world.idByName('柳安春')]);
});

test('the quota is per-day AND per-season, and it counts the LOG — not a counter', () => {
    const world = seasonWorld();
    const deck = deckOf();
    const draft = (n: number): CardProposal => ({ label: `自撰第${n}張`, effects: [{ kind: 'percept', text: `第${n}件事` }] });

    assert.equal(canPropose(world, 3), true);
    const first = validateProposal(world, draft(1), { day: 3, seq: 1 });
    play(world, deck, first.card!);

    assert.equal(canPropose(world, 3), false, '一日一張');
    assert.ok(validateProposal(world, draft(2), { day: 3, seq: 2 }).problems.some((p) => p.includes('今日')));

    // A new day reopens the day quota but not the season one.
    assert.equal(canPropose(world, 4), true);
    play(world, deck, validateProposal(world, draft(2), { day: 4, seq: 2 }).card!, { day: 4 });
    play(world, deck, validateProposal(world, draft(3), { day: 5, seq: 3 }).card!, { day: 5 });

    assert.equal(canPropose(world, 6), false, `一卷至多 ${PROPOSAL_LIMITS.seasonCap} 張`);
    const overflow = validateProposal(world, draft(4), { day: 6, seq: 4 });
    assert.equal(overflow.ok, false);
    assert.ok(overflow.problems.some((problem) => problem.includes(String(PROPOSAL_LIMITS.seasonCap))));
});

test('the log carries the self-authored card VERBATIM, because no deck file has it', () => {
    const world = seasonWorld();
    const verdict = validateProposal(
        world,
        { label: '一件牌組沒寫過的事', effects: [{ kind: 'percept', text: '前街的老槐樹倒了。' }] },
        { day: 3, seq: 1 },
    );
    play(world, deckOf(), verdict.card!, { rationale: '牌面上沒有能推這一步的牌' });

    const entry = world.data.directorLog!.at(-1)!;
    assert.equal(entry.chosenBy, 'director-proposed');
    assert.deepEqual(entry.proposedCard, verdict.card, 'replay can reconstruct it from the log alone');
    assert.equal(entry.rationale, '牌面上沒有能推這一步的牌');

    // A survived snapshot round-trip is what "replayable" actually means.
    const restored = new WorldState(JSON.parse(JSON.stringify(world.data)));
    assert.deepEqual(restored.data.directorLog!.at(-1)!.proposedCard, verdict.card);
});

// ══ 2. 世情動作 ═══════════════════════════════════════════════════════════════

const REPORT: CharacterAct = {
    id: 'report',
    label: '報官',
    needsTarget: true,
    minDay: 2,
    maxPlaysPerCharacter: 1,
    cooldownDays: 5,
    effects: [
        { kind: 'percept', text: '巡捕房來了人。' },
        { kind: 'bill', id: 'fine', label: '罰銀', amountYuan: 3, dueInDays: 5, fromAccountId: '@target' },
        { kind: 'renown', delta: -0.03, on: 'actor' },
        { kind: 'standing', tone: '把我告到巡捕房去了', from: 'targets', toward: 'actor', disposition: 'cold', grievance: 'betrayed' },
        { kind: 'standing', tone: '他吃了官司', from: 'witnesses', toward: 'targets', disposition: 'cold', grievance: 'slighted' },
    ],
};

const WALK_OFF: CharacterAct = {
    id: 'walk-off',
    label: '撂挑子',
    invokableBy: { roles: ['花旦', '小生'] },
    effects: [
        { kind: 'percept', text: '戲牌掛了出去，人卻不見了。' },
        { kind: 'bill', id: 'refund', label: '退票錢', amountYuan: 4, dueInDays: 3, fromAccountId: ACTOR_SENTINEL },
        { kind: 'renown', delta: -0.08, on: 'actor' },
    ],
};

const actDeck = (...acts: CharacterAct[]): EventDeck => deckOf({ acts });

test('亮牌 is the whole permission: role, day, target-in-the-room and quota all gate', () => {
    const world = seasonWorld();
    const deck = actDeck(REPORT, WALK_OFF);
    const liu = world.idByName('柳安春')!;   // 小生
    const zhao = world.idByName('趙阿福')!;  // 小販
    const su = world.idByName('蘇映雪')!;

    const offer = (characterId: string, day: number, coPresentIds: string[]) =>
        availableActsFor(world, deck, { characterId, day, coPresentIds }).map((row) => row.actId);

    assert.deepEqual(offer(liu, 1, [liu, su]), ['walk-off'], '報官的 minDay 是 2 —— 第一日還走不到那一步');
    assert.deepEqual(offer(liu, 3, [liu, su]), ['report', 'walk-off']);
    assert.deepEqual(offer(zhao, 3, [zhao, su]), ['report'], '一個小販撂不了戲班的挑子');
    assert.deepEqual(offer(liu, 3, [liu]), ['walk-off'], '報官要有對象在跟前，撂挑子不必');

    const candidates = availableActsFor(world, deck, { characterId: liu, day: 3, coPresentIds: [liu, su, zhao] })
        .find((row) => row.actId === 'report')!.candidates.map((row) => row.name);
    assert.deepEqual(candidates.sort(), ['蘇映雪', '趙阿福'].sort(), 'and the candidates are exactly the room');
});

test('an act nobody advertised cannot be played, and the refusal says why', () => {
    const world = seasonWorld();
    const deck = actDeck(REPORT);
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const jin = world.idByName('金鳳')!;
    const base = { coPresentIds: [liu, su], day: 3, nowTick: 12, clock: '黃昏' };

    assert.match(playAct(world, deck, { actId: '放火', actorId: liu, targetId: su, ...base }).refused!, /牌組裡沒有/);
    assert.match(playAct(world, deck, { actId: 'report', actorId: liu, targetId: su, ...base, day: 1 }).refused!, /做不了/);
    assert.match(playAct(world, deck, { actId: 'report', actorId: liu, targetId: jin, ...base }).refused!, /不在跟前/);
    assert.match(playAct(world, deck, { actId: 'report', actorId: liu, ...base }).refused!, /不在跟前/);
    assert.deepEqual(world.data.directorLog ?? [], [], 'a refusal changes nothing at all');
});

test('報官 settles through the SAME parts every other consequence uses', () => {
    const world = seasonWorld();
    const deck = actDeck(REPORT);
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const renownBefore = world.renownOf(liu);

    const done = playAct(world, deck, { actId: 'report', actorId: liu, targetId: su, coPresentIds: [liu, su], day: 3, nowTick: 12, clock: '黃昏' });
    assert.equal(done.played, true);

    // 錢: the fine follows the person the act was aimed at, via the same bills array.
    const fine = world.data.economy!.bills!.find((bill) => bill.id.startsWith('fine'));
    assert.equal(fine?.fromAccountId, su);
    assert.equal(fine?.dueDay, 8);

    // 名頭: `on: 'actor'` is the only way an effect reaches the person who acted.
    assert.ok(world.renownOf(liu) < renownBefore, '告官的人這條街也未必待見');

    // 人心: edges + bonds, and nothing else. No new ledger appeared.
    assert.equal(world.data.edges[su][liu].disposition, 'cold');
    assert.ok(!world.data.edges[su][liu].tone.startsWith(HEARSAY_MARK), '被告的人是第一手，不是聽說');
    assert.equal(world.data.edges[liu]?.[su]?.tone.startsWith(HEARSAY_MARK) ?? false, false, '動手的人不會「聽說」自己做的事');
    const witness = world.idByName('金鳳')!;
    assert.ok(world.data.edges[witness][su].tone.startsWith(HEARSAY_MARK), '沒在場的人是聽說的，會淡');
    assert.equal((world.data as unknown as Record<string, unknown>).reputation, undefined);

    // 交情: the numeric bond was actually cut, not merely re-toned.
    assert.ok(bondOf(world.bondGraph(), su, liu) < 0.5);

    const entry = world.data.directorLog!.at(-1)!;
    assert.equal(entry.chosenBy, 'character');
    assert.equal(entry.actorId, liu);
    assert.deepEqual(entry.targetIds, [su]);
});

test('a street turning cold is ONE irreversible fact, not one per pair of eyes', () => {
    // Otherwise a single act out-weighs a whole reckoning in the vitals purely
    // because the cast is large, and 不可逆事件數 stops measuring anything.
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const done = playAct(world, actDeck(REPORT), {
        actId: 'report', actorId: liu, targetId: su, coPresentIds: [liu, su], day: 3, nowTick: 12, clock: '黃昏',
    });
    // percept(0) + bill(1) + renown(0) + two standings(1 each) = 3, regardless of
    // how many people are on the board.
    assert.equal(done.irreversible, 3);
    assert.ok(world.activeCast().length > 5, 'and the cast really is big enough for this to matter');
});

test('@actor puts the cost on the person who did it', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    playAct(world, actDeck(WALK_OFF), { actId: 'walk-off', actorId: liu, coPresentIds: [liu], day: 3, nowTick: 12, clock: '黃昏' });
    const refund = world.data.economy!.bills!.find((bill) => bill.id.startsWith('refund'));
    assert.equal(refund?.fromAccountId, liu, '撂挑子的退票錢從撂挑子的人身上出');
});

test('the caps bind: once per person, then a cooldown, then the day\'s ceiling', () => {
    const world = seasonWorld();
    const deck = actDeck(REPORT, WALK_OFF);
    const liu = world.idByName('柳安春')!;
    const jiang = world.idByName('江聞鶴')!;
    const su = world.idByName('蘇映雪')!;
    const room = [liu, jiang, su];
    const has = (characterId: string, day: number, actId: string) =>
        availableActsFor(world, deck, { characterId, day, coPresentIds: room }).some((row) => row.actId === actId);

    playAct(world, deck, { actId: 'report', actorId: liu, targetId: su, coPresentIds: room, day: 3, nowTick: 12, clock: '黃昏' });
    assert.equal(has(liu, 3, 'report'), false, 'maxPlaysPerCharacter 1');
    assert.equal(has(liu, 30, 'report'), false, '一輩子一次就是一次');
    assert.equal(has(jiang, 3, 'report'), true, 'but it was HIS quota, not the street\'s');

    // 一日至多兩件 —— a pacing bound on the channel, not on any one person.
    playAct(world, deck, { actId: 'walk-off', actorId: liu, coPresentIds: room, day: 3, nowTick: 13, clock: '入夜' });
    assert.deepEqual(availableActsFor(world, deck, { characterId: jiang, day: 3, coPresentIds: room }), [], '這條街一日消化不了第三件');
    assert.equal(has(jiang, 4, 'report'), true, '隔日照舊');
});

test('deck validation refuses acts and cards that reach past their own channel', () => {
    // cast-enter from an act = a character conjuring a person into the world.
    assert.throws(
        () => validateEventDeck(deckOf({ acts: [{ id: 'summon', label: '招人', effects: [{ kind: 'cast-enter', newcomerId: 'nobody' }] }] })),
        /cast-enter/,
    );
    // A card has no actor, so `on: 'actor'` / `from: 'actor'` cannot resolve.
    assert.throws(
        () => validateEventDeck({
            id: 'bad',
            cards: [{ id: 'c', label: '卡', trigger: {}, targeting: { mode: 'all' }, effects: [{ kind: 'renown', delta: 0.1, on: 'actor' }] }],
        }),
        /沒有行為人/,
    );
    assert.throws(
        () => validateEventDeck({
            id: 'bad2',
            cards: [{ id: 'c', label: '卡', trigger: {}, targeting: { mode: 'all' }, effects: [{ kind: 'standing', tone: '冷', from: 'actor', toward: 'targets' }] }],
        }),
        /沒有行為人/,
    );
    // An act aimed at nobody, carrying an effect that only targets can feel.
    assert.throws(
        () => validateEventDeck(deckOf({
            acts: [{ id: 'nowhere', label: '對空氣發火', needsTarget: false, effects: [{ kind: 'cast-exit', reason: '走了' }] }],
        })),
        /只對對象生效/,
    );
    // ids are shared with cards because the log is shared.
    assert.throws(() => validateEventDeck(deckOf({ acts: [{ id: 'filler', label: '撞名', effects: [{ kind: 'percept', text: '無' }] }] })), /撞了/);
});

test('the shipped decks are valid, and their acts stay inside the channel', () => {
    for (const deckId of ['spring-snow', 'spring-snow-premiere']) {
        const deck = loadDeck(deckId);
        validateEventDeck(deck);
        assert.ok((deck.acts ?? []).length > 0, `${deckId} 有世情動作可做`);
        for (const act of deck.acts ?? []) {
            assert.ok(act.note?.trim(), `${act.id} 得告訴角色做了會怎樣`);
            // Every shipped act is bounded in at least one dimension — an act with
            // no ceiling at all would let one channel run a whole season.
            assert.ok(
                act.maxPlays !== undefined || act.maxPlaysPerCharacter !== undefined || act.cooldownDays !== undefined,
                `${act.id} 沒有任何上限`,
            );
        }
    }
});

/** Deliberately the real files, through the real loader: an authored deck that no
 *  longer validates is a bug the moment it is written, not on the next run. */
function loadDeck(deckId: string): EventDeck {
    return loadEventDeckFile(deckId, new URL('../../cli/scripts/decks', import.meta.url).pathname);
}
