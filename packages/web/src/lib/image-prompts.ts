// Single source for the deterministic image-generation prompt templates.
//
// These were inlined in the image action files (generate-additional-views,
// evolve-portrait, generate-event-moment). They're sent to the IMAGE model
// (gpt-image / edit), not a chat LLM. Extracted here so the actions and the
// prompt-lab share ONE source. Plain module (NOT 'use server') — importable by
// both server actions and the server-only prompt-lab registry.

// ── additional-views (mint-time frontal + art-sheet) ──
const TONE = '淡彩水墨工筆畫風：淡墨細線、清透水彩薄塗、大面積留白、宣紙質感。';
// These views are used as CLEAN reference anchors for downstream multi-character
// scene images, so the image must be pure figure art — no text whatsoever.
const NEG = '全圖純畫面，無任何文字、標籤、題字、印章、邊框、數字或排版框線。';

/** additional-views 'frontal' (kind=0 portrait_variant). */
export function portraitVariantPrompt(person: string): string {
    return (
        `${TONE}\n與參考圖**同一個人、同一張臉**（保持五官、髮型、氣質一致）。${person}\n` +
        `改為**端正正面**朝向觀者、神情沉靜，素顏、純色底、自然光、頭肩 close-up。${NEG}`
    );
}

/** additional-views 'art-sheet' (kind=6 setting_sheet / character model-sheet). */
export function artSheetPrompt(person: string): string {
    return (
        `${TONE}\n與參考圖**同一個人、同一張臉**（保持五官、髮型、氣質一致）。${person}\n` +
        `橫向**人物多角度設定圖**：同一人物的正面全身、四分之三側面、背面，並附頭部特寫；` +
        `統一純色底、各角度之間以留白分隔，不做任何排版標註。${NEG}`
    );
}

// ── evolve-portrait (ink-wash variant) ──
const VARIANT_TONE = '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。';
const VARIANT_NEG = '不要動漫感、不要油畫感、不要寫實照片。';

/** evolve-portrait ink-wash variant prompt. */
export function evolveVariantPrompt(personLine: string, framing: string): string {
    return [VARIANT_TONE, personLine, framing, VARIANT_NEG].filter(Boolean).join('\n');
}

/** evolve-portrait variant tone hint (the toneHint passed to generatePortrait). */
export const evolveVariantTone = VARIANT_TONE;

// ── event-moment (multi-character scene) ──
/** event-moment multi-character scene prompt. */
export function eventMomentPrompt(input: { cast: string; sceneName: string; label: string }): string {
    return (
        `${TONE}\n一幅多人物場景圖：${input.sceneName}，${input.label}。` +
        `畫面同時呈現 ${input.cast}；每個人的五官、髮型、氣質與其對應參考圖保持一致，` +
        `依各自身份與此刻處境安排站位、神態與互動，構圖完整、自然光。${NEG}`
    );
}
