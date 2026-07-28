/**
 * 秘密與洩漏 · 人物進出 — the two mechanisms that turn背景 into 火藥.
 *
 * 秘密: the diagnosis was 「三把上膛的槍三天未發」. A secret living only in
 * `CastMember.secret` is prose colour with no trigger, so it can never go off.
 * These tests pin that a secret now has a holder, coveters and finite leak
 * conditions, and — the load-bearing part — that a 記者 who knows one is handed a
 * DATED dilemma that must leave the board either way (print ⇒ resolved, sit on it
 * ⇒ foreclosed).
 *
 * 人物進出: a departure that drops its orphan threads rots the world quietly —
 * dangling keys, bills charged to a purse nobody holds, secrets with no holder,
 * 相許 with one side missing. Every one of those is asserted here.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import {
    ensurePressDilemmas,
    evaluateSecretLeaks,
    isPressRole,
    learnSecret,
    publishSecret,
    PRESS_DEADLINE_DAYS,
    seedSecretLedger,
} from '../src/core/secret-ledger.ts';
import { admitNewcomer, dismissFromCast } from '../src/core/roster-change.ts';
import { completionHolds, runWantLifecycle } from '../src/core/want-lifecycle.ts';
import { auditSeasonEconomy, yuanToSubunits } from '../src/core/season-economy.ts';
import { newWant } from '../src/core/want-core.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.economy!.bills = [];
    world.data.wants = [];
    return world;
}

const setBalance = (world: WorldState, id: string, yuan: bigint): void => {
    const state = world.data.economy!.state;
    state.injected = (BigInt(state.injected) + yuan * YUAN - BigInt(state.accounts[id]!.available)).toString();
    state.accounts[id]!.available = (yuan * YUAN).toString();
};

// ── 秘密 ─────────────────────────────────────────────────────────────────────

test('seeding is idempotent, and a secret nobody in this cast holds is not a secret', () => {
    const world = seasonWorld();
    const seeds = [
        { id: 's1', matter: '衣箱底下那樁事', holderNames: ['唐桂蘭'], coveterNames: ['方競西'] },
        { id: 's-ghost', matter: '無人守著的事', holderNames: ['不在卷中的人'] },
    ];

    assert.equal(seedSecretLedger(world, seeds), 1, 'the holderless seed is refused');
    assert.equal(seedSecretLedger(world, seeds), 0, 're-seeding adds nothing');
    assert.equal(world.data.secretLedger!.length, 1);
    assert.deepEqual(world.data.secretLedger![0].knownByIds, [world.idByName('唐桂蘭')!]);
});

test('a leak condition fires deterministically, reaches the coveters, and is irreversible', () => {
    const world = seasonWorld();
    seedSecretLedger(world, [
        { id: 's1', matter: '那本血帳', holderNames: ['方競西'], coveterNames: ['沈雪笙'], leakWhen: [{ kind: 'day-atleast', day: 3 }] },
    ]);
    const shen = world.idByName('沈雪笙')!;

    assert.deepEqual(evaluateSecretLeaks(world, { day: 2, nowTick: 6 }).leaked, [], 'the fuse is not lit yet');

    const report = evaluateSecretLeaks(world, { day: 3, nowTick: 12 });

    assert.equal(report.leaked.length, 1);
    assert.equal(report.leaked[0].reachedIds[0], shen, 'the coveter now knows');
    assert.ok(world.data.secretLedger![0].knownByIds.includes(shen));
    assert.equal(world.data.secretLedger![0].leakedDay, 3);
    // Irreversible: a second pass finds nothing left to leak.
    assert.deepEqual(evaluateSecretLeaks(world, { day: 4, nowTick: 18 }).leaked, []);
});

test('a coveter standing in the holder\'s scene is itself a leak condition', () => {
    const world = seasonWorld();
    seedSecretLedger(world, [
        { id: 's1', matter: '殷阿婆記著的舊事', holderNames: ['殷阿婆'], coveterNames: ['方競西'], leakWhen: [{ kind: 'coveter-copresent' }] },
    ]);
    const yin = world.idByName('殷阿婆')!;
    const fang = world.idByName('方競西')!;
    world.data.roster[fang] = world.data.scenes.find((scene) => scene.name === '報館茶室')!.id;
    world.data.roster[yin] = world.data.scenes.find((scene) => scene.name === '戲園前街')!.id;

    assert.deepEqual(evaluateSecretLeaks(world, { day: 1, nowTick: 0 }).leaked, [], 'apart, it holds');

    world.data.roster[fang] = world.data.roster[yin]; // he got close enough
    assert.equal(evaluateSecretLeaks(world, { day: 1, nowTick: 1 }).leaked.length, 1);
});

test('記者知道任何秘密 ⇒ 一樁帶死線的「發不發」, planted exactly once', () => {
    const world = seasonWorld();
    const fang = world.idByName('方競西')!;
    assert.ok(isPressRole(world.castById(fang)!.role), '方競西 is press');
    seedSecretLedger(world, [{ id: 's1', matter: '衣箱底下那樁事', holderNames: ['唐桂蘭'] }]);
    learnSecret(world, 's1', fang);

    const first = ensurePressDilemmas(world, { day: 2, nowTick: 6 });
    const second = ensurePressDilemmas(world, { day: 2, nowTick: 7 });

    assert.equal(first.length, 1);
    assert.equal(second.length, 0, 'the dilemma is not re-planted every pass');
    assert.equal(first[0].characterId, fang);
    assert.equal(first[0].dueDay, 2 + PRESS_DEADLINE_DAYS, 'it carries a real deadline');
    assert.deepEqual(first[0].completion, { kind: 'secret-published', secretId: 's1' }, 'and a real completion test');
});

test('見報 resolves the dilemma through its completion test, and ruins the subject in STATE', () => {
    const world = seasonWorld();
    const fang = world.idByName('方競西')!;
    const tang = world.idByName('唐桂蘭')!;
    seedSecretLedger(world, [{ id: 's1', matter: '衣箱底下那樁事', holderNames: ['唐桂蘭'], aboutName: '唐桂蘭' }]);
    learnSecret(world, 's1', fang);
    const [dilemma] = ensurePressDilemmas(world, { day: 2, nowTick: 6 });
    const renownBefore = world.renownOf(tang);

    assert.equal(completionHolds(world, dilemma), false);
    const published = publishSecret(world, { secretId: 's1', byId: fang, day: 3, nowTick: 12 });

    assert.ok(published.ok);
    assert.match(published.line!, /報上登了/);
    assert.ok(world.renownOf(tang) < renownBefore, 'the subject really lost standing');
    assert.ok(world.renownOf(fang) > 0.5 - 1, 'the scoop lifted the publisher');
    assert.equal(world.data.secretLedger![0].knownByIds.length, world.data.cast.length, '見報即眾所周知');
    // The want board and the secret ledger can never disagree about WHY it closed.
    assert.equal(completionHolds(world, dilemma), true);
    assert.equal(runWantLifecycle(world, 3, 13).resolved[0]?.id, dilemma.id);
    assert.equal(dilemma.resolutionCause, 'resolved');

    assert.equal(publishSecret(world, { secretId: 's1', byId: fang, day: 4, nowTick: 18 }).ok, false, '見報 is irreversible');
});

test('sitting on a scoop past the deadline forecloses it — either way it leaves the board', () => {
    const world = seasonWorld();
    const fang = world.idByName('方競西')!;
    seedSecretLedger(world, [{ id: 's1', matter: '那本血帳', holderNames: ['方競西'] }]);
    const [dilemma] = ensurePressDilemmas(world, { day: 1, nowTick: 0 });

    const report = runWantLifecycle(world, 1 + PRESS_DEADLINE_DAYS + 1, 40);

    assert.deepEqual(report.foreclosed.map((want) => want.id), [dilemma.id]);
    assert.equal(dilemma.resolutionCause, 'foreclosed');
});

// ── 人物進出 ─────────────────────────────────────────────────────────────────

test('離班 forces EVERY orphan thread to an answer: key, purse, debt, secret, 相許, 心事', () => {
    const world = seasonWorld();
    const data = world.data.economy!;
    const liu = world.idByName('柳安春')!;   // the departing lead
    const shen = world.idByName('沈雪笙')!;  // 屋主 of the room she rents
    const su = world.idByName('蘇映雪')!;    // her 相許 partner
    const fang = world.idByName('方競西')!;  // coveter of her secret

    // A key she carries to a room somebody else owns.
    const room = world.data.scenes.find((scene) => scene.name === '後台小廂房')!;
    (world.data.propertyOwners ??= {})[room.id] = [shen];
    (world.data.objects ??= []).push({
        id: 'key-liu', label: '後台小廂房的門鑰', aliases: ['門鑰'], sceneId: world.data.roster[liu],
        portable: true, visibility: 'visible', carriedBy: liu, version: 1, knownBy: [], keyFor: room.id,
    });
    // A tab she owes and money in her purse.
    data.bills = [{ id: 'tab', label: '前街食肆賒帳', amountSubunits: yuanToSubunits(world, 4).toString(), paidSubunits: '0', dueDay: 9, fromAccountId: liu, creditor: '趙阿福' }];
    setBalance(world, liu, 7n);
    const troupeBefore = BigInt(data.state.accounts[data.troupeAccountId]!.available);
    // A secret only she holds, and somebody who wants it.
    seedSecretLedger(world, [{ id: 's1', matter: '她台上那張臉底下的事', holderNames: ['柳安春'], coveterNames: ['方競西'] }]);
    // A 相許, and a live 心事 of her own.
    world.addEstablished(liu, su);
    world.data.wants.push(newWant({ id: 'w-liu', characterId: liu, layer: '志向', desc: '要在台上站住', weight: 0.8, sat: 0.2, resistance: 5, kind: 'narrative', source: 'genesis', bornTick: 0 }));

    const out = dismissFromCast(world, { characterId: liu, reason: '被別班挖了過去', day: 3, nowTick: 15 });

    assert.ok(out.ok);
    const kinds = out.settlements.map((settlement) => settlement.kind);
    assert.ok(kinds.includes('key-returned'), '持鑰 went back to the deed-holder');
    assert.equal(world.objectById('key-liu')!.carriedBy, shen);
    assert.ok(kinds.includes('debt-reassigned'), '欠債 was reassigned rather than dropped');
    assert.equal(data.bills[0].fromAccountId, data.troupeAccountId);
    assert.ok(kinds.includes('purse-banked'), '餘銀 was banked in trust');
    assert.ok(BigInt(data.state.accounts[data.troupeAccountId]!.available) > troupeBefore, 'and the money did not vanish');
    assert.ok(kinds.includes('secret-passed'), '秘密 passed to the coveter');
    assert.deepEqual(world.data.secretLedger![0].holderIds, [fang]);
    assert.ok(kinds.includes('pair-dissolved'), '相許 dissolved');
    assert.deepEqual(world.data.establishedPairs, []);
    assert.ok(out.spawnedWants.some((want) => want.target === liu), 'and the one left standing carries it');
    assert.ok(kinds.includes('want-foreclosed'), 'her own 心事 stopped pressing');

    // Off the board: no roster entry, no wage, no lead slot, never a card's target.
    assert.equal(world.onBoard(liu), false);
    assert.equal(world.data.roster[liu], undefined);
    assert.ok(!data.wages.some((wage) => wage.accountId === liu));
    assert.ok(!world.activeCast().some((member) => member.id === liu));
    assert.equal(world.castById(liu)!.departedDay, 3, 'but the world can still name and remember her');
    assert.deepEqual(auditSeasonEconomy(world), [], '離班 conserves money');

    assert.equal(dismissFromCast(world, { characterId: liu, reason: 'again', day: 4, nowTick: 20 }).ok, false, 'nobody leaves twice');
});

test('離班: a secret with no heir goes out of town with its holder rather than dangling', () => {
    const world = seasonWorld();
    const yin = world.idByName('殷阿婆')!;
    seedSecretLedger(world, [
        { id: 's1', matter: '三十年的舊事', holderNames: ['殷阿婆'], leakWhen: [{ kind: 'day-atleast', day: 1 }] },
    ]);

    const out = dismissFromCast(world, { characterId: yin, reason: '回鄉去了', day: 2, nowTick: 10 });

    assert.ok(out.settlements.some((settlement) => settlement.kind === 'secret-lost'));
    assert.deepEqual(world.data.secretLedger![0].leakWhen, [], 'a secret nobody holds can no longer go off by itself');
    assert.ok(out.publicLines.some((line) => line.includes('無人說得清')));
});

test('進場: 故人進城 arrives with ties, a wage, and a claim on a DORMANT secret', () => {
    const world = seasonWorld();
    seedSecretLedger(world, [{ id: 's1', matter: '衣箱底下那樁事', holderNames: ['唐桂蘭'] }]);

    const out = admitNewcomer(world, {
        day: 2,
        nowTick: 8,
        seed: {
            name: '顧硯秋',
            role: '琴師',
            description: '早年在杭州班子裡拉過三年胡琴。',
            home_scene: '戲班大通鋪',
            work_scene: '雲錦台戲台',
            arrival_scene: '戲園前街',
            ties: [{ target: '唐桂蘭', tone: '當年同過班', warmth: 0.45 }],
            armsSecret: { secretId: 's1', as: 'coveter' },
            wageYuan: 1,
        },
    });

    assert.ok(out.ok, out.reason);
    const gu = out.member!.id;
    assert.equal(world.onBoard(gu), true);
    assert.ok(world.data.roster[gu], 'they are somewhere');
    assert.ok(world.data.economy!.wages.some((wage) => wage.accountId === gu), 'and not destitute on day one');
    // The point of the card: a dormant gun is now aimed.
    assert.ok(world.data.secretLedger![0].coveterIds.includes(gu));
    assert.equal(out.armedSecretId, 's1');
    assert.ok(out.publicLines[0].includes('唐桂蘭'), 'the arrival is announced with who they know');

    assert.equal(
        admitNewcomer(world, { day: 2, nowTick: 9, seed: { name: '顧硯秋', description: 'x', home_scene: '戲班大通鋪', work_scene: '雲錦台戲台' } }).ok,
        false,
        'two people cannot share a name',
    );
});
