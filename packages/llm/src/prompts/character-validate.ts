/**
 * Post-generation consistency validator for character candidates (Phase 0 of
 * NARRATIVE_AGENTS.md §12.0).
 *
 * The gen prompt's rules are soft — models sometimes write a high-筋骨
 * character as frail (扶牆喘息), drift pronouns against physicalFacts.gender,
 * or invent dark secrets (仇家/血債) the player never asked for. These checks
 * are deterministic (zero LLM cost) and drive a repair round: violations are
 * appended to the chat as a follow-up user message and the model fixes only
 * what's flagged. See `previewCharacter` for the generate→verify→repair loop.
 */

import type {
  AttributeKey,
  CharacterCandidate,
  RolledAttribute,
} from './character.js';

export interface CandidateViolation {
  code:
    | 'body_vs_constitution'
    | 'frail_prose_high_constitution'
    | 'mighty_prose_low_constitution'
    | 'pronoun_gender_mismatch'
    | 'player_gender_mismatch'
    | 'unprompted_dark_secret';
  /** zh-TW, written to be pasted straight into the repair prompt. */
  message: string;
}

export interface ValidateCandidateOptions {
  /** Player-written character intent — opt-in source for dark themes + gender. */
  userPrompt: string;
  requiredGender?: '男' | '女';
  /** Axis definitions (for min/max normalization). Defaults to 0-100. */
  schemaKeys?: AttributeKey[];
}

/** Frail-body vocabulary forbidden when 筋骨 is clearly not low. */
const FRAIL_WORDS = [
  '扶牆',
  '扶着牆',
  '扶著牆',
  '身子骨',
  '體弱',
  '羸弱',
  '孱弱',
  '病弱',
  '弱不禁風',
  '氣喘',
  '易喘',
  '喘息',
  '咳血',
  '纏綿病榻',
  '大病初癒',
];

/** Mighty-body vocabulary forbidden when 筋骨 is clearly low. */
const MIGHTY_WORDS = ['力大無窮', '虎背熊腰', '臂力過人', '神力', '扛鼎', '膂力過人'];

/**
 * Dark-trope vocabulary the prompt forbids unless the player opted in.
 * Mirrors the「secret 調性邊界」list in the gen prompt.
 */
const DARK_WORDS = [
  '殺人',
  '滅口',
  '血債',
  '仇家',
  '追殺',
  '尋仇',
  '黑幫',
  '被賣',
  '賣身',
  '抵債',
  '逼債',
  '討債',
  '賭債',
  '綁架',
  '滅門',
  '復仇',
  '報仇',
  '性命相搏',
  '強暴',
  '凌辱',
];

/** Stems that count as the player opting in to dark themes. */
const DARK_OPTIN_RE = /殺|仇|血債|黑幫|賣身|被賣|綁|滅門|復仇|報仇|債|滅口/u;

/** Compounds where 他 is not a male pronoun. */
const HE_COMPOUND_RE = /他人|其他|他鄉|他日|他處|他山|他方|維他|吉他/gu;

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

function countHePronoun(text: string): number {
  return countChar(text.replace(HE_COMPOUND_RE, ''), '他');
}

function findHits(text: string, words: string[]): string[] {
  return words.filter((w) => text.includes(w));
}

/** Normalized 0..1 position of the constitution roll, or null if axis absent. */
function constitutionT(
  attributes: RolledAttribute[],
  schemaKeys?: AttributeKey[],
): { t: number; value: number } | null {
  const attr = attributes.find(
    (a) => a.key === 'constitution' || a.label === '筋骨',
  );
  if (!attr) return null;
  const def = schemaKeys?.find((s) => s.key === attr.key);
  const min = def?.min ?? 0;
  const max = def?.max ?? 100;
  const span = max - min || 1;
  return { t: (attr.value - min) / span, value: attr.value };
}

/**
 * Infer the player's intended gender from their own prompt text.
 * Deliberately conservative: returns null whenever signals are mixed or weak.
 */
export function inferGenderFromPlayerPrompt(
  userPrompt: string,
): '男' | '女' | null {
  const femaleNouns = ['女子', '姑娘', '少女', '女兒身', '女小生', '坤生', '女武生'];
  const maleNouns = ['男子', '少年郎', '漢子', '小伙', '兒郎', '男兒', '乾生'];
  const femaleScore =
    countChar(userPrompt, '她') + femaleNouns.filter((w) => userPrompt.includes(w)).length * 2;
  const maleScore =
    countHePronoun(userPrompt) + maleNouns.filter((w) => userPrompt.includes(w)).length * 2;
  if (femaleScore >= 1 && maleScore === 0) return '女';
  if (maleScore >= 1 && femaleScore === 0) return '男';
  return null;
}

