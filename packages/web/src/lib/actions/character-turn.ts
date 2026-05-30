'use server';

/**
 * N1 — let the character agent take its own turn in an event.
 *
 * Replaces admin-manual card play: the character perceives its hand +
 * the scene, recalls memories (three-factor), DECIDES a card, and the
 * action is submitted on chain. This is where "past shapes choice"
 * becomes visible — a character with a trauma memory plays differently.
 *
 * Admin keypair signs submit_action (holds StorytellerCap) — in the demo
 * the saga executes the character's decision. (Later: the character's own
 * delegated signer.)
 */

import { Transaction } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import { characterAgent } from '@endless-story/runner';

type HandCard = characterAgent.HandCard;
import { getAdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { resolveRole } from '@/lib/chain/pov-core';
import { recallForCharacter } from '@/lib/chain/memory';
import { fetchRelationshipHints } from '@/lib/chain/relationships';

const INTENT_NAME: Record<number, string> = {
    0: '殺意',
    1: '攻擊',
    2: '防守',
    3: '療癒',
    4: '社交',
    5: '逃避',
    6: '旁觀',
    7: '親密',
    8: '自訂',
};

export interface CharacterTurnResult {
    ok: boolean;
    /** Chosen card label + the character's first-person intent. */
    cardLabel?: string;
    intent?: string;
    reason?: string;
    recalledCount?: number;
    /** Director-seeded ties fed into the decision (N3). */
    relationshipCount?: number;
    digest?: string;
    error?: string;
}

export async function runCharacterTurnAction(
    eventId: string,
    characterId: string,
): Promise<CharacterTurnResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'admin 載入失敗' };
    }

    const client = makeSuiClient({ network: resolveNetwork() });

    // 1. Read the event: catalog + this character's dealt hand.
    let hand: HandCard[] = [];
    let eventTitle = '一場戲';
    let eventSummary = '';
    let status = 0;
    try {
        const res = await read.event.getBudgetEvent(client, eventId);
        const j = res.json as unknown as {
            meta?: { title?: string; summary?: string; status?: number | string };
            deck?: {
                participants?: string[];
                hands?: Array<Array<number | string>>;
                catalog?: Array<{ label?: string; intent?: number | string }>;
            };
        };
        eventTitle = j.meta?.title ?? eventTitle;
        eventSummary = j.meta?.summary ?? '';
        status = Number(j.meta?.status ?? 0);
        const participants = j.deck?.participants ?? [];
        const hands = j.deck?.hands ?? [];
        const catalog = j.deck?.catalog ?? [];
        const pIdx = participants.findIndex((p) => p === characterId);
        if (pIdx < 0) return { ok: false, error: '此角色不在這個事件裡(請先發牌)' };
        const myHandIdx = (hands[pIdx] ?? []).map((x) => Number(x));
        hand = myHandIdx.map((catalogIndex) => ({
            catalogIndex,
            label: catalog[catalogIndex]?.label ?? `#${catalogIndex}`,
            intent: INTENT_NAME[Number(catalog[catalogIndex]?.intent ?? 8)] ?? '自訂',
        }));
    } catch (err) {
        return { ok: false, error: '讀取事件失敗:' + (err instanceof Error ? err.message : '') };
    }
    if (status !== 0) return { ok: false, error: '事件已結算,無法出牌' };
    if (hand.length === 0) return { ok: false, error: '此角色手牌為空' };

    // 2. Character snapshot + role + recalled memories + relationships
    //    (the choice levers — past + ties shape the card she plays).
    const [charRes, sagaRes, role, recalled, relationshipHints] = await Promise.all([
        read.character.getCharacter(client, characterId).catch(() => null),
        read.saga.getSaga(client, d.sagaId).catch(() => null),
        resolveRole(characterId),
        recallForCharacter(characterId, `${eventTitle} ${eventSummary} 衝突 抉擇`, 6),
        fetchRelationshipHints(characterId, 6).catch(() => [] as string[]),
    ]);
    const cj = charRes?.json as unknown as {
        profile?: { name?: string; physical_facts?: { species?: string; body?: string } };
    };
    const name = cj?.profile?.name ?? '無名';
    const physical =
        [cj?.profile?.physical_facts?.species, cj?.profile?.physical_facts?.body]
            .filter(Boolean)
            .join(' / ') || '—';
    const sagaName = (sagaRes?.json as unknown as { name?: string })?.name ?? '戲班';

    // 3. DECIDE.
    let decision;
    try {
        decision = await characterAgent.decideCardPlay({
            name,
            role: role ?? '—',
            physicalFacts: physical,
            sagaName,
            eventTitle,
            eventSummary,
            hand,
            recalledMemories: recalled,
            relationshipHints,
        });
    } catch (err) {
        return { ok: false, error: 'decide 失敗:' + (err instanceof Error ? err.message : '') };
    }

    // 4. ACT — submit the chosen card on chain.
    try {
        const txb = new Transaction();
        txb.add(
            endlessTx.event.submitAction({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                budgetEvent: eventId,
                characterId,
                cardIndex: BigInt(decision.catalogIndex),
            }),
        );
        const res = await admin.client.signAndExecuteTransaction({
            transaction: txb,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            return {
                ok: false,
                error: res.effects?.status?.error ?? '出牌 tx 失敗',
                cardLabel: hand.find((c) => c.catalogIndex === decision.catalogIndex)?.label,
                intent: decision.intent,
            };
        }
        await admin.client.waitForTransaction({ digest: res.digest }).catch(() => {});
        return {
            ok: true,
            cardLabel: hand.find((c) => c.catalogIndex === decision.catalogIndex)?.label,
            intent: decision.intent,
            reason: decision.reason,
            recalledCount: recalled.length,
            relationshipCount: relationshipHints.length,
            digest: res.digest,
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
