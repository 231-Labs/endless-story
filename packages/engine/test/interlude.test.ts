/**
 * 折子 (interlude) — 喚醒層 P1 的機制本體。拍與拍之間，外來刺激喚起一次單角色的
 * 有界演繹：debounce 合併、每日預算、演繹、心事入記憶，拍首再收成一行世情 percept
 * 給大拍「聽說」。兩道閘門都**只延後、不丟棄**——留在佇列的捎話最遲在大拍被聽見。
 * 見 docs/narrative/AGENT_WAKE_LAYER.md。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { runInterludes, type InterludeRecord } from '../src/interlude.ts';
import { runTick } from '../src/tick.ts';
import { WorldState, type WorldStateData } from '../src/world-state.ts';
import { newWant } from '../src/core/want-core.ts';
import type {
    ArchivePort,
    InterludeInput,
    InterludeReply,
    InterludeStimulus,
    RecallPort,
    RecalledMemory,
    RememberOpts,
    SceneAgentPort,
} from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };

/** 真實時刻由呼叫端給（本機制絕不取牆鐘）——測試裡就是一個固定的錨。 */
const T0 = 1_754_400_000_000;
const MIN = 60_000;

/** 記下每一筆寫進長期記憶的心事，好驗折子確實把 memoryNote 交了出去。 */
class SpyRecall implements RecallPort {
    calls: Array<{ characterId: string; text: string; day: number }> = [];
    async remember(characterId: string, text: string, opts: RememberOpts): Promise<boolean> {
        this.calls.push({ characterId, text, day: opts.day });
        return true;
    }
    async recall(): Promise<RecalledMemory[]> {
        return [];
    }
}

/** 只留一句、不留心事的座席——驗 memoryNote 省略時記憶完全不被寫。 */
class TerseAgent extends FakeSceneAgent {
    override async interlude(input: InterludeInput): Promise<InterludeReply | null> {
        return { response: `${input.name}應了一聲。` };
    }
}

/** 座席缺席：舊 adapter 根本沒實作 interlude（喚醒層是純增量，關掉即回六拍世界）。 */
function seatlessAgent(): SceneAgentPort {
    const agent = new FakeSceneAgent();
    (agent as { interlude?: unknown }).interlude = undefined;
    return agent;
}

function stimulus(over: Partial<InterludeStimulus> & { id: string; characterId: string }): InterludeStimulus {
    return { kind: 'poke', text: '你師姐在後台等你', atRealMs: T0, ...over };
}

