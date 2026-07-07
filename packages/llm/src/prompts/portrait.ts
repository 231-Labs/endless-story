/**
 * Portrait prompt curation — convert a long character description into a
 * short visual-anchor prompt for image models (gpt-image-2).
 *
 * Why curate? Empirically (2026/05 old-repo testing):
 * - "水墨工筆畫風格的女子肖像" < 20 chars → perfect ink-wash output
 * - Same prompt + 500 chars of face / clothing / props / background → photoreal
 *
 * Image models have a "style keyword vs character detail" attention budget;
 * too much detail drowns the style keyword. This builder forces ≤ 90 chars
 * (style sentence + one character sentence) and lets the deterministic guard
 * append composition, so the watercolor style stays the dominant signal.
 *
 * The output of `buildPortraitCurationPrompt` is itself fed to a cheap text
 * model (Haiku-tier); the model's response IS the prompt for the image model.
 */

import type { ChatMessage } from '../text/types.js';
import type { BuildPromptResult } from './moderation.js';

export interface CharacterForPortrait {
  description: string;
  physical: {
    gender: string;
    ageYears: number;
    body: string;
  };
  /** Chain attributes (key + label + 0-100 value). */
  attributes: Array<{ key: string; label: string; value: number }>;
}

export interface PortraitCurationOptions {
  /** Saga's portrait style anchor (e.g. "水墨工筆畫風格，宣紙暈染..."). */
  toneHint: string;
  /** Optional recruitment-intent text — helps the model judge role identity. */
  recruitmentIntent?: string;
}

// Fallback style ONLY — used when a saga carries no `portrait_tone`. Every real
// saga supplies its own art direction (spring-snow = 郎世寧 oil), so keep this a
// plausible neutral rather than a hard-coded ink-wash that fights the saga tone.
export const UNIVERSAL_PORTRAIT_TONE =
  '古典寫實油彩肖像：溫潤細膩的油畫設色、柔和側光塑形、有立體感與質地；素淨中性背景，五官端正且有辨識度，時代氣質只見於髮型與常服。';

// STYLE-NEUTRAL guard: composition / framing / no-text only. It must NOT name a
// painting style (ink-wash, oil, watercolor…) — the saga's `portrait_tone` owns
// the style, and any style word here would fight it. Genre-specific wardrobe /
// hairstyle guidance lives in the saga art direction, not this shared guard.
export const UNIVERSAL_PORTRAIT_GUARD =
  '素顏頭肩半身、四分之三側面 45°、素淨中性背景、柔和自然光；五官耐看、有記憶點，保留年齡與個性痕跡，臉孔因人而異、不要千人一面；畫面只有人物本人，無文字、印章、票券、道具與邊框。';

