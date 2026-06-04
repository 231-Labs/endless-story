'use server';

/**
 * Reconciler (B) — make a character WHOLE, no matter what mint missed.
 *
 * Mint enrichment (portrait / 設定集 views / tags / persona / memories) runs
 * post-response and best-effort, so a character can land missing pieces (legacy
 * mints, a hung step, a transient failure). This action reads the current
 * on-chain state, detects what's absent, and backfills ONLY the gaps —
 * idempotent, so re-running is safe and a second pass just skips everything.
 *
 * It reuses the exact same generators as the mint path, in the same order,
 * sequentially (admin-signed steps never contend for the gas coin).
 *
 * This is also what unblocks "入班不等圖": because the cover portrait itself is
 * reconcilable here, mint can later complete with NO image and let this fill it.
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read, tx as endlessTx } from '@endless-story/sdk';
import { generatePortrait } from './generate-portrait.js';
import { generateAdditionalViews } from './generate-additional-views.js';
import { affirmMintPublicTagsAction } from './affirm-public-tags.js';
import { generatePersonaAction } from './generate-persona.js';
import { seedGenesisMemoryAction } from './seed-genesis-memory.js';
import { fetchOnChainPersona } from '../chain/persona-read.js';
import { resolveRole } from '../chain/pov-core.js';
import { getMemoryCount } from '../chain/memory-counter.js';
import { getAdminContext } from '../chain/admin-signer.js';
import { resolveNetwork } from '../chain/network.js';

const ATTR_LABEL: Record<string, string> = {
    appearance: '外貌',
    constitution: '筋骨',
    acuity: '機敏',
    disposition: '心性',
};

/** kind=6 setting_sheet marks "additional 設定集 views were generated". */
const SETTING_SHEET_KIND = 6;

export type ReconcileStepName = 'portrait' | 'views' | 'tags' | 'persona' | 'memory';
export type ReconcileStatus = 'ok' | 'skip' | 'fail';

export interface ReconcileStep {
    step: ReconcileStepName;
    status: ReconcileStatus;
    detail?: string;
}

export interface ReconcileResult {
    ok: boolean;
    characterId: string;
    name?: string;
    steps: ReconcileStep[];
    error?: string;
}

interface ChainAttr {
    key?: string;
    value?: string | number;
}
interface ChainMediaAsset {
    kind?: string | number;
    uri?: string;
}
interface ChainCharacterJson {
    image_url?: string;
    media_assets?: ChainMediaAsset[];
    tags?: Array<{ label?: string }>;
    attributes?: ChainAttr[];
    profile?: {
        name?: string;
        description?: string;
        physical_facts?: { gender?: string; age_years?: number | string; body?: string };
    };
    state?: { current_scene_id?: string | null };
}

