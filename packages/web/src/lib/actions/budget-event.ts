'use server';

/**
 * BudgetEvent (event.move 1.6) admin server actions.
 *
 * Three independent admin-signed txs, one per lifecycle step:
 *
 *   1. `createBudgetEventAction(sceneId, ...)` — push_event with a preset
 *      demo catalog (4 cards: KILL / ATTACK / SOCIAL / WITNESS). Catalog
 *      editor UI is a v2 — for the demo, a fixed catalog is enough to
 *      show the lifecycle. Returns the new BudgetEvent object id.
 *   2. `dealHandAction(eventId, characterId)` — deal_participant_hand
 *      one character at a time. Sui Random + entry fun forces 1 char =
 *      1 tx; admin UI loops.
 *   3. `resolveEventAction(eventId, sceneId)` — resolve_event with
 *      `emptyOutcomes()`. No death attribution / scene-delta editor in
 *      v1; we just flip status → RESOLVED so the lifecycle is provable.
 *
 * Catalog cards in `DEMO_CATALOG`:
 *   - 0: KILL    · 「斬」
 *   - 1: ATTACK  · 「攻」
 *   - 2: SOCIAL  · 「敘」
 *   - 3: WITNESS · 「觀」
 */

import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { getAdminContext } from '@/lib/chain/admin-signer';

const INTENT_KILL = 0;
const INTENT_ATTACK = 1;
const INTENT_SOCIAL = 4;
const INTENT_WITNESS = 6;

interface DemoCard {
    id: number;
    intent: number;
    label: string;
}

const DEMO_CATALOG: DemoCard[] = [
    { id: 1, intent: INTENT_KILL, label: '斬' },
    { id: 2, intent: INTENT_ATTACK, label: '攻' },
    { id: 3, intent: INTENT_SOCIAL, label: '敘' },
    { id: 4, intent: INTENT_WITNESS, label: '觀' },
];

const DEFAULT_HAND_SIZE = 3;

/** Map event.move abort codes → readable zh messages so the admin sees
 *  WHY a deal/resolve failed instead of a raw MoveAbort. */
function humanizeEventAbort(raw: string | undefined): string | null {
    if (!raw) return null;
    const m = raw.match(/abort code:\s*(\d+)/i) ?? raw.match(/MoveAbort.*?,\s*(\d+)\)/);
    const code = m ? Number(m[1]) : NaN;
    switch (code) {
        case 1:
            return '事件已結算或不在開放狀態，無法再操作（請重整）';
        case 16:
            return '此角色已經在這個事件裡了（清單過期，已自動重整）';
        case 17:
            return '此角色不屬於這個 saga';
        case 18:
            return '此角色不在這個事件的場景內（請換到她所在的場景開事件）';
        case 19:
            return '此角色已死亡，無法參與';
        default:
            return null;
    }
}

export interface CreateBudgetEventInput {
    sceneId: string;
    title: string;
    summary: string;
    /** 1–5; narrative size (informational, no on-chain semantic). */
    scale?: number;
}

export interface ActionResult {
    ok: boolean;
    digest?: string;
    error?: string;
}

export interface CreateBudgetEventResult extends ActionResult {
    /** New BudgetEvent object id on success. */
    eventId?: string;
}

export async function createBudgetEventAction(
    input: CreateBudgetEventInput,
): Promise<CreateBudgetEventResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }
    if (!input.sceneId) {
        return { ok: false, error: '需要選一個場景' };
    }
    if (!input.title.trim()) {
        return { ok: false, error: '事件需要一個標題' };
    }

    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const tx = new Transaction();
        // BCS pure-args don't cover struct vectors → build catalog via
        // makeMoveVec from per-card new_card_template moveCalls.
        const cardArgs = DEMO_CATALOG.map((c) =>
            tx.add(
                endlessTx.event.newCardTemplate({
                    id: c.id,
                    intent: c.intent,
                    label: c.label,
                    payload: [],
                }),
            ),
        );
        const catalogArg = tx.makeMoveVec({
            type: `${d.packageId}::event::CardTemplate`,
            elements: cardArgs,
        });

        tx.add(
            endlessTx.event.pushEvent({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                sceneId: input.sceneId,
                title: input.title,
                summary: input.summary,
                scale: Math.max(1, Math.min(5, input.scale ?? 3)),
                catalog: catalogArg,
                handSize: BigInt(DEFAULT_HAND_SIZE),
            }),
        );

        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true, showObjectChanges: true },
        });

        if (res.effects?.status?.status !== 'success') {
            return {
                ok: false,
                error: res.effects?.status?.error ?? '交易失敗',
                digest: res.digest,
            };
        }

        const changes = (res.objectChanges ?? []) as Array<{
            type?: string;
            objectType?: string;
            objectId?: string;
        }>;
        const created = changes.find(
            (c) => c.type === 'created' && c.objectType?.endsWith('::event::BudgetEvent'),
        );

        return {
            ok: true,
            digest: res.digest,
            eventId: created?.objectId,
        };
    } catch (err) {
        return {
            ok: false,
            error:
                humanizeEventAbort(err instanceof Error ? err.message : String(err)) ??
                (err instanceof Error ? err.message : String(err)),
        };
    }
}

export interface DealHandInput {
    eventId: string;
    characterId: string;
}

export async function dealHandAction(input: DealHandInput): Promise<ActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const tx = new Transaction();
        tx.add(
            endlessTx.event.dealParticipantHand({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                budgetEvent: input.eventId,
                character: input.characterId,
            }),
        );
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            return {
                ok: false,
                error: res.effects?.status?.error ?? '發牌失敗',
                digest: res.digest,
            };
        }
        // Settle before the UI re-reads the participant list — else RPC lag
        // shows the dealt character as still-available → re-deal → abort 16.
        try {
            await admin.client.waitForTransaction({ digest: res.digest });
        } catch {
            /* best-effort */
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: humanizeEventAbort(raw) ?? raw };
    }
}

export interface ResolveEventInput {
    eventId: string;
    sceneId: string;
}

export async function resolveEventAction(
    input: ResolveEventInput,
): Promise<ActionResult> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    if (!d.sagaId || !d.storytellerCapId) {
        return { ok: false, error: 'saga 尚未種子化' };
    }
    let admin;
    try {
        admin = getAdminContext();
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'admin keypair 載入失敗',
        };
    }

    try {
        const tx = new Transaction();
        // empty_outcomes() returns an EventOutcomes value we can hand to
        // resolve_event in the same tx — no scene_deltas, no deaths, no
        // currency transfers, no tag_ops. Just close the event.
        const outcomes = tx.add(endlessTx.event.emptyOutcomes());
        tx.add(
            endlessTx.event.resolveEvent({
                cap: d.storytellerCapId,
                saga: d.sagaId,
                budgetEvent: input.eventId,
                scene: input.sceneId,
                outcomes,
            }),
        );
        const res = await admin.client.signAndExecuteTransaction({
            transaction: tx,
            signer: admin.signer,
            options: { showEffects: true },
        });
        if (res.effects?.status?.status !== 'success') {
            return {
                ok: false,
                error: res.effects?.status?.error ?? '結算失敗',
                digest: res.digest,
            };
        }
        try {
            await admin.client.waitForTransaction({ digest: res.digest });
        } catch {
            /* best-effort */
        }
        return { ok: true, digest: res.digest };
    } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: humanizeEventAbort(raw) ?? raw };
    }
}
