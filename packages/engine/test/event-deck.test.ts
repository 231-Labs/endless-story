/**
 * 事件牌組 + 導演選牌 — the external push layer, and the boundary of the
 * director's authority.
 *
 * The load-bearing claims under test are about what the director CANNOT do:
 * invent a card, aim at somebody the card never offered, postpone a deadline, or
 * touch a number. Everything they legitimately decide is written to the director
 * log, so the run replays from data alone. If any of these ever regress, an LLM
 * quietly regains write access to world state — which is the exact failure mode
 * the deck was designed to prevent.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadEventDeckFile, loadPresetFile, validateEventDeck } from '../src/preset.ts';
import { candidatesFor, eligibleCards, playCard, TARGET_SENTINEL, type EventCard, type EventDeck } from '../src/core/event-deck.ts';
import { auditSeasonEconomy } from '../src/core/season-economy.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.economy!.bills = [];
    return world;
}

const setBalance = (world: WorldState, id: string, yuan: bigint): void => {
    const state = world.data.economy!.state;
    state.injected = (BigInt(state.injected) + yuan * YUAN - BigInt(state.accounts[id]!.available)).toString();
    state.accounts[id]!.available = (yuan * YUAN).toString();
};

function deckOf(...cards: EventCard[]): EventDeck {
    return { id: 'test-deck', cards, maxCardsPerDay: 4, maxSeasonalPlays: 2 };
}

const perceptCard = (id: string, over: Partial<EventCard> = {}): EventCard => ({
    id,
    label: `卡·${id}`,
    trigger: {},
    targeting: { mode: 'none' },
    effects: [{ kind: 'percept', text: `${id} 的卡面文字` }],
    ...over,
});

// ── eligibility ──────────────────────────────────────────────────────────────

test('eligibility is a CLOCK question: onDays / everyDays / atParts all gate', () => {
    const world = seasonWorld();
    const deck = deckOf(
        perceptCard('on-day-3', { trigger: { onDays: [3] } }),
        perceptCard('every-2-from-1', { trigger: { everyDays: 2, anchorDay: 1 } }),
        perceptCard('dusk-only', { trigger: { atParts: [3] } }),
    );

    const ids = (day: number, partIndex: number) =>
        eligibleCards(world, deck, { day, partIndex }).map((row) => row.card.id).sort();

    assert.deepEqual(ids(1, 0), ['every-2-from-1']);
    assert.deepEqual(ids(2, 0), []);
    assert.deepEqual(ids(3, 0), ['every-2-from-1', 'on-day-3']);
    assert.deepEqual(ids(3, 3), ['dusk-only', 'every-2-from-1', 'on-day-3']);
});

test('a card whose condition fails is not offered — and a DEADLINE card ignores conditions entirely', () => {
    const world = seasonWorld();
    const troupeId = world.data.economy!.troupeAccountId;
    setBalance(world, troupeId, 500n); // flush: the runway condition below cannot hold
    world.data.economy!.state.accounts[troupeId]!.dailyFixedCost = (1n * YUAN).toString();

    const deck = deckOf(
        perceptCard('needs-broke', { trigger: { requires: [{ kind: 'account-runway-below', days: 3 }] } }),
        perceptCard('must-land', { mustLand: true, trigger: { onDays: [1], requires: [{ kind: 'account-runway-below', days: 3 }] } }),
    );
    const eligible = eligibleCards(world, deck, { day: 1, partIndex: 0 });

    assert.deepEqual(eligible.map((row) => row.card.id), ['must-land'], 'a condition gates a routine card, never a deadline');
    assert.equal(eligible[0].forced, true);
});

test('the per-day cap holds routine cards back but never a deadline', () => {
    const world = seasonWorld();
    const deck: EventDeck = { ...deckOf(perceptCard('a'), perceptCard('b'), perceptCard('z', { mustLand: true, trigger: { onDays: [1] } })), maxCardsPerDay: 1 };
    // Simulate one routine card already played today.
    world.data.directorLog = [
        { day: 1, tick: 0, clock: '清晨', cardId: 'a', chosenBy: 'director', targetIds: [], outcomeLines: [], irreversible: 0, offeredCardIds: [] },
    ];

    const ids = eligibleCards(world, deck, { day: 1, partIndex: 1 }).map((row) => row.card.id);
    assert.deepEqual(ids, ['z'], 'the cap silenced the routine card; the deadline still stands');
});

test('maxPlays and cooldownDays are honoured from the director log', () => {
    const world = seasonWorld();
    const deck = deckOf(perceptCard('once', { trigger: { maxPlays: 1 } }), perceptCard('cooled', { trigger: { cooldownDays: 3 } }));
    world.data.directorLog = [
        { day: 1, tick: 0, clock: '清晨', cardId: 'once', chosenBy: 'director', targetIds: [], outcomeLines: [], irreversible: 0, offeredCardIds: [] },
        { day: 1, tick: 0, clock: '清晨', cardId: 'cooled', chosenBy: 'director', targetIds: [], outcomeLines: [], irreversible: 0, offeredCardIds: [] },
    ];

    assert.deepEqual(eligibleCards(world, deck, { day: 2, partIndex: 0 }).map((r) => r.card.id), []);
    assert.deepEqual(eligibleCards(world, deck, { day: 4, partIndex: 0 }).map((r) => r.card.id), ['cooled'], 'the cooldown expired; the once-only card never returns');
});

// ── the director's box ───────────────────────────────────────────────────────

test('targeting: a director cannot aim a card at somebody it never offered', () => {
    const world = seasonWorld();
    const outsider = world.idByName('殷阿婆')!; // not a troupe player
    const card = perceptCard('troupe-only', {
        targeting: { mode: 'troupe' },
        effects: [{ kind: 'renown', delta: -0.2 }],
    });
    assert.ok(!candidatesFor(world, card).includes(outsider), 'the flower seller is not on the troupe list');
    const before = world.renownOf(outsider);

    playCard(world, deckOf(card), {
        card,
        targetIds: [outsider], // the director tries anyway
        chosenBy: 'director',
        day: 1,
        nowTick: 0,
        clock: '清晨',
    });

    assert.equal(world.renownOf(outsider), before, 'the illegal target was dropped, not honoured');
});

test('costume: the director may re-dress a card face, and only the face', () => {
    const world = seasonWorld();
    const card = perceptCard('dressable');
    const played = playCard(world, deckOf(card), {
        card,
        costume: '雨從晌午下到掌燈，前街的招子濕透了半邊。',
        rationale: '今日的壓力在天氣上',
        chosenBy: 'director',
        day: 1,
        nowTick: 0,
        clock: '清晨',
    });

    assert.equal(played.percepts[0].text, '雨從晌午下到掌燈，前街的招子濕透了半邊。');
    assert.ok(!played.percepts[0].text.includes('卡面文字'), 'the authored face was replaced');
    assert.equal(world.data.directorLog?.[0].costume, '雨從晌午下到掌燈，前街的招子濕透了半邊。');
    assert.equal(world.data.directorLog?.[0].rationale, '今日的壓力在天氣上');
});

test('every play is logged with what the director was offered — the audit trail', () => {
    const world = seasonWorld();
    const card = perceptCard('logged');
    playCard(world, deckOf(card), { card, chosenBy: 'director', day: 2, nowTick: 7, clock: '日午' });

    const entry = world.data.directorLog![0];
    assert.equal(entry.cardId, 'logged');
    assert.equal(entry.chosenBy, 'director');
    assert.equal(entry.day, 2);
    assert.equal(entry.tick, 7);
    assert.ok(Array.isArray(entry.offeredCardIds), 'the offered set is recorded so a replay can prove the choice was legal');
});

// ── deterministic consequences ───────────────────────────────────────────────

test('a bill effect aimed with @target follows the person the card was aimed at', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const card: EventCard = {
        id: 'fine',
        label: '巡捕的罰單',
        trigger: {},
        targeting: { mode: 'director-pick', pickCount: 1, from: 'all' },
        effects: [
            { kind: 'bill', id: 'patrol-fine', label: '巡捕的罰單', amountYuan: 2, dueInDays: 2, fromAccountId: TARGET_SENTINEL, creditor: '巡捕房' },
        ],
    };

    playCard(world, deckOf(card), { card, targetIds: [liu], chosenBy: 'director', day: 1, nowTick: 0, clock: '深宵' });

    const bill = world.data.economy!.bills!.find((row) => row.id.startsWith('patrol-fine'));
    assert.ok(bill, 'the fine exists');
    assert.equal(bill!.fromAccountId, liu, 'and it is charged to the person the card was aimed at');
    assert.equal(bill!.dueDay, 3, 'with a real due day');
    assertNoDrift(world);
});

test('weather is a real box-office multiplier, not an adjective', () => {
    const world = seasonWorld();
    const card: EventCard = {
        id: 'rain',
        label: '天氣轉變',
        trigger: {},
        targeting: { mode: 'none' },
        effects: [{ kind: 'weather', label: '連日陰雨', housePct: 80 }],
    };
    playCard(world, deckOf(card), { card, chosenBy: 'director', day: 1, nowTick: 0, clock: '清晨' });
    assert.deepEqual(world.data.weather, { label: '連日陰雨', housePct: 80, sinceDay: 1 });
});

test('the same card played on the same world twice produces the same facts (replayable)', () => {
    const build = (): WorldState => {
        const world = seasonWorld();
        setBalance(world, world.data.economy!.troupeAccountId, 60n);
        world.data.economy!.state.accounts[world.data.economy!.troupeAccountId]!.dailyFixedCost = (5n * YUAN).toString();
        return world;
    };
    const card: EventCard = {
        id: 'dividend',
        label: '散戲分紅',
        trigger: {},
        targeting: { mode: 'troupe' },
        effects: [{ kind: 'dividend', label: '散戲分紅', surplusShareBps: 5000, reserveDays: 2 }],
    };

    const a = build();
    const b = build();
    const playA = playCard(a, deckOf(card), { card, chosenBy: 'director', day: 2, nowTick: 6, clock: '深宵' });
    const playB = playCard(b, deckOf(card), { card, chosenBy: 'director', day: 2, nowTick: 6, clock: '深宵' });

    assert.deepEqual(playA.publicLines, playB.publicLines, 'the same card on the same world says the same thing');
    assert.deepEqual(playA.income?.paid, playB.income?.paid, 'and pays exactly the same people the same amounts');
    assert.equal(playA.irreversible, playB.irreversible);
    assertNoDrift(a);
    assertNoDrift(b);
});

function assertNoDrift(world: WorldState): void {
    assert.deepEqual(auditSeasonEconomy(world), [], 'the card play conserves money');
}

// ── the shipped deck ─────────────────────────────────────────────────────────

test('the shipped spring-snow deck is structurally valid', () => {
    const deck = loadEventDeckFile('spring-snow');
    assert.equal(deck.id, 'spring-snow');
    assert.ok(deck.cards.length >= 8, 'the deck is worth calling a deck');
    // 月半結帳 is the deadline the diagnosis said must arrive.
    const reckoning = deck.cards.find((card) => card.id === 'mid-month-reckoning');
    assert.ok(reckoning?.mustLand, '月半結帳 is a deadline card');
    assert.ok(reckoning!.effects.some((effect) => effect.kind === 'reckoning'), 'and it actually reckons');
    // 人物進出 is the biggest card, and it is rate-limited as such.
    const seasonal = deck.cards.filter((card) => card.tier === 'seasonal');
    assert.ok(seasonal.length >= 2, '人物進出 lives in the deck');
    assert.ok(seasonal.every((card) => card.trigger.maxPlays !== undefined), 'and every one of them is capped');
});

test('deck validation refuses the mistakes that would let a director escape the box', () => {
    assert.throws(
        () => validateEventDeck({ id: 'bad', cards: [perceptCard('dup'), perceptCard('dup')] }),
        /card id 重複/,
        'duplicate ids would make the director log ambiguous',
    );
    assert.throws(
        () =>
            validateEventDeck({
                id: 'bad',
                cards: [{ ...perceptCard('ghost'), effects: [{ kind: 'cast-enter', newcomerId: 'nobody' }] }],
            }),
        /未宣告的人選/,
        'a card cannot admit a character the deck never declared',
    );
    assert.throws(
        () =>
            validateEventDeck({
                id: 'bad',
                cards: [{ ...perceptCard('ghost'), effects: [{ kind: 'leak-secret', secretId: 'nope' }] }],
            }),
        /未宣告的秘密/,
    );
    assert.throws(
        () => validateEventDeck({ id: 'bad', cards: [{ ...perceptCard('open'), mustLand: true, trigger: {} }] }),
        /沒有到日之依據/,
        'a deadline with no due day is not a deadline',
    );
    assert.throws(
        () => validateEventDeck({ id: 'bad', cards: [perceptCard('t', { trigger: { atParts: [9] } })] }),
        /非法時辰/,
    );
});
