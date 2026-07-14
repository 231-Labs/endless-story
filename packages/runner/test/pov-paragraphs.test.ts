import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPovSceneParagraphs, povParagraphs } from '../src/services/narrative-format/pov-paragraphs.ts';

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
