/**
 * 角色工件（日記／詩詞）與生命體徵 — the return-visit hook and the four numbers
 * that tell you whether a world is a story or a treadmill.
 *
 * The diary tests are really ANTI-DRIFT tests. A diary is a first-person document
 * that reads as canon, so it is the worst place to let invention in: the last
 * run's dossier caught a character with 24 圓 on the books whose 心事 spoke of
 * 「省著手裡的七十圓」. The audit must catch exactly that, while still letting a
 * diary be biased, self-serving and wrong about other people — which is the whole
 * point of a first-person document.
 *
 * The vitals tests reconstruct the 糖粥 attractor (eight of twelve characters
 * reaching for one errand) and assert the detector actually names it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import {
    artifactsOf,
    auditClaims,
    circulateArtifact,
    diaryId,
    markPoemWritten,
    poemOccasions,
    readChineseNumber,
    recordArtifact,
    spawnPoemProp,
    type ArtifactEvidenceBeat,
    type DiaryArtifact,
    type PoemArtifact,
} from '../src/core/artifacts.ts';
import {
    computeTickVitals,
    contentTokens,
    convergenceOf,
    loopsOf,
    pushVitalsWindow,
    sceneEntropyOf,
    VITALS_WINDOW_TICKS,
} from '../src/core/vitals.ts';
import { newWant } from '../src/core/want-core.ts';
import { WorldState } from '../src/world-state.ts';

const YUAN = 100n;

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    world.data.wants = [];
    return world;
}

function evidence(...texts: Array<[string, string?]>): ArtifactEvidenceBeat[] {
    return texts.map(([text, inner], index) => ({
        ref: `beat:${index}`,
        day: 1,
        tick: index,
        clock: '日午',
        sceneName: '後台妝閣',
        text,
        ...(inner ? { inner } : {}),
    }));
}

const setPurse = (world: WorldState, id: string, yuan: bigint): void => {
    const state = world.data.economy!.state;
    state.injected = (BigInt(state.injected) + yuan * YUAN - BigInt(state.accounts[id]!.available)).toString();
    state.accounts[id]!.available = (yuan * YUAN).toString();
};

// ── 日記 claim audit ─────────────────────────────────────────────────────────

test('a claim citing a real beat passes; a claim citing nothing is FLAGGED, not dropped', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const beats = evidence(['把溫茶推到她手邊。', '別讓她看出來。'], ['接過茶盞，偏頭一笑。']);

    const audited = auditClaims(world, liu, [
        { text: '我把茶推了過去', evidenceRefs: ['beat:0'] },
        { text: '她其實一直都知道', evidenceRefs: [] },
        { text: '我看見她在哭', evidenceRefs: ['beat:9'] },
    ], beats);

    assert.deepEqual(audited.supported.map((claim) => claim.text), ['我把茶推了過去']);
    assert.equal(audited.unsupported.length, 2);
    assert.match(audited.unsupported[0].auditNote!, /沒有引用/);
    assert.match(audited.unsupported[1].auditNote!, /不存在/, 'a fabricated citation cannot resolve');
});

test('a diary may be BIASED about people — that is the point — but not about the ledger', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    setPurse(world, liu, 24n);
    const beats = evidence(['接過茶盞，偏頭一笑。', '她這是可憐我。']);

    const audited = auditClaims(world, liu, [
        // Subjective, unfalsifiable, quite possibly wrong about her — allowed.
        { text: '她遞茶不過是可憐我罷了', evidenceRefs: ['beat:0'] },
        // The exact observed drift: a figure that is neither in the beats nor on the books.
        { text: '省著手裡的七十圓，還能撐些日子', evidenceRefs: ['beat:0'] },
        // The TRUE purse figure is always allowed.
        { text: '手裡剩的24圓，得算著花', evidenceRefs: ['beat:0'] },
    ], beats);

    assert.deepEqual(audited.supported.map((claim) => claim.text), [
        '她遞茶不過是可憐我罷了',
        '手裡剩的24圓，得算著花',
    ]);
    assert.equal(audited.unsupported.length, 1);
    assert.match(audited.unsupported[0].auditNote!, /帳面漂移/);
    assert.match(audited.unsupported[0].auditNote!, /七十圓/);
});

test('a money figure the day\'s beats DID mention is fine, whoever it belonged to', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    setPurse(world, liu, 3n);
    const beats = evidence(['趙阿福說那本帳上還記著六十圓。']);

    const audited = auditClaims(world, liu, [{ text: '那本帳上的六十圓，總得有人認', evidenceRefs: ['beat:0'] }], beats);
    assert.equal(audited.supported.length, 1, 'the figure came from the day itself');
});

test('中文數字 are read the way an in-period diary writes them', () => {
    assert.equal(readChineseNumber('七十'), 70);
    assert.equal(readChineseNumber('十二'), 12);
    assert.equal(readChineseNumber('二十四'), 24);
    assert.equal(readChineseNumber('一百二十'), 120);
    assert.equal(readChineseNumber('24'), 24);
    assert.equal(readChineseNumber('若干'), null, 'an unreadable figure never accuses a claim');
});

test('artifacts persist and are queryable by character and day', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;
    const diary = (characterId: string, day: number): DiaryArtifact => ({
        kind: 'diary',
        id: diaryId(characterId, day),
        characterId,
        name: world.nameById(characterId),
        day,
        body: `第${day}日`,
        claims: [],
        unsupportedClaims: [],
        evidenceCount: 1,
    });

    recordArtifact(world, diary(liu, 1));
    recordArtifact(world, diary(liu, 2));
    recordArtifact(world, diary(su, 1));
    recordArtifact(world, { ...diary(liu, 1), body: '改寫過的第1日' }); // same id ⇒ replace

    assert.equal(artifactsOf(world).length, 3, 're-recording the same day overwrites, never duplicates');
    assert.equal(artifactsOf(world, { characterId: liu }).length, 2);
    assert.equal(artifactsOf(world, { day: 1 }).length, 2);
    assert.equal(artifactsOf(world, { characterId: liu, day: 1 })[0].body, '改寫過的第1日');
    assert.equal(artifactsOf(world, { kind: 'poem' }).length, 0);
});

// ── 詩詞: occasion + scarcity + prop ─────────────────────────────────────────

test('詩詞 is occasion-only: a quiet character with nothing burning writes nothing', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    world.data.wants.push(
        newWant({ id: 'w1', characterId: liu, layer: '事務', desc: '一樁小事', weight: 0.2, sat: 0.5, resistance: 4, kind: 'narrative', source: 'genesis', bornTick: 0 }),
    );
    assert.deepEqual(poemOccasions(world, { day: 1, candidateIds: [liu] }), []);
});

test('詩詞: a 相許 is always an occasion; the cooldown then keeps poems scarce', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const su = world.idByName('蘇映雪')!;

    const hits = poemOccasions(world, { day: 3, candidateIds: [liu, su], signals: { betrothedPairs: [[liu, su]] } });
    assert.deepEqual(hits.map((hit) => hit.occasion), ['betrothed', 'betrothed']);
    assert.equal(hits[0].otherId, su);

    markPoemWritten(world, liu, 3);
    const nextDay = poemOccasions(world, { day: 4, candidateIds: [liu, su], signals: { betrothedPairs: [[liu, su]] } });
    assert.deepEqual(nextDay.map((hit) => hit.characterId), [su], '柳安春 is inside the cooldown; a poem a day is a diary');
});

test('詩詞: a want at breaking point is an occasion — the scarcity gate is real pressure', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const hot = newWant({
        id: 'w-hot', characterId: liu, layer: '愛', desc: '那句話再不說就沒機會了',
        weight: 0.95, sat: 0.05, resistance: 3, kind: 'narrative', source: 'genesis', bornTick: 0,
    });
    hot.heat = 10; // past resistance + margin ⇒ 'breaking'
    world.data.wants.push(hot);

    const hits = poemOccasions(world, { day: 2, candidateIds: [liu] });
    assert.deepEqual(hits.map((hit) => hit.occasion), ['tension-peak']);
    assert.equal(hits[0].want?.id, 'w-hot');
});

test('工件回流世界: a discarded draft becomes a real, portable, findable object', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    const poem: PoemArtifact = {
        kind: 'poem', id: 'poem:liu:d2:0', characterId: liu, name: '柳安春',
        day: 2, tick: 8, occasion: 'refused', body: '燈下自照，影不肯應\n第二句寫壞了',
    };

    const objectId = spawnPoemProp(world, poem);

    assert.ok(objectId);
    const object = world.objectById(objectId!)!;
    assert.equal(object.portable, true, 'another character can pick it up');
    assert.equal(object.visibility, 'visible');
    assert.equal(object.sceneId, world.data.roster[liu], 'it is where the writer was standing');
    assert.match(object.state!, /燈下自照/, 'and it is actually readable');
    assert.equal(poem.propObjectId, objectId, 'the artifact remembers what it became');
    assert.equal(spawnPoemProp(world, poem), objectId, 'spawning twice does not litter the scene');
});

test('對外是內容: a press character\'s writing being printed IS a world event', () => {
    const world = seasonWorld();
    const fang = world.idByName('方競西')!; // 記者
    const liu = world.idByName('柳安春')!;  // 小生 — not press
    const asDiary = (characterId: string): DiaryArtifact => ({
        kind: 'diary', id: `d-${characterId}`, characterId, name: world.nameById(characterId),
        day: 2, body: '今日前街上的一樁事，記在這裡。', claims: [], unsupportedClaims: [], evidenceCount: 1,
    });

    const printed = circulateArtifact(world, asDiary(fang), { nowTick: 9 });
    assert.ok(printed, 'the reporter\'s copy reaches the street');
    assert.equal(printed!.visibility, 'public');
    assert.match(printed!.text, /見了報/);

    assert.equal(circulateArtifact(world, asDiary(liu), { nowTick: 9 }), undefined, 'a private diary stays private');
    assert.ok(circulateArtifact(world, asDiary(liu), { nowTick: 9, force: true }), 'unless somebody circulates it');
});

// ── 生命體徵 ─────────────────────────────────────────────────────────────────

test('場景熵: everyone in one room scores 0; spread out scores 1; nobody acting is distinguishable', () => {
    const spread = sceneEntropyOf([
        { characterId: 'a', text: '', sceneId: 's1' },
        { characterId: 'b', text: '', sceneId: 's2' },
        { characterId: 'c', text: '', sceneId: 's3' },
    ]);
    assert.equal(spread.entropy, 1);
    assert.equal(spread.crowdPeak, 1);

    const crowd = sceneEntropyOf([
        { characterId: 'a', text: '', sceneId: 's1' },
        { characterId: 'b', text: '', sceneId: 's1' },
        { characterId: 'c', text: '', sceneId: 's1' },
    ]);
    assert.equal(crowd.entropy, 0, 'the whole cast in one room is a collapsed tick');
    assert.equal(crowd.crowdPeak, 3);

    assert.equal(sceneEntropyOf([]).entropy, -1, 'a quiet tick is not a collapsed one');
});

test('收斂偵測 names the 糖粥 attractor: one errand in most of the cast\'s intentions at once', () => {
    // Reconstructed from the diagnosed run: eight of twelve 深宵 plans converged
    // on 「去前街食肆買碗糖粥」 while four people did something else.
    const samples = [
        ...Array.from({ length: 8 }, (_, i) => ({ characterId: `c${i}`, text: '去前街食肆買碗糖粥墊墊', sceneId: 's-street' })),
        { characterId: 'c8', text: '把那封信藏進妝閣的抽屜', sceneId: 's-dressing' },
        { characterId: 'c9', text: '在碼頭等一個不會來的人', sceneId: 's-wharf' },
        { characterId: 'c10', text: '對著鏡子把妝卸乾淨', sceneId: 's-dressing' },
        { characterId: 'c11', text: '翻那本記著名字的舊帳', sceneId: 's-attic' },
    ];

    const findings = convergenceOf(samples);

    assert.ok(findings.length > 0, 'the attractor is detected at all');
    assert.ok(findings.some((row) => row.token.includes('糖粥')), `「糖粥」 is named: ${findings.map((r) => r.token).join('、')}`);
    assert.equal(findings[0].count, 8, 'and the reach is reported honestly');

    // The control: twelve people whose intentions share no phrase converge on nothing.
    const distinct = [
        '藏信', '等船', '卸妝', '翻帳', '磨刀', '縫衣',
        '掃地', '點燈', '喂貓', '寫信', '賣花', '打水',
    ];
    const varied = samples.map((sample, i) => ({ ...sample, text: distinct[i] }));
    assert.deepEqual(convergenceOf(varied), []);
});

test('迴圈偵測: one character circling the same phrase across ticks is named', () => {
    const window = [0, 1, 2, 3].map((tick) => ({
        tick,
        samples: [
            { characterId: 'stuck', text: '還是要等月半結帳那一日', sceneId: 's1' },
            { characterId: 'moving', text: ['藏信', '等船', '卸妝', '翻帳'][tick], sceneId: 's2' },
        ],
    }));

    const loops = loopsOf(window);

    assert.equal(loops.length, 1, 'only the character who is actually stuck');
    assert.equal(loops[0].characterId, 'stuck');
    assert.ok(loops[0].ticks >= 3);
});

test('the rolling window is capped and survives being pushed the same tick twice', () => {
    const world = seasonWorld();
    for (let tick = 0; tick < VITALS_WINDOW_TICKS + 4; tick++) {
        pushVitalsWindow(world, { day: 1, tick, samples: [{ characterId: 'a', text: `第${tick}拍`, sceneId: 's1' }] });
    }
    assert.equal(world.data.vitalsWindow!.length, VITALS_WINDOW_TICKS);
    assert.equal(world.data.vitalsWindow![0].tick, 4, 'the oldest frames rolled off');

    const before = world.data.vitalsWindow!.length;
    pushVitalsWindow(world, { day: 1, tick: 5, samples: [{ characterId: 'a', text: '重寫這一拍', sceneId: 's1' }] });
    assert.equal(world.data.vitalsWindow!.length, before, 're-pushing a tick replaces it rather than duplicating');
});

test('computeTickVitals reports the heartbeat alongside the crowding', () => {
    const world = seasonWorld();
    const liu = world.idByName('柳安春')!;
    world.data.wants = [
        newWant({ id: 'r1', characterId: liu, layer: 'x', desc: 'a', weight: 0.5, sat: 0.5, resistance: 4, kind: 'narrative', source: 'genesis', bornTick: 0 }),
        newWant({ id: 'r2', characterId: liu, layer: 'x', desc: 'b', weight: 0.5, sat: 0.5, resistance: 4, kind: 'narrative', source: 'genesis', bornTick: 0 }),
    ];
    world.data.wants[0].retired = true;
    world.data.wants[0].resolutionCause = 'resolved';

    const vitals = computeTickVitals(world, {
        day: 2,
        tick: 7,
        samples: [{ characterId: liu, text: '把話說開了', sceneId: 's1' }],
        irreversible: 3,
        resolvedThisTick: 1,
    });

    assert.equal(vitals.irreversible, 3);
    assert.equal(vitals.resolvedThisTick, 1);
    assert.equal(vitals.wantsResolved, 1);
    assert.equal(vitals.wantsLive, 1);
    assert.equal(vitals.resolvedRate, 1);
    assert.equal(vitals.actorCount, 1);
});

test('contentTokens keeps content phrases and drops pure grammar', () => {
    const tokens = contentTokens('去前街食肆買碗糖粥');
    assert.ok(tokens.has('糖粥'));
    assert.ok(tokens.has('食肆'));
    assert.ok(!contentTokens('這個就是自己知道的').has('自己'), 'a stoplisted bigram never clusters');
    assert.equal(contentTokens('abc 123').size, 0, 'latin/ids are never clustered on');
});
