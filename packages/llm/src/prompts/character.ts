/**
 * Character candidate generation — given a rolled attribute set + saga context,
 * ask the LLM to write 1 character whose narrative MATCHES the rolled values.
 *
 * **Phase 2 gacha model: always 1 candidate per voucher.** No "pick from 3" —
 * one roll, one result. See the design decisions in AGENTS.md.
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
  /** Public blurb — shown + written on-chain. Must NOT reveal `secret`. */
  description: string;
  /**
   * The character's private inner backstory — what they keep to themselves
   * (the real reason behind the public facade). NEVER written on-chain or
   * displayed; carried only to genesis-memory seeding so it surfaces as
   * private recalled memories. '' when the player wrote no hidden layer.
   */
  secret: string;
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
  /**
   * Hard gender requirement from the recruitment (`genderRequirement`). When set,
   * the prompt instructs the LLM that the candidate's gender MUST be this — the
   * dice only roll the 4 attributes, so gender is otherwise the LLM's free choice
   * and a wrong pick fails `check_voucher_requirements` on chain.
   */
  requiredGender?: '男' | '女';
}

type AxisBand = 'high' | 'mid' | 'low';

function axisBand(value: number, min: number, max: number): AxisBand {
  const span = max - min || 1;
  const t = (value - min) / span;
  if (t >= 0.65) return 'high';
  if (t < 0.35) return 'low';
  return 'mid';
}

/**
 * Per-axis, per-band prose guidance. The old prompt showed a single static
 * example pair (「機敏高 / 筋骨低」) — models anchored on the only somatic
 * vocabulary present (扶牆、易喘) and wrote every character frail regardless
 * of the actual roll. Guidance is now derived from the rolled value itself.
 */
const AXIS_GUIDANCE: Record<string, Record<AxisBand, string>> = {
  constitution: {
    high: '筋骨結實耐勞——扛重不喘、台步穩、腕上有力。**嚴禁**出現扶牆喘息、身子骨弱、體弱易病這類弱體描寫',
    mid: '尋常體格，不渲染強弱——既不寫病弱也不寫神力',
    low: '勞作易喘、肩窄、久站後會扶一扶桌沿',
  },
  appearance: {
    high: '容貌出眾，旁人會多看兩眼、記得住',
    mid: '相貌尋常，不必著墨美醜',
    low: '相貌平平或帶一處不討喜的痕跡（疤、痘、塌鼻……擇一即可）',
  },
  acuity: {
    high: '反應快、看人準，能從兩句寒暄裡聽出對方真正要價',
    mid: '不遲鈍也不出奇，尋常心思',
    low: '慢半拍、聽不出弦外之音，常要旁人點破',
  },
  disposition: {
    high: '有主見、壓得住事，認定的事不輕易動搖',
    mid: '尋常心性，會猶豫也會拿主意',
    low: '沒主見、易動搖，怕事或耳根軟',
  },
};

