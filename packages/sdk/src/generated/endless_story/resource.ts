/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Drama Engine — on-chain resource ledger (the SUPPLY side of the Desire/Resource
 * model).
 * 
 * This is the trustless half of the drama engine: scarce, conserved resources that
 * characters contend over (e.g. the 孟雲屏 partnership slot, capacity = 1). The
 * DEMAND side (satisfaction / tension relaxation) stays off-chain as a
 * deterministic, publicly recomputable function of this ledger's allocation
 * history (see `packages/drama`); it is NOT stored here, by design — only the
 * contested, must-be-verifiable scarcity is on-chain.
 * 
 * Design mirror (Move ↔ TS): this module is the Move counterpart of `applyTick`'s
 * RESOURCE PHASE. `apply_transfers` reproduces the TS "apply in canonical order,
 * reject the WHOLE batch on any conservation violation" semantics: within a single
 * transaction, any `abort` rolls back every prior mutation, so atomic-reject is
 * structural (no scratch-copy needed). The conservation invariant
 * `sum(allocations) <= capacity` is asserted after every mutator.
 * 
 * Units are u64 (Sui-native, matches the TS `bigint` ledger values). The
 * SCALE-based fixed-point arithmetic lives on the DEMAND side; resource amounts
 * here are plain counts.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/endless-story::resource';
export const DramaResource = new MoveStruct({ name: `${$moduleName}::DramaResource`, fields: {
        id: bcs.Address,
        saga_id: bcs.Address,
        /**
         * archetype tag — the "bone" (structural kind, e.g. "capacity-1-slot") the LLM
         * dressed in scenario "skin". Narrative-facing; not used in conservation math.
         */
        archetype: bcs.string(),
        /** human label (e.g. "partnership:孟雲屏"); narrative-facing only. */
        label: bcs.string(),
        capacity: bcs.u64(),
        /** holder (Character ID) -> units held. */
        allocations: table.Table,
        /** cached sum(allocations) so conservation checks are O(1), not O(table). */
        total_allocated: bcs.u64(),
        created_at_ms: bcs.u64()
    } });
export const Transfer = new MoveStruct({ name: `${$moduleName}::Transfer`, fields: {
        from: bcs.option(bcs.Address),
        to: bcs.Address,
        amount: bcs.u64()
    } });
export const ResourceInstantiated = new MoveStruct({ name: `${$moduleName}::ResourceInstantiated`, fields: {
        resource_id: bcs.Address,
        saga_id: bcs.Address,
        archetype: bcs.string(),
        label: bcs.string(),
        capacity: bcs.u64(),
        created_at_ms: bcs.u64()
    } });
export const ResourceRetired = new MoveStruct({ name: `${$moduleName}::ResourceRetired`, fields: {
        resource_id: bcs.Address,
        saga_id: bcs.Address
    } });
export const AllocationChanged = new MoveStruct({ name: `${$moduleName}::AllocationChanged`, fields: {
        resource_id: bcs.Address,
        saga_id: bcs.Address,
        transfer_count: bcs.u64(),
        total_allocated: bcs.u64(),
        changed_at_ms: bcs.u64()
    } });
