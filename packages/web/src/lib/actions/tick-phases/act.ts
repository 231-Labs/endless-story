/* ── ACT phase (batched into PTBs) ─────────────────────────────────────
 * For every OPEN event, characters DECIDE concurrently (bounded — decide
 * recalls memory), then:
 *   PTB-1: every submit_action in ONE transaction (one signature).
 *   PTB-2: resolve_event for every now-fully-acted event in ONE transaction.
 * Was 2N serial signs (submit + resolve per participant/event); now ≤2.
 * Already-acted participants are skipped (idempotent re-runs via status +
 * resolution.submitted_actions).
 * Plain module (not 'use server'). */
import {
    ENDLESS_STORY_DEPLOYMENT,
    makeSuiClient,
    read,
    tx as endlessTx,
} from '@endless-story/sdk';
import type { AdminContext } from '@/lib/chain/admin-signer';
import { resolveNetwork } from '@/lib/chain/network';
import { recordSceneLine } from '@/lib/chain/scene-lines';
import { runCharacterTurnAction } from '../character-turn';
import type { TickActResult, TickResolveResult } from '../tick-loop-types';
import { RECALL_CONCURRENCY, mapPool, TickMemoryContext } from './support';
import { trySend } from './chain';

interface EventActState {
    eventId: string;
    sceneId: string;
    participants: string[];
    acted: Set<string>;
    pending: string[]; // participant ids that still need to act (have a hand)
    handCounts: number[]; // hand size per participant (0 = can never act)
    createdAtMs: number; // 0 when the chain object lacks the field
    hands: string[][]; // card template ids per participant
    catalog: Array<{ id: string; label: string; intent: number }>;
    /** All known plays (chain + this tick), for the deterministic verdict. */
    plays: Array<{ characterId: string; cardIndex: number; atMs: number }>;
}

/**
 * Deterministic verdict from on-chain plays — the chain fact the narrative
 * layer can quote for win/loss (resolve itself carries empty outcomes today).
 * Rule: the most aggressive card wins (catalog intent ascending: 斬0 攻1 敘4
 * 觀6); ties break by earliest submission. Pure derivation — reproducible by
 * anyone from the BudgetEvent object.
 */
