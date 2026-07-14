/**
 * MIND-WORLD PHYSICS — one test per perception rule, each seeded from a REAL
 * defect observed in season runs (regression suite, not hypotheticals).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mentionsItem,
    parseGiftNarration,
    parseGiftField,
    parseWhisper,
    parseDoorIntent,
    sightingPairs,
    SceneFeed,
    type Move,
} from '../experiments/mind-world/physics.ts';

// ── hearing: the S3 「師姐問話被當沒聽到」 regression ──────────────────────
test('scene feed: a direct address two seats away reaches the addressee on her next turn', () => {
    const feed = new SceneFeed();
    // order 柳 → 蘇 → 方 → 沈 → 裴 → 杜, as in S3 day-2 晡時
    feed.push('柳生春', '柳生春（開扇試氣口）');
    feed.push('蘇映雪', '蘇映雪說：「你前夜去了哪裡？」（按下她的扇子）');
    feed.push('方競西', '方競西（鋼筆懸著）');
    feed.push('沈雪笙', '沈雪笙（擋在視線之間）');
    feed.push('裴硯樵', '裴硯樵（拉了個慢過門）');
    feed.push('杜三通', '杜三通（鼓箭子畫圈）');
    const heardByLiu = feed.unseen('柳生春');
    assert.match(heardByLiu, /你前夜去了哪裡/, '蘇映雪的質問必須抵達柳生春');
    assert.match(heardByLiu, /鼓箭子/, '同場其他動靜也要一併抵達');
    assert.doesNotMatch(heardByLiu, /開扇試氣口/, '自己的行動不迴聲');
});

test('scene feed: departure stops hearing at the door; flush delivers the rest', () => {
    const feed = new SceneFeed();
    feed.push('甲', '甲說：「我先走了。」（起身）');
    feed.markDeparted('甲');
    feed.push('乙', '乙說：「背後說他兩句。」（撇嘴）');
    assert.doesNotMatch(feed.flush('甲'), /背後說他/, '離場者聽不見身後的話');
    assert.match(feed.flush('乙') + feed.unseen('乙'), /^/, 'no throw');
});

test('scene feed: cursor advances — nothing is delivered twice', () => {
    const feed = new SceneFeed();
    feed.push('甲', '甲（做了一件事）');
    assert.match(feed.unseen('乙'), /一件事/);
    assert.equal(feed.unseen('乙'), '', '第二次索取不得重複投遞');
});

// ── gifts: the S3 keyring false-positive regression ───────────────────────
test('gift narration: boxes-given-to-X plus keys elsewhere must NOT hand over the keys', () => {
    const carried = ['一串衣箱鑰匙（春雪社全部行頭家當都在這串鑰匙底下）'];
    const text = '唐桂蘭將旁的箱子交給連翹幫忙抬出，自己從腰間解下那串鑰匙，將那把鑰匙擱在箱蓋正中，退開半步站定。';
    assert.equal(parseGiftNarration(text, carried, ['連翹', '沈雪笙']), null);
});

test('gift narration: a real handover parses, with the receiver from the same clause', () => {
    const carried = ['湘妃竹對扇・情債柄（先師遺物）'];
    const g = parseGiftNarration('柳生春將那柄湘妃竹摺扇留給金鳳，轉身出門。', carried, ['金鳳', '蘇映雪']);
    assert.ok(g);
    assert.equal(g.itemIdx, 0);
    assert.equal(g.receiverName, '金鳳');
});

test('gift field: explicit 贈 resolves item and receiver', () => {
    const g = parseGiftField('摺扇｜金鳳', ['湘妃竹對扇・情債柄'], ['金鳳']);
    assert.ok(g);
    assert.equal(g.itemIdx, 0);
    assert.equal(g.receiverName, '金鳳');
});

// ── whispers ───────────────────────────────────────────────────────────────
test('whisper: target resolves among the co-present only', () => {
    const w = parseWhisper('桂蘭｜那件戲衣是我放進去的。', ['唐桂蘭', '柳生春']);
    assert.ok(w);
    assert.equal(w.targetName, '唐桂蘭');
    assert.equal(parseWhisper('白蘭｜想你。', ['唐桂蘭']), null, '不在場的人聽不見耳語');
});

// ── doors ──────────────────────────────────────────────────────────────────
test('door: bolting and opening parse from narration', () => {
    assert.equal(parseDoorIntent('她閉門落閂，吹熄了燈。'), 'lock');
    assert.equal(parseDoorIntent('她起身拔閂開門。'), 'unlock');
    assert.equal(parseDoorIntent('她坐在窗邊發怔。'), null);
});

// ── sightings: same-destination and disjoint-route regressions ────────────
const mv = (name: string, fromCluster: string, toCluster: string, to: string): Move => ({ name, fromCluster, toCluster, to });

test('sightings: converging on the same venue is a meeting, not a crossing', () => {
    const pairs = sightingPairs([mv('甲', '城南', '戲園', '雲錦台戲台'), mv('乙', '城北', '戲園', '雲錦台戲台')]);
    assert.equal(pairs.length, 0);
});

test('sightings: disjoint routes never cross', () => {
    const pairs = sightingPairs([mv('甲', '城南', '城南', '沈宅小樓'), mv('乙', '城北', '城北', '報館後閣')]);
    assert.equal(pairs.length, 0, '路線 cluster 無交集＝城市另一頭，不該相遇');
});

test('sightings: overlapping routes to different venues cross', () => {
    const pairs = sightingPairs([mv('甲', '戲園', '城北', '會樂里寓所'), mv('乙', '城北', '戲園', '雲錦台戲台')]);
    assert.equal(pairs.length, 1);
});

// ── items ──────────────────────────────────────────────────────────────────
test('mentionsItem: parenthetical provenance never matches', () => {
    assert.equal(mentionsItem('她把懷錶收好', '一只停擺的舊懷錶（白蘭之物）'), true);
    assert.equal(mentionsItem('白蘭的舊事', '一只停擺的舊懷錶（白蘭之物）'), false);
});
