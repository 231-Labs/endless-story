/**
 * BudgetEvent (event.move 1.6) — card-based saga events with weighted
 * hand draws + resolution invariants for death / scene / tag outcomes.
 *
 * Lifecycle:
 *   1. `pushEvent`  — storyteller seeds OPEN event with catalog + hand size
 *   2. `dealParticipantHand` — add each character; draws their hand via
 *      Sui Random + saga card-weight rules (uniform when no rules set).
 *      `entry` on chain — must be its own tx (non-composable randomness).
 *   3. `submitAction` — character plays one card from their hand
 *   4. `resolveEvent` — validates outcomes (death attribution, scene id
 *      match, currency participants) and flips to RESOLVED
 *   5. `applyDeath` / `applyTagOp` — one Character mut per call after
 *      resolve to land mark_dead / apply_tag / revoke_tag side effects
 *
 * Builders (`newCardTemplate`) exist so the orchestrator can build
 * `vector<CardTemplate>` via `tx.makeMoveVec` since BCS pure-args don't
 * cover struct vectors.
 */
import * as gen from '../generated/endless_story/event.js';
import { pkg } from './_package.js';

export { gen as raw };

export const pushEvent = (args: gen.PushEventArguments) =>
    gen.pushEvent({ package: pkg(), arguments: args });

export const dealParticipantHand = (args: gen.DealParticipantHandArguments) =>
    gen.dealParticipantHand({ package: pkg(), arguments: args });

export const submitAction = (args: gen.SubmitActionArguments) =>
    gen.submitAction({ package: pkg(), arguments: args });

export const resolveEvent = (args: gen.ResolveEventArguments) =>
    gen.resolveEvent({ package: pkg(), arguments: args });

export const applyDeath = (args: gen.ApplyDeathArguments) =>
    gen.applyDeath({ package: pkg(), arguments: args });

export const applyTagOp = (args: gen.ApplyTagOpArguments) =>
    gen.applyTagOp({ package: pkg(), arguments: args });

export const newCardTemplate = (args: gen.NewCardTemplateArguments) =>
    gen.newCardTemplate({ package: pkg(), arguments: args });

export const emptyOutcomes = () =>
    gen.emptyOutcomes({ package: pkg(), arguments: [] });

/* Constant readers — handy for off-chain TagOp construction. */
export const tagOpKindAdd = () =>
    gen.tagOpKindAdd({ package: pkg(), arguments: [] });

export const tagOpKindRemove = () =>
    gen.tagOpKindRemove({ package: pkg(), arguments: [] });
