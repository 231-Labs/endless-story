import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPovSceneParagraphs, povParagraphs, stripPovTitle } from '../src/services/narrative-format/pov-paragraphs.ts';

test('one long POV block is deterministically shaped into four lossless paragraphs', () => {
    const raw = '晨光落上台板。江聞鶴揚聲道：「先走兩圈。」柳生春偏頭一笑。她沒有退。蘇映雪抱著手臂。連翹沉腰站穩。鑼聲還沒響。眾人都在等。';
    const shaped = formatPovSceneParagraphs(raw);
    assert.equal(povParagraphs(shaped).length, 4);
    assert.equal(shaped.replace(/\n/g, ''), raw);
    assert.match(shaped, /「先走兩圈。」/);
});

test('an already structured POV is preserved', () => {
    const raw = '第一段。\n\n第二段。\n\n第三段。';
    assert.equal(formatPovSceneParagraphs(raw), raw);
});

test('short prose is not split into fragmentary paragraphs', () => {
    const raw = '她接過茶。只說了一聲好。';
    assert.equal(formatPovSceneParagraphs(raw), raw);
});

test('stripPovTitle removes a leading markdown 場景題 heading', () => {
    const raw = '# 場景題：雪夜對唱\n\n晨光落上台板。我立在台口。';
    assert.equal(stripPovTitle(raw), '晨光落上台板。我立在台口。');
});

test('stripPovTitle removes a leading 「第X回」 chapter line (and a stacked heading)', () => {
    assert.equal(stripPovTitle('第三回：樟木戲箱\n\n我推開了戲箱。'), '我推開了戲箱。');
    assert.equal(stripPovTitle('# 第三回　樟木戲箱\n\n我推開了戲箱。'), '我推開了戲箱。');
    assert.equal(stripPovTitle('第一回\n我立在台口，看鑼未響。'), '我立在台口，看鑼未響。');
});

test('stripPovTitle leaves title-free prose untouched — even a sentence that opens with 第X回 as "a time"', () => {
    const prose = '第三回想起那年的雪時，我才明白她為何不退。台板還涼著。';
    assert.equal(stripPovTitle(prose), prose);
    const plain = '晨光落上台板。江聞鶴揚聲道：「先走兩圈。」';
    assert.equal(stripPovTitle(plain), plain);
});

test('a POV body that arrives with a heading no longer starts with # or 第X回 after shaping', () => {
    const raw = '# 第七回　雪夜\n\n晨光落上台板。我立在台口。她沒有退。鑼聲還沒響。';
    const body = formatPovSceneParagraphs(stripPovTitle(raw));
    assert.ok(!body.startsWith('#'), 'no markdown heading survives');
    assert.ok(!/^第[〇零一二三四五六七八九十百千兩两0-9]+[回折]/.test(body), 'no 第X回 heading survives');
    assert.match(body, /晨光落上台板/);
});
