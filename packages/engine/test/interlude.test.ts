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
import { collectDueIntents, hasDueIntent, runInterludes, type InterludeRecord } from '../src/interlude.ts';
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

/** 照單回話的座席——回什麼由測試指定。用它把「座席自律」與「引擎驗證」分開：
 *  座席愛說什麼都行（一萬分鐘、四十字的念、班底起念），夾限是引擎的事。 */
class ScriptedAgent extends FakeSceneAgent {
    readonly scripted: InterludeReply;
    constructor(scripted: InterludeReply) {
        super();
        this.scripted = scripted;
    }
    override async interlude(): Promise<InterludeReply | null> {
        return this.scripted;
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

/** 甲點名為台柱、乙留作班底——起念只有台柱有份（惰性是預設，設計稿 §六之二）。 */
function makeTieredWorld(over: Partial<WorldStateData> = {}): WorldState {
    const world = makeWorld(over);
    world.data.cast[0].agency = 'principal';
    return world;
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

// ── 起念（P2）—— 自己捎話給未來的自己 ────────────────────────────────────────
// 一枚定時的刺激，到點入佇列，走折子全套既有閘門。以下驗的正是「沒有第二套機制」。

test('起念免 debounce：整組皆起念立刻成局，混進一句外來捎話就照一般規則等窗滿齡', async () => {
    const agent = new FakeSceneAgent();
    // 起念本來就是排程過的一件事——到點即是此刻，沒有東西還要等它併進來。
    const solo = makeWorld({
        pendingStimuli: [stimulus({ id: 'i-1', characterId: 'c0', kind: 'intent', text: '黃昏去茶樓堵他', atRealMs: T0 })],
    });
    const now = await runInterludes(solo, { agent, recall: new SpyRecall() }, { nowMs: T0 });
    assert.equal(now.length, 1, '齡 0 也演——debounce 是為外來連戳而設，不是為起念');
    assert.deepEqual(solo.data.pendingStimuli, []);

    // 混組：起念撞上一句剛到的外來捎話 → 走一般規則，讓那句話有機會併進同一折，
    // 而不是逼出兩次演繹。
    const mixed = makeWorld({
        pendingStimuli: [
            stimulus({ id: 'i-2', characterId: 'c0', kind: 'intent', text: '黃昏去茶樓堵他', atRealMs: T0 }),
            stimulus({ id: 's-2', characterId: 'c0', kind: 'note', text: '東家問你今晚的戲', atRealMs: T0 }),
        ],
    });
    const early = await runInterludes(mixed, { agent, recall: new SpyRecall() }, { nowMs: T0 + 10_000 });
    assert.equal(early.length, 0, '混組不免 debounce');
    assert.equal(mixed.data.pendingStimuli?.length, 2, '兩則原封留在佇列');
    const later = await runInterludes(mixed, { agent, recall: new SpyRecall() }, { nowMs: T0 + 61_000 });
    assert.equal(later.length, 1);
    assert.equal(later[0].stimuli.length, 2, '窗滿齡後併成一折');
});

test('起念只有台柱能立：班底的 followUp 逕行忽略', async () => {
    const agent = new ScriptedAgent({ response: '應了一聲', followUp: { inMinutes: 60, note: '入夜去尋她' } });
    const world = makeTieredWorld({
        pendingStimuli: [
            stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 }), // 甲：台柱
            stimulus({ id: 's-2', characterId: 'c1', atRealMs: T0 }), // 乙：班底
        ],
    });
    const played = await runInterludes(world, { agent, recall: new SpyRecall() }, { nowMs: T0 + 2 * MIN });
    assert.equal(played.length, 2, '被捎話全員照舊有折子——tier 閘的只有起念');
    assert.deepEqual(
        (world.data.pendingIntents ?? []).map((i) => i.characterId),
        ['c0'],
        '班底不起念（缺席 = ensemble，惰性是預設）',
    );
    assert.equal(world.data.pendingIntents?.[0].dueRealMs, T0 + 2 * MIN + 60 * MIN);
    assert.equal(world.data.pendingIntents?.[0].note, '入夜去尋她');
});

test('起念的夾限：分鐘數夾 [15,1440]、話截 40 字、非數逕行忽略', async () => {
    /** 讓台柱在一折裡立下這麼一枚念，回傳落帳後的在途清單。 */
    const stake = async (followUp: { inMinutes: number; note: string }) => {
        const world = makeTieredWorld({ pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })] });
        await runInterludes(
            world,
            { agent: new ScriptedAgent({ response: '應了一聲', followUp }), recall: new SpyRecall() },
            { nowMs: T0 + 2 * MIN },
        );
        return world.data.pendingIntents ?? [];
    };
    const base = T0 + 2 * MIN;

    assert.equal((await stake({ inMinutes: 1, note: '這就去' }))[0].dueRealMs, base + 15 * MIN, '太近夾到 15 分鐘');
    assert.equal((await stake({ inMinutes: 99_999, note: '總有一日' }))[0].dueRealMs, base + 1440 * MIN, '太遠夾到一晝夜');
    assert.equal((await stake({ inMinutes: 30, note: '好' }))[0].dueRealMs, base + 30 * MIN, '範圍內原封不動');

    const long = await stake({ inMinutes: 30, note: '一'.repeat(80) });
    assert.equal(long[0].note.length, 40, '捎給未來自己的是一句提醒，不是一份計畫書');

    assert.deepEqual(await stake({ inMinutes: Number.NaN, note: '說不清什麼時候' }), [], '非數逕行忽略');
    assert.deepEqual(await stake({ inMinutes: 30, note: '   ' }), [], '沒話就沒有念');
});

