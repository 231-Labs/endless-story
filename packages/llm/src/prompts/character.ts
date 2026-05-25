/**
 * Character candidate generation — given a rolled attribute set + saga context,
 * ask the LLM to write 1 character whose narrative MATCHES the rolled values.
 *
 * **Phase 2 抽卡 model: always 1 candidate per voucher.** No "pick from 3" —
 * one roll, one result. See AGENTS.md「下次接班」設計拍板.
 *
 * Values are LOCKED — rolled deterministically from voucher.attribute_seed
 * (see `seed/roll.ts`) before this is called. The LLM only writes the
 * narrative; it never picks numbers. This is the fairness backbone.
 */

import type { ChatMessage } from '../text/types.js';
import type { BuildPromptResult } from './moderation.js';

/** Schema definition for one chain attribute axis. */
export interface AttributeKey {
  /** Stable identifier (e.g. 'appearance'). */
  key: string;
  /** Display label (e.g. '外貌'). */
  label: string;
  min: number;
  max: number;
}

/** One rolled attribute value, locked before LLM call. */
export interface RolledAttribute {
  key: string;
  label: string;
  value: number;
}

export interface CharacterCandidate {
  name: string;
  description: string;
  physicalFacts: {
    /** Free text: '男' / '女' / '中性' / ... */
    gender: string;
    /** Integer years. */
    age: number;
    /** Free text: '瘦削' / '豐潤' / '粗壯' / '孱弱' / '勻稱' */
    body: string;
  };
  /** Server-locked rolled values; LLM cannot edit. */
  attributes: RolledAttribute[];
}

export interface BuildCharacterGenPromptOptions {
  /** Player-written character intent (already moderated). */
  userPrompt: string;
  /** Saga's role-intent text from the Recruitment (off-chain). */
  recruitmentIntent?: string;
  /** Existing character names in the saga — avoid duplicates. */
  castNames?: string[];
  /** Atmosphere tags for narrative tone. */
  storyTags?: string[];
  /** Chain-side schema (`world.rules.attribute_definitions`). */
  schemaKeys: AttributeKey[];
  /** Server-rolled values (one per schemaKey, in same order). */
  rolledValues: RolledAttribute[];
}

export function buildCharacterGenPrompt(
  opts: BuildCharacterGenPromptOptions,
): BuildPromptResult {
  const intent = opts.recruitmentIntent?.trim() || '（無 — 請自由發揮）';
  const tagLine =
    opts.storyTags && opts.storyTags.length > 0
      ? opts.storyTags.join('、')
      : '江湖、戲班、夜戲';
  const castLine =
    opts.castNames && opts.castNames.length > 0
      ? opts.castNames.join('、')
      : '蕭夜蘭、沈輕雪、葉嫿、柳生春';

  const rolledLine = opts.rolledValues
    .map((t) => `${t.label}=${t.value}`)
    .join('，');
  const rangeLine = opts.schemaKeys
    .map((s) => `${s.label} ${s.min}-${s.max}`)
    .join(' · ');

  const userText = `你是「無盡故事」的說書人。當前的 saga 發了一則徵召公告，說明這個故事**需要一個怎樣定位**的角色（在敘事中佔什麼位置、能製造什麼樣的張力）。玩家接著寫下了**自己想扮演的角色背景與個性**。

你的任務：**在 saga 的敘事需要範圍內 + 在已擲好的數值範圍內**，依玩家的角色設定擬 1 個對位候選。這個候選應該：
- 完整實現玩家寫下的角色核心意象
- 同時填得進 saga 公告所說的「位置」與「定位」
- **精確對應已擲的數值**

如果玩家設定與 saga 公告有明顯衝突（例如公告要小旦但玩家寫了一個老和尚），請優先保留玩家設定的核心意象，把 saga 公告當成可以變通的氛圍指引。

【saga 公告 · 此角色在故事中該佔的位置】
${intent}

【玩家設定 · 此角色的背景與個性】
"""
${opts.userPrompt}
"""

【現有角色名單，不可重名】
${castLine}

【故事氛圍標籤】
${tagLine}

【已擲出的天賦數值（**鎖死、不可改**）】
${rolledLine}

值域：${rangeLine}。值高代表該軸強、值低代表弱。
**敘事必須讓讀者從文字裡讀得出這組數值的高低分佈**：
- 例如「機敏=85」要在描述裡出現靈巧、反應快、看人準的細節
- 例如「筋骨=20」要顯出體弱、勞作易喘、肩窄等具體痕跡
- 絕不可把高值寫成弱、低值寫成強

請設計：
1. name：2-4 字中文名，不與現有名單重複
2. description：100-160 字人物敘述（出身 / 性格 / 行事風格 / 顯眼外貌 / 一條可被人捕捉的執念或缺陷）—— **必須讓讀者從敘述裡讀得出該候選的數值高低**
3. physicalFacts：{ gender ("男" / "女" / "中性"), age (年齡，整數), body ("瘦削" / "豐潤" / "粗壯" / "孱弱" / "勻稱" 擇一) }——體型應與「筋骨」軸對位（若有此 key）

**不要在 JSON 裡寫 attributes 或 innateTraits**：數值已鎖死，server 會直接 attach。

要求：
- 忠於玩家描述的核心意象
- 不寫成全能主角；該有可被故事咬住的弱點或執念
- 繁體中文

只輸出 JSON 物件，不要任何前綴或解釋：
{"name": "...", "description": "...", "physicalFacts": {"gender":"...","age":..,"body":"..."}}`;

  return {
    messages: [{ role: 'user', content: userText }],
    maxTokens: 2400,
  };
}

const VALID_GENDERS = new Set(['男', '女', '中性']);
const VALID_BODIES = new Set(['瘦削', '豐潤', '粗壯', '孱弱', '勻稱']);

/**
 * Parse LLM output into a `CharacterCandidate`. Attaches the server-locked
 * `rolledValues` directly — caller does NOT need to merge.
 *
 * Returns `null` on parse failure; caller should retry or fail loud.
 */
export function parseCharacterCandidate(
  text: string,
  rolledValues: RolledAttribute[],
): CharacterCandidate | null {
  // Grab the first `{ ... }` (greedy to end of last `}`).
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  if (!name || !description) return null;

  const pf = (obj.physicalFacts ?? obj.physical_facts) as Record<string, unknown> | undefined;
  const rawGender = typeof pf?.gender === 'string' ? pf.gender.trim() : '中性';
  const gender = VALID_GENDERS.has(rawGender) ? rawGender : '中性';

  const ageRaw = pf?.age;
  const ageNum =
    typeof ageRaw === 'number'
      ? ageRaw
      : typeof ageRaw === 'string'
        ? Number(ageRaw)
        : NaN;
  const age = Number.isFinite(ageNum) ? Math.max(0, Math.round(ageNum)) : 25;

  const rawBody = typeof pf?.body === 'string' ? pf.body.trim() : '勻稱';
  const body = VALID_BODIES.has(rawBody) ? rawBody : '勻稱';

  return {
    name,
    description,
    physicalFacts: { gender, age, body },
    attributes: rolledValues,
  };
}
