/**
 * DECOUPLED FULL-TICK harness — in-memory FAKE chain for the WHOLE tick loop.
 *
 * Extends the settle-only `settlement-harness/fake-chain.ts` idea to every read +
 * write the REAL `runTickLoopAction` drives, so the unmodified tick can run with
 * ZERO network. The goal is to isolate the runner's MECHANISM from infrastructure:
 * with a perfect (never-429, instant-finality) chain underneath, does the cut job
 * stall / do chapters anchor? If yes here, the fault is the mechanism; if it only
 * stalls on real chain, the fault is RPC 429 rate-limiting.
 *
 * Fidelity contract (same as the settle harness): the REAL generated BCS structs
 * encode the bytes the REAL decoders read (`core.getObjects` → `.json`), and the
 * write side interprets the REAL built `Transaction` via `tx.getData()`, applying
 * the on-chain object-version + lifecycle semantics the admin-tx lock exists to
 * protect (owned StorytellerCap + gas coin version bumps; BudgetEvent OPEN→RESOLVED).
 *
 * Three MODES (the infra knob):
 *   · ideal        — zero latency, never throttles. The control condition.
 *   · inject429    — reads/txs throw `Unexpected status code: 429` at a tunable rate.
 *   · slowFinality — waitForTransaction (and optionally tx submit) add latency, to
 *                    emulate slow indexing/finality wedging the serial admin lock.
 */

import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { DramaResource as DramaResourceStruct } from '@endless-story/sdk/generated/endless_story/resource.js';
import {
    BudgetEvent as BudgetEventStruct,
    EventOutcomes as EventOutcomesStruct,
} from '@endless-story/sdk/generated/endless_story/event.js';
import { World as WorldStruct } from '@endless-story/sdk/generated/endless_story/world.js';
import { Saga as SagaStruct } from '@endless-story/sdk/generated/endless_story/saga.js';
import { Scene as SceneStruct } from '@endless-story/sdk/generated/endless_story/scene.js';
import { Character as CharacterStruct } from '@endless-story/sdk/generated/endless_story/character.js';
import { fakeId } from '../settlement-harness/fake-chain.js';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

/* ── mode config ──────────────────────────────────────────────────────────── */

export type FakeMode = 'ideal' | 'inject429' | 'slowFinality';

export interface FakeModeConfig {
    mode: FakeMode;
    /** inject429: probability [0,1] a given read throws 429. */
    readFailRate?: number;
    /** inject429: probability [0,1] a given tx submit throws 429. */
    txFailRate?: number;
    /** slowFinality: ms added to each waitForTransaction. */
    finalityDelayMs?: number;
    /** slowFinality: ms added to each tx submit. */
    submitDelayMs?: number;
    /** ideal default 0 — ms added to every read (set >0 to emulate base RTT). */
    readDelayMs?: number;
}

/* ── in-memory ledger objects ─────────────────────────────────────────────── */

export interface FakeWorld {
    id: string;
    currentTick: number;
    daysPerTickBp: number;
}

export interface FakeSaga {
    id: string;
    worldId: string;
    name: string;
    description: string;
    characterCount: number;
    anchorSceneIds: string[];
    operator: string;
}

export interface FakeScene {
    id: string;
    worldId: string;
    sagaId: string;
    locationId: string;
    name: string;
    characterIds: string[];
}

export interface FakeCharacter {
    id: string;
    name: string;
    sagaId: string;
    sceneId: string;
    ownerCapId: string;
    controlCapId: string;
    owner: string;
    /** innate world attrs (key→value). */
    attrs: { appearance: number; constitution: number; acuity: number; disposition: number };
    gender: string;
    species: string;
}

export interface FakeResource {
    id: string;
    sagaId: string;
    archetype: string;
    label: string;
    capacity: bigint;
    tableId: string;
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
    /** 0 = OPEN, 1 = RESOLVED. */
    status: number;
    createdAtMs: number;
    participants: string[];
    resourceTransfers: FakeOutcomeOp[];
}

/** One emitted `RelationshipSeeded` soft event (director-declared tie). Stored
 *  so `read.director.listRelationshipEvents` → `fetchOnChainEdgesFrom` can read
 *  the graph back — the harness writes the tie here on `relationship_seed`. */