/** 甲(c0)、乙(c1) 各據一處，寡欲少事——這幾樁測的是幕間，不是大拍。 */
function makeWorld(over: Partial<WorldStateData> = {}): WorldState {
    const base: WorldStateData = {
        sagaId: 'wake',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', gender: '女', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
            { id: 'c1', name: '乙', persona: '乙', gender: '男', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '前廳', privacyLevel: 1 },
            { id: 's1', name: '後院', privacyLevel: 1 },
        ],
        roster: { c0: 's0', c1: 's1' },
        homeByChar: { c0: 's0', c1: 's1' },
        workByChar: { c0: 's0', c1: 's1' },
        wants: [
            newWant({ id: 'w0', characterId: 'c0', layer: '日常', desc: '想睡個囫圇覺', weight: 0.3, sat: 0.5, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
            newWant({ id: 'w1', characterId: 'c1', layer: '日常', desc: '想歇口氣', weight: 0.3, sat: 0.5, resistance: 6, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        ],
        establishedPairs: [],
        edges: {},
        bonds: [],
        clock: makeClock(6, 0),
        lastMovedTickByChar: {},
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState({ ...base, ...over });
}

test('debounce：未滿齡的捎話不消化，滿齡則同一人多則合併為一次折子', async () => {
    const agent = new FakeSceneAgent();
    const recall = new SpyRecall();
    const world = makeWorld({
        pendingStimuli: [
            stimulus({ id: 's-1', characterId: 'c0', text: '東家問你今晚的戲', kind: 'note', atRealMs: T0 }),
            stimulus({ id: 's-2', characterId: 'c0', text: '又問你嗓子好些沒有', kind: 'note', atRealMs: T0 + 20_000 }),
        ],
    });

    // 最老的一則才 30 秒：窗還沒滿，讓後頭的話併進來。
    const early = await runInterludes(world, { agent, recall }, { nowMs: T0 + 30_000 });
    assert.equal(early.length, 0, '未滿齡不演');
    assert.equal(world.data.pendingStimuli?.length, 2, '兩則捎話原封留在佇列');
    assert.equal(world.data.interludeLedger, undefined, '沒演過就不記帳');

    // 滿齡（最老那則齡 ≥ 60s）：兩則併成 ONE 次折子，佇列清空。
    const played = await runInterludes(world, { agent, recall }, { nowMs: T0 + 61_000 });
    assert.equal(played.length, 1, '同一人窗內的捎話合併成一次演繹');
    assert.equal(played[0].stimuli.length, 2, '一次折子聽見兩句話');
    assert.deepEqual(world.data.pendingStimuli, [], '成局的那一組移出佇列');
    assert.deepEqual(world.data.interludesSinceLastTick?.map((r) => r.id), [played[0].id], '紀錄 append 到待匯入的幕間');
});

test('預算：達上限後滯留佇列，day 一變即歸零，同一人又能再演', async () => {
    const agent = new FakeSceneAgent();
    const recall = new SpyRecall();
    const world = makeWorld({
        pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })],
        interludeLedger: { c0: { day: 1, count: 1 } },
    });

    const capped = await runInterludes(world, { agent, recall }, { nowMs: T0 + 2 * MIN, dailyBudget: 1 });
    assert.equal(capped.length, 0, '今日的份額用盡');
    assert.equal(world.data.pendingStimuli?.length, 1, '超預算者不丟棄，留給下一個大拍');

    // 隔日：帳按 clock.day 歸零（不必清表），同一樁捎話終於被聽見。
    world.data.clock = makeClock(6, 6);
    const nextDay = await runInterludes(world, { agent, recall }, { nowMs: T0 + 3 * MIN, dailyBudget: 1 });
    assert.equal(nextDay.length, 1, 'day 變了，預算歸零');
    assert.deepEqual(world.data.interludeLedger?.c0, { day: 2, count: 1 }, '帳改記新的一日');
    assert.deepEqual(world.data.pendingStimuli, []);
});

test('預算設 0 ≡ 現制：一則也不演，全留給大拍', async () => {
    const agent = new FakeSceneAgent();
    const recall = new SpyRecall();
    const world = makeWorld({ pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })] });

    const played = await runInterludes(world, { agent, recall }, { nowMs: T0 + 5 * MIN, dailyBudget: 0 });
    assert.equal(played.length, 0);
    assert.equal(world.data.pendingStimuli?.length, 1, '關掉喚醒層 = 回到六拍世界');
    assert.equal(world.data.interludesSinceLastTick, undefined, '沒演過就沒有待匯入的幕間');
});

test('心事入長期記憶：memoryNote 有值才寫，且記在演繹當下的 day', async () => {
    const recall = new SpyRecall();
    const world = makeWorld({ pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })] });
    const played = await runInterludes(world, { agent: new FakeSceneAgent(), recall }, { nowMs: T0 + 2 * MIN });
    assert.equal(played.length, 1);
    assert.equal(recall.calls.length, 1, '一次折子至多寫一筆心事');
    assert.deepEqual(
        { characterId: recall.calls[0].characterId, day: recall.calls[0].day },
        { characterId: 'c0', day: 1 },
    );
    assert.equal(recall.calls[0].text, played[0].memoryNote);

    // 沒留心事的一輪：記憶完全不被碰。
    const terseRecall = new SpyRecall();
    const terseWorld = makeWorld({ pendingStimuli: [stimulus({ id: 's-2', characterId: 'c1', atRealMs: T0 })] });
    const terse = await runInterludes(terseWorld, { agent: new TerseAgent(), recall: terseRecall }, { nowMs: T0 + 2 * MIN });
    assert.equal(terse.length, 1);
    assert.equal(terse[0].memoryNote, undefined);
    assert.equal(terseRecall.calls.length, 0, 'memoryNote 省略 ⇒ 一筆記憶也不寫');
});

test('座席缺席：佇列原封不動，什麼也不消化', async () => {
    const recall = new SpyRecall();
    const world = makeWorld({
        pendingStimuli: [
            stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 }),
            stimulus({ id: 's-2', characterId: 'c1', atRealMs: T0 }),
        ],
    });
    const played = await runInterludes(world, { agent: seatlessAgent(), recall }, { nowMs: T0 + 10 * MIN });
    assert.equal(played.length, 0);
    assert.equal(world.data.pendingStimuli?.length, 2, '沒有座席就沒有折子——捎話留給大拍');
    assert.equal(recall.calls.length, 0);
    assert.equal(world.data.interludeLedger, undefined, '預算帳也不該被動到');
});

