'use server';

/**
 * §11 — evolve a character's portrait (AI-native dynamic NFT).
 *
 * The NFT's art isn't a frozen mint image: it GROWS with the story. This
 * action renders a new portrait variant conditioned on the same person
 * (physical_facts = the durable anchor) + an OCCASION (stage-makeup / old-age / everyday / a
 * dramatic moment), uploads it to Walrus, then appends it to the on-chain
 * gallery via `add_media_asset_by_storyteller`. It deliberately does NOT
 * update `image_url`; the owner later chooses the public cover from the
 * accumulated setting gallery with `set_cover_from_media`.
 *
 * Consistency rule (§11 iron law): every variant is conditioned on the mint-time
 * physical_facts so it's the SAME person in a new moment, not a new face.
 * (gpt-image-2 is text-to-image, so we anchor via the physical_facts text
 * rather than an image reference.)
 *
 * Storyteller-signed (admin cap) here — the director-driven trigger. An
 * owner-paid path would use `update_image_by_owner` signed by the owner.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read, tx as endlessTx } from '@endless-story/sdk';
import { createImageClient } from '@endless-story/llm/image';
import { blob } from '@endless-story/memwal';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import { evolveVariantPrompt, evolveVariantTone } from '@/lib/image-prompts';
import { buildStagePrompt, type StageSlots } from '@/lib/stage-prompt';
import { generatePortrait } from './generate-portrait';
import { curateStageSlots } from './stage-curator';

export type PortraitOccasionKind =
    | 'reference'
    | 'stage'
    | 'stage-real'
    | 'finery'
    | 'daily'
    | 'youth'
    | 'aged'
    | 'illness'
    | 'snow'
    | 'realistic'
    | 'custom';

/** Kinds that need the ACTUAL face preserved → rendered img2img off the base
 *  anchor portrait (edit endpoint), NOT the text-anchored look-alike path:
 *   - realistic   : real-person photo of the same face
 *   - stage-real  : real-person photo with painted opera makeup on that face
 *   - stage       : ink-wash portrait with painted opera makeup on that face
 *  All three build their own prompt and feed it through `renderFromAnchor`. */
type Img2ImgKind = 'realistic' | 'stage-real' | 'stage';
function isImg2ImgKind(kind: PortraitOccasionKind): kind is Img2ImgKind {
    return kind === 'realistic' || kind === 'stage-real' || kind === 'stage';
}

/** Per-kind situational framing — short, evocative, visually distinct (for
 *  demo). Drives costume / age / scene. The anchor curator strips these (it's
 *  bare-face-only), so the variant builds its OWN prompt and renders it directly
 *  via promptOverride. (makeup/realistic kinds go through isImg2ImgKind instead.) */
const OCCASION_BY_KIND: Record<
    Exclude<PortraitOccasionKind, 'custom' | 'realistic' | 'stage' | 'stage-real'>,
    string
> = {
    reference: '正式設定形象：端正面向觀者、神情沉靜，純色底、自然光、半身。',
    finery: '一身上等綢緞華服、配飾講究，雍容貴氣，半身。',
    daily: '後台卸了妝的尋常一刻：素常服、神情鬆弛、帶生活感。',
    youth: '更年輕幾歲：眉眼青澀、未脫稚氣，衣著樸素，半身。',
    aged: '多年以後：白髮、面有風霜皺紋、氣度蒼勁，樸素常服，半身。',
    illness: '久病清減：面色蒼白、形容憔悴、披衣倚枕，神情倦怠。',
    snow: '風雪夜中：披斗篷、肩頭落雪、呵氣成霜，神情堅毅。',
};

// ── img2img anchor prompts (face preserved off the base portrait) ──
/** Photo variants: only forbid stray text (realism is the whole point). */
const PHOTO_GUARD = '畫面中不得出現任何文字、浮水印、邊框或排版框線。';

/**
 * The opera行當 for the makeup variants follows the character's actual `role`,
 * NOT their gender — 反串 (cross-gender casting: 坤生 a woman playing 生行,
 * 乾旦 a man playing 旦行) is core to this troupe, so a gender guess would put
 * the wrong makeup on the face. Resolve 反串 to the PERFORMING line; otherwise
 * pass the role through. Only fall back to a generic hint when role is unknown.
 */
