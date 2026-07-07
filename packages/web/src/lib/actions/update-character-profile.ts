'use server';

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext, execAdminTx } from '@/lib/chain/admin-signer';

export interface UpdateCharacterProfileDescriptionInput {
    characterId: string;
    description: string;
}

export interface UpdateCharacterProfileDescriptionResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

export async function updateCharacterProfileDescriptionAction(
    input: UpdateCharacterProfileDescriptionInput,
): Promise<UpdateCharacterProfileDescriptionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const characterId = input.characterId.trim();
    const description = input.description.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(characterId)) {
        return { ok: false, error: '角色 id 格式不正確' };
    }
    if (!description) {
        return { ok: false, error: '描述不可為空' };
    }
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化（缺 sagaId / storytellerCapId）' };
    }

    try {
        const admin = getAdminContext();
        const tx = new Transaction();
        tx.add(
            endlessTx.character.updateProfileDescriptionByStoryteller({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                character: characterId,
                newDescription: description,
            }),
        );
        const res = await execAdminTx(admin, tx);
        if (!res.success) {
            return {
                ok: false,
                digest: res.digest,
                error: res.error ?? '交易失敗',
            };
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
