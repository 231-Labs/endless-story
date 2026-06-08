'use server';

/**
 * Ensure a minted character has an on-chain cover portrait.
 *
 * If `existingUrl` is set (the portrait finished before mint and was baked into
 * media_assets[0]), this is a no-op. Otherwise it generates the portrait
 * server-side and patches it on chain via `update_image_by_storyteller` — the
 * same generate→write path the reconciler uses. This is what lets a mint skip
 * the art wait ("join now, art later") and still reliably end up with a cover,
 * regardless of whether the client stuck around.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import type { CharacterForPortrait } from '@endless-story/llm/prompts';
import { generatePortrait } from './generate-portrait.js';
import { getAdminContext } from '../chain/admin-signer.js';

export interface EnsurePortraitResult {
    ok: boolean;
    /** Final cover url (the baked one if it already existed, else the freshly generated one). */
    url?: string;
    skipped?: 'already_has_cover';
    error?: string;
}

export async function ensurePortraitForCharacter(
    characterId: string,
    opts: {
        character: CharacterForPortrait;
        sagaId?: string;
        recruitmentIntent?: string;
        /** Cover already written at mint time — when present, skip generation. */
        existingUrl?: string;
    },
): Promise<EnsurePortraitResult> {
    if (opts.existingUrl && opts.existingUrl.trim()) {
        return { ok: true, url: opts.existingUrl, skipped: 'already_has_cover' };
    }
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.packageId || !d.storytellerCapId || !d.sagaId) {
        return { ok: false, error: 'deployment incomplete (package / storytellerCap / saga)' };
    }

    const gen = await generatePortrait({
        character: opts.character,
        toneHint: '',
        sagaId: opts.sagaId ?? d.sagaId,
        recruitmentIntent: opts.recruitmentIntent,
    });
    if (!gen.ok || !gen.url) {
        return { ok: false, error: gen.error ?? 'no_image' };
    }

    try {
        const admin = getAdminContext();
        const txb = new Transaction();
        txb.add(
            endlessTx.character.updateImageByStoryteller({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                character: characterId,
                newImageUrl: gen.url,
            }),
        );
        const txr = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        await admin.client.waitForTransaction({ digest: txr.digest }).catch(() => {});
        if (txr.effects?.status?.status !== 'success') {
            return { ok: false, error: txr.effects?.status?.error ?? 'tx_failed', url: gen.url };
        }
        return { ok: true, url: gen.url };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err), url: gen.url };
    }
}