function deriveVerdict(
    e: EventActState,
    nameById: Map<string, string>,
): { winnerId: string; text: string } | null {
    const ranked = e.plays
        .map((p) => {
            const pi = e.participants.indexOf(p.characterId);
            const templateId = pi >= 0 ? e.hands[pi]?.[p.cardIndex] : undefined;
            const card = e.catalog.find((c) => String(c.id) === String(templateId));
            return card ? { ...p, label: card.label, intent: card.intent } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.intent - b.intent || a.atMs - b.atMs);
    if (ranked.length === 0) return null;
    const w = ranked[0];
    const winnerName = nameById.get(w.characterId) ?? '某角';
    if (ranked.length === 1) {
        return { winnerId: w.characterId, text: `${winnerName}打出〔${w.label}〕，無人接招，這一局由${winnerName}收場` };
    }
    const losers = ranked
        .slice(1)
        .map((l) => `${nameById.get(l.characterId) ?? '某角'}的〔${l.label}〕`)
        .join('、');
    return {
        winnerId: w.characterId,
        text: `${winnerName}的〔${w.label}〕壓過${losers}，這一局${winnerName}佔了上風`,
    };
}

/** All-acted events may linger this long in spine mode before the janitor closes them. */
const EVENT_GRACE_MS =
    Math.max(1, Number(process.env.TICK_EVENT_GRACE_MINUTES) || 10) * 60_000;
/** No event survives past this age, acted or not — the world must never deadlock. */
const EVENT_MAX_AGE_MS =
    Math.max(5, Number(process.env.TICK_EVENT_MAX_AGE_MINUTES) || 60) * 60_000;

export async function runActPhase(
    admin: AdminContext,
    sagaId: string,
    capId: string,
    nameById: Map<string, string>,
    autoResolve: boolean,
    dramaHints: Record<string, string> = {},
    rosterContextById: Map<string, string[]> = new Map(),
    memoryContext = new TickMemoryContext(),
): Promise<{ acts: TickActResult[]; resolves: TickResolveResult[] }> {
    const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
    if (!pkg) return { acts: [], resolves: [] };
    const client = makeSuiClient({ network: resolveNetwork() });
    const summaries = await read.event
        .listBudgetEvents(client, pkg, { sagaId, maxEvents: 20 })
        .catch(() => []);

    // Gather open events + who still needs to act.
    const events: EventActState[] = [];
    for (const s of summaries) {
        let parsed;
        try {
            const res = await read.event.getBudgetEvent(client, s.eventId);
            parsed = res.json as unknown as {
                meta?: { status?: number | string; scene_id?: string; created_at_ms?: number | string };
                deck?: {
                    participants?: string[];
                    hands?: Array<Array<number | string>>;
                    catalog?: Array<
                        | { id?: number | string; label?: string; intent?: number | string }
                        | { fields?: { id?: number | string; label?: string; intent?: number | string } }
                    >;
                };
                resolution?: {
                    submitted_actions?: Array<{
                        character_id?: string;
                        card_index?: number | string;
                        submitted_at_ms?: number | string;
                    }>;
                };
            };
        } catch {
            continue;
        }
        if (Number(parsed.meta?.status ?? 0) !== 0) continue; // resolved/closed
        const participants = parsed.deck?.participants ?? [];
        const hands = parsed.deck?.hands ?? [];
        if (participants.length === 0) continue;
        const acted = new Set(
            (parsed.resolution?.submitted_actions ?? [])
                .map((a) => a.character_id)
                .filter((x): x is string => typeof x === 'string'),
        );
        const pending = participants.filter(
            (p, i) => p && !acted.has(p) && (hands[i]?.length ?? 0) > 0,
        );
        const catalog = (parsed.deck?.catalog ?? []).map((raw) => {
            const f = ('fields' in raw && raw.fields ? raw.fields : raw) as {
                id?: number | string;
                label?: string;
                intent?: number | string;
            };
            return {
                id: String(f.id ?? ''),
                label: String(f.label ?? '?'),
                intent: Number(f.intent ?? 99),
            };
        });
        const plays = (parsed.resolution?.submitted_actions ?? [])
            .filter((a): a is { character_id: string; card_index?: number | string; submitted_at_ms?: number | string } =>
                typeof a.character_id === 'string',
            )
            .map((a) => ({
                characterId: a.character_id,
                cardIndex: Number(a.card_index ?? 0),
                atMs: Number(a.submitted_at_ms ?? 0),
            }));
        events.push({
            eventId: s.eventId,
            sceneId: parsed.meta?.scene_id ?? s.sceneId,
            participants,
            acted,
            pending,
            handCounts: participants.map((_, i) => hands[i]?.length ?? 0),
            createdAtMs: Number(parsed.meta?.created_at_ms ?? 0) || 0,
            hands: participants.map((_, i) => (hands[i] ?? []).map((h) => String(h))),
            catalog,
            plays,
        });
    }

    // DECIDE (bounded concurrency — each decide recalls memory → SEAL).
    const tasks = events.flatMap((e) => e.pending.map((charId) => ({ e, charId })));
    const decided = await mapPool(tasks, RECALL_CONCURRENCY, async ({ e, charId }) => {
        try {
            const r = await runCharacterTurnAction(e.eventId, charId, {
                decideOnly: true,
                dramaHint: dramaHints[charId],
                rosterContext: rosterContextById.get(charId),
                recalledMemories: await memoryContext.recent(
                    charId,
                    `${e.eventId} 衝突 抉擇 出牌`,
                    4,
                    `act:${e.eventId}`,
                ),
                relationshipHints: await memoryContext.relationshipHints(charId, 5),
                planHint: await memoryContext.plan(charId),
            });
            return { e, charId, r };
        } catch (err) {
            return {
                e,
                charId,
                r: {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                } as Awaited<ReturnType<typeof runCharacterTurnAction>>,
            };
        }
    });

    const acts: TickActResult[] = [];
    const submittable = decided.filter(
        (d) => d.r.ok && typeof d.r.cardIndex === 'number',
    );
    // Failed decisions surface immediately.
    for (const d of decided) {
        if (!d.r.ok || typeof d.r.cardIndex !== 'number') {
            acts.push({
                eventId: d.e.eventId,
                characterId: d.charId,
                name: nameById.get(d.charId),
                ok: false,
                error: d.r.error ?? 'decide failed',
            });
        }
    }

    // PTB-1: all submit_action calls in ONE signature. If the batch aborts
    // (one bad card reverts the whole PTB), fall back to per-item submits so
    // a single failure doesn't block the rest. Happy path = one tx.
    if (submittable.length > 0) {
        const batch = await trySend(admin, (txb) => {
            for (const d of submittable) {
                txb.add(
                    buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                );
            }
        });
        if (batch.ok) {
            for (const d of submittable) {
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: true,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                });
                d.e.acted.add(d.charId);
                d.e.plays.push({ characterId: d.charId, cardIndex: d.r.cardIndex as number, atMs: Date.now() });
                // Handscroll Step 3: surface the first-person intent as a ghost quote.
                recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
            }
        } else {
            // Fallback: isolate each submit (serial — only on the rare abort).
            for (const d of submittable) {
                const one = await trySend(admin, (txb) =>
                    txb.add(
                        buildSubmitCall(capId, sagaId, d.e.eventId, d.charId, d.r.cardIndex as number),
                    ),
                );
                acts.push({
                    eventId: d.e.eventId,
                    characterId: d.charId,
                    name: nameById.get(d.charId),
                    ok: one.ok,
                    cardLabel: d.r.cardLabel,
                    intent: d.r.intent,
                    error: one.ok ? undefined : one.error,
                });
                if (one.ok) {
                    d.e.acted.add(d.charId);
                    d.e.plays.push({ characterId: d.charId, cardIndex: d.r.cardIndex as number, atMs: Date.now() });
                    recordSceneLine(d.e.sceneId, d.charId, d.r.intent, 'act');
                }
            }
        }
    }

    // PTB-2: resolve finished events, one signature.
    //
    // Three close conditions (the world must NEVER deadlock on an open event):
    //   1. autoResolve (non-spine judge): everyone who CAN act has acted →
    //      close now. "Can act" = has a non-empty hand; a participant dealt
    //      no cards must not hold the event open forever.
    //   2. Spine-mode fallback: spine owns the linger/resolve cadence, but its
    //      registry is process-local — a redeploy orphans its open events. An
    //      all-acted event older than EVENT_GRACE_MS gets closed here anyway.
    //   3. Hard cap: ANY event older than EVENT_MAX_AGE_MS closes, acted or
    //      not (e.g. a participant whose decide keeps failing). Janitor closes
    //      use emptyOutcomes — "settle nothing" is spine-core's own precedent
    //      for contested resources nobody claimed.
    const resolves: TickResolveResult[] = [];
    {
        const now = Date.now();
        const toResolve = events.filter((e) => {
            if (!e.sceneId) return false;
            const doneActing =
                e.acted.size > 0 &&
                e.participants.every(
                    (p, i) => !p || e.acted.has(p) || e.handCounts[i] === 0,
                );
            const age = e.createdAtMs > 0 ? now - e.createdAtMs : 0;
            if (autoResolve && doneActing) return true;
            if (doneActing && age >= EVENT_GRACE_MS) return true;
            return age >= EVENT_MAX_AGE_MS;
        });
        if (toResolve.length > 0) {
            const r = await trySend(admin, (txb) => {
                for (const e of toResolve) {
                    const outcomes = txb.add(endlessTx.event.emptyOutcomes());
                    txb.add(
                        endlessTx.event.resolveEvent({
                            cap: capId,
                            saga: sagaId,
                            budgetEvent: e.eventId,
                            scene: e.sceneId,
                            outcomes,
                        }),
                    );
                }
            });
            for (const e of toResolve) {
                // The chain resolve carries empty outcomes; the VERDICT — who
                // prevailed, derived purely from on-chain plays — is what the
                // narrative layer anchors win/loss to.
                const verdict = r.ok ? deriveVerdict(e, nameById) : null;
                if (verdict) {
                    recordSceneLine(e.sceneId, verdict.winnerId, verdict.text, 'act');
                }
                resolves.push({
                    eventId: e.eventId,
                    ok: r.ok,
                    digest: r.digest,
                    error: r.ok ? undefined : r.error,
                    verdict: verdict?.text,
                    winnerId: verdict?.winnerId,
                    participants: e.participants,
                });
            }
        }
    }

    return { acts, resolves };
}

/** Build one submit_action move-call for the batch PTB. */
function buildSubmitCall(
    capId: string,
    sagaId: string,
    eventId: string,
    characterId: string,
    cardIndex: number,
) {
    return endlessTx.event.submitAction({
        cap: capId,
        saga: sagaId,
        budgetEvent: eventId,
        characterId,
        cardIndex: BigInt(cardIndex),
    });
}
