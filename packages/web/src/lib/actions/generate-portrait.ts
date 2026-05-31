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
    type CharacterForPortrait,
    type PortraitCurationOptions,
} from '@endless-story/llm/prompts';
import { blob } from '@endless-story/memwal';

export interface GeneratePortraitInput {
    character: CharacterForPortrait;
    /** Saga's portrait style anchor — usually from Recruitment.sagaToneHint. */
    toneHint: string;
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
    return '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。不要動漫感、不要油畫感、不要寫實照片。';
}

export async function generatePortrait(input: GeneratePortraitInput): Promise<GeneratePortraitResult> {
    const tone = input.toneHint.trim() || defaultToneHint();

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
        curated = `${tone}\n${desc}\n素顏臉部 anchor，純白底，自然光，頭肩 close-up。`;
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