const SYSTEM_PROMPT = `你是「無盡故事」的角色 anchor 畫師。寫一段極短的「**素顏臉部 anchor**」prompt
給圖像模型（gpt-image-2）。此系統對**任何題材/時代的 saga 通用**——所有題材專屬的線索
（時代、地域、行當、身分扮相）一律從角色 description 與 saga toneHint 讀，不要預設任何劇種。

Anchor = 這位角色的**長期 reference 圖**：素顏、無妝、頭肩 close-up、素色底。
未來不同情境會生變裝版、全身版，但 Anchor 永遠是這張素顏。
所有角色（不分職業、身分、行當）都用同一種 portrait 畫面格式；
只能用年齡、氣質、髮型與常服差異表現身份，不得改成海報、票券、設定卡或插畫版面。
目標是可長期追蹤、讓人願意凝視的角色臉：耐看、有記憶點、帶生活痕跡，保留年齡、個性與一點不對稱。

**臉孔必須有真實的多樣性，不是一整排俊男美女**：
- 只有真正的主角級人物才寫得漂亮；其餘角色按人生磨出各自的臉。
- 配角、雜工、長者、勞動者、市井人物：多半是**平凡、真實、有歲月感**的長相——
  臉寬、顴骨高、眼小、皮膚粗、皺紋法令、風霜相、疲態，一點都不美也完全正確。
- 臉型、五官比例、膚色、骨相、胖瘦都要因人而異；同一 saga 的人擺一起要一眼認得出是不同的人，
  絕不能都是尖下巴、大眼、白皙、精緻的同一張臉。
- 寧可平凡真實，也不要千人一面的漂亮。不用刻意寫醜，但「不特別好看」是常態。

【身分 / 時代 / 髮型 — 一律從資料推斷，不預設劇種】
- 從角色 description 與 saga toneHint 判斷角色的**身分定位與所處時代地域**，給出**符合那個時代與身分**的髮型與常服；
  具體的行當扮相、劇種參照，看 description 與 toneHint 自帶的線索，不要自己硬套一個劇種。
- 髮型要合乎該 saga 的時代與地域；**避免與該時代不符的當代潮流造型**（剃邊 undercut、fade 漸層、油頭、
  雕塑碎蓋、韓系燙髮、健身型男感…），除非這個 saga 本身就是當代背景。
- 若 description 指出角色是**女性反串男角**（如戲曲坤生／女小生）：**一定要一眼看得出是女子**，
  只是氣質中性俊秀——英氣在眉眼與神采、不在骨架；**嚴禁畫成男人**（不鬍鬚眉、不寬下顎方臉、不喉結、
  不厚眉、不魁梧）。反之男性角色就是男相。

【Anchor 構圖鐵則 · 背景知識,系統會自動接,你「不要」寫進輸出】
- 素色中性背景，不要裝飾背景、花枝、山水、紙張邊框
- 柔和自然光、無誇張舞台燈
- 頭肩 close-up、**四分之三側面（約 45°）**（不要純正面、不要全側面）
- **不上妝/不穿戲服/不戴頭面**——只是這個人卸了裝的素顏
- 衣著：簡單常服一個詞帶過

【輸出結構 · 嚴格 ≤ 90 字】
1. 風格句（**完整照抄 saga toneHint**——畫風全靠它，排最前面）
2. 一句人物（≤ 25 字）：性別 + 年齡 + 最多 1 個顯眼特徵；素顏、簡單常服一詞帶過
**不要寫構圖、背景、光線、攝影詞或任何「不要…」負面句**——系統會自動接。
鐵律：以畫風為主，人物細節越少越好。細節一多，模型就吃掉畫風、退回厚塗寫實。

【絕對不要寫】
- 任何文字、題字、書法、簽名、印章、票券、封套、戲報、報紙、海報、月份牌、設定卡
- 任何道具、版面設計、邊框、標籤、卡片、刊物
- 妝面／頭面／油彩／點翠（Anchor 階段全省）；妝面細節（眉骨、眼尾、唇形）
- 衣紋／衣領／袖口紋樣；道具形狀
- 任何攝影詞彙：陰影／高光／景深／質感／紋理

【鏈上 traits 簡化映射 — 只取最強信號】
- 外貌極低 (<30) → 「眉眼清淡」；極高 (>80) → 「眉眼明亮有記憶點」
- 筋骨極低 → 「體弱」；極高 → 「體格扎實」；中間值全省
- traits 最多寫 1 個（最極端那條），可全省

【鐵則】
- 繁體中文
- **總長 ≤ 90 字**（風格句 + 一句人物即可，不要構圖、不要負面句）
- 不寫人名（給玩家保留命名空間）
- 不解釋、不 markdown、純 prompt 文字直出

【範例結構（風格句一律用該 saga 自己的 toneHint，不要照抄這裡的字面）】
"〔照抄 saga toneHint 的畫風句〕。二十六歲女子，眉目清麗、髮式簡單，素常服。"
（構圖與安全句由系統自動接，你不要寫）

只輸出 prompt 文字，無 JSON 無說明。`;

export function buildPortraitCurationPrompt(
  character: CharacterForPortrait,
  options: PortraitCurationOptions,
): BuildPromptResult {
  const traitLines = character.attributes
    .map((t) => `- ${t.label}（${t.key}） ${t.value}/100`)
    .join('\n');
  const intentBlock = options.recruitmentIntent?.trim()
    ? `\n【saga 公告（補充語境，僅幫你判斷身份定位用，不必每條 mapping）】\n${options.recruitmentIntent.trim()}\n`
    : '';

  const userText = `【角色】
描述：${character.description}
基本事實：${character.physical.gender}，${character.physical.ageYears} 歲，${character.physical.body}

【鏈上 traits】
${traitLines}

【saga 風格基底 toneHint（要照抄進 prompt 開頭跟結尾）】
${options.toneHint}
${intentBlock}
請依 system prompt 的「≤ 90 字、2 段結構」寫出 portrait prompt。`;

  return {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText } satisfies ChatMessage],
    maxTokens: 600,
  };
}

/**
 * Portrait curation has no JSON structure — the LLM output IS the prompt.
 * Caller sends this directly to the image model, so enforce the universal
 * anchor guard deterministically in case the cheap curator leaks poster or
 * ticket language from saga lore.
 */
export function parsePortraitPrompt(text: string): string {
  const stripped = text
    .trim()
    .replace(/[，、；。\s]*[^，、；。\n]*(?:文字|題字|書法|簽名|印章|紅章|票券|唱片封套|戲報|報紙|書頁|海報|月份牌|設定卡|道具|邊框|標籤|卡片|刊物|版面設計)[^，、；。\n]*/g, '')
    // gpt-image treats negations like "no oil-painting/photoreal/anime" as positive
    // keywords, summoning the very thing. Drop the whole negative clause.
    .replace(/(?:[，、；。\n]\s*)?不要[^。\n]*(?:動漫|卡通|油畫|寫實|照片|渲染|3D|CG)[^。\n]*。?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [stripped, UNIVERSAL_PORTRAIT_GUARD].filter(Boolean).join('\n');
}