test('每人至多一枚在途：新的念換掉舊的（人會改主意），旁人的不受牽連', async () => {
    const world = makeTieredWorld({
        pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })],
        // 乙先前也有一枚在途——換的是同一個人的念，不是整張表。
        pendingIntents: [{ id: 'old-c1', characterId: 'c1', dueRealMs: T0 + 300 * MIN, note: '乙的舊念' }],
    });
    const recall = new SpyRecall();
    await runInterludes(
        world,
        { agent: new ScriptedAgent({ response: '應一聲', followUp: { inMinutes: 30, note: '先去尋師姐' } }), recall },
        { nowMs: T0 + 2 * MIN },
    );
    world.data.pendingStimuli = [stimulus({ id: 's-2', characterId: 'c0', atRealMs: T0 + 10 * MIN })];
    await runInterludes(
        world,
        { agent: new ScriptedAgent({ response: '又應一聲', followUp: { inMinutes: 45, note: '改主意，先回戲園' } }), recall },
        { nowMs: T0 + 12 * MIN },
    );

    const intents = world.data.pendingIntents ?? [];
    assert.equal(intents.filter((i) => i.characterId === 'c0').length, 1, '甲身上至多一枚在途');
    assert.equal(intents.find((i) => i.characterId === 'c0')?.note, '改主意，先回戲園', '新的換掉舊的');
    assert.equal(intents.find((i) => i.characterId === 'c1')?.note, '乙的舊念', '乙的念不受牽連');
});

test('起念取用：hasDueIntent 只 peek，collectDueIntents 只取到期者並轉成刺激', () => {
    const world = makeWorld();
    world.data.pendingIntents = [
        { id: 'i-due', characterId: 'c0', dueRealMs: T0, note: '去茶樓堵他' },
        { id: 'i-later', characterId: 'c1', dueRealMs: T0 + 60 * MIN, note: '明早再說' },
    ];

    assert.equal(hasDueIntent(world, T0 - 1), false, '還沒到點');
    assert.equal(hasDueIntent(world, T0), true, '到點了');
    assert.equal(world.data.pendingIntents.length, 2, 'peek 絕不改狀態（driver 在單寫者隊外呼它）');

    const due = collectDueIntents(world, T0 + MIN);
    assert.deepEqual(due, [
        // 落款用「當初排定的時刻」而非此刻：巡佇列晚了幾十秒不該讓這枚念顯得年輕。
        { id: 'i-due', characterId: 'c0', kind: 'intent', text: '去茶樓堵他', atRealMs: T0 },
    ]);
    assert.deepEqual(world.data.pendingIntents.map((i) => i.id), ['i-later'], '未到期者原封留著');
    assert.deepEqual(collectDueIntents(world, T0 + MIN), [], '一枚也沒到期就什麼都不取');
    assert.deepEqual(collectDueIntents(makeWorld(), T0), [], '從沒起過念的世界也走得通');
});

// ── 輕量 activity（P2）—— 拍與拍之間的存在形狀 ──────────────────────────────

