/**
 * Portrait prompt curation — convert a long character description into a
 * short visual-anchor prompt for image models (gpt-image-2).
 *
 * Why curate? Empirically (2026/05 old-repo testing):
 * - "水墨工筆畫風格的女子肖像" < 20 chars → perfect ink-wash output
 * - Same prompt + 500 chars of face / clothing / props / background → photoreal
 *
 * Image models have a "style keyword vs character detail" attention budget;
 * too much detail drowns the style keyword. This builder forces ≤ 160 chars.
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

export const UNIVERSAL_PORTRAIT_TONE =
  '水墨工筆人物肖像，宣紙暈染邊緣，淡墨線描 + 水彩設色；統一純白背景，民國上海氣質只體現在髮型與常服。不要動漫感、不要油畫感、不要寫實照片。';

export const UNIVERSAL_PORTRAIT_GUARD =
  '單人素顏頭肩肖像，純白背景，四分之三側面 45°，自然光。畫面只包含人物與空白背景；無字、無題款、無印記、無出版物、無紙張道具、無邊框版面。';

const SYSTEM_PROMPT = `你是「無盡故事」的角色 anchor 畫師。寫一段極短的「**素顏臉部 anchor**」prompt
給圖像模型（gpt-image-2）。

Anchor = 這位角色的**長期 reference 圖**：素顏、無戲妝、頭肩 close-up、純色底。
未來不同戲碼會生戲妝版、不同章回會生全身版，但 Anchor 永遠是這張素顏。
所有演員與非演員工種（班主、樂師、箱管、經理、武行等）都使用同一種 portrait 畫面格式；
只能用年齡、氣質、髮型與常服差異表現身份，不得改成海報、票券、設定卡或插畫版面。

【Anchor 構圖鐵則】
- **只能純白背景**，不要灰底、米色底、花枝、山水、紙張邊框或任何裝飾背景
- 自然光、無誇張舞台燈
- 頭肩 close-up、半身偏上、**固定四分之三側面（約 45°）朝向觀者**（不要純正面、不要全側面）
- **不上戲妝、不戴頭面、不穿戲服**——只是這個人「卸了戲的素顏」
- 衣著：簡單常服（旗袍 / 中式短衫 / 棉布素衫）一個詞帶過

【輸出結構 · 嚴格 ≤ 160 字】
1. 風格 keyword（saga toneHint 開頭 1-2 句，照抄）
2. 一句人物（≤ 30 字）：性別 + 年齡 + 最多 1-2 個顯眼特徵
3. 一句構圖：「素顏臉部 anchor / 純白底 / 自然光 / 頭肩 close-up / 四分之三側面 45°」
4. 風格再強調 1 句（saga toneHint 的 negative 部分，照抄）

【行當 / 性別表現 · 重要】
讀角色 description 推斷行當：
- 「女小生 / 女武生 / 坤生」（女演員扮男角）→ 性別仍是女、但臉型可微帶英氣，
  髮型短或束起、衣著中性（棉布短衫）。**不寫嫵媚、不寫脂粉、不寫水袖**。
- 「青衣 / 花旦」→ 氣質端莊或明豔、髮型可挽起、衣著柔軟（旗袍）
- 「武旦 / 刀馬旦」→ 氣質爽利、髮型俐落、衣著輕便
- 「老旦 / 老生」→ 年紀已長、衣著樸素
- 「班主 / 掌事」→ 氣質穩重、長者風範、衣著得體
- 「樂師 / 箱管」→ 素衫常服

【絕對不要寫】
- 任何文字、題字、書法、簽名、印章、紅章、票券、唱片封套、戲報、報紙、書頁、海報、月份牌、設定卡
- 任何道具、版面設計、邊框、貼紙、標籤、卡片、刊物
- 戲妝 / 頭面 / 油彩 / 點翠 / 水袖（這些在 Anchor 階段全省）
- 妝面細節（眉骨、眼尾、唇形）
- 衣紋 / 衣領 / 袖口紋樣
- 道具具體形狀
- 任何攝影詞彙：陰影 / 高光 / 景深 / 重心 / 質感 / 紋理

【鏈上 traits 簡化映射 — 只取最強信號】
- 外貌極低 (<30) → 「相貌平凡」一個詞
- 外貌極高 (>80) → 「相貌出眾」一個詞
- 筋骨極低 → 「體弱」；極高 → 「體格扎實」
- 中間值（30-80）全部省略
- traits 部分最多寫 1 個（最極端那條）；可全省略

【鐵則】
- 繁體中文
- **總長 ≤ 160 字，違規視為失敗**
- 不寫人名（給玩家保留命名空間）
- 不解釋、不 markdown、純 prompt 文字直出

【範例 · 你該寫成這樣】
"水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。
二十六歲女子，眉目清麗、髮髻簡單，棉布素衫。
素顏臉部 anchor，純白底，自然光，頭肩 close-up，四分之三側面 45°。
不要動漫感、不要油畫感、不要寫實照片。"
（共 ~80 字，model 自行填細節）

【女小生氣質提示】
若角色是女小生 / 坤生，人物句仍必須使用「基本事實」裡的實際年齡；
氣質可寫眉目英朗清潤、束髮、中性短衫。不要照抄固定歲數，不要嫵媚。

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
請依 system prompt 的「≤ 160 字、4 段結構」寫出 portrait prompt。`;

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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [stripped, UNIVERSAL_PORTRAIT_GUARD].filter(Boolean).join('\n');
}
