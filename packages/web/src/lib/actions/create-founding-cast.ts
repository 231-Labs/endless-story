'use server';

/**
 * 創世入口 — saga owner directly mints a batch of founding-cast characters
 * (no gacha voucher) and weaves them with a single batch induction (mode B).
 *
 * Flow:
 *   per spec → roll attributes (own seed) → generate portrait (await, so a
 *     founding member is never headless) → mint_genesis_character (admin-signed,
 *     portrait baked in) → public tags + persona.
 *   then ONCE over the whole cast → runBatchFounding (mode B: each member's self
 *     memories + the full pairwise prior web, shared scenes written once) →
 *     write self memories into MemWal + seed symmetric director ties.
 *
 * Direct mint (mint_genesis_character) instead of the voucher create→redeem path:
 * no voucher, admin chooses owner_recipient. OwnerCap + ControlCap go to admin
 * (founding cast are storyteller-run).
 */

import { randomBytes } from 'node:crypto';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { induction as runnerInduction } from '@endless-story/runner';
import { rollAttributesFromSeed } from '@endless-story/llm/seed';
import type { CharacterCandidate } from '@endless-story/llm/prompts';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { isMemoryConfigured, rememberForCharacter } from '@/lib/chain/memory';
import { sagasApi } from '@/lib/api/index';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '../config/attribute-schema.js';
import { generatePortrait } from './generate-portrait.js';
import { affirmMintPublicTagsAction } from './affirm-public-tags.js';
import { generatePersonaAction } from './generate-persona.js';
import { applyRelationshipTiesAction, type ProposedTie } from './assess-relationships.js';

export interface FoundingCharSpec {
    name: string;
    ageYears: number;
    /** '男' | '女' | '中性' | … */
    gender: string;
    /** 行當 / specialty (also the public role tag). */
    role: string;
    description: string;
    /** Private secret — feeds only this character's self memories. */
    secret?: string;
    /** Body free-text; default '勻稱'. */
    body?: string;
}

export interface CreateFoundingCastInput {
    specs: FoundingCharSpec[];
    /** Scene to mint into; default deployment.sceneIds[0]. */
    sceneId?: string;
}

export interface FoundingMintedEntry {
    id: string;
    name: string;
    digest?: string;
    /** false = minted without a cover (portrait gen failed; reconcile can backfill). */
    portrait: boolean;
}

export interface CreateFoundingCastResult {
    ok: boolean;
    minted: FoundingMintedEntry[];
    failures: { name: string; error: string }[];
    /** Total self memories written across the cast. */
    selfSeeded: number;
    /** Pairwise ties seeded. */
    tiesSeeded: number;
    inductionSkipped?: 'memory_unconfigured';
    error?: string;
}

const EMPTY = { minted: [] as FoundingMintedEntry[], failures: [] as { name: string; error: string }[], selfSeeded: 0, tiesSeeded: 0 };

