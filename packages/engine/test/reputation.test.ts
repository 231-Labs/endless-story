/**
 * 口碑帳 — the consequence layer that lets 「打死不還」 be a real choice.
 *
 * The engine never takes anybody's money. That is only defensible if refusing to
 * pay costs something ELSE, and these tests pin what: a fact other people hold,
 * that spreads person to person, that closes a specific door, and that the
 * debtor can see and act on. A reputation that nobody knows, or that gates
 * nothing, would just be an adjective — and an adjective is not a consequence.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile, loadSeasonFrameFile } from '../src/preset.ts';
import {
    recordReputation,
    reputationAsKnownBy,
    reputationOf,
    reputationPerceptFor,
    settleReputationForBill,
    spreadReputation,
    tabAllowedFor,
    type ReputationMark,
} from '../src/core/reputation.ts';
import { WorldState } from '../src/world-state.ts';

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

function refusalMark(world: WorldState, aboutId: string, vendor = '前街食肆'): ReputationMark {
    return recordReputation(world, {
        id: `rep:tab:refused:d2`,
        aboutId,
        kind: 'debt-refused',
        day: 2,
        note: `${world.nameById(aboutId)}欠趙阿福三圓，到了日子沒還——手裡不是沒有`,
        knownByIds: [],
        tabRevokedFor: vendor,
    });
}

test('a mark is idempotent, and spreading is monotonic — a name never un-travels', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const mark = refusalMark(world, liu);
    refusalMark(world, liu); // same id again
    assert.equal(world.data.reputation!.length, 1);

    const first = spreadReputation(world, mark.id, [world.idByName('蘇映雪')!, world.idByName('連翹')!]);
    assert.equal(first.length, 2);
    const again = spreadReputation(world, mark.id, [world.idByName('蘇映雪')!]);
    assert.deepEqual(again, [], 'somebody who already heard does not hear it twice');
    assert.equal(spreadReputation(world, mark.id, ['not-a-character']).length, 0);
});

test('賒帳資格: the door shuts at the vendor who was stiffed, and ONLY there', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'nothing on him to begin with');

    refusalMark(world, liu, '前街食肆');

    assert.equal(tabAllowedFor(world, liu, '前街食肆'), false, '趙阿福 stops extending credit');
    assert.equal(tabAllowedFor(world, liu, '白家繡樓'), true, '殷阿婆 was not the one stiffed');
    assert.equal(tabAllowedFor(world, world.idByName('蘇映雪')!, '前街食肆'), true, 'and it is about HIM, not everyone');
});

test('a forgiven debt marks the name too, but closes no door', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    recordReputation(world, {
        id: 'rep:tab:forgiven:d2',
        aboutId: liu,
        kind: 'debt-forgiven',
        day: 2,
        note: '趙阿福免了柳安春三圓的帳',
        knownByIds: [],
    });

    assert.equal(reputationOf(world, liu, 'debt-forgiven').length, 1, 'the street remembers being let off');
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'but generosity is not a punishment');
});

test('the debtor SEES what the street is saying — otherwise it could never change their mind', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    assert.equal(reputationPerceptFor(world, liu), undefined, 'a clean name says nothing');

    const mark = refusalMark(world, liu);
    const alone = reputationPerceptFor(world, liu)!;
    assert.match(alone, /暫時還沒傳開/, 'a mark nobody has heard reads as exactly that');

    spreadReputation(world, mark.id, world.data.cast.map((member) => member.id));
    const spread = reputationPerceptFor(world, liu)!;
    assert.match(spread, /前街差不多都知道了/, 'and reach is reported honestly');
    assert.match(spread, /帳清了，話才會淡/, 'along with the way out');
});

test('what OTHERS know is scoped to what they actually heard', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const jin = world.idByName('金鳳')!;
    const mark = refusalMark(world, liu);
    spreadReputation(world, mark.id, [su]);

    assert.ok(reputationAsKnownBy(world, su, liu), '蘇映雪 heard it');
    assert.equal(reputationAsKnownBy(world, jin, liu), undefined, '金鳳 did not, so she cannot act on it');
});

test('洗刷: clearing the debt reopens the door and quiets the percept, but keeps the record', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const mark = refusalMark(world, liu);
    spreadReputation(world, mark.id, world.data.cast.map((member) => member.id));

    const cleared = settleReputationForBill(world, 'tab', 6);

    assert.equal(cleared.length, 1);
    assert.equal(tabAllowedFor(world, liu, '前街食肆'), true, 'paying up reopens the door');
    assert.equal(reputationPerceptFor(world, liu), undefined, 'and stops nagging him');
    assert.deepEqual(reputationOf(world, liu), [], 'no standing marks left');
    assert.equal(world.data.reputation!.length, 1, 'but what was said was still said');
    assert.equal(world.data.reputation![0].settledDay, 6);
    assert.deepEqual(settleReputationForBill(world, 'tab', 7), [], 'settling twice is a no-op');
});

test('a shut 賒帳 door is a REFUSAL at the purchase path, with a reason that names why', () => {
    // The full path: a broke buyer at a tab-extending vendor normally gets credit;
    // with a standing refusal mark they get turned away instead, and told why.
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, loadSeasonFrameFile('spring-snow-market'));
    const axi = world.idByName('何阿喜')!;
    const state = world.data.economy!.state;
    state.injected = (BigInt(state.injected) - BigInt(state.accounts[axi]!.available)).toString();
    state.accounts[axi]!.available = '0'; // broke, so the tab path is the only way through
    const stall = world.data.scenes.find((scene) => scene.name === '戲園前街')!;
    world.data.roster[axi] = stall.id;

    const economy = new LocalEconomy();
    const buy = () =>
        economy.commitCommand(world, {
            actorId: axi,
            sceneId: stall.id,
            witnessIds: [axi],
            command: { action: 'purchase', itemId: 'meal-frontstreet-tangzhou' },
            causeEventId: 'test:buy',
            seq: 0,
            day: 1,
        });

    const onTab = buy();
    assert.equal(onTab.ok, true, 'with a clean name, a broke buyer gets it on tab');

    // Now he has been publicly named for not paying.
    recordReputation(world, {
        id: 'rep:other:refused:d2',
        aboutId: axi,
        kind: 'debt-refused',
        day: 2,
        note: '何阿喜欠著不還',
        knownByIds: [],
        tabRevokedFor: '前街食肆',
    });
    world.data.economy!.bills = []; // clear the tab he just opened, isolate the gate
    const refused = economy.commitCommand(world, {
        actorId: axi,
        sceneId: stall.id,
        witnessIds: [axi],
        command: { action: 'purchase', itemId: 'meal-frontstreet-noodle' },
        causeEventId: 'test:buy2',
        seq: 1,
        day: 2,
    });

    assert.equal(refused.ok, false, 'the door is shut');
    assert.match(refused.reason!, /不肯再賒/, 'and the refusal says why, so he can learn from it');
});