function buildAxisGuidanceLines(
  rolled: RolledAttribute[],
  schema: AttributeKey[],
): string {
  const bandLabel: Record<AxisBand, string> = {
    high: '偏高',
    mid: '中段',
    low: '偏低',
  };
  return rolled
    .map((attr) => {
      const def = schema.find((s) => s.key === attr.key);
      const band = axisBand(attr.value, def?.min ?? 0, def?.max ?? 100);
      const guide =
        AXIS_GUIDANCE[attr.key]?.[band] ??
        (band === 'high'
          ? `把「${attr.label}」寫成明顯偏強`
          : band === 'low'
            ? `把「${attr.label}」寫成明顯偏弱`
            : `「${attr.label}」尋常即可，不渲染強弱`);
      return `- ${attr.label}=${attr.value}（${bandLabel[band]}）：${guide}`;
    })
    .join('\n');
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
  const genderRule = opts.requiredGender
    ? `\n\n【性別 · 硬性要求,不可違反】此徵召只收「${opts.requiredGender}」。physicalFacts.gender **必須**為「${opts.requiredGender}」—— 這是鏈上會驗的硬條件,違反則整張角色作廢。description 與 secret 也必須全篇符合此性別,不可把角色寫成另一性別。`
    : `\n\n【性別 · 從玩家原文鎖定】先讀玩家原文判斷性別:若原文出現「她」、姑娘、女子、坤生、女小生等線索,gender 必須為「女」;出現「他」、少年、漢子、兒郎等線索則為「男」。**原文完全未透露才可自行選擇。**選定後 description、secret 全篇人稱與 physicalFacts.gender 一致,不可中途改稱。`;
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
"""${genderRule}

【現有角色名單，不可重名】
${castLine}

【故事氛圍標籤】
${tagLine}

【已擲出的天賦數值（**鎖死、不可改**）】
${rolledLine}

值域：${rangeLine}。值高代表該軸強、值低代表弱。
**這些分數只供你判斷角色強弱，不得出現在候選 JSON 的任何文字欄位。**
**敘事必須讓讀者從具體行為、身體痕跡、語氣和社交反應裡讀得出高低分佈。本次擲值的逐軸要求**：
${buildAxisGuidanceLines(opts.rolledValues, opts.schemaKeys)}
- 絕不可把高值寫成弱、低值寫成強；中段就寫尋常，不渲染強弱
- 絕不可在 description 直接寫出「外貌88」「筋骨 39」「機敏=99」「心性34」這類屬性名、阿拉伯數字、括號評分或分數評語

請設計：
1. name：2-4 字中文名，不與現有名單重複
2. description（**公開**）：100-160 字人物敘述（出身 / 性格 / 行事風格 / 顯眼外貌 / 一條可被人捕捉的執念或缺陷）—— **必須讓讀者從敘述裡讀得出該候選的數值高低，但不能報出分數、屬性名或括號評分**。這段會公開顯示並上鏈，**絕不可洩漏 secret 的內容**，只寫對外說得出口的版本。
3. secret（**不公開**）：這名角色「放在心裡、對外絕不明說」的那一層 —— 公開門面背後的真正緣由（隱痛、心結、未癒的情、不可告人的因果）。
   · 若玩家描述裡寫了「沒人知道 / 其實 / 心底 / 不曾對人說」之類的隱情，**務必收進 secret，並從 description 抹去**；description 只留公開版本。
   · 玩家若沒寫隱情，你可依人設**合理補一段**不外顯的心事（不得與 description 矛盾），但調性應是正常人會藏著的心事，不是狗血慘案。
   · 80-200 字，要具體（有對象、有事件、有那一刻），它日後會化成此角色的私密記憶。沒有可寫就給空字串 ""。
4. physicalFacts：{ gender ("男" / "女" / "中性"), age (年齡，整數), body ("瘦削" / "豐潤" / "粗壯" / "孱弱" / "勻稱" 擇一) }——body **必須與「筋骨」擲值對位**：筋骨偏高 → 瘦削/勻稱/粗壯（**禁「孱弱」**）；筋骨偏低 → 瘦削/孱弱/豐潤（禁「粗壯」）；中段 → 除「孱弱」「粗壯」外皆可${opts.requiredGender ? `；**gender 必須為「${opts.requiredGender}」(徵召硬性要求,不可改)**` : ''}

【性別 / 行當一致性 · 很重要】
- 「女小生 / 坤生 / 女武生」= **女性演員扮小生或武生**,角色性別仍是女,文本用「她」的生命經驗;不可寫成男性,不可讓她被當作男角本人。
- 「小生」若徵召要求為女,就是女小生/坤生;若徵召要求為男,才可寫男小生或乾生。
- 不要因「小生」「公子」「男裝」就改掉 physicalFacts.gender;台上扮相和台下性別要分清。
- description、secret、physicalFacts.gender 必須互相一致;不要同一段裡一會兒「他」一會兒「她」。

【secret 調性邊界 · 避免狗血黑暗】
- secret 應偏向:未說出口的感情、利益算計、唱片合約壓力、師承心結、身體隱疾、怕被取代、欠一份人情、對行當身份的矛盾、家庭責任、舊班未了的名聲或契約。
- **不要自動生成**仇家追殺、黑幫追殺、殺人滅口、重傷垂死、被賣、強迫賣身、血債、性暴力、虐待、滅門、綁架、復仇等重口橋段;除非玩家明確寫了這些。
- 若涉及「粉戲 / 煙花地 / 風月場」等語境,把它寫成民初梨園邊緣生計、名聲與合約壓力,不要加羞辱、獵奇、暴力或道德審判。
- 角色可以精明、有刺、有自保,但不要每個秘密都變成犯罪片或苦情戲。
- 調性正確的例子(供把握分寸,不要照抄):
  · 「臨行前夜師姐塞給她的那支銀簪,她至今不敢戴——怕一戴上,就承認自己再也回不去了。」
  · 「班主以為他識字,其實戲本全靠耳朵硬背;他夜裡對著油燈描字,最怕哪天被叫去念一齣新戲。」
  · 「她每月把一半工錢寄回鄉下,信裡卻寫自己在城裡過得風光,連口脂都是法國貨。」

**不要在 JSON 裡寫 attributes、innateTraits 或任何分數文字**：數值已鎖死，server 會直接 attach。

要求：
- 忠於玩家描述的核心意象
- 不寫成全能主角；該有可被故事咬住的弱點或執念
- 繁體中文

只輸出 JSON 物件，不要任何前綴或解釋：
{"name": "...", "description": "...", "secret": "...", "physicalFacts": {"gender":"...","age":..,"body":"..."}}`;

  return {
    messages: [{ role: 'user', content: userText }],
    maxTokens: 2400,
  };
}

const VALID_GENDERS = new Set(['男', '女', '中性']);
const VALID_BODIES = new Set(['瘦削', '豐潤', '粗壯', '孱弱', '勻稱']);
const DEFAULT_ATTRIBUTE_SCORE_TERMS = [
  '外貌',
  '筋骨',
  '機敏',
  '心性',
  'appearance',
  'constitution',
  'acuity',
  'disposition',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCandidateGender(raw: string): '男' | '女' | '中性' {
  const value = raw.trim().toLowerCase();
  if (value === 'female' || raw.includes('女')) return '女';
  if (value === 'male' || raw.includes('男')) return '男';
  if (value === 'neutral' || value === 'other' || raw.includes('中性')) return '中性';
  return VALID_GENDERS.has(raw) ? (raw as '男' | '女' | '中性') : '中性';
}

function stripAttributeScoreLeaks(input: string, rolledValues: RolledAttribute[]): string {
  const terms = Array.from(
    new Set(
      [
        ...DEFAULT_ATTRIBUTE_SCORE_TERMS,
        ...rolledValues.flatMap((attr) => [attr.label, attr.key]),
      ]
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
  const axisPattern = terms.map(escapeRegExp).join('|');
  if (!axisPattern) return input.trim();

  const parenScoreLeak = new RegExp(
    `[（(][^（）()\\n]*(?:${axisPattern})(?:\\s*(?:分數|數值|值))?\\s*[=:：]?\\s*\\d{1,3}(?:\\s*/\\s*100)?[^（）()\\n]*[）)]`,
    'giu',
  );
  const inlineScoreLeak = new RegExp(
    `(?:${axisPattern})(?:\\s*(?:分數|數值|值))?\\s*[=:：]?\\s*\\d{1,3}(?:\\s*/\\s*100)?`,
    'giu',
  );
  const reversedInlineScoreLeak = new RegExp(
    `\\d{1,3}(?:\\s*/\\s*100)?\\s*(?:分)?\\s*(?:${axisPattern})`,
    'giu',
  );

  return input
    .replace(parenScoreLeak, '')
    .replace(inlineScoreLeak, '')
    .replace(reversedInlineScoreLeak, '')
    .replace(/[（(]\s*[）)]/g, '')
    .replace(/\s+([，。；、！？])/g, '$1')
    .replace(/([，、；;])\s*([，、；;。！？])/g, '$2')
    .replace(/[，、；;]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse LLM output into a `CharacterCandidate`. Attaches the server-locked
 * `rolledValues` directly — caller does NOT need to merge.
 *
 * Returns `null` on parse failure; caller should retry or fail loud.
 */
export function parseCharacterCandidate(
  text: string,
  rolledValues: RolledAttribute[],
  requiredGender?: '男' | '女',
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
  const description =
    typeof obj.description === 'string'
      ? stripAttributeScoreLeaks(obj.description, rolledValues)
      : '';
  if (!name || !description) return null;

  // Private inner backstory — kept off-chain, only fed to genesis-memory.
  const secret =
    typeof obj.secret === 'string'
      ? stripAttributeScoreLeaks(obj.secret, rolledValues).trim()
      : '';

  const pf = (obj.physicalFacts ?? obj.physical_facts) as Record<string, unknown> | undefined;
  const rawGender = typeof pf?.gender === 'string' ? pf.gender.trim() : '中性';
  const gender = requiredGender ?? normalizeCandidateGender(rawGender);

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
    secret,
    physicalFacts: { gender, age, body },
    attributes: rolledValues,
  };
}