export async function createFoundingCastAction(
    input: CreateFoundingCastInput,
): Promise<CreateFoundingCastResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.storytellerCapId || !d.sagaId || !d.worldId) {
        return { ok: false, ...EMPTY, error: 'world 尚未種子化（缺 package / storytellerCap / saga / world）' };
    }
    const sceneId = input.sceneId || d.sceneIds[0];
    if (!sceneId) return { ok: false, ...EMPTY, error: '無可用 scene — 種子化未完成' };

    const specs = (input.specs ?? []).filter((s) => s.name?.trim() && s.description?.trim());
    if (specs.length === 0) return { ok: false, ...EMPTY, error: '沒有有效的角色設定（需姓名 + 描述）' };

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, ...EMPTY, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
    }

    const minted: FoundingMintedEntry[] = [];
    const failures: { name: string; error: string }[] = [];
    const members: runnerInduction.FoundingMember[] = [];

    // ── per spec: roll → portrait → mint → tags + persona ──
    for (const spec of specs) {
        try {
            const body = spec.body?.trim() || '勻稱';
            const seed = randomBytes(32);
            const seedBytes = Array.from(seed);
            const rolled = rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA);
            const candidate: CharacterCandidate = {
                name: spec.name.trim(),
                description: spec.description.trim(),
                secret: spec.secret?.trim() ?? '',
                physicalFacts: { gender: spec.gender, age: spec.ageYears, body },
                attributes: rolled,
            };

            // portrait first (founding cast must not be headless) → baked into the mint
            let portraitUrl: string | undefined;
            let portraitBlobId: string | undefined;
            try {
                const port = await generatePortrait({
                    character: {
                        description: candidate.description,
                        physical: { gender: spec.gender, ageYears: spec.ageYears, body },
                        attributes: rolled,
                    },
                    toneHint: '',
                    sagaId: d.sagaId,
                    recruitmentIntent: spec.role,
                });
                if (port.ok && port.url) {
                    portraitUrl = port.url;
                    portraitBlobId = port.blobId;
                }
            } catch {
                /* mint headless; ensure-portrait / reconcile can backfill */
            }

            // mint via mint_genesis_character (no voucher)
            const tx = new Transaction();
            const physical = tx.add(
                endlessTx.character.newPhysicalFacts({ species: 'human', gender: spec.gender, body, ageYears: spec.ageYears }),
            );
            const profile = tx.add(
                endlessTx.character.newCharacterProfile({
                    name: candidate.name,
                    description: candidate.description,
                    physicalFacts: physical,
                }),
            );
            const mediaElements = portraitUrl
                ? [
                      tx.add(
                          endlessTx.character.newMediaAsset({
                              kind: 0,
                              uri: portraitUrl,
                              walrusBlobId: portraitBlobId ? Array.from(new TextEncoder().encode(portraitBlobId)) : [],
                              metadataUri: '',
                          }),
                      ),
                  ]
                : [];
            const mediaAssets = tx.makeMoveVec({
                elements: mediaElements,
                type: `${d.packageId}::character::MediaAsset`,
            });
            const attrElements = rolled.map((rv) =>
                tx.add(endlessTx.character.newAttributeValue({ key: rv.key, value: BigInt(rv.value), seed: seedBytes })),
            );
            const attributes = tx.makeMoveVec({
                elements: attrElements,
                type: `${d.packageId}::character::AttributeValue`,
            });
            const caps = tx.add(
                endlessTx.character.mintGenesisCharacter({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    world: d.worldId,
                    scene: sceneId,
                    profile,
                    mediaAssets,
                    attributes,
                    ownerRecipient: admin.address,
                }),
            );
            tx.transferObjects([caps[0], caps[1]], admin.address);

            const res = await admin.client.signAndExecuteTransaction({
                transaction: tx,
                signer: admin.signer,
                options: { showEffects: true, showObjectChanges: true },
            });

            let characterId: string | undefined;
            for (const ch of (res.objectChanges ?? []) as Array<{ type: string; objectType?: string; objectId?: string }>) {
                if (ch.type === 'created' && (ch.objectType ?? '').endsWith('::character::Character')) {
                    characterId = ch.objectId;
                }
            }
            if (!characterId) {
                failures.push({ name: spec.name, error: 'mint tx 成功但找不到 Character object' });
                continue;
            }

            minted.push({ id: characterId, name: candidate.name, digest: res.digest, portrait: Boolean(portraitUrl) });
            members.push({
                id: characterId,
                name: candidate.name,
                role: spec.role,
                gender: spec.gender,
                ageYears: spec.ageYears,
                description: candidate.description,
                secret: candidate.secret || undefined,
            });

            // public tags + persona (best-effort; reconcile can fill any gap)
            try {
                await affirmMintPublicTagsAction({
                    characterId,
                    sceneId,
                    characterName: candidate.name,
                    candidate,
                    rolledValues: rolled,
                    recruitmentSpecialty: spec.role,
                });
            } catch {
                /* best-effort */
            }
            try {
                await generatePersonaAction(characterId);
            } catch {
                /* best-effort */
            }
        } catch (err) {
            failures.push({ name: spec.name, error: err instanceof Error ? err.message : String(err) });
        }
    }

    if (members.length === 0) {
        return { ok: false, minted, failures, selfSeeded: 0, tiesSeeded: 0, error: minted.length ? undefined : '全部 mint 失敗' };
    }

    // ── batch founding induction (mode B) ──
    const saga = await sagasApi.getSaga(d.sagaId).catch(() => null);
    let batch: runnerInduction.RunBatchResult;
    try {
        batch = await runnerInduction.runBatchFounding({
            members,
            saga: {
                name: saga?.name,
                premise: saga?.premise || saga?.description,
                nature: saga?.sagaPrompts?.naturePrompt,
                rhythm: saga?.sagaPrompts?.rhythmHints,
            },
        });
    } catch (err) {
        return { ok: false, minted, failures, selfSeeded: 0, tiesSeeded: 0, error: `induction 失敗：${err instanceof Error ? err.message : String(err)}` };
    }

    // write self memories into each MemWal
    const memoryOn = isMemoryConfigured();
    let selfSeeded = 0;
    if (memoryOn) {
        for (const s of batch.self) {
            for (const mem of s.selfMemories) {
                if (await rememberForCharacter(s.id, mem, { kind: 'genesis', importance: 7 })) selfSeeded += 1;
            }
        }
    }

    // seed symmetric director ties + dual memories (reuse assess apply; idempotent)
    const nameById = new Map(members.map((m) => [m.id, m.name]));
    let tiesSeeded = 0;
    for (const t of batch.ties) {
        const proposed: ProposedTie = {
            otherId: t.bId,
            otherName: nameById.get(t.bId) ?? '',
            tone: t.tone,
            kind: t.priorPast ? 'prior' : 'first_impression',
            selfMemory: t.aMemory,
            otherMemory: t.bMemory,
            importance: t.importance,
        };
        const r = await applyRelationshipTiesAction(t.aId, [proposed]).catch(() => null);
        if (r?.ok) tiesSeeded += r.seeded;
    }

    return {
        ok: failures.length === 0,
        minted,
        failures,
        selfSeeded,
        tiesSeeded,
        inductionSkipped: memoryOn ? undefined : 'memory_unconfigured',
    };
}
