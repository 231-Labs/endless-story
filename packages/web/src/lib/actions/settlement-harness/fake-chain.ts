/**
 * DECOUPLED settlement harness — in-memory FAKE chain (zero network, zero SEAL).
 *
 * This is NOT a re-implementation of the settle logic. It is a faithful fake of the
 * SUI RPC SURFACE that the REAL settle code (`event-spine.ts settleEvent` →
 * `drama.ts readResourceLedger` / `settleResolvedTransfers`) drives. The real code
 * runs UNCHANGED; only the bytes coming back from `SuiClient` are local.
 *
 * Fidelity contract (why this is 1:1 with the real wiring, per PERCEPTION_PLAN §8):
 *   · `readResourceLedger` runs REAL: calls `read.resource.listResourceInstantiations`
 *     (→ client.queryEvents), `getManyResources` (→ client.core.getObjects, BCS-decoded
 *     with the REAL generated `DramaResource` struct), `readAllocations`
 *     (→ client.getDynamicFields + client.multiGetObjects). We serve BCS bytes encoded
 *     with the SAME generated structs the decoder uses, so the decode path is exercised
 *     end-to-end.
 *   · `reconcileOpenFromChain` runs REAL: calls `read.event.listBudgetEvents`
 *     (→ queryEvents) + `getBudgetEvent` (→ core.getObjects, BCS BudgetEvent). We serve a
 *     real OPEN BudgetEvent so the orphan-adoption path the audit blames is exercised.
 *   · The resolve TX (`outcomes_with_resource_transfers` + `resolve_event`) and the apply
 *     TX (`apply_resource_transfers`) are built by the REAL `endlessTx.*` builders. Our
 *     `signAndExecuteTransaction` parses the built `Transaction` via `tx.getData()` and
 *     applies the EXACT on-chain validation + mutation semantics from event.move /
 *     resource.move (see applyTransaction).
 */

import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { DramaResource as DramaResourceStruct } from '@endless-story/sdk/generated/endless_story/resource.js';
import {
    BudgetEvent as BudgetEventStruct,
    EventOutcomes as EventOutcomesStruct,
    ResourceTransferOp,
} from '@endless-story/sdk/generated/endless_story/event.js';

/** BCS input type of one resource-transfer op (the struct is a value, not a type). */
type ResourceTransferOpInput = typeof ResourceTransferOp.$inferInput;

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

/** A fake 32-byte object id derived from a short seed (deterministic, valid hex). */
export function fakeId(seed: string): string {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    const tail = seed.replace(/[^a-f0-9]/gi, '');
    const hex = (h.toString(16).padStart(8, '0') + tail).slice(0, 64);
    return '0x' + hex.padEnd(64, '0').slice(0, 64);
}

/* ── in-memory ledger objects ──────────────────────────────────────────── */

export interface FakeResource {
    id: string;
    sagaId: string;
    archetype: string;
    label: string;
    capacity: bigint;
    /** allocations Table object id (its own object so dynamic-field reads route here). */
    tableId: string;
    /** holder character id → units. */
    allocations: Map<string, bigint>;
}

interface FakeOutcomeOp {
    resourceId: string;
    from: string | null;
    to: string;
    amount: bigint;
}

export interface FakeEvent {
    id: string;
    sagaId: string;
    sceneId: string;
    title: string;
    /** 0 = OPEN, 1 = RESOLVED (matches event.move STATUS_OPEN / STATUS_RESOLVED). */
    status: number;
    createdAtMs: number;
    participants: string[];
    /** ops stored by resolve_event; read by apply_resource_transfers. */
    resourceTransfers: FakeOutcomeOp[];
}

/** Effect-trace entry so the test can prove WHICH move calls actually ran. */
export interface MoveCallTrace {
    module: string;
    fn: string;
}

export class FakeChain {
    readonly resources = new Map<string, FakeResource>();
    readonly events = new Map<string, FakeEvent>();
    /** every move call the fake interpreted, in order (assertion aid). */
    readonly callLog: MoveCallTrace[] = [];
    private digestSeq = 0;

    constructor(readonly packageId: string) {}

    addResource(r: FakeResource): void {
        this.resources.set(r.id, r);
    }
    addEvent(e: FakeEvent): void {
        this.events.set(e.id, e);
    }

    totalAllocated(r: FakeResource): bigint {
        let s = 0n;
        for (const v of r.allocations.values()) s += v;
        return s;
    }

