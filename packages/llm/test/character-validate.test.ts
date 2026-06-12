// Phase 0 regression (NARRATIVE_AGENTS.md §12.0): the candidate validator must
// catch the three real-world failures seen at mint time —
//   1. high-筋骨 characters written frail (扶牆喘息 / body=孱弱)
//   2. gender drift (柳生春 written as 他 while physicalFacts says 女)
//   3. unprompted dark secrets (殺人/仇家/血債 the player never asked for)
// — and stay silent on clean candidates (no false positives).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCharacterCandidate,
  inferGenderFromPlayerPrompt,
  buildCharacterRepairMessage,
} from '../src/prompts/character-validate.ts';
import type { CharacterCandidate, RolledAttribute } from '../src/prompts/character.ts';

const SCHEMA = [
  { key: 'appearance', label: '外貌', min: 0, max: 100 },
  { key: 'constitution', label: '筋骨', min: 0, max: 100 },
  { key: 'acuity', label: '機敏', min: 0, max: 100 },
  { key: 'disposition', label: '心性', min: 0, max: 100 },
];

function rolled(constitution: number): RolledAttribute[] {
  return [
    { key: 'appearance', label: '外貌', value: 70 },
    { key: 'constitution', label: '筋骨', value: constitution },
    { key: 'acuity', label: '機敏', value: 60 },
    { key: 'disposition', label: '心性', value: 50 },
  ];
}

function candidate(over: {
  description?: string;
  secret?: string;
  gender?: string;
  body?: string;
  constitution?: number;
}): CharacterCandidate {
  return {
    name: '柳生春',
    description: over.description ?? '外地來的女小生，台上英氣，台下話少，總把一枚舊銅錢縫在袖口。',
    secret: over.secret ?? '',
    physicalFacts: {
      gender: over.gender ?? '女',
      age: 27,
      body: over.body ?? '勻稱',
    },
    attributes: rolled(over.constitution ?? 70),
  };
}

const CLEAN_PROMPT = '一位外地來的女小生，台上英氣逼人，台下沉默寡言。';

// —— 筋骨 ↔ 弱體描寫 ——————————————————————————————————

test('高筋骨 + 扶牆喘息弱體描寫 → frail_prose_high_constitution', () => {
  const v = validateCharacterCandidate(
    candidate({
      constitution: 72,
      description: '她身子骨弱，稍重的行頭便壓得她氣喘，常要扶牆歇息。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'frail_prose_high_constitution'), JSON.stringify(v));
});

test('低筋骨 + 弱體描寫 → 不違規（對位正確）', () => {
  const v = validateCharacterCandidate(
    candidate({
      constitution: 25,
      body: '孱弱',
      description: '她身子骨弱，稍重的行頭便壓得她氣喘，常要扶牆歇息。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.equal(v.length, 0, JSON.stringify(v));
});

test('高筋骨 + body=孱弱 → body_vs_constitution', () => {
  const v = validateCharacterCandidate(
    candidate({ constitution: 80, body: '孱弱' }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'body_vs_constitution'), JSON.stringify(v));
});

test('低筋骨 + body=粗壯 → body_vs_constitution', () => {
  const v = validateCharacterCandidate(
    candidate({ constitution: 20, body: '粗壯' }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'body_vs_constitution'), JSON.stringify(v));
});

test('低筋骨 + 虎背熊腰 → mighty_prose_low_constitution', () => {
  const v = validateCharacterCandidate(
    candidate({ constitution: 20, description: '生得虎背熊腰，臂力過人，一人能扛兩箱行頭。' }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'mighty_prose_low_constitution'), JSON.stringify(v));
});

// —— 人稱 ↔ gender ————————————————————————————————————

test('gender=女 但全文用「他」 → pronoun_gender_mismatch', () => {
  const v = validateCharacterCandidate(
    candidate({
      description: '他自外地來，戲台上他最是英氣，台下卻寡言。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'pronoun_gender_mismatch'), JSON.stringify(v));
});

test('「其他/他鄉」等複合詞不算男性人稱（無誤報）', () => {
  const v = validateCharacterCandidate(
    candidate({
      description: '她自他鄉而來，與其他角兒不同，她台上英氣台下溫吞。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.equal(v.length, 0, JSON.stringify(v));
});

test('玩家原文明寫女性、候選 gender=男 → player_gender_mismatch', () => {
  const v = validateCharacterCandidate(
    candidate({ gender: '男', description: '他自外地來，台上英氣，台下寡言。' }),
    { userPrompt: '她是一位女小生，台上英氣逼人。', schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'player_gender_mismatch'), JSON.stringify(v));
});

test('有 requiredGender 時不做玩家原文性別推斷', () => {
  const v = validateCharacterCandidate(
    candidate({ gender: '男', description: '他自外地來，台上英氣，台下寡言。' }),
    { userPrompt: '她是一位女小生。', requiredGender: '男', schemaKeys: SCHEMA },
  );
  assert.ok(!v.some((x) => x.code === 'player_gender_mismatch'), JSON.stringify(v));
});

// —— 暗黑橋段 ——————————————————————————————————————

test('玩家沒寫、secret 卻有仇家追殺 → unprompted_dark_secret', () => {
  const v = validateCharacterCandidate(
    candidate({
      secret: '她當年為了還賭債頂替人殺人，至今仇家追殺不止。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.some((x) => x.code === 'unprompted_dark_secret'), JSON.stringify(v));
});

test('玩家自己寫了復仇 → 暗黑橋段放行', () => {
  const v = validateCharacterCandidate(
    candidate({ secret: '她進班是為了向當年滅她家門的仇家復仇。' }),
    { userPrompt: '她背負血海深仇，進戲班是為了復仇。', schemaKeys: SCHEMA },
  );
  assert.ok(!v.some((x) => x.code === 'unprompted_dark_secret'), JSON.stringify(v));
});

test('正常心事 secret → 不違規', () => {
  const v = validateCharacterCandidate(
    candidate({
      secret: '她每月把一半工錢寄回鄉下，信裡卻寫自己在城裡過得風光。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.equal(v.length, 0, JSON.stringify(v));
});

// —— 乾淨候選 / 修復訊息 ————————————————————————————————

test('乾淨候選 → 零違規', () => {
  const v = validateCharacterCandidate(candidate({}), {
    userPrompt: CLEAN_PROMPT,
    schemaKeys: SCHEMA,
  });
  assert.equal(v.length, 0, JSON.stringify(v));
});

test('inferGenderFromPlayerPrompt：保守推斷', () => {
  assert.equal(inferGenderFromPlayerPrompt('她是位女小生。'), '女');
  assert.equal(inferGenderFromPlayerPrompt('一個少年郎，他初入戲班。'), '男');
  // 混合線索 → 不推斷
  assert.equal(inferGenderFromPlayerPrompt('她的師父待他如親生。'), null);
  // 無線索 → 不推斷
  assert.equal(inferGenderFromPlayerPrompt('一位武生，戲路極寬。'), null);
});

test('修復訊息含全部違規 + JSON 格式要求', () => {
  const v = validateCharacterCandidate(
    candidate({
      constitution: 72,
      body: '孱弱',
      description: '他身子骨弱，常扶牆喘息。',
      secret: '他殺人抵債，被仇家追殺。',
    }),
    { userPrompt: CLEAN_PROMPT, schemaKeys: SCHEMA },
  );
  assert.ok(v.length >= 3, JSON.stringify(v));
  const msg = buildCharacterRepairMessage(v);
  for (const item of v) assert.ok(msg.includes(item.message));
  assert.match(msg, /只輸出 JSON 物件/);
});
