'use server';

/**
 * §11 — generate additional character views at mint, via img2img.
 *
 * The mint-time portrait is a fixed 45° three-quarter view (see portrait.ts). Once
 * the character is on chain, we use that portrait as a VISUAL REFERENCE (OpenAI
 * /v1/images/edits) to render — of the SAME face —:
 *   1. a frontal portrait   (kind=0 portrait_variant)
 *   2. a horizontal 人物美術設定 art sheet (kind=6 setting_sheet)
 * Each is uploaded to Walrus and appended to the character's gallery (設定集) via
 * `add_media_asset_by_storyteller`. The public cover (image_url) is NOT touched —
 * the mint UI keeps showing the original 45° portrait.
 *
 * Why img2img (not text anchoring): gpt-image-2 /edits keeps the reference's
 * actual identity, so the frontal/art-sheet are the SAME person — not a look-alike
 * (which is all physical_facts text could give). This realises the §11 img2img TODO.
 *
 * Designed to be called in the BACKGROUND after redeemVoucher mint success — it must
 * never block the mint or change the mint UI. Failure-isolated + logged.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read, tx as endlessTx } from '@endless-story/sdk';
import { createImageClient } from '@endless-story/llm/image';
import { blob } from '@endless-story/memwal';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';

const TONE = '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。';
const NEG = '不要動漫感、不要油畫感、不要寫實照片。';

export interface AdditionalViewsInput {
    characterId: string;
    /** Walrus aggregator URL of the mint-time 45° portrait — the img2img reference. */
    referenceUrl: string;
    /** Skip on-chain anchoring (render + upload only) — for testing. */
    dryRun?: boolean;
}

export interface AdditionalViewsResult {
    ok: boolean;
    /** how many views were appended to the gallery on chain. */
    appended: number;
    frontalUrl?: string;
    artSheetUrl?: string;
    error?: string;
    skipped?: string;
}

interface ViewSpec {
    label: 'frontal' | 'art-sheet';
    kind: number; // MediaAsset.kind
    aspect: '4:5' | '16:9';
    prompt: (person: string) => string;
}

const VIEWS: ViewSpec[] = [
    {
        label: 'frontal',
        kind: 0, // portrait_variant
        aspect: '4:5',
        prompt: (person) =>
            `${TONE}\n與參考圖**同一個人、同一張臉**（保持五官、髮型、氣質一致）。${person}\n` +
            `改為**端正正面**朝向觀者、神情沉靜，素顏、純色底、自然光、頭肩 close-up。${NEG}`,
    },
    {
        label: 'art-sheet',
        kind: 6, // setting_sheet / 人物美術設定
        aspect: '16:9',
        prompt: (person) =>
            `${TONE}\n與參考圖**同一個人、同一張臉**（保持五官、髮型、氣質一致）。${person}\n` +
            `橫向**人物美術設定圖（character art sheet）**：同一人物的多角度呈現 —— 正面全身、` +
            `四分之三側面、背面，並附頭部特寫；純色底、設定集排版、標註感。${NEG}`,
    },
];

export async function generateAdditionalViews(
    input: AdditionalViewsInput,
): Promise<AdditionalViewsResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, appended: 0, skipped: 'saga_unconfigured' };
    }
    if (!input.referenceUrl?.trim()) {
        return { ok: false, appended: 0, skipped: 'no_reference' };
    }

    // ── fetch the reference portrait bytes (the img2img anchor) ──
    let refBytes: Uint8Array;
    try {
        const r = await fetch(input.referenceUrl);
        if (!r.ok) throw new Error(`reference fetch HTTP ${r.status}`);
        refBytes = new Uint8Array(await r.arrayBuffer());
        if (refBytes.length === 0) throw new Error('reference image empty');
    } catch (err) {
        return { ok: false, appended: 0, error: `讀取參考圖失敗: ${err instanceof Error ? err.message : String(err)}` };
    }

    // ── read character (for the person line that keeps identity consistent) ──
    const client = makeSuiClient({ network: resolveNetwork() });
    const [charRes, role] = await Promise.all([
        read.character.getCharacter(client, input.characterId).catch(() => null),
        resolveRole(input.characterId).catch(() => null),
    ]);
    const cj = (charRes?.json ?? {}) as {
        profile?: { physical_facts?: { species?: string; gender?: string; body?: string; age_years?: number | string } };
    };
    const pf = cj.profile?.physical_facts ?? {};
    const physical = [pf.species, pf.body].filter(Boolean).join(' / ') || '—';
    const person = `${role ?? '梨園中人'}，${mapGender(pf.gender ?? '')}，${Number(pf.age_years ?? 0)} 歲，${physical}`;

    let imgClient;
    try {
        imgClient = createImageClient();
    } catch {
        return { ok: false, appended: 0, skipped: 'image_unconfigured' };
    }

    let admin;
    if (!input.dryRun) {
        try {
            admin = getAdminContext();
        } catch (err) {
            return { ok: false, appended: 0, error: err instanceof Error ? err.message : 'admin 載入失敗' };
        }
    }

    let appended = 0;
    const urls: Partial<Record<ViewSpec['label'], string>> = {};

    // Serial: each view is one img2img call + one Walrus upload + one append tx.
    // Serial avoids hammering the SEAL/Walrus publisher and keeps the saga/char
    // object versions from clashing across the two append txs.
    for (const view of VIEWS) {
        try {
            const res = await imgClient.edit({
                prompt: view.prompt(person),
                images: [refBytes],
                aspectRatio: view.aspect,
                quality: 'medium',
                n: 1,
            });
            const img = res.images[0];
            const bytes = img?.base64
                ? Uint8Array.from(Buffer.from(img.base64, 'base64'))
                : img?.url
                  ? new Uint8Array(await (await fetch(img.url)).arrayBuffer())
                  : null;
            if (!bytes || bytes.length === 0) {
                console.warn(`[additional-views] ${view.label}: empty image`);
                continue;
            }
            const put = await blob.putBlob(bytes, { network: 'testnet', contentType: 'image/png', epochs: 5 });
            urls[view.label] = put.url;

            if (input.dryRun || !admin) continue;

            const txb = new Transaction();
            const asset = txb.add(
                endlessTx.character.newMediaAsset({
                    kind: view.kind,
                    uri: put.url,
                    walrusBlobId: put.blobId ? Array.from(new TextEncoder().encode(put.blobId)) : [],
                    metadataUri: `endless://additional-view?view=${view.label}`,
                }),
            );
            txb.add(
                endlessTx.character.addMediaAssetByStoryteller({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    character: input.characterId,
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
            else console.warn(`[additional-views] ${view.label} append failed:`, txr.effects?.status?.error);
        } catch (err) {
            console.warn(`[additional-views] ${view.label} failed:`, err instanceof Error ? err.message : err);
        }
    }

    return {
        ok: true,
        appended,
        frontalUrl: urls['frontal'],
        artSheetUrl: urls['art-sheet'],
    };
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}