    nextDigest(): string {
        return fakeId('digest-' + this.digestSeq++);
    }

    /* ── the on-chain validator + mutator, replicated from the Move source ── */

    /**
     * Interpret a built Transaction the way the Sui Move VM would, with the SAME
     * type discipline the on-chain bytecode verifier enforces. Each command writes a
     * typed value into a result register; later commands read those registers by
     * `Result` index. We model the relevant Move VALUE TYPES so a struct-type mismatch
     * (the exact failure mode that sends `settleEvent` into its fallback on real chain)
     * surfaces here instead of being silently coerced.
     *
     * Returns { ok, error } like a SuiClient effects.status. A type error / abort →
     * ok:false with the error string (mirrors a MoveAbort / type-check failure).
     */
    applyTransaction(tx: Transaction): { ok: boolean; error?: string } {
        const data = tx.getData();
        const inputs = data.inputs;
        const pkg = this.packageId;

        const decodePure = (idx: number, kind: 'id' | 'u64'): string | bigint => {
            const inp = inputs[idx] as { $kind?: string; Pure?: { bytes: string } };
            if (inp?.$kind !== 'Pure' || !inp.Pure) throw new Error(`input ${idx} not Pure`);
            const bytes = fromB64(inp.Pure.bytes);
            if (kind === 'id') return '0x' + toHex(bytes);
            // bcs.u64().parse returns a STRING — coerce to bigint so ledger math stays bigint.
            return BigInt(bcs.u64().parse(bytes) as unknown as string);
        };
        const objIdOf = (idx: number): string => {
            const inp = inputs[idx] as {
                $kind?: string;
                UnresolvedObject?: { objectId: string };
                Object?: { ImmOrOwnedObject?: { objectId: string }; SharedObject?: { objectId: string } };
            };
            if (inp?.UnresolvedObject) return inp.UnresolvedObject.objectId;
            if (inp?.Object?.ImmOrOwnedObject) return inp.Object.ImmOrOwnedObject.objectId;
            if (inp?.Object?.SharedObject) return inp.Object.SharedObject.objectId;
            throw new Error(`input ${idx} not an object`);
        };
        // Option<ID>: BCS-encoded [0x00] = None, [0x01, ...32 bytes] = Some(id).
        const decodeOptionId = (idx: number): string | null => {
            const inp = inputs[idx] as { $kind?: string; Pure?: { bytes: string } };
            if (inp?.$kind !== 'Pure' || !inp.Pure) throw new Error(`input ${idx} not Pure`);
            const bytes = fromB64(inp.Pure.bytes);
            if (bytes.length === 0 || bytes[0] === 0) return null;
            return '0x' + toHex(bytes.slice(1));
        };

        // Typed result registers. `moveType` is the fully-qualified Move type a command
        // produced; `value` carries the JS payload (a transfer op, a vec of ops, …).
        interface Reg {
            moveType: string;
            value: unknown;
        }
        const regs: Reg[] = [];
        const readReg = (arg: { $kind: string; Result?: number }): Reg => {
            if (arg.$kind !== 'Result' || arg.Result === undefined)
                throw new Error('expected a Result register argument');
            const r = regs[arg.Result];
            if (!r) throw new Error(`result register ${arg.Result} not produced`);
            return r;
        };

        const OP_TYPE = `${pkg}::event::ResourceTransferOp`;
        const TRANSFER_TYPE = `${pkg}::resource::Transfer`;
        const OUTCOMES_TYPE = `${pkg}::event::EventOutcomes`;

        try {
            for (const cmd of data.commands) {
                const kind = (cmd as { $kind: string }).$kind;

                if (kind === 'MoveCall') {
                    const mc = (cmd as {
                        MoveCall: { module: string; function: string; arguments: Array<{ $kind: string; Input?: number; Result?: number }> };
                    }).MoveCall;
                    this.callLog.push({ module: mc.module, fn: mc.function });
                    const a = mc.arguments;

                    if (mc.module === 'resource' && mc.function === 'acquire') {
                        // acquire(to: ID, amount: u64): resource::Transfer
                        const to = decodePure(a[0].Input!, 'id') as string;
                        const amount = decodePure(a[1].Input!, 'u64') as bigint;
                        regs.push({ moveType: TRANSFER_TYPE, value: { from: null, to, amount } });
                    } else if (mc.module === 'resource' && mc.function === 'reallocate') {
                        // reallocate(from: ID, to: ID, amount: u64): resource::Transfer
                        const from = decodePure(a[0].Input!, 'id') as string;
                        const to = decodePure(a[1].Input!, 'id') as string;
                        const amount = decodePure(a[2].Input!, 'u64') as bigint;
                        regs.push({ moveType: TRANSFER_TYPE, value: { from, to, amount } });
                    } else if (mc.module === 'event' && mc.function === 'new_resource_transfer_op') {
                        // new_resource_transfer_op(resource_id, from: Option<ID>, to, amount): ResourceTransferOp
                        // (the CORRECT constructor for outcomes_with_resource_transfers). Decode the
                        // real args so the well-typed path applies a genuine transfer.
                        const resourceId = decodePure(a[0].Input!, 'id') as string;
                        const from = decodeOptionId(a[1].Input!);
                        const to = decodePure(a[2].Input!, 'id') as string;
                        const amount = decodePure(a[3].Input!, 'u64') as bigint;
                        regs.push({
                            moveType: OP_TYPE,
                            value: { from, to, amount, resourceId } satisfies FakeOutcomeOp,
                        });
                    } else if (mc.module === 'event' && mc.function === 'outcomes_with_resource_transfers') {
                        // SIGNATURE: outcomes_with_resource_transfers(vector<event::ResourceTransferOp>)
                        // The on-chain VM type-checks the vec's element type. If the caller built
                        // the vec from resource::Transfer (acquire/reallocate) — as settleEvent does —
                        // this is a TYPE MISMATCH and the tx aborts before any state change.
                        const vec = readReg(a[0]);
                        const elemType = (vec.value as { elemType?: string })?.elemType;
                        if (vec.moveType !== `vector<${OP_TYPE}>`) {
                            throw new Error(
                                `TypeMismatch: outcomes_with_resource_transfers expects ` +
                                    `vector<${OP_TYPE}> but received ${vec.moveType}` +
                                    (elemType ? ` (elements are ${elemType})` : ''),
                            );
                        }
                        const ops = (vec.value as { ops: FakeOutcomeOp[] }).ops;
                        regs.push({ moveType: OUTCOMES_TYPE, value: { ops } });
                    } else if (mc.module === 'event' && mc.function === 'empty_outcomes') {
                        regs.push({ moveType: OUTCOMES_TYPE, value: { ops: [] as FakeOutcomeOp[] } });
                    } else if (mc.module === 'event' && mc.function === 'resolve_event') {
                        // resolve_event(cap, saga, budgetEvent, scene, outcomes)
                        const eventId = objIdOf(a[2].Input!);
                        const outcomes = readReg(a[4]);
                        if (outcomes.moveType !== OUTCOMES_TYPE)
                            throw new Error(`resolve_event: arg 5 not EventOutcomes (${outcomes.moveType})`);
                        const ops = (outcomes.value as { ops: FakeOutcomeOp[] }).ops;
                        this.resolveEvent(eventId, ops);
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'apply_resource_transfers') {
                        // apply_resource_transfers(cap, saga, budgetEvent, dramaResource)
                        const eventId = objIdOf(a[2].Input!);
                        const resourceId = objIdOf(a[3].Input!);
                        this.applyResourceTransfers(eventId, resourceId);
                        regs.push({ moveType: 'unit', value: null });
                    } else {
                        // Other calls (pushEvent / dealParticipantHand / newCardTemplate …) are
                        // not on the settle path; seed those via the ledger. Produce an opaque reg.
                        regs.push({ moveType: 'unknown', value: null });
                    }
                } else if (kind === 'MakeMoveVec') {
                    // makeMoveVec({ type, elements }) → vector<type>. We carry the declared
                    // element type AND the actual element register types so the consumer can
                    // type-check (the verifier checks element types match the declared type).
                    const mv = (cmd as { MakeMoveVec: { type: string | null; elements: Array<{ $kind: string; Result?: number }> } })
                        .MakeMoveVec;
                    const declared = mv.type ?? 'inferred';
                    const elemRegs = mv.elements.map((e) => readReg(e));
                    const elemType = elemRegs[0]?.moveType ?? declared;
                    // Gather the underlying transfer ops (only meaningful when elements are
                    // resource::Transfer; for ResourceTransferOp we model them as opaque ops).
                    const ops: FakeOutcomeOp[] = elemRegs.map((r) => {
                        const v = r.value as { from?: string | null; to?: string; amount?: bigint };
                        return {
                            resourceId: '',
                            from: v.from ?? null,
                            to: v.to ?? '',
                            amount: v.amount ?? 0n,
                        };
                    });
                    // The vec's Move type is vector<declared-element-type>. settleEvent declares
                    // `resource::ResourceTransfer` (which is not even the real struct name —
                    // the struct is resource::Transfer) — so this will NOT equal vector<…Op>.
                    regs.push({ moveType: `vector<${declared}>`, value: { ops, elemType } });
                } else {
                    regs.push({ moveType: 'unknown', value: null });
                }
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /** event.move resolve_event: validate participant scope, store outcomes, → RESOLVED. */
    private resolveEvent(eventId: string, ops: FakeOutcomeOp[]): void {
        const ev = this.events.get(eventId);
        if (!ev) throw new Error(`resolve_event: unknown event ${eventId}`);
        if (ev.status !== 0) throw new Error('EEventNotOpen'); // STATUS_OPEN required
        const parts = new Set(ev.participants);
        for (const op of ops) {
            if (op.from !== null && !parts.has(op.from))
                throw new Error('EResourceTransferFromNotParticipant');
            if (!parts.has(op.to)) throw new Error('EResourceTransferToNotParticipant');
        }
        ev.resourceTransfers = ops.map((o) => ({ ...o }));
        ev.status = 1; // STATUS_RESOLVED
    }

    /** event.move apply_resource_transfers → resource.move apply_transfers / apply_one. */
    private applyResourceTransfers(eventId: string, resourceId: string): void {
        const ev = this.events.get(eventId);
        if (!ev) throw new Error(`apply: unknown event ${eventId}`);
        if (ev.status !== 1) throw new Error('EEventNotResolved');
        const r = this.resources.get(resourceId);
        if (!r) throw new Error(`apply: unknown resource ${resourceId}`);
        // Gather ops naming THIS resource — the Move side filters op.resource_id == rid.
        // Ops built via the CORRECT constructor (new_resource_transfer_op) carry the real
        // resource id; we filter by it. Ops with an empty resource id (the legacy
        // acquire/reallocate shape) are treated as belonging to the single passed resource.
        const ops = ev.resourceTransfers.filter(
            (op) => op.resourceId === '' || op.resourceId === resourceId,
        );
        for (const op of ops) {
            this.applyOne(r, op);
        }
    }

    /** resource.move apply_one — conservation-checked single transfer. */
    private applyOne(r: FakeResource, op: FakeOutcomeOp): void {
        if (op.amount === 0n) return;
        if (op.from !== null) {
            if (op.from === op.to) throw new Error('ESelfTransfer');
            const have = r.allocations.get(op.from) ?? 0n;
            if (have < op.amount) throw new Error('EInsufficientHeld');
            r.allocations.set(op.from, have - op.amount);
            r.allocations.set(op.to, (r.allocations.get(op.to) ?? 0n) + op.amount);
        } else {
            const after = this.totalAllocated(r) + op.amount;
            if (after > r.capacity) throw new Error('ECapacityExceeded');
            r.allocations.set(op.to, (r.allocations.get(op.to) ?? 0n) + op.amount);
        }
    }
}

/* ── SuiClient-shaped fake (only the methods the settle path touches) ───── */

export function makeFakeSuiClient(chain: FakeChain): unknown {
    return {
        /* read.* event scans → queryEvents */
        async queryEvents({ query }: { query: { MoveEventType?: string } }) {
            const t = query?.MoveEventType ?? '';
            if (t.endsWith('::resource::ResourceInstantiated')) {
                return {
                    data: [...chain.resources.values()].map((r) => ({
                        id: { txDigest: 'seed', eventSeq: '0' },
                        parsedJson: {
                            resource_id: r.id,
                            saga_id: r.sagaId,
                            archetype: r.archetype,
                            label: r.label,
                            capacity: r.capacity.toString(),
                            created_at_ms: '0',
                        },
                    })),
                    hasNextPage: false,
                    nextCursor: null,
                };
            }
            if (t.endsWith('::resource::ResourceRetired')) {
                return { data: [], hasNextPage: false, nextCursor: null };
            }
            if (t.endsWith('::event::BudgetEventPushed')) {
                return {
                    data: [...chain.events.values()].map((e) => ({
                        id: { txDigest: 'seed', eventSeq: '0' },
                        parsedJson: {
                            event_id: e.id,
                            saga_id: e.sagaId,
                            scene_id: e.sceneId,
                            participant_count: e.participants.length,
                            card_count: 0,
                            created_at_ms: String(e.createdAtMs),
                        },
                    })),
                    hasNextPage: false,
                    nextCursor: null,
                };
            }
            return { data: [], hasNextPage: false, nextCursor: null };
        },

        /* DramaResource.getMany / BudgetEvent.get → core.getObjects (BCS content) */
        core: {
            async getObjects({ objectIds }: { objectIds: string[] }) {
                return {
                    objects: objectIds.map((id) => {
                        const r = chain.resources.get(id);
                        if (r) return { content: encodeResource(r) };
                        const e = chain.events.get(id);
                        if (e) return { content: encodeEvent(e) };
                        return new Error(`no object ${id}`);
                    }),
                };
            },
        },

        /* readAllocations → getDynamicFields + multiGetObjects on the Table */
        async getDynamicFields({ parentId }: { parentId: string }) {
            const r = [...chain.resources.values()].find((x) => x.tableId === parentId);
            if (!r) return { data: [], hasNextPage: false, nextCursor: null };
            const data = [...r.allocations.entries()].map(([holder]) => ({
                objectId: fakeId('field-' + r.id + '-' + holder),
            }));
            return { data, hasNextPage: false, nextCursor: null };
        },
        async multiGetObjects({ ids }: { ids: string[] }) {
            // Map each field object id back to its (resource, holder, value).
            const fieldIndex = new Map<string, { holder: string; value: bigint }>();
            for (const r of chain.resources.values()) {
                for (const [holder, value] of r.allocations.entries()) {
                    fieldIndex.set(fakeId('field-' + r.id + '-' + holder), { holder, value });
                }
            }
            return ids.map((id) => {
                const f = fieldIndex.get(id);
                if (!f) return { data: null };
                return {
                    data: {
                        content: {
                            dataType: 'moveObject',
                            fields: { name: f.holder, value: f.value.toString() },
                        },
                    },
                };
            });
        },

        /* the write side: interpret the REAL built tx, apply move semantics */
        async signAndExecuteTransaction({ transaction }: { transaction: Transaction }) {
            const result = chain.applyTransaction(transaction);
            const digest = chain.nextDigest();
            return {
                digest,
                effects: {
                    status: result.ok
                        ? { status: 'success' }
                        : { status: 'failure', error: result.error },
                },
                objectChanges: [],
            };
        },
        async waitForTransaction() {
            return {};
        },
    };
}

/* ── BCS encoders (REAL generated structs → bytes the REAL decoder reads) ── */

function encodeResource(r: FakeResource): Uint8Array {
    return DramaResourceStruct.serialize({
        id: r.id,
        saga_id: r.sagaId,
        archetype: r.archetype,
        label: r.label,
        capacity: r.capacity,
        // The Table struct decodes to { id, size }; readAllocations reads the size>0
        // path by paging the table id's dynamic fields (served by getDynamicFields).
        allocations: { id: r.tableId, size: BigInt(r.allocations.size) },
        total_allocated: [...r.allocations.values()].reduce((s, v) => s + v, 0n),
        created_at_ms: 0n,
    }).toBytes();
}

function encodeEvent(e: FakeEvent): Uint8Array {
    const ops: ResourceTransferOpInput[] = e.resourceTransfers.map((o) => ({
        resource_id: o.resourceId || ZERO,
        from: o.from,
        to: o.to,
        amount: o.amount,
    }));
    return BudgetEventStruct.serialize({
        id: e.id,
        meta: {
            saga_id: e.sagaId,
            scene_id: e.sceneId,
            title: e.title,
            summary: '',
            scale: 3,
            status: e.status,
            created_at_ms: BigInt(e.createdAtMs),
            resolved_at_ms: 0n,
        },
        deck: {
            participants: e.participants,
            catalog: [],
            hand_size: 0n,
            hands: [],
        },
        resolution: {
            submitted_actions: [],
            outcomes: emptyOutcomes(ops),
        },
    }).toBytes();
}

function emptyOutcomes(resourceTransfers: ResourceTransferOpInput[]) {
    return {
        currency_transfers: [],
        scene_deltas: [],
        tag_ops: [],
        commitment_ids: [],
        deaths: [],
        resource_transfers: resourceTransfers,
    } satisfies Parameters<typeof EventOutcomesStruct.serialize>[0];
}

/* ── tiny base64/hex helpers (Pure input bytes are base64) ───────────────── */

function fromB64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