export interface AcquireArguments {
    to: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface AcquireOptions {
    package?: string;
    arguments: AcquireArguments | [
        to: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
/** Acquire `amount` from the free pool to `to`. */
export function acquire(options: AcquireOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x2::object::ID',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["to", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'acquire',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReallocateArguments {
    from: RawTransactionArgument<string>;
    to: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface ReallocateOptions {
    package?: string;
    arguments: ReallocateArguments | [
        from: RawTransactionArgument<string>,
        to: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
/** Move `amount` of an already-held unit from `from` to `to` (seize / hand-off). */
export function reallocate(options: ReallocateOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["from", "to", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'reallocate',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TransferToArguments {
    t: TransactionArgument;
}
export interface TransferToOptions {
    package?: string;
    arguments: TransferToArguments | [
        t: TransactionArgument
    ];
}
export function transferTo(options: TransferToOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'transfer_to',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TransferFromArguments {
    t: TransactionArgument;
}
export interface TransferFromOptions {
    package?: string;
    arguments: TransferFromArguments | [
        t: TransactionArgument
    ];
}
export function transferFrom(options: TransferFromOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'transfer_from',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TransferAmountArguments {
    t: TransactionArgument;
}
export interface TransferAmountOptions {
    package?: string;
    arguments: TransferAmountArguments | [
        t: TransactionArgument
    ];
}
export function transferAmount(options: TransferAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'transfer_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface InstantiateArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    archetype: RawTransactionArgument<string>;
    label: RawTransactionArgument<string>;
    capacity: RawTransactionArgument<number | bigint>;
}
export interface InstantiateOptions {
    package?: string;
    arguments: InstantiateArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        archetype: RawTransactionArgument<string>,
        label: RawTransactionArgument<string>,
        capacity: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Instantiate a contested resource under a saga. Gated by the saga's
 * StorytellerCap (the "director"). In the genesis pipeline this is called AFTER
 * the off-chain simulator has dry-run-validated the schema; here we only enforce
 * the structural floor (capacity > 0).
 */
export function instantiate(options: InstantiateOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x1::string::String',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "archetype", "label", "capacity"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'instantiate',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RetireArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    resource: RawTransactionArgument<string>;
}
export interface RetireOptions {
    package?: string;
    arguments: RetireArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        resource: RawTransactionArgument<string>
    ];
}
/**
 * Retire a fully-drained resource (all allocations released). We refuse to retire
 * while units are still held so the conservation history stays coherent (no
 * orphaned holdings).
 */
export function retire(options: RetireOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'retire',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ApplyTransfersArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    resource: RawTransactionArgument<string>;
    transfers: TransactionArgument;
}
export interface ApplyTransfersOptions {
    package?: string;
    arguments: ApplyTransfersArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        resource: RawTransactionArgument<string>,
        transfers: TransactionArgument
    ];
}
/**
 * Apply a batch of transfers in the given (canonical) order, atomically. Any
 * conservation violation `abort`s the whole transaction → every prior mutation in
 * this call rolls back, which is exactly the TS RESOURCE PHASE's "reject the whole
 * action, leave state untouched".
 *
 * The off-chain SDK is responsible for ordering `transfers` canonically (by actor,
 * index); the chain replays that order faithfully and re-validates conservation —
 * it never trusts the off-chain computation, it re-checks it. This is the
 * trustless guarantee.
 *
 * Gated by StorytellerCap so only the saga's director can settle a resolved
 * event's resource outcomes (called from `event::resolve_event` in DR-2).
 */
export function applyTransfers(options: ApplyTransfersOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<null>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "resource", "transfers"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'apply_transfers',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseHolderArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    resource: RawTransactionArgument<string>;
    holder: RawTransactionArgument<string>;
}
export interface ReleaseHolderOptions {
    package?: string;
    arguments: ReleaseHolderArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        resource: RawTransactionArgument<string>,
        holder: RawTransactionArgument<string>
    ];
}
/**
 * Escape hatch: release a holder's units back to the free pool (e.g. when a
 * character is released to wild / dies mid-saga, so the ledger stays coherent
 * without a full event). StorytellerCap-gated, consistent with the rest of the
 * module. (An AdminCap-gated emergency variant can land in DR-3 alongside the
 * director wiring, with a proper &Saga world check.)
 */
export function releaseHolder(options: ReleaseHolderOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::object::ID',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "resource", "holder"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'release_holder',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ResourceSagaIdArguments {
    resource: RawTransactionArgument<string>;
}
export interface ResourceSagaIdOptions {
    package?: string;
    arguments: ResourceSagaIdArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function resourceSagaId(options: ResourceSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'resource_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CapacityArguments {
    resource: RawTransactionArgument<string>;
}
export interface CapacityOptions {
    package?: string;
    arguments: CapacityArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function capacity(options: CapacityOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'capacity',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TotalAllocatedArguments {
    resource: RawTransactionArgument<string>;
}
export interface TotalAllocatedOptions {
    package?: string;
    arguments: TotalAllocatedArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function totalAllocated(options: TotalAllocatedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'total_allocated',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FreeCapacityArguments {
    resource: RawTransactionArgument<string>;
}
export interface FreeCapacityOptions {
    package?: string;
    arguments: FreeCapacityArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function freeCapacity(options: FreeCapacityOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'free_capacity',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HeldByArguments {
    resource: RawTransactionArgument<string>;
    holder: RawTransactionArgument<string>;
}
export interface HeldByOptions {
    package?: string;
    arguments: HeldByArguments | [
        resource: RawTransactionArgument<string>,
        holder: RawTransactionArgument<string>
    ];
}
export function heldBy(options: HeldByOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["resource", "holder"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'held_by',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ArchetypeArguments {
    resource: RawTransactionArgument<string>;
}
export interface ArchetypeOptions {
    package?: string;
    arguments: ArchetypeArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function archetype(options: ArchetypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'archetype',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LabelArguments {
    resource: RawTransactionArgument<string>;
}
export interface LabelOptions {
    package?: string;
    arguments: LabelArguments | [
        resource: RawTransactionArgument<string>
    ];
}
export function label(options: LabelOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["resource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'resource',
        function: 'label',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}