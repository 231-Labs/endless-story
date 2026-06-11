'use server';

/**
 * Relationship assessment + apply — derive a character's ties to the existing
 * saga roster from public descriptions, then anchor them on the DIRECTOR's
 * public channel (symmetric `RelationshipSeeded` events) + write symmetric
 * first-person memories into both characters' MemWal.
 *
 * Why the director channel (not private genesis memory): a pre-existing tie
 * (Liu ↔ Meng "have known each other a long time") is objective, shared canon — it must be
 * symmetric and visible to both sides. Director events are read symmetrically
 * (so mint order stops mattering — the ordering asymmetry disappears) and are
 * the only source the relationship graph (ProfileTab / CastConstellation) reads.
 *
 * Two-step by design so the admin panel can REVIEW before seeding:
 *   - assessRelationshipsAction → LLM proposals, no writes
 *   - applyRelationshipTiesAction → seed events + memories (idempotent: skips
 *     pairs that already have a public tie, so re-runs / full-troupe backfill don't dup)
 * `assessAndApplyRelationshipsAction` chains both for the auto-after-mint path.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { relationshipAssess as runnerRel } from '@endless-story/runner';
import { resolveRole } from '@/lib/chain/pov-core';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { fetchRecruitmentIdForCharacter } from '@/lib/chain/voucher-read';
import { isMemoryConfigured, rememberForCharacter } from '@/lib/chain/memory';
import { fetchOnChainEdgesFrom } from '@/lib/chain/relationships';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { getStoreRecruitment } from './recruitments-store';

/** A proposed tie — mirrors the runner's RelationshipTie, kept local so the
 *  admin client imports it from here (not from the server-only runner pkg). */
export interface ProposedTie {
    otherId: string;
    otherName: string;
    /** RelationshipTone string (incl. 'acquaintance' / prior acquaintance). */
    tone: string;
    kind: 'prior' | 'first_impression';
    selfMemory: string;
    otherMemory: string;
    importance: number;
}

export interface AssessRelationshipsResult {
    ok: boolean;
    characterName?: string;
    ties: ProposedTie[];
    /** Other-ids that already have a public tie with this character (skipped on apply). */
    existingOtherIds: string[];
    skipped?: 'empty_roster' | 'character_unreachable' | 'deployment_not_ready';
    error?: string;
}

export interface ApplyRelationshipTiesResult {
    ok: boolean;
    seeded: number;
    skippedExisting: number;
    memoriesWritten: number;
    digest?: string;
    error?: string;
}

async function resolveRecruitmentIntent(characterId: string): Promise<string | undefined> {
    try {
        const recruitmentId = await fetchRecruitmentIdForCharacter(characterId);
        if (!recruitmentId) return undefined;
        const rec = await getStoreRecruitment(recruitmentId);
        return rec?.roleIntent;
    } catch {
        return undefined;
    }
}

function toGenesisRoster(entries: SagaRosterEntry[]): runnerRel.GenesisRosterEntry[] {
    return entries.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        gender: e.gender,
        ageYears: e.ageYears,
        brief: e.brief,
        currentSceneName: e.currentSceneName,
    }));
}