export interface FakeRelationshipSeed {
    sagaId: string;
    sceneId: string;
    characterA: string;
    characterB: string;
    tone: string;
    seededAtMs: number;
}

/** Owned object whose version the admin-tx lock protects (gas coin, StorytellerCap). */
interface OwnedObject {
    id: string;
    version: number;
}

export interface MoveCallTrace {
    module: string;
    fn: string;
}

/** Per-tx interpretation result. */
interface TxResult {
    ok: boolean;
    error?: string;
    /** objectChanges to surface (created BudgetEvent / Commitment / etc.). */
    created: Array<{ objectType: string; objectId: string }>;
}

export class FullFakeChain {
    world!: FakeWorld;
    saga!: FakeSaga;
    readonly scenes = new Map<string, FakeScene>();
    readonly characters = new Map<string, FakeCharacter>();
    readonly resources = new Map<string, FakeResource>();
    readonly events = new Map<string, FakeEvent>();
    /** RelationshipSeeded soft-event log (append order = oldest→newest). The
     *  query surface returns it newest-first, matching the real descending scan. */
    readonly relationships: FakeRelationshipSeed[] = [];

    /** owned objects whose versions move on every admin tx (the lock's purpose). */
    readonly owned = new Map<string, OwnedObject>();
    /** N admin gas coins (getCoins surface, even if the tick rarely calls it). */
    gasCoins: OwnedObject[] = [];

    readonly callLog: MoveCallTrace[] = [];
    /** counters for the report. */
    stats = {
        reads: 0,
        readThrottled: 0,
        txSubmitted: 0,
        txThrottled: 0,
        txAborted: 0,
        pushEvents: 0,
        deals: 0,
        resolves: 0,
        applies: 0,
        commits: 0,
        advances: 0,
        /** owned-object version-conflict aborts (would-be 'version unavailable'). */
        versionConflicts: 0,
    };

    private digestSeq = 0;
    private objSeq = 0;

    constructor(
        readonly packageId: string,
        public cfg: FakeModeConfig = { mode: 'ideal' },
    ) {}

    setMode(cfg: FakeModeConfig): void {
        this.cfg = cfg;
        // reset transient stats but keep ledger state across modes? We re-seed per
        // mode in the driver, so just reset stats here for a clean per-mode report.
        this.stats = {
            reads: 0,
            readThrottled: 0,
            txSubmitted: 0,
            txThrottled: 0,
            txAborted: 0,
            pushEvents: 0,
            deals: 0,
            resolves: 0,
            applies: 0,
            commits: 0,
            advances: 0,
            versionConflicts: 0,
        };
        this.callLog.length = 0;
    }

    nextDigest(): string {
        return fakeId('digest-' + this.digestSeq++);
    }
    private nextObjId(kind: string): string {
        return fakeId(`obj-${kind}-${this.objSeq++}`);
    }

    registerOwned(id: string): void {
        if (!this.owned.has(id)) this.owned.set(id, { id, version: 1 });
    }

    totalAllocated(r: FakeResource): bigint {
        let s = 0n;
        for (const v of r.allocations.values()) s += v;
        return s;
    }

    /* ── infra knobs ──────────────────────────────────────────────────────── */

    private maybeThrottleRead(): void {
        this.stats.reads++;
        if (this.cfg.mode === 'inject429') {
            const rate = this.cfg.readFailRate ?? 0.25;
            if (Math.random() < rate) {
                this.stats.readThrottled++;
                throw new Error('Unexpected status code: 429');
            }
        }
    }
    private async readDelay(): Promise<void> {
        const ms = this.cfg.readDelayMs ?? 0;
        if (ms > 0) await sleep(ms);
    }

    /* ── the write interpreter (real built Transaction → move semantics) ───── */

