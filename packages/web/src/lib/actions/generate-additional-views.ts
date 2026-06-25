'use server';

/**
 * §11 — generate additional character views at mint, via img2img.
 *
 * The mint-time portrait is a fixed 45° three-quarter view (see portrait.ts). Once
 * the character is on chain, we use that portrait as a VISUAL REFERENCE (OpenAI
 * /v1/images/edits) to render — of the SAME face and same pale-ink style —:
 *   1. a frontal portrait   (kind=0 portrait_variant)
 *   2. a horizontal character model-sheet art sheet (kind=6 setting_sheet)
 *   3. a pale-ink human reference portrait (kind=0 portrait_variant)
 *   4. a role-aware stage-makeup portrait (kind=3 makeup)
 * Each is uploaded to Walrus and appended to the character's gallery via
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
import { portraitVariantPrompt, artSheetPrompt, humanReferencePrompt, stageMakeupPrompt } from '@/lib/image-prompts';

export interface AdditionalViewsInput {
    characterId: string;
    /** Walrus aggregator URL of the mint-time 45° portrait — the img2img reference. */
    referenceUrl: string;
    /** Generate only selected standard views. Defaults to both mint-time views. */
    views?: Array<ViewSpec['label']>;
    /** Skip on-chain anchoring (render + upload only) — for testing. */
    dryRun?: boolean;
}

export interface AdditionalViewsResult {
    ok: boolean;
    /** how many views were appended to the gallery on chain. */
    appended: number;
    frontalUrl?: string;
    artSheetUrl?: string;
    humanReferenceUrl?: string;
    stageMakeupUrl?: string;
    error?: string;
    skipped?: string;
}

interface ViewSpec {
    label: 'frontal' | 'art-sheet' | 'human-reference' | 'stage-makeup';
    kind: number; // MediaAsset.kind
    aspect: '4:5' | '16:9';
    prompt: (person: string) => string;
}

const VIEWS: ViewSpec[] = [
    {
        label: 'frontal',
        kind: 0, // portrait_variant
        aspect: '4:5',
        prompt: (person) => portraitVariantPrompt(person),
    },
    {
        label: 'art-sheet',
        kind: 6, // setting_sheet / character model-sheet
        aspect: '16:9',
        prompt: (person) => artSheetPrompt(person),
    },
    {
        label: 'human-reference',
        kind: 0, // portrait_variant
        aspect: '4:5',
        prompt: (person) => humanReferencePrompt(person),
    },
    {
        label: 'stage-makeup',
        kind: 3, // makeup
        aspect: '4:5',
        prompt: (person) => stageMakeupPrompt(person, stageRoleForPerson(person)),
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
    const requested = new Set(input.views ?? VIEWS.map((view) => view.label));
    const views = VIEWS.filter((view) => requested.has(view.label));
    if (views.length === 0) {
        return { ok: true, appended: 0, skipped: 'no_views' };
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
    const physical = [mapSpecies(pf.species ?? ''), pf.body].filter(Boolean).join(' / ') || '—';
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

    // ── 1) render every view first (img2img), collect the successes ──
    // Image generation is the flaky step; render all before storing so a single
    // failed view never aborts the batch.
    const rendered: Array<{ view: ViewSpec; bytes: Uint8Array }> = [];
    for (const view of views) {
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
            rendered.push({ view, bytes });
        } catch (err) {
            console.warn(`[additional-views] ${view.label} render failed:`, err instanceof Error ? err.message : err);
        }
    }
    if (rendered.length === 0) return { ok: true, appended: 0 };

    // ── 2) store the whole mint gallery as ONE Walrus quilt ──
    // The mint-time setting views are produced together → batch them into a
    // single quilt: one publisher round-trip (less 429), one Sui blob tx, shared
    // metadata floor. Each view stays individually addressable by its quilt patch
    // id. (Quilts are immutable, so later additions — evolve-portrait, event
    // moments — are their own blobs; this quilt is just the mint batch.) Falls
    // back to per-blob upload if the quilt endpoint is unavailable.
    const stored = new Map<ViewSpec['label'], { url: string; chainId: string }>();
    try {
        const quilt = await blob.putQuilt(
            rendered.map((r) => ({
                identifier: r.view.label,
                bytes: r.bytes,
                contentType: 'image/png',
                tags: { kind: String(r.view.kind), view: r.view.label },
            })),
            { network: 'testnet', epochs: 30 },
        );
        for (const p of quilt.patches) {
            stored.set(p.identifier as ViewSpec['label'], { url: p.url, chainId: p.quiltPatchId });
        }
    } catch (err) {
        console.warn('[additional-views] quilt upload failed, falling back to per-blob:', err instanceof Error ? err.message : err);
        for (const r of rendered) {
            try {
                const put = await blob.putBlob(r.bytes, { network: 'testnet', contentType: 'image/png', epochs: 30 });
                stored.set(r.view.label, { url: put.url, chainId: put.blobId });
            } catch (e) {
                console.warn(`[additional-views] ${r.view.label} upload failed:`, e instanceof Error ? e.message : e);
            }
        }
    }

    // ── 3) anchor each stored view to the on-chain gallery (one append tx each) ──
    // Separate txs keep the saga/character object versions from clashing.
    for (const { view } of rendered) {
        const s = stored.get(view.label);
        if (!s) continue;
        urls[view.label] = s.url;
        if (input.dryRun || !admin) continue;
        try {
            const txb = new Transaction();
            const asset = txb.add(
                endlessTx.character.newMediaAsset({
                    kind: view.kind,
                    uri: s.url,
                    walrusBlobId: s.chainId ? Array.from(new TextEncoder().encode(s.chainId)) : [],
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
            console.warn(`[additional-views] ${view.label} anchor failed:`, err instanceof Error ? err.message : err);
        }
    }

    return {
        ok: true,
        appended,
        frontalUrl: urls['frontal'],
        artSheetUrl: urls['art-sheet'],
        humanReferenceUrl: urls['human-reference'],
        stageMakeupUrl: urls['stage-makeup'],
    };
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}

function mapSpecies(raw: string): string {
    const lower = raw.toLowerCase();
    if (!raw || lower === 'human' || raw === '人') return '人';
    return raw;
}

function stageRoleForPerson(person: string): string {
    if (/刀馬旦|武旦|女武生|武生/.test(person)) {
        return '刀馬旦或武旦扮相：利落短打或靠旗意象，英氣眼線，身段有武戲張力';
    }
    if (/女小生|坤生|小生/.test(person)) {
        return '越劇小生扮相：書生或少年才子類角色，眉眼乾淨，中性戲服與束髮頭套';
    }
    if (/青衣|正旦/.test(person)) {
        return '青衣扮相：端莊婦人或貞靜才女類角色，素雅水袖與柔和旦角妝';
    }
    if (/花旦/.test(person)) {
        return '花旦扮相：活潑少女或伶俐閨閣角色，明快旦角妝與輕巧戲服';
    }
    if (/老旦|老生/.test(person)) {
        return '老旦或老生扮相：年長角色，淡墨皺紋、沉穩眉眼與樸素戲服';
    }
    if (/丑/.test(person)) {
        return '丑角扮相：輕巧喜劇角色，小塊白鼻或淡彩丑妝，表情機敏';
    }
    if (/樂師|箱管|掌事|班主|經理/.test(person)) {
        return '後台人員偶登台的配角扮相：簡潔戲服，淡妝，身份克制不搶主角';
    }
    return '越劇常規角色扮相：依其氣質選擇小生、旦角或配角方向，淡彩戲妝';
}
