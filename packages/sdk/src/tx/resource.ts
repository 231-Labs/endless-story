/**
 * Drama resource ledger (resource.move) — the SUPPLY side of the
 * Desire/Resource drama engine.
 *
 * Thin wrappers around `generated/endless_story/resource.ts`. A
 * `DramaResource` is a saga-scoped, conserved scarce resource that
 * characters contend over (e.g. the 孟雲屏 partnership slot, capacity 1).
 * The DEMAND side (satisfaction / tension) is recomputed OFF-CHAIN from
 * this ledger's allocation history (see `@endless-story/drama`).
 *
 * Two flavours of builder here:
 *   - **mutators** (`instantiate` / `retire` / `applyTransfers` /
 *     `releaseHolder`) — StorytellerCap-gated; settle the on-chain ledger.
 *   - **Transfer constructors** (`acquire` / `reallocate`) — build the
 *     `Transfer` values that go into an `apply_transfers` batch. Use
 *     `tx.makeMoveVec` to assemble `vector<Transfer>` from these, since
 *     BCS pure-args can't express a struct vector (same pattern as
 *     `event.newCardTemplate`).
 *
 * `apply_transfers` re-validates conservation on chain and applies the
 * whole batch atomically — it never trusts the off-chain computation, it
 * re-checks it. That is the trustless guarantee the drama engine rests on.
 */
import * as gen from '../generated/endless_story/resource.js';
import { pkg } from './_package.js';

export { gen as raw };

/* ── Transfer constructors (compose into an apply_transfers batch) ────── */

/** Draw `amount` from the free pool to `to` (total rises; must stay ≤ capacity). */
export const acquire = (args: gen.AcquireArguments) =>
    gen.acquire({ package: pkg(), arguments: args });

/** Move `amount` of an already-held unit from `from` to `to` (seize / hand-off). */
export const reallocate = (args: gen.ReallocateArguments) =>
    gen.reallocate({ package: pkg(), arguments: args });

/* ── lifecycle (StorytellerCap-gated) ────────────────────────────────── */

/** Instantiate a contested resource under a saga (capacity > 0). Shares the object. */
export const instantiate = (args: gen.InstantiateArguments) =>
    gen.instantiate({ package: pkg(), arguments: args });

/** Retire a fully-drained resource (aborts if any units are still held). */
export const retire = (args: gen.RetireArguments) =>
    gen.retire({ package: pkg(), arguments: args });

/** Apply a canonical-ordered batch of transfers atomically; re-checks conservation. */
export const applyTransfers = (args: gen.ApplyTransfersArguments) =>
    gen.applyTransfers({ package: pkg(), arguments: args });

/** Release a holder's units back to the free pool (death / release-to-wild escape hatch). */
export const releaseHolder = (args: gen.ReleaseHolderArguments) =>
    gen.releaseHolder({ package: pkg(), arguments: args });

/* ── views (for devInspect / on-chain assertions; off-chain prefers
   read/resource.ts struct + events) ──────────────────────────────────── */

export const resourceSagaId = (args: gen.ResourceSagaIdArguments) =>
    gen.resourceSagaId({ package: pkg(), arguments: args });

export const capacity = (args: gen.CapacityArguments) =>
    gen.capacity({ package: pkg(), arguments: args });

export const totalAllocated = (args: gen.TotalAllocatedArguments) =>
    gen.totalAllocated({ package: pkg(), arguments: args });

export const freeCapacity = (args: gen.FreeCapacityArguments) =>
    gen.freeCapacity({ package: pkg(), arguments: args });

export const heldBy = (args: gen.HeldByArguments) =>
    gen.heldBy({ package: pkg(), arguments: args });

export const archetype = (args: gen.ArchetypeArguments) =>
    gen.archetype({ package: pkg(), arguments: args });

export const label = (args: gen.LabelArguments) =>
    gen.label({ package: pkg(), arguments: args });