/** Stage 1 — LLM proposals only, no chain/memory writes. */
export async function assessRelationshipsAction(
    characterId: string,
): Promise<AssessRelationshipsResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId) {
        return { ok: false, ties: [], existingOtherIds: [], skipped: 'deployment_not_ready', error: 'saga 尚未種子化' };
    }

    let fullRoster: SagaRosterEntry[] = [];
    try {
        fullRoster = await buildSagaRoster(d.sagaId);
    } catch (err) {
        return { ok: false, ties: [], existingOtherIds: [], error: err instanceof Error ? err.message : String(err) };
    }
    const newEntry = fullRoster.find((r) => r.id === characterId);
    const existingRoster = fullRoster.filter((r) => r.id !== characterId);
    if (existingRoster.length === 0) {
        return { ok: true, ties: [], existingOtherIds: [], characterName: newEntry?.name, skipped: 'empty_roster' };
    }

    const [role, recruitmentRoleIntent, existingEdges] = await Promise.all([
        resolveRole(characterId).catch(() => undefined),
        resolveRecruitmentIntent(characterId),
        fetchOnChainEdgesFrom(characterId).catch(() => []),
    ]);
    const existingOtherIds = existingEdges.map((e) => e.toId);

    try {
        const res = await runnerRel.runOnce({
            characterId,
            sagaId: d.sagaId,
            role: role ?? undefined,
            recruitmentRoleIntent,
            roster: toGenesisRoster(existingRoster),
        });
        if (res.skipReason) {
            return { ok: true, ties: [], existingOtherIds, characterName: newEntry?.name, skipped: res.skipReason };
        }
        const ties: ProposedTie[] = res.ties.map((t) => ({
            otherId: t.otherId,
            otherName: t.otherName,
            tone: t.tone,
            kind: t.kind,
            selfMemory: t.selfMemory,
            otherMemory: t.otherMemory,
            importance: t.importance,
        }));
        return { ok: true, ties, existingOtherIds, characterName: newEntry?.name };
    } catch (err) {
        return { ok: false, ties: [], existingOtherIds, characterName: newEntry?.name, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Stage 2 — seed the (reviewed) ties on chain + write symmetric memories.
 * Idempotent: pairs already having a public tie are skipped.
 */
export async function applyRelationshipTiesAction(
    characterId: string,
    ties: ProposedTie[],
    sceneIdHint?: string,
): Promise<ApplyRelationshipTiesResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.sagaId || !d.storytellerCapId) {
        return { ok: false, seeded: 0, skippedExisting: 0, memoriesWritten: 0, error: 'saga 尚未種子化' };
    }
    if (ties.length === 0) {
        return { ok: true, seeded: 0, skippedExisting: 0, memoriesWritten: 0 };
    }

    // Idempotency — drop pairs that already have a public tie with this character.
    const existing = await fetchOnChainEdgesFrom(characterId).catch(() => []);
    const existingSet = new Set(existing.map((e) => e.toId));
    const seen = new Set<string>();
    const fresh = ties.filter((t) => {
        if (!t.otherId || t.otherId === characterId) return false;
        if (existingSet.has(t.otherId) || seen.has(t.otherId)) return false;
        seen.add(t.otherId);
        return true;
    });
    const skippedExisting = ties.length - fresh.length;
    if (fresh.length === 0) {
        return { ok: true, seeded: 0, skippedExisting, memoriesWritten: 0 };
    }

    // Resolve scene + the new character's own name in one roster read. selfName
    // is used to attribute the reciprocal memory written into the OTHER
    // character's namespace, so reading it back shows WHO it's about (not just he/she).
    let selfName: string | undefined;
    let resolvedScene = sceneIdHint ?? null;
    try {
        if (d.sagaId) {
            const roster = await buildSagaRoster(d.sagaId);
            const me = roster.find((r) => r.id === characterId);
            selfName = me?.name;
            if (!resolvedScene) resolvedScene = me?.currentSceneId ?? null;
        }
    } catch {
        /* fall through to deployment default scene */
    }
    const sceneId = resolvedScene ?? d.sceneIds[0] ?? null;
    if (!sceneId) {
        return { ok: false, seeded: 0, skippedExisting, memoriesWritten: 0, error: '無可用 scene — 無法建立關係事件' };
    }

    // One PTB seeds every fresh pair (symmetric: the reader matches either side).
    let digest: string | undefined;
    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        for (const t of fresh) {
            tx.add(
                endlessTx.director.relationshipSeed({
                    cap: d.storytellerCapId,
                    saga: d.sagaId,
                    sceneId,
                    characterA: characterId,
                    characterB: t.otherId,
                    tone: t.tone,
                }),
            );
        }
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            throw new Error(res.effects?.status?.error ?? 'relationship_seed 交易失敗');
        }
        await admin.client.waitForTransaction({ digest: res.digest });
        digest = res.digest;
    } catch (err) {
        return { ok: false, seeded: 0, skippedExisting, memoriesWritten: 0, error: err instanceof Error ? err.message : String(err) };
    }

    // Symmetric private memories — both sides remember the same relationship.
    // MemWal absence is not an error (the public tie already landed).
    // A SILENT one-sided failure here is what made「對彼此的觀察」asymmetric:
    // the public tie exists but one character can't recall why — so each side
    // gets one extra retry, and a final failure is loudly logged for reconcile.
    let memoriesWritten = 0;
    if (isMemoryConfigured()) {
        const writeSide = async (charId: string, text: string, importance: number, label: string) => {
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                try {
                    if (await rememberForCharacter(charId, text, { kind: 'relationship', importance })) {
                        return true;
                    }
                } catch {
                    /* rememberForCharacter normally swallows; belt-and-braces */
                }
                if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
            }
            console.warn(`[assess-relationships] relationship memory LOST (${label}) — tie on chain but ${charId.slice(0, 10)}… has no memory of it`);
            return false;
        };
        for (const t of fresh) {
            // Deterministic "about <name>:" style prefix (see selfText/otherText below) so the
            // memory is attributable when read back out of context — even if the body uses
            // he/she. The self side
            // names the other person; the other side names this new character.
            const selfText = `對「${t.otherName}」：${t.selfMemory}`;
            const otherText = selfName ? `對「${selfName}」：${t.otherMemory}` : t.otherMemory;
            if (await writeSide(characterId, selfText, t.importance, `self→${t.otherName}`)) memoriesWritten += 1;
            if (await writeSide(t.otherId, otherText, t.importance, `${t.otherName}→self`)) memoriesWritten += 1;
        }
    }

    return { ok: true, seeded: fresh.length, skippedExisting, memoriesWritten, digest };
}

/** Auto path (after mint): assess then apply, no review. */
export async function assessAndApplyRelationshipsAction(
    characterId: string,
): Promise<{ ok: boolean; seeded: number; skipped?: string; error?: string }> {
    const assessed = await assessRelationshipsAction(characterId);
    if (!assessed.ok) return { ok: false, seeded: 0, error: assessed.error };
    if (assessed.skipped) return { ok: true, seeded: 0, skipped: assessed.skipped };
    if (assessed.ties.length === 0) return { ok: true, seeded: 0 };
    const applied = await applyRelationshipTiesAction(characterId, assessed.ties);
    return { ok: applied.ok, seeded: applied.seeded, error: applied.error };
}

// NOTE: saga-wide relationship backfill is now folded into the reconciler
// (reconcile-character.ts step 6 / reconcile whole troupe) — the single batch entry point —
// so there's no separate backfillAll here. Per-character assess+apply lives in
// the admin RelationshipAssessPanel for reviewed, targeted seeding.
