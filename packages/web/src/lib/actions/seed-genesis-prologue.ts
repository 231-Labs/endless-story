'use server';

/**
 * Seed a freshly-minted character's 入世序章 (genesis prologue) — the
 * reader's FRONT DOOR to this character — and anchor it on chain.
 *
 * Every character should land in the world with a first chapter: a concrete
 * present scene that shows who they are and what they are quietly carrying,
 * leaning on their genesis-seeded life-memories for thickness (no 承上, no
 * prior event to recap). This is the autonomous counterpart to the manual
 * POV trigger — the per-character bootstrap (reconcile) calls it once so no
 * human has to.
 *
 * FLEXIBLE / NOT HARDCODED: the trigger narrative names no character and no
 * saga; it stays generic across any roster. The runner does the genesis
 * framing (mode='genesis') + the extra life-memory recall; pov-core anchors
 * the chapter and writes it back to MemWal itself. We OPTIONALLY fold the
 * saga premise in as a light 將至的引線 when it's cheap to fetch — purely
 * additive, never required.
 *
 * `forceRun: true` bypasses the subscriber gate — a brand-new character has
 * zero subscribers, so the normal gate would skip them. Idempotency is the
 * CALLER's job (only invoke when the character has no chapter yet); MemWal +
 * the chain anchor both append, so re-running would mint a second prologue.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { runPovForCharacter } from '@/lib/chain/pov-core';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { fetchOnChainSaga } from '@/lib/chain/saga-read';
import { dumpChapter } from '@/lib/chain/chapter-dump';

export interface SeedGenesisPrologueResult {
    ok: boolean;
    anchored: boolean;
    chapterChars?: number;
    skipped?: string;
    error?: string;
}

/**
 * Generic front-door trigger. No character name, no saga-specific copy — the
 * runner's genesis framing + the character's own seeded memories supply the
 * particulars. The optional `premise` is woven in as a light pull toward what
 * is coming, never as a scene to recap.
 */
function buildTriggerNarrative(premise?: string): string {
    const base =
        '讀者第一次遇見這個角色。請截取他此刻的一個具體當下場面：身在何處、手上正在做什麼、' +
        '眼前有誰或避開了誰，讓人從這一幕就看出他是個怎樣的人，以及他心裡靜靜揣著的那點未說出口的事。' +
        '不要承接任何先前的情節，只寫此刻。';
    const lead = premise?.trim();
    return lead
        ? `${base}\n（將至的引線，僅作底色、不必明寫）：${lead}`
        : base;
}

export async function seedGenesisPrologueAction(
    characterId: string,
): Promise<SeedGenesisPrologueResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, anchored: false, error: 'saga 尚未種子化' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            anchored: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    // Optional light 引線 — the saga premise as backdrop. Best-effort: a slow
    // or failed read must never block the prologue, so we swallow and proceed
    // with the generic trigger alone.
    const saga = await fetchOnChainSaga(d.sagaId).catch(() => null);
    const triggerNarrative = buildTriggerNarrative(saga?.premise);

    try {
        const res = await runPovForCharacter(admin, characterId, {
            triggerNarrative,
            mode: 'genesis',
            forceRun: true, // brand-new character has 0 subscribers; bypass the gate
            dryRun: false, // runner anchors + remembers itself
        });
        if (!res.ok && res.skipReason) {
            return { ok: false, anchored: false, skipped: res.skipReason };
        }
        dumpChapter({ kind: 'genesis', name: characterId.slice(0, 8), note: characterId, dryRun: false }, res.chapter);
        return {
            ok: res.ok,
            anchored: res.anchored,
            chapterChars: res.chapter.length,
            error: res.error,
        };
    } catch (err) {
        return {
            ok: false,
            anchored: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
