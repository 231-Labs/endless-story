// Single source for the deterministic image-generation prompt templates.
//
// These were inlined in the image action files (generate-additional-views,
// evolve-portrait, generate-event-moment). They're sent to the IMAGE model
// (gpt-image / edit), not a chat LLM. Extracted here so the actions and the
// prompt-lab share ONE source. Plain module (NOT 'use server') — importable by
// both server actions and the server-only prompt-lab registry.

// ── shared image style ──
// Keep this aligned with `UNIVERSAL_PORTRAIT_TONE` in @endless-story/llm/prompts,
// but local here so deterministic image prompts stay tiny and server-action safe.
const TONE =
    '淡彩水墨工筆畫風：淡墨細線勾勒，清透水彩薄塗，設色清淡通透，大面積留白，宣紙暈染質感；統一純白背景。';

const FACE_LOCK =
    '與參考圖同一個人、同一張臉，保持五官、髮型、年齡感、體態與氣質一致；保留平實五官、原本骨相與生活痕跡。';

// These views are used as CLEAN reference anchors for downstream multi-character
// scene images, so the image must be pure figure art — no text whatsoever.
const NO_TEXT = '全圖純畫面，無任何文字、標籤、題字、印章、邊框、數字、字母、浮水印或排版框線。';
const WHITE_CLEAN = `全圖純畫面，純白背景，${NO_TEXT.replace(/^全圖純畫面，/, '')}`;

/** additional-views 'frontal' (kind=0 portrait_variant). */
export function portraitVariantPrompt(person: string): string {
    return (
        `${TONE}\n${FACE_LOCK}${person}\n` +
        `改為端正正面朝向觀者，神情沉靜，素顏、自然光、頭肩 close-up；民國上海梨園後台髮型與素常服。${WHITE_CLEAN}`
    );
}

/** additional-views 'art-sheet' (kind=6 setting_sheet / character model-sheet). */
export function artSheetPrompt(person: string): string {
    return (
        `${TONE}\n${FACE_LOCK}${person}\n` +
        `橫向人物多角度設定圖：同一人物的正面全身、四分之三側面、背面，並附頭部特寫；` +
        `旁邊放一條極簡淡墨身高參照線，只用短刻度與地面線對齊頭頂和腳底；` +
        `各角度之間以留白分隔，身高比例與體態穩定。${WHITE_CLEAN}`
    );
}

/** additional-views 'human-reference' (kind=0 portrait_variant,淡彩真人感). */
export function humanReferencePrompt(person: string): string {
    return (
        `${TONE}\n${FACE_LOCK}${person}\n` +
        `真人感淡彩肖像：骨相、膚色、年齡痕跡與日常神態更接近真實演員，畫法仍保持淡彩水墨工筆；` +
        `端正正面半身，自然光，民國上海梨園後台素常服。${WHITE_CLEAN}`
    );
}

/** additional-views 'stage-makeup' (kind=3 makeup). */
export function stageMakeupPrompt(person: string, stageRole: string): string {
    return (
        `${TONE}\n${FACE_LOCK}${person}\n` +
        `越劇戲妝設定：依此角色行當設計：${stageRole}；妝面、頭飾與戲服都以淡彩薄塗呈現，保持同一張臉；` +
        `半身或七分身，純白背景，人物清楚可作後續劇照與影片錨定。${WHITE_CLEAN}`
    );
}

// ── evolve-portrait (ink-wash variant) ──
const VARIANT_TONE = TONE;
const VARIANT_CLEAN = WHITE_CLEAN;

/** evolve-portrait ink-wash variant prompt. */
export function evolveVariantPrompt(personLine: string, framing: string): string {
    return [VARIANT_TONE, personLine, framing, VARIANT_CLEAN].filter(Boolean).join('\n');
}

/** evolve-portrait variant tone hint (the toneHint passed to generatePortrait). */
export const evolveVariantTone = VARIANT_TONE;

// ── event-moment (multi-character scene) ──
/** event-moment multi-character scene prompt. */
export function eventMomentPrompt(input: { cast: string; sceneName: string; label: string }): string {
    return (
        `${TONE}\n一幅多人物場景圖：${input.sceneName}，${input.label}。` +
        `畫面同時呈現 ${input.cast}；每個人的五官、髮型、氣質與其對應參考圖保持一致，` +
        `依各自身份與此刻處境安排站位、神態與互動，構圖完整、自然光。${NO_TEXT}`
    );
}
