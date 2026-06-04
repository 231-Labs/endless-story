// Regression: attribute SCORES must never leak into the public NFT description.
//
// At mint, the candidate-generation LLM is GIVEN the rolled axis scores (外貌 /
// 筋骨 / 機敏 / 心性) only to judge the character's strength — it must convey them
// through prose, never print the numbers. `parseCharacterCandidate` enforces this
// with `stripAttributeScoreLeaks` (added in b9b76e7). A real legacy character,
// 柳生春, was minted BEFORE that guard and had the four numbers baked into the
// prose as （外貌88）（筋骨39）（機敏99）（心性34）. These tests pin the stripper so
// the leak can never come back — and so the cleanup never mangles clean prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCharacterCandidate } from '../src/prompts/character.ts';

/** any axis term immediately followed by a number (the forbidden shape). */
const AXIS_NUM = /(外貌|筋骨|機敏|心性|appearance|constitution|acuity|disposition)\s*[=:：]?\s*\d/iu;
/** any (…digits…) parenthetical — a score dressed up in parens. */
const PAREN_NUM = /[（(][^（）()]*\d[^（）()]*[）)]/u;

function parse(description: string) {
  const json = JSON.stringify({
    name: '柳生春',
    description,
    physicalFacts: { gender: '女', age: 27, body: '瘦削' },
  });
  return parseCharacterCandidate(json, []);
}

test('strips the real 柳生春 leak: （外貌88）（筋骨39）（機敏99）（心性34）', () => {
  const out = parse(
    '眉眼如畫，風流倜儻，那張讓女學生痴迷的臉龐（外貌88）全是天賦。生得單薄，肩窄如削，' +
      '稍重的行頭便壓得她氣喘（筋骨39）。但她心眼靈動極了，機變百出（機敏99），總能替人圓場。' +
      '內裡卻是個怕散的軟骨頭，毫無主見（心性34）。',
  );
  assert.ok(out, 'candidate should parse');
  assert.doesNotMatch(out.description, AXIS_NUM);
  assert.doesNotMatch(out.description, /（外貌88）|（筋骨39）|（機敏99）|（心性34）/u);
  // the surrounding prose must survive untouched
  assert.match(out.description, /風流倜儻/);
  assert.match(out.description, /機變百出/);
  assert.match(out.description, /毫無主見/);
});

test('strips separator variants: 外貌=88 / 筋骨：39 / 機敏 99 / 心性34', () => {
  const out = parse('她外貌=88，筋骨：39，反應機敏 99，但心性34，終究是個軟骨頭。');
  assert.ok(out);
  assert.doesNotMatch(out.description, AXIS_NUM);
  assert.match(out.description, /軟骨頭/);
});

test('strips reversed inline (88分機敏) and half-width parens ((appearance 90))', () => {
  const out = parse('傳聞她有88分機敏，旁人說 (appearance 90) 也不為過，倒是真有幾分本事。');
  assert.ok(out);
  assert.doesNotMatch(out.description, AXIS_NUM);
  assert.doesNotMatch(out.description, PAREN_NUM);
  assert.match(out.description, /幾分本事/);
});

test('clean prose with no scores passes through unchanged (no false positives)', () => {
  const clean = '眉眼如畫，風流倜儻，心眼靈動，總能替人圓場，卻是個沒主見的軟骨頭。';
  const out = parse(clean);
  assert.ok(out);
  assert.equal(out.description, clean);
});

test('axis WORDS without numbers are allowed (only numbers are forbidden)', () => {
  const out = parse('她機敏過人，心性卻軟，外貌出眾，筋骨偏弱。');
  assert.ok(out);
  // nothing stripped — the words convey the traits, which is the whole point
  assert.match(out.description, /機敏過人/);
  assert.match(out.description, /筋骨偏弱/);
  assert.doesNotMatch(out.description, AXIS_NUM);
});
