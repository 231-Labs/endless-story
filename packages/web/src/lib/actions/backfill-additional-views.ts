'use server';

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from '@/lib/chain/network';
import { generateAdditionalViews } from './generate-additional-views';

type StandardAdditionalView = 'frontal' | 'art-sheet';

export interface BackfillAdditionalViewsInput {
    characterId: string;
    /** Regenerate both standard views even if existing metadata says they are present. */
    force?: boolean;
    /** Render and upload only; do not append media assets on chain. */
    dryRun?: boolean;
}

export interface BackfillAdditionalViewsResult {
    ok: boolean;
    characterName?: string;
    requested?: StandardAdditionalView[];
    existing?: StandardAdditionalView[];
    appended: number;
    frontalUrl?: string;
    artSheetUrl?: string;
    skipped?: string;
    error?: string;
}

const STANDARD_VIEWS: StandardAdditionalView[] = ['frontal', 'art-sheet'];

/**
 * Re-run the mint-time standard gallery generation for an existing character.
 *
 * This repairs cases where Next `after()` was interrupted after redeemVoucher:
 * the character exists and has the 45-degree anchor, but the background
 * frontal/art-sheet generation never finished.
 */
export async function backfillAdditionalViewsAction(
    input: BackfillAdditionalViewsInput,
): Promise<BackfillAdditionalViewsResult> {
    const characterId = input.characterId.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(characterId)) {
        return { ok: false, appended: 0, error: '角色 id 格式不正確' };
    }
    if (!ENDLESS_STORY_DEPLOYMENT.sagaId || !ENDLESS_STORY_DEPLOYMENT.storytellerCapId) {
        return { ok: false, appended: 0, error: 'saga 尚未種子化' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });
    let charRes;
    try {
        charRes = await read.character.getCharacter(client, characterId);
    } catch (err) {
        return {
            ok: false,
            appended: 0,
            error: `讀取角色失敗：${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const json = charRes.json as ChainCharacter | undefined;
    const characterName = json?.profile?.name;
    const referenceUrl = firstAnchorUrl(json);
    if (!referenceUrl) {
        return {
            ok: false,
            characterName,
            appended: 0,
            skipped: 'no_anchor',
            error: '角色沒有初始 45 度形象，無法補正面與設定圖。',
        };
    }

    const existing = existingStandardViews(json);
    const requested = input.force
        ? STANDARD_VIEWS
        : STANDARD_VIEWS.filter((view) => !existing.includes(view));

    if (requested.length === 0) {
        return {
            ok: true,
            characterName,
            existing,
            requested,
            appended: 0,
            skipped: 'already_complete',
        };
    }

    const result = await generateAdditionalViews({
        characterId,
        referenceUrl,
        views: requested,
        dryRun: input.dryRun,
    });

    return {
        ok: result.ok,
        characterName,
        existing,
        requested,
        appended: result.appended,
        frontalUrl: result.frontalUrl,
        artSheetUrl: result.artSheetUrl,
        skipped: result.skipped,
        error: result.error,
    };
}

function firstAnchorUrl(json: ChainCharacter | undefined): string {
    const cover = json?.image_url?.trim();
    if (cover) return cover;
    const first = json?.media_assets?.[0]?.uri?.trim();
    return first ?? '';
}

function existingStandardViews(json: ChainCharacter | undefined): StandardAdditionalView[] {
    const out = new Set<StandardAdditionalView>();
    for (const asset of json?.media_assets ?? []) {
        const view = parseAdditionalView(asset.metadata_uri ?? '');
        if (view) out.add(view);
    }
    return STANDARD_VIEWS.filter((view) => out.has(view));
}

function parseAdditionalView(metadata: string): StandardAdditionalView | null {
    const match = metadata.match(/[?&]view=([^&]+)/);
    if (!match) return null;
    const view = decodeURIComponent(match[1]);
    return view === 'frontal' || view === 'art-sheet' ? view : null;
}

interface ChainCharacter {
    profile?: {
        name?: string;
    };
    image_url?: string;
    media_assets?: Array<{
        uri?: string;
        metadata_uri?: string;
    }>;
}