    applyTransaction(tx: Transaction): TxResult {
        const created: TxResult['created'] = [];
        let data: ReturnType<Transaction['getData']>;
        try {
            data = tx.getData();
        } catch (err) {
            return { ok: false, error: `getData failed: ${String(err)}`, created };
        }
        const inputs = data.inputs;
        const pkg = this.packageId;

        const decodePure = (idx: number, kind: 'id' | 'u64'): string | bigint => {
            const inp = inputs[idx] as { $kind?: string; Pure?: { bytes: string } };
            if (inp?.$kind !== 'Pure' || !inp.Pure) throw new Error(`input ${idx} not Pure`);
            const bytes = fromB64(inp.Pure.bytes);
            if (kind === 'id') return '0x' + toHex(bytes);
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
        const decodeOptionId = (idx: number): string | null => {
            const inp = inputs[idx] as { $kind?: string; Pure?: { bytes: string } };
            if (inp?.$kind !== 'Pure' || !inp.Pure) throw new Error(`input ${idx} not Pure`);
            const bytes = fromB64(inp.Pure.bytes);
            if (bytes.length === 0 || bytes[0] === 0) return null;
            return '0x' + toHex(bytes.slice(1));
        };
        const decodeString = (idx: number): string => {
            const inp = inputs[idx] as { $kind?: string; Pure?: { bytes: string } };
            if (inp?.$kind !== 'Pure' || !inp.Pure) return '';
            try {
                return bcs.string().parse(fromB64(inp.Pure.bytes)) as unknown as string;
            } catch {
                return '';
            }
        };

        interface Reg {
            moveType: string;
            value: unknown;
        }
        const regs: Reg[] = [];
        const readReg = (arg: { $kind: string; Result?: number }): Reg => {
            if (arg.$kind !== 'Result' || arg.Result === undefined)
                throw new Error('expected a Result register');
            const r = regs[arg.Result];
            if (!r) throw new Error(`result register ${arg.Result} not produced`);
            return r;
        };

        const OP_TYPE = `${pkg}::event::ResourceTransferOp`;
        const OUTCOMES_TYPE = `${pkg}::event::EventOutcomes`;

        // Collect every OWNED object this tx touches, so we can model the version
        // bump (and detect a stale-version use — the conflict the admin lock prevents).
        const touchedOwned = new Set<string>();
        const noteOwnedInput = (idx: number) => {
            try {
                const id = objIdOf(idx);
                if (this.owned.has(id)) touchedOwned.add(id);
            } catch {
                /* not an object input */
            }
        };

        try {
            for (const cmd of data.commands) {
                const kind = (cmd as { $kind: string }).$kind;
                if (kind === 'MoveCall') {
                    const mc = (cmd as {
                        MoveCall: { module: string; function: string; arguments: Array<{ $kind: string; Input?: number; Result?: number }> };
                    }).MoveCall;
                    this.callLog.push({ module: mc.module, fn: mc.function });
                    const a = mc.arguments;
                    // The cap (arg 0) of every admin call is an owned object.
                    for (let i = 0; i < a.length; i++) if (a[i]?.Input !== undefined) noteOwnedInput(a[i].Input!);

                    if (mc.module === 'world' && mc.function === 'advance_tick') {
                        this.world.currentTick += 1;
                        this.stats.advances++;
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'new_card_template') {
                        regs.push({ moveType: `${pkg}::event::CardTemplate`, value: null });
                    } else if (mc.module === 'event' && mc.function === 'push_event') {
                        // push_event(cap, saga, sceneId, title, summary, scale, catalog, handSize)
                        const sceneId = decodePure(a[2].Input!, 'id') as string;
                        const title = decodeString(a[3].Input!);
                        const ev: FakeEvent = {
                            id: this.nextObjId('budget-event'),
                            sagaId: this.saga.id,
                            sceneId,
                            title: title || '一場戲',
                            status: 0,
                            createdAtMs: Date.now(),
                            participants: [],
                            resourceTransfers: [],
                        };
                        this.events.set(ev.id, ev);
                        this.stats.pushEvents++;
                        created.push({ objectType: `${pkg}::event::BudgetEvent`, objectId: ev.id });
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'deal_participant_hand') {
                        // deal_participant_hand(cap, saga, budgetEvent, character)
                        const eventId = objIdOf(a[2].Input!);
                        const charId = objIdOf(a[3].Input!); // character is passed by object, not pure
                        const ev = this.events.get(eventId);
                        if (!ev) throw new Error(`deal: unknown event ${eventId}`);
                        if (ev.status !== 0) throw new Error('EEventNotOpen');
                        if (!ev.participants.includes(charId)) ev.participants.push(charId);
                        this.stats.deals++;
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'director' && mc.function === 'open_storylet') {
                        // open_storylet(cap, saga, templateId, sceneId, characterIds) — model
                        // it as creating a BudgetEvent-equivalent so the non-spine path also
                        // produces a live event the POV/cut code can anchor to.
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'director' && mc.function === 'relationship_seed') {
                        // relationship_seed(cap, saga, sceneId, characterA, characterB, tone, clock)
                        // sceneId/characterA/characterB are 0x2::object::ID args (Pure bytes,
                        // same encoding as push_event's sceneId); tone is a Pure string.
                        const sceneId = decodePure(a[2].Input!, 'id') as string;
                        const characterA = decodePure(a[3].Input!, 'id') as string;
                        const characterB = decodePure(a[4].Input!, 'id') as string;
                        const tone = decodeString(a[5].Input!);
                        this.relationships.push({
                            sagaId: this.saga.id,
                            sceneId,
                            characterA,
                            characterB,
                            tone: tone || 'neutral',
                            seededAtMs: Date.now(),
                        });
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'commitment' && mc.function === 'commit') {
                        // commit(cap, saga, subjectId, contentHash, blobId, clock) → Commitment
                        const cid = this.nextObjId('commitment');
                        this.stats.commits++;
                        created.push({ objectType: `${pkg}::commitment::Commitment`, objectId: cid });
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'resource' && mc.function === 'instantiate') {
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'new_resource_transfer_op') {
                        const resourceId = decodePure(a[0].Input!, 'id') as string;
                        const from = decodeOptionId(a[1].Input!);
                        const to = decodePure(a[2].Input!, 'id') as string;
                        const amount = decodePure(a[3].Input!, 'u64') as bigint;
                        regs.push({ moveType: OP_TYPE, value: { from, to, amount, resourceId } satisfies FakeOutcomeOp });
                    } else if (mc.module === 'event' && mc.function === 'outcomes_with_resource_transfers') {
                        const vec = readReg(a[0]);
                        if (vec.moveType !== `vector<${OP_TYPE}>`)
                            throw new Error(`TypeMismatch: outcomes_with_resource_transfers expects vector<${OP_TYPE}> got ${vec.moveType}`);
                        const ops = (vec.value as { ops: FakeOutcomeOp[] }).ops;
                        regs.push({ moveType: OUTCOMES_TYPE, value: { ops } });
                    } else if (mc.module === 'event' && mc.function === 'empty_outcomes') {
                        regs.push({ moveType: OUTCOMES_TYPE, value: { ops: [] as FakeOutcomeOp[] } });
                    } else if (mc.module === 'event' && mc.function === 'resolve_event') {
                        const eventId = objIdOf(a[2].Input!);
                        const outcomes = readReg(a[4]);
                        if (outcomes.moveType !== OUTCOMES_TYPE)
                            throw new Error(`resolve_event: arg 5 not EventOutcomes (${outcomes.moveType})`);
                        const ops = (outcomes.value as { ops: FakeOutcomeOp[] }).ops;
                        this.resolveEvent(eventId, ops);
                        this.stats.resolves++;
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'apply_resource_transfers') {
                        const eventId = objIdOf(a[2].Input!);
                        const resourceId = objIdOf(a[3].Input!);
                        this.applyResourceTransfers(eventId, resourceId);
                        this.stats.applies++;
                        regs.push({ moveType: 'unit', value: null });
                    } else if (mc.module === 'event' && mc.function === 'submit_action') {
                        regs.push({ moveType: 'unit', value: null });
                    } else {
                        regs.push({ moveType: 'unknown', value: null });
                    }
                } else if (kind === 'MakeMoveVec') {
                    const mv = (cmd as { MakeMoveVec: { type: string | null; elements: Array<{ $kind: string; Result?: number }> } }).MakeMoveVec;
                    const declared = mv.type ?? 'inferred';
                    const elemRegs = mv.elements.map((e) => readReg(e));
                    // Only ResourceTransferOp vectors carry op fields; other makeMoveVec
                    // (e.g. push_event's CardTemplate catalog, whose elements decode to
                    // null) must not be read as ops or `v.resourceId` throws on null.
                    const ops: FakeOutcomeOp[] = elemRegs.map((r) => {
                        const v = (r.value ?? {}) as { from?: string | null; to?: string; amount?: bigint; resourceId?: string };
                        return { resourceId: v.resourceId ?? '', from: v.from ?? null, to: v.to ?? '', amount: v.amount ?? 0n };
                    });
                    regs.push({ moveType: `vector<${declared}>`, value: { ops } });
                } else {
                    regs.push({ moveType: 'unknown', value: null });
                }
            }

            // Owned-object version semantics: bump every touched owned object's version.
            // Because the admin-tx lock serializes signAndExecute, txs never interleave,
            // so a stale-version read can't happen here (the very property the lock buys).
            for (const id of touchedOwned) {
                const o = this.owned.get(id)!;
                o.version += 1;
            }
            return { ok: true, created };
        } catch (err) {
            this.stats.txAborted++;
            return { ok: false, error: err instanceof Error ? err.message : String(err), created };
        }
    }

    private resolveEvent(eventId: string, ops: FakeOutcomeOp[]): void {
        const ev = this.events.get(eventId);
        if (!ev) throw new Error(`resolve_event: unknown event ${eventId}`);
        if (ev.status !== 0) throw new Error('EEventNotOpen');
        const parts = new Set(ev.participants);
        for (const op of ops) {
            if (op.from !== null && !parts.has(op.from)) throw new Error('EResourceTransferFromNotParticipant');
            if (!parts.has(op.to)) throw new Error('EResourceTransferToNotParticipant');
        }
        ev.resourceTransfers = ops.map((o) => ({ ...o }));
        ev.status = 1;
    }

    private applyResourceTransfers(eventId: string, resourceId: string): void {
        const ev = this.events.get(eventId);
        if (!ev) throw new Error(`apply: unknown event ${eventId}`);
        if (ev.status !== 1) throw new Error('EEventNotResolved');
        const r = this.resources.get(resourceId);
        if (!r) throw new Error(`apply: unknown resource ${resourceId}`);
        const ops = ev.resourceTransfers.filter((op) => op.resourceId === '' || op.resourceId === resourceId);
        for (const op of ops) this.applyOne(r, op);
    }

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

/* ── SuiClient-shaped fake over the full chain ─────────────────────────────── */

export function makeFullFakeSuiClient(chain: FullFakeChain): unknown {
    const pkg = chain.packageId;

    const txFn = async ({ transaction }: { transaction: Transaction }) => {
        // submit-side throttle / delay (infra knob)
        if (chain.cfg.mode === 'inject429') {
            const rate = chain.cfg.txFailRate ?? 0;
            if (rate > 0 && Math.random() < rate) {
                chain.stats.txThrottled++;
                throw new Error('Unexpected status code: 429');
            }
        }
        if (chain.cfg.mode === 'slowFinality' && (chain.cfg.submitDelayMs ?? 0) > 0) {
            await sleep(chain.cfg.submitDelayMs!);
        }
        const result = chain.applyTransaction(transaction);
        chain.stats.txSubmitted++;
        const digest = chain.nextDigest();
        return {
            digest,
            effects: {
                status: result.ok ? { status: 'success' } : { status: 'failure', error: result.error },
            },
            objectChanges: result.created.map((c) => ({
                type: 'created',
                objectType: c.objectType,
                objectId: c.objectId,
            })),
        };
    };

    return {
        /* read.* event scans → queryEvents */
        async queryEvents({ query }: { query: { MoveEventType?: string } }) {
            chain['maybeThrottleRead']();
            await chain['readDelay']();
            const t = query?.MoveEventType ?? '';
            const empty = { data: [] as unknown[], hasNextPage: false, nextCursor: null };

            if (t.endsWith('::character::CharacterMinted')) {
                return {
                    data: [...chain.characters.values()].map((c) => ({
                        id: { txDigest: 'seed', eventSeq: '0' },
                        parsedJson: {
                            character_id: c.id,
                            world_id: chain.world.id,
                            saga_id: c.sagaId,
                            scene_id: c.sceneId,
                            owner_cap_id: c.ownerCapId,
                            control_cap_id: c.controlCapId,
                            name: c.name,
                            owner: c.owner,
                            minted_at_ms: '0',
                        },
                    })),
                    hasNextPage: false,
                    nextCursor: null,
                };
            }
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
            if (t.endsWith('::director::RelationshipSeeded')) {
                // Newest-first to match the real descending scan + aggregatePairs's
                // "first seen pair wins tone, repeats add weight" expectation.
                return {
                    data: [...chain.relationships]
                        .reverse()
                        .map((rel, i) => ({
                            id: { txDigest: `rel-${i}`, eventSeq: '0' },
                            parsedJson: {
                                saga_id: rel.sagaId,
                                scene_id: rel.sceneId,
                                character_a: rel.characterA,
                                character_b: rel.characterB,
                                tone: rel.tone,
                                seeded_at_ms: String(rel.seededAtMs),
                            },
                        })),
                    hasNextPage: false,
                    nextCursor: null,
                };
            }
            // ResourceRetired / StoryletOpened / CharacterJoined / AllocationChanged /
            // reflection / gazette scans → empty (never throw).
            return empty;
        },

        /* BCS-decoded object reads → core.getObjects */
        core: {
            async getObjects({ objectIds }: { objectIds: string[] }) {
                chain['maybeThrottleRead']();
                await chain['readDelay']();
                return {
                    objects: objectIds.map((id) => {
                        if (id === chain.world.id) return { objectId: id, content: encodeWorld(chain.world) };
                        if (id === chain.saga.id) return { objectId: id, content: encodeSaga(chain.saga) };
                        const sc = chain.scenes.get(id);
                        if (sc) return { objectId: id, content: encodeScene(sc) };
                        const ch = chain.characters.get(id);
                        if (ch) return { objectId: id, content: encodeCharacter(ch) };
                        const r = chain.resources.get(id);
                        if (r) return { objectId: id, content: encodeResource(r) };
                        const e = chain.events.get(id);
                        if (e) return { objectId: id, content: encodeEvent(e, pkg) };
                        return new Error(`no object ${id}`);
                    }),
                };
            },
        },

        /* resolveCurrentOwner → getObject({ showOwner }) on the OwnerCap */
        async getObject({ id, options }: { id: string; options?: { showOwner?: boolean } }) {
            chain['maybeThrottleRead']();
            await chain['readDelay']();
            const owner = [...chain.characters.values()].find((c) => c.ownerCapId === id);
            if (owner && options?.showOwner) {
                return { data: { objectId: id, owner: { AddressOwner: owner.owner } } };
            }
            return { data: { objectId: id } };
        },

        /* readAllocations → getDynamicFields + multiGetObjects on the Table */
        async getDynamicFields({ parentId }: { parentId: string }) {
            chain['maybeThrottleRead']();
            await chain['readDelay']();
            const r = [...chain.resources.values()].find((x) => x.tableId === parentId);
            if (!r) return { data: [], hasNextPage: false, nextCursor: null };
            const data = [...r.allocations.entries()].map(([holder]) => ({
                objectId: fakeId('field-' + r.id + '-' + holder),
            }));
            return { data, hasNextPage: false, nextCursor: null };
        },
        async multiGetObjects({ ids }: { ids: string[] }) {
            chain['maybeThrottleRead']();
            await chain['readDelay']();
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

        /* gas coin surface (not always on the tick path, but cheap to provide) */
        async getCoins() {
            chain['maybeThrottleRead']();
            return {
                data: chain.gasCoins.map((c) => ({
                    coinObjectId: c.id,
                    version: String(c.version),
                    balance: '1000000000',
                })),
                hasNextPage: false,
                nextCursor: null,
            };
        },

        /* write side */
        signAndExecuteTransaction: txFn,

        async waitForTransaction() {
            if (chain.cfg.mode === 'slowFinality' && (chain.cfg.finalityDelayMs ?? 0) > 0) {
                await sleep(chain.cfg.finalityDelayMs!);
            }
            return {};
        },
    };
}

/* ── BCS encoders (REAL generated structs → bytes the REAL decoder reads) ──── */

function encodeWorld(w: FakeWorld): Uint8Array {
    return WorldStruct.serialize({
        id: w.id,
        info: { name: 'Endless', description: '' },
        currency: { name: 'ENDLESS', symbol: 'ES' },
        rules: { species_kinds: [], attribute_definitions: [] },
        state: { current_tick: BigInt(w.currentTick), saga_ids: [w.id ? ZERO : ZERO], location_ids: [], created_at_ms: 0n },
        time_config: { days_per_tick_bp: BigInt(w.daysPerTickBp), tick_interval_ms: 0n },
    }).toBytes();
}

function encodeSaga(s: FakeSaga): Uint8Array {
    return SagaStruct.serialize({
        id: s.id,
        world_id: s.worldId,
        kind: { Standard: true },
        is_active: true,
        name: s.name,
        description: s.description,
        metadata_uri: '',
        operator: s.operator,
        revenue_config: { owner_bps: 0, storyteller_bps: 0, treasury_bps: 0 },
        treasury: { value: 0n },
        covered_location_ids: [],
        anchor_scene_ids: s.anchorSceneIds,
        character_count: BigInt(s.characterCount),
        departure_policy: '',
        nature_prompt: '',
        rhythm_hints: '',
        portrait_tone: '',
        created_at_ms: 0n,
    }).toBytes();
}

function encodeScene(sc: FakeScene): Uint8Array {
    return SceneStruct.serialize({
        id: sc.id,
        info: { name: sc.name, description: '', metadata_uri: '' },
        placement: { world_id: sc.worldId, saga_id: sc.sagaId, location_id: sc.locationId, pos_x: 0n, pos_y: 0n },
        access: { privacy_level: 0 },
        params: { atmosphere: 50n, danger: 20n, prosperity: 50n },
        state: { causal_commitment_ids: [], current_character_ids: sc.characterIds, created_at_ms: 0n },
    }).toBytes();
}

function encodeCharacter(c: FakeCharacter): Uint8Array {
    const attr = (key: string, value: number) => ({ key, value: BigInt(value), seed: [] as number[] });
    return CharacterStruct.serialize({
        id: c.id,
        control_epoch: 0n,
        profile: {
            name: c.name,
            description: '',
            physical_facts: { species: c.species, gender: c.gender, body: '', age_years: 30 },
        },
        attributes: [
            attr('appearance', c.attrs.appearance),
            attr('constitution', c.attrs.constitution),
            attr('acuity', c.attrs.acuity),
            attr('disposition', c.attrs.disposition),
        ],
        media_assets: [],
        state: {
            world_id: chainWorldIdOf(c),
            saga_id: c.sagaId,
            current_scene_id: c.sceneId,
            current_location_id: null,
            birth_ms: 0n,
        },
        tags: [],
        image_url: '',
        death: null,
        subscriber_count: 1n,
    }).toBytes();
}

// The character struct needs the world id; it isn't on FakeCharacter, so we stash
// it via a module-level ref set at seed time (kept simple — single world).
let _worldIdForChars = ZERO;
export function setWorldIdForCharacters(id: string): void {
    _worldIdForChars = id;
}
function chainWorldIdOf(_c: FakeCharacter): string {
    return _worldIdForChars;
}

function encodeResource(r: FakeResource): Uint8Array {
    return DramaResourceStruct.serialize({
        id: r.id,
        saga_id: r.sagaId,
        archetype: r.archetype,
        label: r.label,
        capacity: r.capacity,
        allocations: { id: r.tableId, size: BigInt(r.allocations.size) },
        total_allocated: [...r.allocations.values()].reduce((s, v) => s + v, 0n),
        created_at_ms: 0n,
    }).toBytes();
}

function encodeEvent(e: FakeEvent, _pkg: string): Uint8Array {
    const ops = e.resourceTransfers.map((o) => ({
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
        deck: { participants: e.participants, catalog: [], hand_size: 0n, hands: [] },
        resolution: {
            submitted_actions: [],
            outcomes: emptyOutcomes(ops),
        },
    }).toBytes();
}

function emptyOutcomes(resourceTransfers: ReturnType<typeof mapOps>) {
    return {
        currency_transfers: [],
        scene_deltas: [],
        tag_ops: [],
        commitment_ids: [],
        deaths: [],
        resource_transfers: resourceTransfers,
    } satisfies Parameters<typeof EventOutcomesStruct.serialize>[0];
}
function mapOps(ops: Array<{ resource_id: string; from: string | null; to: string; amount: bigint }>) {
    return ops;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
function fromB64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
