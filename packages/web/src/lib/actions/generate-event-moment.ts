'use server';

/**
 * Event "moment" image (時刻) — the multi-character scene image of one on-chain
 * event, the text→image bridge.
 *
 * When an event (storylet) involves ≥2 characters, render ONE scene image of the
 * incident using EACH involved character's clean anchor portrait as an img2img
 * reference (OpenAI /v1/images/edits, multi-reference) — so faces/builds don't
 * drift. The single image is then appended as a `kind=4` event_moment media asset
 * to EVERY involved character, so it surfaces in each one's 設定集「事件瞬間」, and
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

const EVENT_MOMENT_KIND = 4;
const TONE = '淡彩水墨工筆畫風：淡墨細線、清透水彩薄塗、大面積留白、宣紙質感。';
const NEG = '全圖純畫面，無任何文字、標籤、題字、印章、邊框、數字或排版框線。';
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
    /** How many characters got this moment in their 時刻. */
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
        const anchorUrl = cj?.image_url || cj?.media_assets?.[0]?.uri;
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
    const prompt =
        `${TONE}\n一幅多人物場景圖：${input.sceneName}，${input.label}。` +
        `畫面同時呈現 ${cast}；每個人的五官、髮型、氣質與其對應參考圖保持一致，` +
        `依各自身份與此刻處境安排站位、神態與互動，構圖完整、自然光。${NEG}`;
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

    // ── store ONCE; the same blob is shared by every participant's 時刻 ──
    let url: string;
    let blobId: string;
    try {
        const put = await blob.putBlob(bytes, { network: 'testnet', contentType: 'image/png', epochs: 5 });
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
