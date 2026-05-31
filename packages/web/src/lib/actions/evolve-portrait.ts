'use server';

/**
 * §11 — evolve a character's portrait (AI-native dynamic NFT).
 *
 * The NFT's art isn't a frozen mint image: it GROWS with the story. This
 * action renders a new portrait variant conditioned on the same person
 * (physical_facts = the durable anchor) + an OCCASION (戲妝 / 老年 / 日常 / a
 * dramatic moment), uploads it to Walrus, and updates `image_url` on chain
 * via `update_image_by_storyteller` — which emits `CharacterImageUpdated`.
 * That event chain IS the dynamic-NFT trail: a verifiable history of how the
 * portrait evolved, each variant anchored.
 *
 * Consistency rule (§11 鐵律): every variant is conditioned on the mint-time
 * physical_facts so it's the SAME person in a new moment, not a new face.
 * (gpt-image-2 is text-to-image, so we anchor via the physical_facts text
 * rather than an image reference.)
 *
 * Storyteller-signed (admin cap) here — the director-driven trigger. An
 * owner-paid path would use `update_image_by_owner` signed by the owner.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import { generatePortrait } from './generate-portrait';

export type PortraitOccasionKind =
    | 'reference'
    | 'stage'
    | 'finery'
    | 'daily'
    | 'youth'
    | 'aged'
    | 'illness'
    | 'snow'
    | 'custom';

/** Per-kind situational framing — short, evocative, visually distinct (for
 *  demo). Drives makeup / costume / age / scene. The anchor curator strips
 *  these (it's 素顏-only), so the variant builds its OWN prompt and renders
 *  it directly via promptOverride. */
const OCCASION_BY_KIND: Record<Exclude<PortraitOccasionKind, 'custom'>, string> = {
    reference: '正式設定形象：端正面向觀者、神情沉靜，純色底、自然光、半身。',
    stage: '登台演出：勾臉上彩的京劇戲妝、戴頭面、穿蟒袍戲服，舞台燈光，半身。',
    finery: '一身上等綢緞華服、配飾講究，雍容貴氣，半身。',
    daily: '後台卸了妝的尋常一刻：素常服、神情鬆弛、帶生活感。',
    youth: '更年輕幾歲：眉眼青澀、未脫稚氣，衣著樸素，半身。',
    aged: '多年以後：白髮、面有風霜皺紋、氣度蒼勁，樸素常服，半身。',
    illness: '久病清減：面色蒼白、形容憔悴、披衣倚枕，神情倦怠。',
    snow: '風雪夜中：披斗篷、肩頭落雪、呵氣成霜，神情堅毅。',
};

const VARIANT_TONE = '水墨工筆畫風格，宣紙暈染邊緣，淡墨線描 + 水彩設色。';
const VARIANT_NEG = '不要動漫感、不要油畫感、不要寫實照片。';

export interface EvolvePortraitInput {
    characterId: string;
    kind: PortraitOccasionKind;
    /** Free-text occasion (used when kind='custom', or appended otherwise). */
    occasion?: string;
    /** Preview only — render but don't anchor on chain. */
    dryRun?: boolean;
}

export interface EvolvePortraitResult {
    ok: boolean;
    /** New Walrus aggregator URL written to image_url. */
    url?: string;
    /** Base64 PNG for immediate preview before Walrus settles. */
    base64?: string;
    blobId?: string;
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

    const framing =
        input.kind === 'custom'
            ? input.occasion?.trim() || '一個尋常的午後'
            : [OCCASION_BY_KIND[input.kind], input.occasion?.trim()].filter(Boolean).join(' ');

    // Build the variant prompt DIRECTLY (the anchor curator would strip the
    // occasion — it's hardwired to 素顏/無戲妝). Anchor on physical_facts +
    // role so it stays the same person; the framing drives makeup/costume.
    const genderAge = `${mapGender(pf.gender ?? '')}，${Number(pf.age_years ?? 0)} 歲`;
    const personLine = `${role ?? '梨園中人'}，${genderAge}，${physicalFacts}（同一個人，保持體態與氣質一致）。`;
    const variantPrompt = [VARIANT_TONE, personLine, framing, VARIANT_NEG]
        .filter(Boolean)
        .join('\n');

    // Render the exact prompt (skip anchor curation) → Walrus.
    const gen = await generatePortrait({
        character: {
            description: personLine,
            physical: {
                gender: mapGender(pf.gender ?? ''),
                ageYears: Number(pf.age_years ?? 0),
                body: pf.body ?? '',
            },
            attributes: [],
        },
        toneHint: VARIANT_TONE,
        promptOverride: variantPrompt,
    });
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

    // Anchor on chain: update image_url + emit CharacterImageUpdated.
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗', url: gen.url };
    }
    try {
        const txb = new Transaction();
        txb.add(
            endlessTx.character.updateImageByStoryteller({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                character: input.characterId,
                newImageUrl: gen.url,
            }),
        );
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        const okChain = res.effects?.status?.status === 'success';
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        return {
            ok: okChain,
            url: gen.url,
            base64: gen.base64,
            blobId: gen.blobId,
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
