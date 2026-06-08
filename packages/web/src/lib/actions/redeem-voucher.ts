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
import { generatePersonaAction } from './generate-persona.js';
import { affirmMintPublicTagsAction } from './affirm-public-tags.js';
import { assessAndApplyRelationshipsAction } from './assess-relationships.js';

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
    /** Off-chain recruitment specialty. Used to write the public `role:*` identity tag. */
    recruitmentSpecialty?: string;
    /** Off-chain recruitment role intent. Used to derive visible social identity tags. */
    recruitmentIntent?: string;
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

/**
 * Run a post-mint enrichment step with light retry. Retries on a thrown error
 * OR a returned `{ ok: false }` (the actions catch their own errors and report
 * via `ok`, so a bare try/catch wouldn't see a failed tx). Used to ride out the
 * occasional transient publisher / SEAL / gas hiccup now that the steps run
 * serially (no more concurrent admin-gas contention to retry around).
 */
async function withRetry<T extends { ok?: boolean }>(
    label: string,
    fn: () => Promise<T>,
    tries = 2,
): Promise<T | null> {
    for (let attempt = 1; attempt <= tries; attempt += 1) {
        try {
            const r = await fn();
            if (r?.ok !== false) return r;
            console.warn(
                `[redeem-voucher] ${label} attempt ${attempt}/${tries} not ok:`,
                (r as { error?: string }).error ?? '',
            );
        } catch (err) {
            console.warn(
                `[redeem-voucher] ${label} attempt ${attempt}/${tries} threw:`,
                err instanceof Error ? err.message : err,
            );
        }
        if (attempt < tries) await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
    console.warn(`[redeem-voucher] ${label} gave up after ${tries} attempts`);
    return null;
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

    // Post-mint enrichment — runs in ONE `after()` (post-response, never blocks the
    // mint UI) and SEQUENTIALLY. The admin-signed steps (tags → persona → views) all
    // sign with the SAME gas coin; as separate concurrent after() blocks they raced +
    // equivocated, so a character could silently land with no tags / no persona while
    // another got everything. Serial = no contention; each step has light retry and is
    // failure-isolated (the Character is already on chain). Memory seeding (MemWal, no
    // gas) runs last. All steps read the on-chain profile, which exists post-tx.
    //
    // NOTE: this is the same work the reconciler (admin 對帳/補發) performs — anything
    // missed here is recoverable there, so the mint never has to wait on it.
    {
        const charId = characterId;
        const sceneId = input.sceneId;
        const candidate = input.candidate;
        const rolledValues = input.rolledValues;
        const recruitmentSpecialty = input.recruitmentSpecialty;
        const recruitmentIntent = input.recruitmentIntent;
        const portraitUrl = input.portraitUrl;
        after(async () => {
            // 1) public identity tags (role:* + social labels)
            const tagRes = await withRetry('public-tags', () =>
                affirmMintPublicTagsAction({
                    characterId: charId,
                    sceneId,
                    characterName: candidate.name,
                    candidate,
                    rolledValues,
                    recruitmentSpecialty,
                    recruitmentIntent,
                }),
            );
            console.log(
                `[redeem-voucher] tags for ${charId}: ` +
                    (tagRes?.ok ? (tagRes.tags ?? []).join('|') : 'failed'),
            );

            // 2) persona (本色) — distil + anchor on the content road
            const personaRes = await withRetry('persona', () => generatePersonaAction(charId));
            console.log(
                `[redeem-voucher] persona for ${charId}: ` +
                    (personaRes?.ok ? `v${personaRes.version}` : `failed${personaRes?.skipped ? `(${personaRes.skipped})` : ''}`),
            );

            // 3) §11 additional 設定集 views (frontal + art sheet) via img2img
            if (portraitUrl) {
                const viewsRes = await withRetry('additional-views', () =>
                    generateAdditionalViews({ characterId: charId, referenceUrl: portraitUrl }),
                );
                console.log(`[redeem-voucher] views for ${charId}: appended=${viewsRes?.appended ?? 0}`);
            }

            // 4) genesis memories (MemWal — no admin gas, so it can't contend; run last).
            //    Pass the candidate's private `secret` (never on-chain) so the inner
            //    backstory surfaces as private recalled memories.
            try {
                const seedRes = await seedGenesisMemoryAction(charId, undefined, input.candidate.secret);
                console.log(
                    `[redeem-voucher] memories for ${charId}: ` +
                        (seedRes.skipped ? `skipped(${seedRes.skipped})` : String(seedRes.seeded ?? 0)),
                );
            } catch (err) {
                console.warn(`[redeem-voucher] genesis memory seeding failed for ${charId}:`, err);
            }

            // 5) relationship ties — assess this character vs the roster from public
            //    descriptions, then seed symmetric director ties (公開關係圖) + symmetric
            //    memories on both sides. Admin-signed (relationship_seed), so it runs after
            //    the other admin-gas steps. Idempotent (skips pairs already tied) → the
            //    admin 關係補帳 panel can re-run / backfill earlier characters safely.
            const relRes = await withRetry('relationships', () =>
                assessAndApplyRelationshipsAction(charId),
            );
            console.log(
                `[redeem-voucher] relationships for ${charId}: ` +
                    (relRes?.ok
                        ? `seeded=${relRes.seeded}${relRes.skipped ? ` skipped(${relRes.skipped})` : ''}`
                        : 'failed'),
            );
        });
    }

    return { ok: true, characterId, ownerCapId, digest: result.digest };
}
