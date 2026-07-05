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
import type { CharacterAttributes } from '@endless-story/shared';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { isMemoryConfigured, rememberForCharacter } from '@/lib/chain/memory';
import { sagasApi } from '@/lib/api/index';
import { listStoryPresets, loadStoryPreset } from '@/lib/stories/loader';
import { DEFAULT_ATTRIBUTE_SCHEMA } from '../config/attribute-schema.js';
import { generatePortrait } from './generate-portrait.js';
import { generateAdditionalViews } from './generate-additional-views.js';
import { affirmMintPublicTagsAction } from './affirm-public-tags.js';
import { generatePersonaAction } from './generate-persona.js';
import { applyRelationshipTiesAction, type ProposedTie } from './assess-relationships.js';
import { deriveSagaSkills, seedCharacterSkills, type WorldAttrs } from '@/lib/chain/saga-skills';

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
    /** Per-axis attribute floors (行當下限). Omit → `roleAttributeFloors(role)`. */
    minAttributes?: Partial<CharacterAttributes>;
    /** Authored canon memories (你-form), seeded verbatim after mint. */
    memories?: string[];
}

type AttrFloors = Partial<CharacterAttributes>;

/**
 * 行當 → attribute floors for FOUNDING cast (the marquee troupe). Deliberately
 * higher than the gacha `minAttributes` in the preset: these are台柱, so a founding
 * 花旦 must read 明豔、a 小生 俊秀、a 刀馬旦 身手俐落. The rolled stats drive the portrait
 * + persona, so a low roll = a 醜 / 不對行當 的角色 — exactly the "參數太低" the owner hit.
 * Substring match, more specific keywords first; a lucky roll above the floor is kept.
 */
const ROLE_ATTRIBUTE_FLOORS: { match: string[]; floors: AttrFloors }[] = [
    { match: ['刀馬旦', '武旦', '武生', '武小生'], floors: { constitution: 86, disposition: 76, appearance: 82, acuity: 74 } },
    { match: ['花旦', '青衣', '正旦', '名伶', '坤伶'], floors: { appearance: 88, disposition: 80, acuity: 74, constitution: 62 } },
    { match: ['坤生', '乾生', '小生'], floors: { appearance: 86, acuity: 80, disposition: 72, constitution: 66 } },
    { match: ['老生', '鬚生', '老旦'], floors: { acuity: 80, disposition: 78, appearance: 64, constitution: 64 } },
    { match: ['丑'], floors: { acuity: 84, disposition: 74, constitution: 66, appearance: 58 } },
    { match: ['淨', '大面', '花臉'], floors: { constitution: 82, disposition: 66, acuity: 66, appearance: 62 } },
    { match: ['班主', '掌事', '當家', '東家'], floors: { acuity: 84, disposition: 82, appearance: 70, constitution: 64 } },
    { match: ['記者', '報', '筆', '文人'], floors: { acuity: 86, disposition: 72, appearance: 62, constitution: 56 } },
    { match: ['琴師', '樂師', '鼓', '場面', '文武場', '司鼓'], floors: { acuity: 82, disposition: 70, appearance: 56, constitution: 60 } },
    { match: ['衣箱', '管箱', '箱'], floors: { acuity: 78, disposition: 70, appearance: 54, constitution: 58 } },
    { match: ['龍套', '武行', '檢場', '道具'], floors: { constitution: 66, acuity: 64, disposition: 56, appearance: 54 } },
];
const FALLBACK_FLOORS: AttrFloors = { appearance: 72, constitution: 64, acuity: 74, disposition: 70 };

function roleAttributeFloors(role: string): AttrFloors {
    const r = role || '';
    for (const g of ROLE_ATTRIBUTE_FLOORS) {
        if (g.match.some((kw) => r.includes(kw))) return g.floors;
    }
    return FALLBACK_FLOORS;
}

/**
 * Raise each rolled axis to at least its floor (台柱不能擲出歪瓜裂棗). Caps at 100.
 * The on-chain `seed` is kept as provenance; founding cast aren't reproducible gacha,
 * so a clamped value diverging from the raw seed-roll is intended, not a bug.
 */