function stageRoleHint(role: string | undefined): string {
    const r = role?.trim();
    if (!r) return '依此角色的行當';
    if (/坤生|乾生/.test(r)) return '小生（生行俊扮）';
    if (/乾旦|坤旦/.test(r)) return '旦角（旦行扮相）';
    return r; // already a 行當 like 小生 / 老生 / 花旦 / 青衣 / 武生 / 淨 / 丑
}

/** realistic — real-person photo of the same face. */
function realisticPrompt(person: string, extra: string): string {
    return (
        `寫實真人肖像攝影：與參考圖同一個人、同一張臉（五官、髮型、神態保持一致），${person}${extra}。` +
        `自然光、真實膚質與衣料質感、淺景深、半身正面肖像，照片寫真感。${PHOTO_GUARD}`
    );
}

/**
 * stage / stage-real — painted opera makeup on the base face, via the structured
 * 戲妝 builder (Hybrid): LLM-curated dramaturgical slots (play / scene / pose…) +
 * role-default makeup/headpiece/costume, with an optional caller override merged
 * on top. Only `styleMode` separates the two kinds (ink-wash vs real-photo).
 */
async function buildStageImgPrompt(
    kind: 'stage' | 'stage-real',
    pf: { gender?: string; age_years?: number | string },
    role: string | undefined,
    occasion: string | undefined,
    override?: Partial<StageSlots>,
): Promise<string> {
    const gender = mapGender(pf.gender ?? '');
    const roleType = stageRoleHint(role);
    const curated = await curateStageSlots({
        roleType,
        occasion,
        gender,
        ageYears: Number(pf.age_years ?? 0) || undefined,
    });
    const styleMode = kind === 'stage-real' ? '寫實真人舞台劇照' : '淡彩水墨工筆畫風';
    // Sanitize the override: keep only non-empty string slots (the JSON comes from
    // an admin textarea, so a stray number must not reach buildStagePrompt's .trim()).
    const cleanOverride: Record<string, string> = {};
    if (override) {
        for (const [k, val] of Object.entries(override)) {
            if (typeof val === 'string' && val.trim()) cleanOverride[k] = val.trim();
        }
    }
    const slots: StageSlots = {
        styleMode,
        roleType,
        ...curated,
        ...cleanOverride,
    };
    return buildStagePrompt(slots);
}

/** Build the img2img prompt for a face-preserving kind. */
async function buildAnchorPrompt(
    kind: Img2ImgKind,
    pf: { gender?: string; age_years?: number | string },
    role: string | undefined,
    occasion?: string,
    override?: Partial<StageSlots>,
): Promise<string> {
    if (kind === 'realistic') {
        const gender = mapGender(pf.gender ?? '');
        const person = `${role ?? '梨園中人'}，${gender}，${Number(pf.age_years ?? 0)} 歲`;
        const extra = occasion?.trim() ? `（${occasion.trim()}）` : '';
        return realisticPrompt(person, extra);
    }
    return buildStageImgPrompt(kind, pf, role, occasion, override);
}

export interface EvolvePortraitInput {
    characterId: string;
    kind: PortraitOccasionKind;
    /** Free-text occasion (used when kind='custom', or appended otherwise). */
    occasion?: string;
    /** Advanced (stage / stage-real only): override any LLM-curated 戲妝 slot —
     *  merged on top of the curated + role-default slots before rendering. */
    slotsOverride?: Partial<StageSlots>;
    /** Preview only — render but don't anchor on chain. */
    dryRun?: boolean;
}

export interface EvolvePortraitResult {
    ok: boolean;
    /** New Walrus aggregator URL appended to the setting gallery. */
    url?: string;
    /** Base64 PNG for immediate preview before Walrus settles. */
    base64?: string;
    blobId?: string;
    /** Index in Character.media_assets when anchored. */
    mediaIndex?: number;
    promptUsed?: string;
    digest?: string;
    anchored?: boolean;
    error?: string;
}

