'use server';

/**
 * Event "moment" image — the multi-character scene image of one on-chain
 * event, the text→image bridge.
 *
 * When an event (storylet) involves ≥2 characters, render ONE scene image of the
 * incident using EACH involved character's clean anchor portrait as an img2img
 * reference (OpenAI /v1/images/edits, multi-reference) — so faces/builds don't
 * drift. The single image is then appended as a `kind=4` event_moment media asset
 * to EVERY involved character, so it surfaces in each one's gallery "event moments", and
 * its metadata carries the source on-chain event tx (provenance). Same image,
 * shared across the cast — like the multi-POV chapters, one objective moment.
 *
 * Background-only (called from the tick loop's after()); failure-isolated.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read, tx as endlessTx } from '@endless-story/sdk';
import { createImageClient } from '@endless-story/llm/image';
import { blob } from '@endless-story/memwal';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import { eventMomentPrompt } from '@/lib/image-prompts';

const EVENT_MOMENT_KIND = 4;
/** OpenAI edits accepts a handful of refs; cap to keep cost + identity stable. */
const MAX_REFS = 4;

export interface EventMomentInput {
    /** Characters present in the event (the storylet cast). */
    characterIds: string[];
    /** Scene where it happened. */
    sceneName: string;
    /** The incident framing (storylet label). */
    label: string;
    /** Source on-chain event tx digest (provenance). */
    eventTx?: string;
    /** Render + upload only, no on-chain append. */
    dryRun?: boolean;
}

export interface EventMomentResult {
    ok: boolean;
    url?: string;
    blobId?: string;
    /** How many characters got this moment in their gallery. */
    appended: number;
    skipped?: string;
    error?: string;
}

interface CastRef {
    id: string;
    name: string;
    role: string;
    bytes: Uint8Array;
}

export async function generateEventMomentAction(input: EventMomentInput): Promise<EventMomentResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) return { ok: false, appended: 0, skipped: 'saga_unconfigured' };

    const ids = [...new Set(input.characterIds)].slice(0, MAX_REFS);
    if (ids.length < 2) return { ok: true, appended: 0, skipped: 'need_2_plus' };

    let imgClient;
    try {
        imgClient = createImageClient();
    } catch {
        return { ok: false, appended: 0, skipped: 'image_unconfigured' };
    }

    // ── gather each character's clean anchor portrait as an img2img reference ──
    const client = makeSuiClient({ network: resolveNetwork() });
    const refs: CastRef[] = [];
    for (const id of ids) {
        const [charRes, role] = await Promise.all([
            read.character.getCharacter(client, id).catch(() => null),
            resolveRole(id).catch(() => null),
        ]);
        const cj = charRes?.json as
            | { image_url?: string; profile?: { name?: string }; media_assets?: Array<{ uri?: string }> }
            | undefined;
        // Use the BASE anchor = media_assets[0] (mint-time portrait), not image_url
        // (owner-set cover) — a stable identity reference across every scene image.
        const anchorUrl = cj?.media_assets?.[0]?.uri || cj?.image_url;
        if (!anchorUrl) continue;
        let bytes: Uint8Array | null = null;
        try {
            const r = await fetch(anchorUrl);
            if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
        } catch {
            /* skip this ref */
        }
        if (!bytes || bytes.length === 0) continue;
        refs.push({ id, name: cj?.profile?.name ?? '某人', role: role ?? '梨園中人', bytes });
    }
    if (refs.length < 2) return { ok: true, appended: 0, skipped: 'insufficient_anchors' };

    // ── render ONE multi-character scene, faces matching each anchor ──
    const cast = refs.map((r) => `${r.name}（${r.role}）`).join('、');
    const prompt = eventMomentPrompt({ cast, sceneName: input.sceneName, label: input.label });
    let bytes: Uint8Array | null = null;
    try {
        const res = await imgClient.edit({
            prompt,
            images: refs.map((r) => r.bytes),
            aspectRatio: '16:9',
            quality: 'medium',
            n: 1,
        });
        const img = res.images[0];
        bytes = img?.base64
            ? Uint8Array.from(Buffer.from(img.base64, 'base64'))
            : img?.url
              ? new Uint8Array(await (await fetch(img.url)).arrayBuffer())
              : null;
    } catch (err) {
        return { ok: false, appended: 0, error: err instanceof Error ? err.message : String(err) };
    }
    if (!bytes || bytes.length === 0) return { ok: false, appended: 0, error: 'empty_image' };

    // ── store ONCE; the same blob is shared by every participant's gallery ──
    let url: string;
    let blobId: string;
    try {
        const put = await blob.putBlob(bytes, { network: 'testnet', contentType: 'image/png', epochs: 30 });
        url = put.url;
        blobId = put.blobId;
    } catch (err) {
        return { ok: false, appended: 0, error: err instanceof Error ? err.message : String(err) };
    }

    if (input.dryRun) return { ok: true, appended: 0, url, blobId };

    // ── append the moment (kind=4) to EACH involved character; metadata = eventTx ──
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, appended: 0, url, blobId, error: err instanceof Error ? err.message : 'admin 載入失敗' };
    }
    const metadataUri =
        `endless://event-moment?scene=${encodeURIComponent(input.sceneName)}` +
        (input.eventTx ? `&tx=${input.eventTx}` : '');
    let appended = 0;
    for (const r of refs) {
        try {
            const txb = new Transaction();
            const asset = txb.add(
                endlessTx.character.newMediaAsset({
                    kind: EVENT_MOMENT_KIND,
                    uri: url,
                    walrusBlobId: Array.from(new TextEncoder().encode(blobId)),
                    metadataUri,
                }),
            );
            txb.add(
                endlessTx.character.addMediaAssetByStoryteller({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    character: r.id,
                    asset,
                }),
            );
            const txr = await admin.client.signAndExecuteTransaction({
                transaction: txb,
                signer: admin.signer,
                options: { showEffects: true },
            });
            await admin.client.waitForTransaction({ digest: txr.digest }).catch(() => {});
            if (txr.effects?.status?.status === 'success') appended += 1;
            else console.warn(`[event-moment] append failed for ${r.id}:`, txr.effects?.status?.error);
        } catch (err) {
            console.warn(`[event-moment] anchor failed for ${r.id}:`, err instanceof Error ? err.message : err);
        }
    }
    return { ok: true, appended, url, blobId };
}