function applyAttributeFloors(
    rolled: ReturnType<typeof rollAttributesFromSeed>,
    floors: AttrFloors,
): ReturnType<typeof rollAttributesFromSeed> {
    return rolled.map((rv) => {
        const floor = (floors as Record<string, number | undefined>)[rv.key];
        if (floor == null || rv.value >= floor) return rv;
        return { ...rv, value: Math.min(100, floor) };
    });
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
    /** Setting-gallery views (frontal + art sheet) appended across the cast. */
    viewsSeeded: number;
    /** Per-saga skill values written across the cast (6 per character). */
    skillsSeeded: number;
    inductionSkipped?: 'memory_unconfigured';
    /**
     * Non-fatal genesis-seeding warning. Set when memory IS configured but the
     * cast ended up with no / fewer 此生記憶 than generated — i.e. the founding
     * "succeeded" (mints are fine) but genesis silently under-seeded (LLM parse
     * miss, or some writes failed). Surfaces the failure that used to be invisible
     * (ok stays true because the mints succeeded); backfill via the 劇團
     * GenesisMemoryPanel without re-founding. */
    genesisWarning?: string;
    error?: string;
}

const EMPTY = { minted: [] as FoundingMintedEntry[], failures: [] as { name: string; error: string }[], selfSeeded: 0, tiesSeeded: 0, viewsSeeded: 0, skillsSeeded: 0 };

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

    const authoredMemories: { id: string; memories: string[] }[] = [];
    const failures: { name: string; error: string }[] = [];
    const members: runnerInduction.FoundingMember[] = [];
    // (characterId, portraitUrl) for the post-mint setting-gallery pass below.
    const viewTargets: { characterId: string; referenceUrl: string }[] = [];
    // (characterId, role, rolled world attrs) for the post-mint saga-skill pass —
    // gives each character the 行當 skills the card-weight rules read.
    const skillTargets: { characterId: string; role: string; world: WorldAttrs }[] = [];

    // ── per spec: roll → portrait → mint → tags + persona ──
    for (const spec of specs) {
        try {
            const body = spec.body?.trim() || '勻稱';
            const seed = randomBytes(32);
            const seedBytes = Array.from(seed);
            const rolled = applyAttributeFloors(
                rollAttributesFromSeed(seed, DEFAULT_ATTRIBUTE_SCHEMA),
                spec.minAttributes ?? roleAttributeFloors(spec.role),
            );
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
                /* portrait gen failed — mint headless; the reconciler can backfill a cover */
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
            // mint_genesis_character transfers the OwnerCap to ownerRecipient
            // (= admin here) on-chain and returns only the ControlCap.
            const controlCap = tx.add(
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
            tx.transferObjects([controlCap], admin.address);

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
            if (spec.memories?.length) authoredMemories.push({ id: characterId, memories: spec.memories });
            if (portraitUrl) viewTargets.push({ characterId, referenceUrl: portraitUrl });
            skillTargets.push({
                characterId,
                role: spec.role,
                world: Object.fromEntries(rolled.map((rv) => [rv.key, rv.value])) as WorldAttrs,
            });
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
        return { ok: false, minted, failures, selfSeeded: 0, tiesSeeded: 0, viewsSeeded: 0, skillsSeeded: 0, error: minted.length ? undefined : '全部 mint 失敗' };
    }

    // ── §11 setting-gallery views (frontal + art sheet) ──
    // The mint above bakes in only the 45° cover portrait; the gacha redeem path
    // (redeem-voucher.ts) follows it with generateAdditionalViews to fill the 設定集.
    // Founding cast skipped that, so they had a cover but no frontal / art-sheet.
    // Run it as its own pass AFTER all mints so the on-chain mints aren't held up
    // behind img2img, and isolate each so one failure can't sink the batch
    // (the reconciler can still backfill any that fail here).
    let viewsSeeded = 0;
    for (const t of viewTargets) {
        try {
            const r = await generateAdditionalViews({ characterId: t.characterId, referenceUrl: t.referenceUrl });
            if (r.ok) viewsSeeded += r.appended;
        } catch {
            /* best-effort — reconcile can backfill the gallery */
        }
    }

    // ── per-saga skills (the card-weight rules read these) ──
    // Derived from 行當 + rolled world attrs and written one PTB per character.
    // Best-effort + isolated: a failure just leaves that character's card draw at
    // uniform weight (the reconciler can backfill), never sinks the batch.
    let skillsSeeded = 0;
    for (const t of skillTargets) {
        try {
            const r = await seedCharacterSkills(admin, t.characterId, deriveSagaSkills(t.role, t.world));
            if (r.ok) skillsSeeded += r.seeded;
        } catch {
            /* best-effort — reconcile can backfill skills */
        }
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
        return { ok: false, minted, failures, selfSeeded: 0, tiesSeeded: 0, viewsSeeded, skillsSeeded, error: `induction 失敗：${err instanceof Error ? err.message : String(err)}` };
    }

    // write self memories into each MemWal
    const memoryOn = isMemoryConfigured();
    const authoredExpected = authoredMemories.reduce((n, a) => n + a.memories.length, 0);
    const genesisExpected = authoredExpected + batch.self.reduce((n, s) => n + s.selfMemories.length, 0);
    let selfSeeded = 0;
    if (memoryOn) {
        // Authored canon first, above the generated batch (i=8 > 7): facts the
        // story cannot afford to drift must win recall ties.
        for (const a of authoredMemories) {
            for (const mem of a.memories) {
                if (await rememberForCharacter(a.id, mem, { kind: 'genesis', importance: 8 })) selfSeeded += 1;
            }
        }
    }
    if (memoryOn) {
        for (const s of batch.self) {
            for (const mem of s.selfMemories) {
                if (await rememberForCharacter(s.id, mem, { kind: 'genesis', importance: 7 })) selfSeeded += 1;
            }
        }
    }
    // Genesis used to fail SILENTLY: founding returns ok=true (mints are fine)
    // even when zero 此生記憶 got written — so the cast had no life-thickness and
    // nobody noticed. Surface it loudly. memoryOn but nothing generated = the LLM
    // parse miss (see batch.ts); generated-but-under-written = some MemWal writes
    // failed (relayer/SEAL). Either way: backfill via 劇團 GenesisMemoryPanel.
    let genesisWarning: string | undefined;
    if (memoryOn && minted.length > 0 && selfSeeded < genesisExpected) {
        genesisWarning =
            genesisExpected === 0
                ? `立班生成器沒吐出任何此生記憶（${minted.length} 人已立，但 genesis 為空）—— 多半是 LLM 回傳格式壞掉。請到「劇團」分頁用 GenesisMemoryPanel 為每個角色補種，或重跑一次立班。`
                : `此生記憶只種了 ${selfSeeded}/${genesisExpected} 條（部分 MemWal 寫入失敗）。缺的可到「劇團」分頁用 GenesisMemoryPanel 補種。`;
        console.warn(`[founding] ${genesisWarning}`);
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
        viewsSeeded,
        skillsSeeded,
        inductionSkipped: memoryOn ? undefined : 'memory_unconfigured',
        genesisWarning,
    };
}

/**
 * Load the founding cast bios from the story preset (`founding_cast`) so the
 * admin panel can pre-fill the rows. Returns [] when the preset has none, so the
 * panel falls back to its recruitment-role scaffold.
 */
export async function loadFoundingPresetAction(): Promise<FoundingCharSpec[]> {
    try {
        const presets = await listStoryPresets();
        // Prefer a preset that actually declares a founding cast; else first; else slug.
        let chosen: string | undefined;
        for (const p of presets) {
            const preset = await loadStoryPreset(p.id).catch(() => null);
            if (preset?.founding_cast?.length) {
                chosen = p.id;
                break;
            }
        }
        const id = chosen ?? presets[0]?.id ?? 'spring-snow';
        const preset = await loadStoryPreset(id);
        const cast = preset.founding_cast ?? [];
        // `disabled: true` is a reversible "comment-out" for small-scale test runs.
        return cast
            .filter((c) => !c.disabled)
            .map((c) => ({
            name: c.name,
            ageYears: c.ageYears,
            gender: c.gender,
            role: c.role,
            description: c.description,
            secret: c.secret,
            minAttributes: c.minAttributes,
            memories: c.memories,
        }));
    } catch {
        return [];
    }
}