export async function evolvePortraitAction(
    input: EvolvePortraitInput,
): Promise<EvolvePortraitResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });
    const [charRes, role] = await Promise.all([
        read.character.getCharacter(client, input.characterId).catch(() => null),
        resolveRole(input.characterId).catch(() => null),
    ]);
    if (!charRes) return { ok: false, error: '讀取角色失敗' };

    const cj = charRes.json as unknown as {
        image_url?: string;
        media_assets?: Array<{ uri?: string }>;
        profile?: {
            name?: string;
            physical_facts?: {
                species?: string;
                gender?: string;
                body?: string;
                age_years?: number | string;
            };
        };
        attributes?: Array<{ key?: string; value?: number | string }>;
    };
    const pf = cj.profile?.physical_facts ?? {};
    const physicalFacts = [pf.species, pf.body].filter(Boolean).join(' / ') || '—';

    // Face-preserving kinds (真人版 / 真人戲妝 / 水墨戲妝): these need the ACTUAL
    // face, so they're img2img off the character's anchor portrait (edit endpoint)
    // with a per-kind prompt — NOT the text-anchored path (which only reproduces
    // physical_facts, a look-alike). The makeup kinds paint opera油彩 onto the base face.
    let gen: { ok: boolean; url?: string; base64?: string; blobId?: string; promptUsed?: string; error?: string };
    if (isImg2ImgKind(input.kind)) {
        const prompt = await buildAnchorPrompt(
            input.kind,
            pf,
            role ?? undefined,
            input.occasion,
            input.slotsOverride,
        );
        gen = await renderFromAnchor(cj, prompt);
    } else {
        const framing =
            input.kind === 'custom'
                ? input.occasion?.trim() || '一個尋常的午後'
                : [OCCASION_BY_KIND[input.kind], input.occasion?.trim()].filter(Boolean).join(' ');

        // Build the variant prompt DIRECTLY (the anchor curator would strip the
        // occasion — it's hardwired to bare-face/no-stage-makeup). Anchor on physical_facts +
        // role so it stays the same person; the framing drives makeup/costume.
        const genderAge = `${mapGender(pf.gender ?? '')}，${Number(pf.age_years ?? 0)} 歲`;
        const personLine = `${role ?? '梨園中人'}，${genderAge}，${physicalFacts}（同一個人，保持體態與氣質一致）。`;
        const variantPrompt = evolveVariantPrompt(personLine, framing);

        // Render the exact prompt (skip anchor curation) → Walrus.
        gen = await generatePortrait({
            character: {
                description: personLine,
                physical: {
                    gender: mapGender(pf.gender ?? ''),
                    ageYears: Number(pf.age_years ?? 0),
                    body: pf.body ?? '',
                },
                attributes: [],
            },
            toneHint: evolveVariantTone,
            promptOverride: variantPrompt,
        });
    }
    if (!gen.ok || !gen.url) {
        // Distinguish "image render failed" from "rendered but Walrus upload
        // was rate-limited" (gen.ok + base64 present, just no url).
        const error =
            gen.error ??
            (gen.base64
                ? '圖已生成，但 Walrus 上傳被限流（429）。請稍後重試，並避免同時跑 world-loop（會搶 Walrus publisher）。'
                : '出圖失敗');
        return { ok: false, error, base64: gen.base64, promptUsed: gen.promptUsed };
    }

    if (input.dryRun) {
        return {
            ok: true,
            url: gen.url,
            base64: gen.base64,
            blobId: gen.blobId,
            promptUsed: gen.promptUsed,
            anchored: false,
        };
    }

    // Anchor on chain: append to media_assets; cover stays owner-controlled.
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗', url: gen.url };
    }
    try {
        const txb = new Transaction();
        const asset = txb.add(
            endlessTx.character.newMediaAsset({
                kind: mediaKindForOccasion(input.kind),
                uri: gen.url,
                walrusBlobId: gen.blobId ? Array.from(new TextEncoder().encode(gen.blobId)) : [],
                metadataUri: buildVariantMetadataUri(input.kind, input.occasion),
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
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true, showEvents: true },
        });
        const okChain = res.effects?.status?.status === 'success';
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        const mediaIndex = extractMediaAssetIndex(res.events ?? []);
        return {
            ok: okChain,
            url: gen.url,
            base64: gen.base64,
            blobId: gen.blobId,
            mediaIndex,
            promptUsed: gen.promptUsed,
            anchored: okChain,
            digest: res.digest,
            error: okChain ? undefined : (res.effects?.status?.error ?? '上鏈失敗'),
        };
    } catch (err) {
        return {
            ok: false,
            url: gen.url,
            base64: gen.base64,
            blobId: gen.blobId,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

function mapGender(raw: string): string {
    if (raw === '男' || raw.toLowerCase() === 'male') return '男';
    if (raw === '女' || raw.toLowerCase() === 'female') return '女';
    return '中性';
}

/**
 * Render a face-preserving variant by feeding the character's anchor BASE
 * portrait into the image-edit (img2img) endpoint as a reference, so the actual
 * face/features survive while the caller-supplied `prompt` drives style and
 * makeup (real-person photo, painted opera makeup, etc.). Returns the same shape
 * as `generatePortrait` so the caller's anchor-on-chain path is unchanged.
 */
async function renderFromAnchor(
    cj: {
        image_url?: string;
        media_assets?: Array<{ uri?: string }>;
    },
    prompt: string,
): Promise<{ ok: boolean; url?: string; base64?: string; blobId?: string; promptUsed?: string; error?: string }> {
    // ALWAYS use the BASE anchor = media_assets[0] (the mint-time portrait), NOT
    // image_url (the owner-set cover, which may point at any later variant).
    const anchorUrl = cj.media_assets?.[0]?.uri || cj.image_url || '';
    if (!anchorUrl) return { ok: false, promptUsed: prompt, error: '此角色尚無基底肖像可作參考' };

    let refBytes: Uint8Array;
    try {
        const r = await fetch(anchorUrl);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refBytes = new Uint8Array(await r.arrayBuffer());
        if (refBytes.length === 0) throw new Error('empty reference');
    } catch (err) {
        return { ok: false, promptUsed: prompt, error: `讀取基底肖像失敗：${err instanceof Error ? err.message : String(err)}` };
    }

    let imgClient;
    try {
        imgClient = createImageClient();
    } catch {
        return { ok: false, promptUsed: prompt, error: 'image 服務未設定（缺 OPENAI_API_KEY）' };
    }

    try {
        const res = await imgClient.edit({
            prompt,
            images: [refBytes],
            aspectRatio: '4:5',
            quality: 'medium',
            n: 1,
        });
        const img = res.images[0];
        const bytes = img?.base64
            ? Uint8Array.from(Buffer.from(img.base64, 'base64'))
            : img?.url
              ? new Uint8Array(await (await fetch(img.url)).arrayBuffer())
              : null;
        if (!bytes || bytes.length === 0) return { ok: false, promptUsed: prompt, error: '出圖為空' };
        const base64 = img?.base64 ?? Buffer.from(bytes).toString('base64');
        try {
            const put = await blob.putBlob(bytes, { network: 'testnet', contentType: 'image/png', epochs: 5 });
            return { ok: true, url: put.url, base64, blobId: put.blobId, promptUsed: prompt };
        } catch {
            // Rendered but Walrus upload was rate-limited — still return the
            // base64 so the lab can preview it (caller handles missing url).
            return { ok: true, base64, promptUsed: prompt };
        }
    } catch (err) {
        return { ok: false, promptUsed: prompt, error: err instanceof Error ? err.message : String(err) };
    }
}

function mediaKindForOccasion(kind: PortraitOccasionKind): number {
    if (kind === 'reference') return 6; // setting sheet / stable reference
    if (kind === 'stage' || kind === 'stage-real') return 3; // makeup
    if (kind === 'finery') return 2; // costume
    return 0; // portrait variant
}

function buildVariantMetadataUri(kind: PortraitOccasionKind, occasion?: string): string {
    const params = new URLSearchParams({ kind });
    const trimmed = occasion?.trim();
    if (trimmed) params.set('occasion', trimmed);
    return `endless://portrait-variant?${params.toString()}`;
}

interface SuiEventLike {
    type?: string;
    parsedJson?: unknown;
}

function extractMediaAssetIndex(events: SuiEventLike[]): number | undefined {
    for (const ev of events) {
        if (!ev.type?.endsWith('::character::MediaAssetAdded')) continue;
        const parsed = ev.parsedJson as { index?: string | number } | undefined;
        const n = Number(parsed?.index);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}
