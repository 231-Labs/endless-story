'use server';

/**
 * Server action — an OUTSIDE fan (the owner/subscriber) sends an item backstage
 * under a pen name: the 恩主/捧角 donation hook, in-world and fourth-wall-safe
 * (1920s fans really did send 行頭/首飾 to 名角 via the stage door).
 *
 * What it does (v0, off-chain):
 *   1. the item enters the character's 隨身 (carried-store, durable) with
 *      provenance = the pen name + a fresh-gift salience window;
 *   2. the character REMEMBERS receiving it (MemWal, kind observation).
 * Whether she ever wears it, sleeves it, or one day pawns it is HER choice —
 * the engine salience gate + her beats decide; every answer is a signal back.
 *
 * v1 (later): the gift as a paid on-chain asset (ENDLESS fee → saga treasury,
 * item provenance anchored) + LLM moderation of the item description.
 */

import { addCarried } from '@/lib/chain/carried-store';
import { rememberForCharacter } from '@/lib/chain/memory';

export interface GiftCharacterInput {
    characterId: string;
    /** The item, in-world wording (e.g. 一柄湘妃竹摺扇，扇骨刻著一枝白梅). */
    itemDesc: string;
    /** The fan's pen name (落款), e.g. 聽雪客. Defaults to anonymous. */
    penName?: string;
}

export interface GiftCharacterResult {
    ok: boolean;
    error?: string;
}

export async function giftCharacterAction(input: GiftCharacterInput): Promise<GiftCharacterResult> {
    const itemDesc = input.itemDesc?.trim();
    const penName = input.penName?.trim() || '一位不具名的戲迷';
    if (!input.characterId) return { ok: false, error: '缺 characterId' };
    if (!itemDesc) return { ok: false, error: '物件描述不可為空' };
    if (itemDesc.length > 60) return { ok: false, error: '物件描述請在 60 字以內' };
    if (penName.length > 12) return { ok: false, error: '落款請在 12 字以內' };

    addCarried(input.characterId, { desc: `${penName}所贈的${itemDesc}`, from: penName });
    // She remembers receiving it — the 素箋 fiction keeps the wall intact. The
    // closing line matters: it hands the decision back to her.
    await rememberForCharacter(
        input.characterId,
        `今晨戲園門房轉來一件東西：${itemDesc}。附著一張素箋，只落了款：「${penName}」。這樣的東西，收是收下了，怎麼用、用不用，由你。`,
        { kind: 'observation', importance: 7 },
    ).catch(() => undefined); // store already holds the item; memory is best-effort
    return { ok: true };
}
