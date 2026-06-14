/**
 * render-anchored-image — the reusable "condition on character anchors → one
 * image" recipe, extracted from web's proven `generate-event-moment`.
 *
 * Gathers each involved character's CLEAN anchor portrait (media_assets[0], the
 * mint-time reference — NOT the owner-set cover) as an img2img reference, then
 * renders ONE new image following `prompt` via OpenAI /v1/images/edits
 * (multi-reference) so faces / builds don't drift (§11 face-consistency).
 *
 * Returns the raw PNG bytes — the CALLER decides how to persist (Walrus putBlob,
 * commitment anchor, media-asset append). Siblings that share this recipe: the
 * still-compiler (劇照, scene framing) and the future curio generator (珍玩,
 * object framing). Stateless + failure-isolated; never throws on a bad ref.
 */

import { makeSuiClient, read } from '@endless-story/sdk';
import { createImageClient } from '@endless-story/llm/image';
import type { ImageClient, AspectRatio, ImageQuality } from '@endless-story/llm/image';
import { resolveNetwork } from '../../infra/network.js';

export interface RenderAnchoredImageInput {
    /** Characters whose anchor portraits condition the render. */
    characterIds: string[];
    /** The image-model prompt (built by the calling service). */
    prompt: string;
    aspectRatio?: AspectRatio;
    quality?: ImageQuality;
    model?: string;
    /** Cap on reference images (cost + identity stability). Default 4. */
    maxRefs?: number;
    /** Minimum anchors required to render. Default 1 (a still can be 1 character;
     *  event-moment requires 2). */
    minRefs?: number;
    // ── injectables (tests / alt providers) ──
    /** Provide a ready image client; else one is created from env. */
    imageClient?: ImageClient;
    /** Override how a character's anchor URL is resolved (default: chain read). */
    resolveAnchorUrl?: (characterId: string) => Promise<string | null>;
    /** Override how an anchor URL is fetched to bytes (default: global fetch). */
    fetchBytes?: (url: string) => Promise<Uint8Array | null>;
}

export interface RenderAnchoredImageResult {
    ok: boolean;
    /** Rendered PNG bytes — caller persists. */
    bytes?: Uint8Array;
    /** The characters whose anchors actually conditioned the render. */
    usedCharacterIds: string[];
    skipped?: 'image_unconfigured' | 'no_anchors' | 'insufficient_anchors' | 'empty_image';
    error?: string;
}

/** Chain-read a character's stable anchor portrait URL (media_assets[0] base). */
async function chainAnchorUrl(characterId: string): Promise<string | null> {
    try {
        const client = makeSuiClient({ network: resolveNetwork() });
        const res = await read.character.getCharacter(client, characterId).catch(() => null);
        const cj = res?.json as
            | { image_url?: string; media_assets?: Array<{ uri?: string }> }
            | undefined;
        // BASE anchor = media_assets[0] (mint-time portrait), not image_url
        // (owner-set cover) — a stable identity reference across every scene image.
        return cj?.media_assets?.[0]?.uri || cj?.image_url || null;
    } catch {
        return null;
    }
}

async function defaultFetchBytes(url: string): Promise<Uint8Array | null> {
    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const buf = new Uint8Array(await r.arrayBuffer());
        return buf.length > 0 ? buf : null;
    } catch {
        return null;
    }
}

export async function renderAnchoredImage(
    input: RenderAnchoredImageInput,
): Promise<RenderAnchoredImageResult> {
    const maxRefs = input.maxRefs ?? 4;
    const minRefs = input.minRefs ?? 1;
    const ids = [...new Set(input.characterIds)].slice(0, maxRefs);

    let imageClient = input.imageClient;
    if (!imageClient) {
        try {
            imageClient = createImageClient();
        } catch {
            return { ok: false, usedCharacterIds: [], skipped: 'image_unconfigured' };
        }
    }

    const resolveAnchorUrl = input.resolveAnchorUrl ?? chainAnchorUrl;
    const fetchBytes = input.fetchBytes ?? defaultFetchBytes;

    // ── gather anchor reference bytes ──
    const refs: { id: string; bytes: Uint8Array }[] = [];
    for (const id of ids) {
        const url = await resolveAnchorUrl(id);
        if (!url) continue;
        const bytes = await fetchBytes(url);
        if (!bytes || bytes.length === 0) continue;
        refs.push({ id, bytes });
    }
    if (refs.length === 0) return { ok: false, usedCharacterIds: [], skipped: 'no_anchors' };
    if (refs.length < minRefs) {
        return { ok: false, usedCharacterIds: refs.map((r) => r.id), skipped: 'insufficient_anchors' };
    }

    // ── render ONE image, faces matching each anchor ──
    try {
        const res = await imageClient.edit({
            prompt: input.prompt,
            images: refs.map((r) => r.bytes),
            aspectRatio: input.aspectRatio ?? '16:9',
            quality: input.quality ?? 'medium',
            model: input.model,
            n: 1,
        });
        const img = res.images[0];
        const bytes = img?.base64
            ? Uint8Array.from(Buffer.from(img.base64, 'base64'))
            : img?.url
              ? await fetchBytes(img.url)
              : null;
        if (!bytes || bytes.length === 0) {
            return { ok: false, usedCharacterIds: refs.map((r) => r.id), skipped: 'empty_image' };
        }
        return { ok: true, bytes, usedCharacterIds: refs.map((r) => r.id) };
    } catch (err) {
        return {
            ok: false,
            usedCharacterIds: refs.map((r) => r.id),
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