test('自陳活動：what 截 20 字、forMinutes 夾 [10,360] 預設 60，起訖落在演繹當下', async () => {
    /** 讓某人在一折裡自陳這麼一樁活動，回傳落帳後的那一筆。 */
    const doing = async (activity: { what: string; forMinutes?: number }) => {
        const world = makeWorld({ pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })] });
        await runInterludes(
            world,
            { agent: new ScriptedAgent({ response: '應了一聲', activity }), recall: new SpyRecall() },
            { nowMs: T0 + 2 * MIN },
        );
        return world.data.activityByChar?.c0;
    };
    const base = T0 + 2 * MIN;

    assert.deepEqual(await doing({ what: '排戲' }), { what: '排戲', startRealMs: base, endRealMs: base + 60 * MIN }, '沒說多久就一個時辰');
    assert.equal((await doing({ what: '排戲', forMinutes: 1 }))?.endRealMs, base + 10 * MIN, '太短夾到十分鐘');
    assert.equal((await doing({ what: '排戲', forMinutes: 9_999 }))?.endRealMs, base + 360 * MIN, '太長夾到六個時辰');
    assert.equal((await doing({ what: '一'.repeat(50), forMinutes: 30 }))?.what.length, 20, '活動名是一句，不是一段');
    assert.equal(await doing({ what: '  ', forMinutes: 30 }), undefined, '沒說在做什麼就不記');
});

test('在期的自陳活動壓過節律提示；過了鐘點便讓回節律（不必清表）', async () => {
    const hint = () => '甲在戲台練功'; // 行當節律推的「此刻本該在哪」（零 LLM 的預設行程）
    const live = makeWorld({
        pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', atRealMs: T0 })],
        activityByChar: { c0: { what: '同師姐對戲', startRealMs: T0, endRealMs: T0 + 30 * MIN } },
    });
    const played = await runInterludes(live, { agent: new FakeSceneAgent(), recall: new SpyRecall() }, {
        nowMs: T0 + 2 * MIN,
        activityHint: hint,
    });
    assert.match(played[0].response, /你正在：同師姐對戲/, 'agent 明示的覆寫壓過節律的預設行程');
    assert.doesNotMatch(played[0].response, /戲台練功/);

    // 同一筆活動，過了鐘點：視同不存在，節律接回來——沒有誰需要去清那張表。
    const stale = makeWorld({
        pendingStimuli: [stimulus({ id: 's-2', characterId: 'c0', atRealMs: T0 })],
        activityByChar: { c0: { what: '同師姐對戲', startRealMs: T0 - 60 * MIN, endRealMs: T0 } },
    });
    const after = await runInterludes(stale, { agent: new FakeSceneAgent(), recall: new SpyRecall() }, {
        nowMs: T0 + 2 * MIN,
        activityHint: hint,
    });
    assert.match(after[0].response, /甲在戲台練功/, '過期的活動不再壓過節律');
});

test('起念全鏈路：折子裡起一念 → 到期 → 轉刺激 → 再一折，兩折都計本人預算', async () => {
    const agent = new FakeSceneAgent(); // 確定性替身的把手：捎話帶「稍後」二字才立念
    const recall = new SpyRecall();
    const world = makeTieredWorld({
        pendingStimuli: [stimulus({ id: 's-1', characterId: 'c0', kind: 'note', text: '東家說這事稍後再議', atRealMs: T0 })],
    });

    const first = await runInterludes(world, { agent, recall }, { nowMs: T0 + 2 * MIN });
    assert.equal(first.length, 1, '第一折：聽見東家的話');
    const intents = world.data.pendingIntents ?? [];
    assert.equal(intents.length, 1, '台柱在折子裡替自己記下一樁稍後要辦的事');
    const dueMs = intents[0].dueRealMs;
    assert.equal(dueMs, T0 + 2 * MIN + 15 * MIN);

    // driver 那頭只 peek——到點之前什麼也不做。
    assert.equal(hasDueIntent(world, dueMs - 1), false);
    assert.equal(hasDueIntent(world, dueMs), true);

    // 呼叫端的責任：取出來、推進 pendingStimuli（引擎不代勞，見 collectDueIntents）。
    const due = collectDueIntents(world, dueMs);
    assert.equal(due.length, 1);
    (world.data.pendingStimuli ??= []).push(...due);

    // 起念免 debounce：到點就是此刻，這一折立刻成局。
    const second = await runInterludes(world, { agent, recall }, { nowMs: dueMs });
    assert.equal(second.length, 1, '第二折：他自己先前捎的話送到了');
    assert.equal(second[0].stimuli[0].kind, 'intent');
    assert.match(second[0].response, /想起先前的念/, '起念與外來捎話說法上分得開');
    assert.deepEqual(world.data.pendingStimuli, []);
    assert.deepEqual(world.data.interludeLedger?.c0, { day: 1, count: 2 }, '起念照計本人當日折子上限（防自我 DDoS）');
    assert.equal(world.data.pendingIntents?.length, 1, '這一折又起了一念，仍是至多一枚在途');
    assert.equal(recall.calls.length, 2, '兩折各記一筆心事');
});