test('紀錄欄位完整：落款取演繹當下的 clock，realMs 是重播的憑據', async () => {
    const world = makeWorld({
        clock: makeClock(6, 8), // 第 2 日・日午
        pendingStimuli: [
            stimulus({ id: 's-1', characterId: 'c0', text: '東家捎話問你', kind: 'note', atRealMs: T0 }),
            stimulus({ id: 's-2', characterId: 'c1', text: '有人在門外候著', atRealMs: T0 }),
        ],
    });
    const nowMs = T0 + 5 * MIN;
    const played = await runInterludes(world, { agent: new FakeSceneAgent(), recall: new SpyRecall() }, {
        nowMs,
        dateLabel: '民國十五年八月五日',
        activityHint: (id) => (id === 'c0' ? '甲在戲台練功' : undefined),
    });

    assert.equal(played.length, 2, '兩個人各演各的折子');
    const first = played.find((r) => r.characterId === 'c0') as InterludeRecord;
    assert.equal(first.name, '甲');
    assert.equal(first.realMs, nowMs);
    assert.equal(first.day, 2);
    assert.equal(first.partOfDay, '晡時');
    assert.equal(first.tick, 8);
    assert.ok(first.response.includes('甲在戲台練功'), '「此刻本該在哪」有給就到得了座席');
    assert.ok(first.memoryNote, '確定性替身留了一筆心事');
    // id 確定性：同日、同時辰序、同毫秒、同角色 ⇒ 同一個號（重播可復現，且不撞號）。
    assert.equal(first.id, `wake:d2:b2:w${nowMs}:c0`);
    assert.notEqual(first.id, played.find((r) => r.characterId === 'c1')!.id);
});

test('拍首匯入：大拍聽說幕間（答過的與未及回的各一句），佇列隨即清空', async () => {
    /** 攔下每個角色在拍首收到的世情，驗折子確實以 percept 的身分入了大拍。 */
    class WatchingAgent extends FakeSceneAgent {
        situationById: Record<string, string> = {};
        override async decideMove(
            input: CharacterAgentNs.MoveDecideInput,
        ): Promise<CharacterAgentNs.MoveDecideResult> {
            if (input.currentSituation) this.situationById[input.name] = input.currentSituation;
            return super.decideMove(input);
        }
    }

    const agent = new WatchingAgent();
    // 乙：幕間答過了（大拍只聽說，不重演）。
    const world = makeWorld({ pendingStimuli: [stimulus({ id: 's-9', characterId: 'c1', text: '有人在門外候了半日', atRealMs: T0 })] });
    await runInterludes(world, { agent, recall: new SpyRecall() }, { nowMs: T0 + 2 * MIN });
    assert.equal(world.data.interludesSinceLastTick?.length, 1, '幕間演過一場，等著大拍聽說');
    // 甲：捎話滯留在佇列（超預算／座席缺席都是這個下場），大拍一併聽見。
    world.data.pendingStimuli = [stimulus({ id: 's-10', characterId: 'c0', text: '東家又捎了一句話', kind: 'note', atRealMs: T0 })];

    await runTick(world, { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() }, { log: () => {} });

    assert.deepEqual(world.data.interludesSinceLastTick, [], 'drain 後清空——同一樁幕間不被兩拍聽見兩次');
    assert.deepEqual(world.data.pendingStimuli, [], '滯留的捎話到大拍也被聽見了');
    assert.match(agent.situationById['乙'] ?? '', /幕間：/, '答過的那樁成了乙的一行世情');
    assert.match(agent.situationById['甲'] ?? '', /幕間有人捎話你未及回/, '未及回的捎話大拍照樣說給本人聽');
});

test('喚醒層沒開：兩個佇列皆空，大拍完全不受影響', async () => {
    const agent = new FakeSceneAgent();
    const world = makeWorld();
    await runTick(world, { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() }, { log: () => {} });
    assert.equal(world.data.pendingStimuli, undefined, '沒有幕間就不生欄位（舊卷 byte-identical）');
    assert.equal(world.data.interludesSinceLastTick, undefined);
});