/** Backfill every missing enrichment for ONE character. Idempotent. */
export async function reconcileCharacterAction(characterId: string): Promise<ReconcileResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const steps: ReconcileStep[] = [];
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, characterId, steps, error: 'saga 尚未種子化' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });
    let json: ChainCharacterJson | undefined;
    try {
        const res = (await read.character.getCharacter(client, characterId)) as { json?: ChainCharacterJson } | null;
        json = res?.json;
    } catch (err) {
        return { ok: false, characterId, steps, error: err instanceof Error ? err.message : String(err) };
    }
    if (!json) return { ok: false, characterId, steps, error: 'character_unreachable' };

    const name = json.profile?.name ?? '';
    const pf = json.profile?.physical_facts ?? {};
    const rolledValues = (Array.isArray(json.attributes) ? json.attributes : []).map((a) => ({
        key: String(a.key ?? ''),
        label: ATTR_LABEL[String(a.key ?? '')] ?? String(a.key ?? ''),
        value: Number(a.value ?? 0),
    }));
    const candidate = {
        name,
        description: json.profile?.description ?? '',
        physicalFacts: {
            gender: String(pf.gender ?? '中性'),
            age: Number(pf.age_years ?? 0),
            body: String(pf.body ?? '勻稱'),
        },
        attributes: rolledValues,
    };
    const mediaAssets = Array.isArray(json.media_assets) ? json.media_assets : [];
    const tags = Array.isArray(json.tags) ? json.tags : [];
    const sceneId = json.state?.current_scene_id ?? '';

    // ── 1) cover portrait ─────────────────────────────────────────────
    let coverUrl = (typeof json.image_url === 'string' && json.image_url) || mediaAssets[0]?.uri || '';
    if (!coverUrl) {
        try {
            const intent = await resolveRole(characterId).catch(() => undefined);
            const gen = await generatePortrait({
                character: {
                    description: candidate.description,
                    physical: {
                        gender: candidate.physicalFacts.gender,
                        ageYears: candidate.physicalFacts.age,
                        body: candidate.physicalFacts.body,
                    },
                    attributes: rolledValues,
                },
                toneHint: '',
                sagaId: d.sagaId,
                recruitmentIntent: intent,
            });
            if (gen.ok && gen.url) {
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
                const okTx = txr.effects?.status?.status === 'success';
                if (okTx) coverUrl = gen.url;
                steps.push({ step: 'portrait', status: okTx ? 'ok' : 'fail', detail: okTx ? gen.url : txr.effects?.status?.error });
            } else {
                steps.push({ step: 'portrait', status: 'fail', detail: gen.error ?? 'no_image' });
            }
        } catch (err) {
            steps.push({ step: 'portrait', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
        }
    } else {
        steps.push({ step: 'portrait', status: 'skip', detail: 'has_cover' });
    }

    // ── 2) 設定集 additional views (gate on the kind=6 art sheet) ──────
    const hasViews = mediaAssets.some((a) => Number(a.kind) === SETTING_SHEET_KIND);
    if (!hasViews && coverUrl) {
        try {
            const r = await generateAdditionalViews({ characterId, referenceUrl: coverUrl });
            steps.push({
                step: 'views',
                status: r.ok && r.appended > 0 ? 'ok' : r.ok ? 'skip' : 'fail',
                detail: r.error ?? r.skipped ?? `appended=${r.appended}`,
            });
        } catch (err) {
            steps.push({ step: 'views', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
        }
    } else {
        steps.push({ step: 'views', status: 'skip', detail: hasViews ? 'has_views' : 'no_reference' });
    }

    // ── 3) public identity tags ───────────────────────────────────────
    if (tags.length > 0) {
        steps.push({ step: 'tags', status: 'skip', detail: `${tags.length} existing` });
    } else if (!sceneId) {
        steps.push({ step: 'tags', status: 'skip', detail: 'no_scene' });
    } else {
        try {
            const specialty = await resolveRole(characterId).catch(() => undefined);
            const r = await affirmMintPublicTagsAction({
                characterId,
                sceneId,
                characterName: name,
                candidate,
                rolledValues,
                recruitmentSpecialty: specialty,
            });
            steps.push({
                step: 'tags',
                status: r.ok ? 'ok' : 'fail',
                detail: r.ok ? (r.tags ?? []).join('|') : r.error ?? r.llmSkipped,
            });
        } catch (err) {
            steps.push({ step: 'tags', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
        }
    }

    // ── 4) persona (本色) ─────────────────────────────────────────────
    const hasPersona = (await fetchOnChainPersona(characterId).catch(() => null)) != null;
    if (hasPersona) {
        steps.push({ step: 'persona', status: 'skip', detail: 'has_persona' });
    } else {
        const r = await generatePersonaAction(characterId);
        steps.push({
            step: 'persona',
            status: r.ok ? 'ok' : 'fail',
            detail: r.ok ? `v${r.version}` : r.error ?? r.skipped,
        });
    }

    // ── 5) genesis memories (relayer count; null ⇒ counter unconfigured) ─
    const memCount = await getMemoryCount(characterId).catch(() => null);
    if (memCount == null) {
        steps.push({ step: 'memory', status: 'skip', detail: 'counter_unconfigured' });
    } else if (memCount > 0) {
        steps.push({ step: 'memory', status: 'skip', detail: `${memCount} existing` });
    } else {
        try {
            const r = await seedGenesisMemoryAction(characterId);
            steps.push({
                step: 'memory',
                status: r.skipped ? 'skip' : 'ok',
                detail: r.skipped ?? `seeded ${r.seeded ?? 0}`,
            });
        } catch (err) {
            steps.push({ step: 'memory', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
        }
    }

    return { ok: !steps.some((s) => s.status === 'fail'), characterId, name, steps };
}

export interface ReconcileSagaResult {
    ok: boolean;
    results: ReconcileResult[];
    error?: string;
}

/** Reconcile every character in the saga, sequentially. */
export async function reconcileSagaAction(): Promise<ReconcileSagaResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const client = makeSuiClient({ network: resolveNetwork() });
    let chars: Array<{ characterId: string }>;
    try {
        chars = await read.character.listMintedCharacterSummaries(client, d.packageId, { sagaId: d.sagaId });
    } catch (err) {
        return { ok: false, results: [], error: err instanceof Error ? err.message : String(err) };
    }
    const results: ReconcileResult[] = [];
    for (const c of chars) {
        results.push(await reconcileCharacterAction(c.characterId));
    }
    return { ok: results.every((r) => r.ok), results };
}