/**
 * Deterministic consistency checks. Empty array = candidate is clean.
 * Order matters only for readability of the repair prompt.
 */
export function validateCharacterCandidate(
  candidate: CharacterCandidate,
  opts: ValidateCandidateOptions,
): CandidateViolation[] {
  const violations: CandidateViolation[] = [];
  const prose = `${candidate.description}\n${candidate.secret}`;
  const gender = candidate.physicalFacts.gender;
  const body = candidate.physicalFacts.body;

  // —— 筋骨 ↔ body / 弱體詞 ————————————————————————————————
  const con = constitutionT(candidate.attributes, opts.schemaKeys);
  if (con) {
    if (con.t >= 0.65 && body === '孱弱') {
      violations.push({
        code: 'body_vs_constitution',
        message: `筋骨擲值 ${con.value}（偏高），physicalFacts.body 卻是「孱弱」——body 必須改成與筋骨對位（瘦削/勻稱/粗壯擇一）。`,
      });
    }
    if (con.t < 0.35 && body === '粗壯') {
      violations.push({
        code: 'body_vs_constitution',
        message: `筋骨擲值 ${con.value}（偏低），physicalFacts.body 卻是「粗壯」——body 必須改成與筋骨對位（瘦削/孱弱/豐潤擇一）。`,
      });
    }
    if (con.t >= 0.55) {
      const hits = findHits(prose, FRAIL_WORDS);
      if (hits.length > 0) {
        violations.push({
          code: 'frail_prose_high_constitution',
          message: `筋骨擲值 ${con.value} 並不低，但文字出現弱體描寫（${hits.join('、')}）——刪除這些描寫，把身體寫成結實耐勞、與筋骨對位。`,
        });
      }
    }
    if (con.t < 0.35) {
      const hits = findHits(prose, MIGHTY_WORDS);
      if (hits.length > 0) {
        violations.push({
          code: 'mighty_prose_low_constitution',
          message: `筋骨擲值 ${con.value}（偏低），文字卻出現強體描寫（${hits.join('、')}）——刪除這些描寫，身體寫成偏弱。`,
        });
      }
    }
  }

  // —— 人稱 ↔ gender ————————————————————————————————————
  const sheCount = countChar(prose, '她');
  const heCount = countHePronoun(prose);
  if (gender === '女' && sheCount === 0 && heCount >= 2) {
    violations.push({
      code: 'pronoun_gender_mismatch',
      message: `physicalFacts.gender=「女」，但全文人稱用「他」——全篇人稱改為「她」並保持一致。`,
    });
  }
  if (gender === '男' && heCount === 0 && sheCount >= 2) {
    violations.push({
      code: 'pronoun_gender_mismatch',
      message: `physicalFacts.gender=「男」，但全文人稱用「她」——全篇人稱改為「他」並保持一致。`,
    });
  }

  // —— 玩家原文性別 ↔ gender（無徵召硬性要求時才檢） ——————————
  if (!opts.requiredGender) {
    const inferred = inferGenderFromPlayerPrompt(opts.userPrompt);
    if (inferred && (gender === '男' || gender === '女') && gender !== inferred) {
      violations.push({
        code: 'player_gender_mismatch',
        message: `玩家原文寫的是${inferred}性角色，候選 gender 卻是「${gender}」——gender 改回「${inferred}」，description 與 secret 全篇人稱一併修正。`,
      });
    }
  }

  // —— 暗黑橋段（玩家沒寫就不准出現） ————————————————————
  if (!DARK_OPTIN_RE.test(opts.userPrompt)) {
    const hits = findHits(prose, DARK_WORDS);
    if (hits.length > 0) {
      violations.push({
        code: 'unprompted_dark_secret',
        message: `玩家原文沒有任何黑暗橋段，文字卻出現「${hits.join('、')}」——重寫為正常人會藏的心事（未說出口的感情、契約壓力、師承心結、家計、怕被取代……），不要犯罪片或苦情戲。`,
      });
    }
  }

  return violations;
}

/**
 * Follow-up user message for the repair round. Appended after the model's
 * previous (violating) reply in the same conversation, so it only needs to
 * state what to fix.
 */
export function buildCharacterRepairMessage(
  violations: CandidateViolation[],
): string {
  const lines = violations.map((v, i) => `${i + 1}. ${v.message}`);
  return `你上一版候選違反了以下硬規則：
${lines.join('\n')}

請輸出修正版：**只修正違規處，其餘文字盡量保留**。所有原本的規則（數值對位、不洩漏分數、性別一致、secret 調性）仍然有效。仍然只輸出 JSON 物件，不要任何前綴或解釋：
{"name": "...", "description": "...", "secret": "...", "physicalFacts": {"gender":"...","age":..,"body":"..."}}`;
}
