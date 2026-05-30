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

export type PortraitOccasionKind = 'reference' | 'stage' | 'aged' | 'daily' | 'custom';

/** Per-kind situational framing folded into the variant prompt. */
const OCCASION_BY_KIND: Record<Exclude<PortraitOccasionKind, 'custom'>, string> = {
    reference: '正式設定形象，端正面對觀者，神情沉靜。',
    stage: '此刻正登台演出，著戲服、上了濃重戲妝，眼神入戲。',
    aged: '多年以後，歲月在臉上留下痕跡，氣度更見蒼勁。',
    daily: '後台卸了妝的尋常一刻，神情鬆弛、帶著生活感。',
};

const ATTR_LABEL: Record<string, string> = {
    appearance: '外貌',
    constitution: '筋骨',
    acuity: '機敏',
    disposition: '心性',
};

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
    const name = cj.profile?.name ?? '無名';
    const pf = cj.profile?.physical_facts ?? {};
    const physicalFacts = [pf.species, pf.body].filter(Boolean).join(' / ') || '—';

    const occasionText =
        input.kind === 'custom'
            ? input.occasion?.trim() || '一個尋常的午後'
            : [OCCASION_BY_KIND[input.kind], input.occasion?.trim()].filter(Boolean).join(' ');

    // Variant description — anchored on physical_facts (same person) + occasion.
    const description = [
        `${name}，${role ?? '梨園中人'}。`,
        `外形（必須一致）：${physicalFacts}。`,
        `此刻情境：${occasionText}`,
    ].join(' ');

    const attributes = (cj.attributes ?? [])
        .filter((a): a is { key: string; value: number | string } => typeof a?.key === 'string')
        .map((a) => ({
            key: a.key,
            label: ATTR_LABEL[a.key] ?? a.key,
            value: Number(a.value ?? 0),
        }));

    // Reuse the curate→render→Walrus pipeline.
    const gen = await generatePortrait({
        character: {
            description,
            physical: {
                gender: mapGender(pf.gender ?? ''),
                ageYears: Number(pf.age_years ?? 0),
                body: pf.body ?? '',
            },
            attributes,
        },
        toneHint: '', // default ink-wash tone keeps the series visually consistent
        recruitmentIntent: occasionText,
    });
    if (!gen.ok || !gen.url) {
        return { ok: false, error: gen.error ?? '出圖失敗', base64: gen.base64, promptUsed: gen.promptUsed };
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
