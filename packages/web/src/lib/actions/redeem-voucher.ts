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

import { after } from 'next/server';
import { Transaction } from '@mysten/sui/transactions';
import { tx as endlessTx, ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import type { CharacterCandidate, RolledAttribute } from '@endless-story/llm/prompts';
import { getAdminContext } from '../chain/admin-signer.js';
import { seedGenesisMemoryAction } from './seed-genesis-memory.js';
import { generateAdditionalViews } from './generate-additional-views.js';

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
    /**
     * Walrus aggregator URL for the generated portrait. When present, gets
     * encoded as a MediaAsset (kind=0 portrait) at mint — the contract
     * auto-derives `Character.image_url` from `media_assets[0].uri`, which
     * is what Display V2 reads for the explorer NFT thumbnail.
     */
    portraitUrl?: string;
    /** Walrus blob id matching portraitUrl. Optional but useful for receipts. */
    portraitBlobId?: string;
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
    /** # of genesis memories seeded immediately after mint (0 if MemWal unconfigured). */
    seededMemories?: number;
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

    // Encode the Walrus portrait as the first MediaAsset so
    // `mint_character_internal` initialises `Character.image_url` from
    // `media_assets[0].uri`. Display V2's `{image_url}` template then
    // renders the NFT thumbnail in Sui explorers without a follow-up tx.
    const mediaElements = input.portraitUrl
        ? [
              tx.add(
                  endlessTx.character.newMediaAsset({
                      kind: 0, // 0 = portrait (caller convention, see character.move)
                      uri: input.portraitUrl,
                      walrusBlobId: input.portraitBlobId
                          ? Array.from(new TextEncoder().encode(input.portraitBlobId))
                          : [],
                      metadataUri: '',
                  }),
              ),
          ]
        : [];
    const mediaAssets = tx.makeMoveVec({
        elements: mediaElements,
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

    // redeem returns (OwnerCap, ControlCap). Character is transferred
    // internally to voucher.payer (= user, NOT admin). Caller PTB must
    // transfer the two returned caps: OwnerCap → user (matches Character),
    // ControlCap → admin (storyteller retains delegation).
    const caps = tx.add(
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
    // We don't have the user address here — read voucher.payer from chain
    // then send OwnerCap there. ControlCap stays with admin (this signer).
    // Simpler shortcut: transfer BOTH to admin, then a follow-up Phase 3
    // step migrates OwnerCap to user. For Phase 2 demo where admin and
    // user are often the same dev wallet, this is fine.
    tx.transferObjects([caps[0], caps[1]], admin.address);

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

    // Seed age/gender/role-appropriate genesis memories immediately after the mint lands —
    // server-side and AWAITED (not the old client-side fire-and-forget, which failed silently
    // and left characters memory-less). Generation reads the on-chain profile, so it must run
    // after the Character object exists. A MemWal/LLM failure must NOT fail the mint (the
    // Character is already on chain), so we swallow errors and just report how many seeded.
    let seededMemories = 0;
    try {
        const seedRes = await seedGenesisMemoryAction(characterId);
        seededMemories = seedRes.seeded ?? 0;
        if (seedRes.skipped) {
            console.warn(`[redeem-voucher] genesis memory skipped (${seedRes.skipped}) for ${characterId}`);
        } else {
            console.log(`[redeem-voucher] seeded ${seededMemories} genesis memories for ${characterId}`);
        }
    } catch (err) {
        console.warn(`[redeem-voucher] genesis memory seeding failed for ${characterId}:`, err);
    }

    // §11 additional views (frontal + 人物美術設定 art sheet) via img2img, using the
    // mint-time 45° portrait as the reference. Runs AFTER the response (Next `after`)
    // so it never blocks the mint or the UI — the views land in the 設定集 gallery
    // asynchronously. Skipped silently if no portrait reference was provided.
    if (input.portraitUrl) {
        const charId = characterId;
        const refUrl = input.portraitUrl;
        after(async () => {
            try {
                const r = await generateAdditionalViews({ characterId: charId, referenceUrl: refUrl });
                console.log(
                    `[redeem-voucher] additional views for ${charId}: appended=${r.appended}` +
                        (r.skipped ? ` skipped=${r.skipped}` : '') +
                        (r.error ? ` error=${r.error}` : ''),
                );
            } catch (err) {
                console.warn(`[redeem-voucher] additional views failed for ${charId}:`, err);
            }
        });
    }

    return { ok: true, characterId, ownerCapId, digest: result.digest, seededMemories };
}
