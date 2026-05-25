'use server';

/**
 * Server action — storyteller (admin keypair) signs `redeem_voucher_to_character`
 * to mint the actual Character, consuming the user's voucher.
 *
 * The 抽卡 model: once the user clicks "accept" on the LLM preview, this
 * runs server-side so the user doesn't need a second wallet signature.
 * Storyteller curation is encoded in the off-chain Recruitment (admin
 * published the job; that's the strategic decision), so per-redeem
 * curation is unnecessary.
 *
 * Returns the on-chain Character object id, ready for `/dossier?id=<id>`.
 */

import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx, ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { getAdminContext } from '../chain/admin-signer.js';

export interface RedeemVoucherInput {
    voucherId: string;
    sceneId: string;
    /** The previewed candidate the user accepted. */
    candidate: CharacterCandidate;
    /** Server-locked rolled values from previewCharacter result. */
    rolledValues: RolledAttribute[];
    /**
     * Hex-encoded voucher attribute_seed — stored on each AttributeValue
     * as provenance (lets readers verify the rolled values came from this
     * specific voucher).
     */
    attributeSeedHex: string;
}

export interface RedeemVoucherResult {
    ok: boolean;
    error?: string;
    /** On-chain Character object id. */
    characterId?: string;
    /** OwnerCap id transferred to the original voucher payer. */
    ownerCapId?: string;
    /** Transaction digest for receipts / explorer links. */
    digest?: string;
}

export async function redeemVoucher(input: RedeemVoucherInput): Promise<RedeemVoucherResult> {
    const deployment = ENDLESS_STORY_DEPLOYMENT;
    if (!deployment.packageId) {
        return { ok: false, error: '合約尚未部署 — packageId 為空。請先跑 cli deploy。' };
    }
    if (!deployment.storytellerCapId || !deployment.sagaId || !deployment.worldId) {
        return { ok: false, error: '世界尚未種子化 — 缺 storytellerCap / saga / world。請先跑 cli bootstrap。' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
    }

    let seedBytes: number[];
    try {
        const clean = input.attributeSeedHex.replace(/^0x/, '').trim();
        seedBytes = [];
        for (let i = 0; i < clean.length; i += 2) {
            seedBytes.push(parseInt(clean.slice(i, i + 2), 16));
        }
    } catch {
        return { ok: false, error: 'attributeSeedHex 格式錯誤' };
    }

    const tx = new Transaction();

    // Build the inline structs:
    //   1. PhysicalFacts
    //   2. CharacterProfile (wraps PhysicalFacts)
    //   3. media (empty for Phase 2 — image_url set via separate update tx)
    //   4. attributes vector (each with provenance seed)
    const physical = tx.add(
        endlessTx.character.newPhysicalFacts({
            species: 'human',
            gender: input.candidate.physicalFacts.gender,
            body: input.candidate.physicalFacts.body,
            ageYears: input.candidate.physicalFacts.age,
        }),
    );

    const profile = tx.add(
        endlessTx.character.newCharacterProfile({
            name: input.candidate.name,
            description: input.candidate.description,
            physicalFacts: physical,
        }),
    );

    // Phase 2: empty mediaAssets at mint. Image URL gets attached afterwards
    // via update_image_by_storyteller in a follow-up tx (or deferred to runner).
    const mediaAssets = tx.makeMoveVec({
        elements: [],
        type: `${deployment.packageId}::character::MediaAsset`,
    });

    // Attributes — locked rolled values, each tagged with the voucher seed
    // for provenance verification.
    const attrElements = input.rolledValues.map((rv) =>
        tx.add(
            endlessTx.character.newAttributeValue({
                key: rv.key,
                value: BigInt(rv.value),
                seed: seedBytes,
            }),
        ),
    );
    const attributes = tx.makeMoveVec({
        elements: attrElements,
        type: `${deployment.packageId}::character::AttributeValue`,
    });

    tx.add(
        endlessTx.recruit.redeemVoucherToCharacter({
            cap: deployment.storytellerCapId,
            saga: deployment.sagaId,
            world: deployment.worldId,
            scene: input.sceneId,
            voucher: input.voucherId,
            profile,
            mediaAssets,
            attributes,
        }),
    );

    let result;
    try {
        result = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true, showObjectChanges: true },
        });
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Parse Character + OwnerCap from objectChanges.
    let characterId: string | undefined;
    let ownerCapId: string | undefined;
    const changes = (result.objectChanges ?? []) as Array<{
        type: string;
        objectType?: string;
        objectId?: string;
    }>;
    for (const change of changes) {
        if (change.type !== 'created') continue;
        const ot = change.objectType ?? '';
        if (ot.endsWith('::character::Character')) characterId = change.objectId;
        else if (ot.endsWith('::character::OwnerCap')) ownerCapId = change.objectId;
    }

    if (!characterId) {
        return {
            ok: false,
            error: '交易成功但找不到 Character object — 請檢查 explorer',
            digest: result.digest,
        };
    }

    return { ok: true, characterId, ownerCapId, digest: result.digest };
}
