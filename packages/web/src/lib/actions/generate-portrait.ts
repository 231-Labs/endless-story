'use server';

/**
 * Server action — generate a portrait for a previewed character and stash
 * it on Walrus. Returns the aggregator URL ready to be written into
 * `character.image_url` on chain.
 *
 * Two-stage:
 *   1. LLM (cheap-tier) curates the long character description into a
 *      ≤160-char visual-anchor prompt — empirically critical for image
 *      models to honour saga toneHint.
 *   2. OpenAI gpt-image-2 renders → bytes → Walrus → aggregator URL.
 *
 * Returns base64 too so the wizard can show the image immediately while
 * Walrus settles (publisher writes are ~1-3s on testnet).
 */

import { createTextClient } from '@endless-story/llm/text';
import { createImageClient } from '@endless-story/llm/image';
import {
    buildPortraitCurationPrompt,
    parsePortraitPrompt,
    UNIVERSAL_PORTRAIT_TONE,
    type CharacterForPortrait,
    type PortraitCurationOptions,
} from '@endless-story/llm/prompts';
import { blob } from '@endless-story/memwal';
import { fetchOnChainSaga } from '@/lib/chain/saga-read';

export interface GeneratePortraitInput {
    character: CharacterForPortrait;
    /** Explicit portrait style anchor. When empty, the saga's on-chain
     *  `portrait_tone` (resolved via `sagaId`) is used; else a default
     *  ink-wash tone. */
    toneHint: string;
    /** Saga to resolve `portrait_tone` from when `toneHint` is empty (F). */
    sagaId?: string;
    recruitmentIntent?: string;
    /**
     * Skip the bare-face ANCHOR curation and render this exact prompt. Used
     * by portrait VARIANTS (§11 evolve-portrait), whose occasion (戲妝/老年/…)
     * the anchor curator would otherwise strip (it's hardwired to 素顏/無戲妝).
     */
    promptOverride?: string;
}

export interface GeneratePortraitResult {
    ok: boolean;
    error?: string;
    /** Portrait prompt that was actually sent to the image model. */
    promptUsed?: string;
    /** Walrus blob id (immutable, points to bytes). */
    blobId?: string;
    /** Aggregator URL — write this to `character.image_url`. */
    url?: string;
    /** Base64 PNG payload — show immediately in UI before Walrus settles. */
    base64?: string;
    revisedPrompt?: string;
}

function defaultToneHint(): string {
    return UNIVERSAL_PORTRAIT_TONE;
}

function anchorSafeToneHint(raw: string): string {
    const tone = raw.trim();
    if (!tone) return defaultToneHint();

    // Some saga-level tones are written for later costume / setting-gallery
    // images. Recruitment portraits are plain face anchors, so strip costume
    // and make-up directives before handing the prompt to the image model.
    if (
        /海派水墨工筆|月份牌|唱片封套|戲報|票券|報紙|書頁|題字|書法|印章|海報|設定卡|版面設計/.test(
            tone,
        )
    ) {
        return defaultToneHint();
    }

    return tone
        .replace(/；?戲服和妝面精細[^。；]*[。；]?/g, '；')
        .replace(/；?[^。；]*(?:文字|題字|書法|簽名|印章|紅章|票券|唱片封套|戲報|報紙|書頁|海報|月份牌|設定卡|道具|邊框|標籤|卡片|刊物|版面設計)[^。；]*[。；]?/g, '；')
        .replace(/；{2,}/g, '；')
        .replace(/；。/g, '。')
        .trim();
}

/**
 * Resolve the portrait art-direction tone (F — saga soul, 畫風):
 *   explicit toneHint → saga's on-chain portrait_tone → default ink-wash.
 * The saga read is cached (saga-read TTL) so repeated recruitment portraits
 * in a session don't re-hit RPC.
 */
async function resolveToneHint(input: GeneratePortraitInput): Promise<string> {
    const explicit = input.toneHint.trim();
    if (explicit) return anchorSafeToneHint(explicit);
    if (input.sagaId) {
        try {
            const saga = await fetchOnChainSaga(input.sagaId);
            const tone = saga?.sagaPrompts?.portraitTone?.trim();
            if (tone) return anchorSafeToneHint(tone);
        } catch {
            /* fall through to default on any read failure */
        }
    }
    return defaultToneHint();
}

export async function generatePortrait(input: GeneratePortraitInput): Promise<GeneratePortraitResult> {
    const tone = await resolveToneHint(input);

    // ── Stage 1: curate (skipped when caller supplies an exact prompt) ──
    let curated: string;
    if (input.promptOverride?.trim()) {
        curated = input.promptOverride.trim();
    } else
    try {
        const text = createTextClient({ kind: 'cheap' });
        const opts: PortraitCurationOptions = { toneHint: tone, recruitmentIntent: input.recruitmentIntent };
        const { system, messages, maxTokens } = buildPortraitCurationPrompt(input.character, opts);
        const res = await text.chat({ system, messages, maxTokens, temperature: 0.6 });
        curated = parsePortraitPrompt(res.text);
        if (!curated) throw new Error('curator returned empty prompt');
    } catch (err) {
        // Fallback to a raw assembly so the flow doesn't break on curator failure.
        const desc = input.character.description.slice(0, 60);
        curated = parsePortraitPrompt(`${tone}\n${desc}\n素顏臉部 anchor，純白底，自然光，頭肩 close-up，四分之三側面 45°。`);
        console.warn('[generate-portrait] curator failed, using fallback prompt:', err);
    }

    // ── Stage 2: image generation ──────────────────────────────────────
    let image;
    try {
        const imgClient = createImageClient();
        image = await imgClient.generate({ prompt: curated, aspectRatio: '4:5', n: 1 });
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), promptUsed: curated };
    }

    const first = image.images[0];
    if (!first) {
        return { ok: false, error: 'OpenAI returned no images', promptUsed: curated };
    }

    // ── Stage 3: stash on Walrus ───────────────────────────────────────
    let url: string | undefined;
    let blobId: string | undefined;
    let bytes: Uint8Array | null = null;
    if (first.base64) {
        bytes = Uint8Array.from(Buffer.from(first.base64, 'base64'));
    } else if (first.url) {
        try {
            const fetched = await fetch(first.url);
            bytes = new Uint8Array(await fetched.arrayBuffer());
        } catch (err) {
            console.warn('[generate-portrait] failed to fetch image URL:', err);
        }
    }
    if (bytes && bytes.length > 0) {
        try {
            const put = await blob.putBlob(bytes, { network: 'testnet', contentType: 'image/png', epochs: 5 });
            url = put.url;
            blobId = put.blobId;
        } catch (err) {
            console.warn('[generate-portrait] Walrus upload failed; returning base64 only:', err);
        }
    }

    return {
        ok: true,
        promptUsed: curated,
        blobId,
        url,
        base64: first.base64,
        revisedPrompt: first.revisedPrompt,
    };
}
