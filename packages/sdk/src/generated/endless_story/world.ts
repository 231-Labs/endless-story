/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * World — the root state object every saga, scene, and character is anchored to.
 * 
 * One `World` is created once per deployment by `cli bootstrap` (Phase 1+). It
 * owns:
 * 
 * - `WorldInfo` — display name / description
 * - `CurrencyDisplay` — name + symbol of in-fiction currency (ENDLESS by default)
 * - `WorldRules` — species kinds + reusable AttributeDefinition catalog
 * - `WorldState` — current tick, registered saga IDs, location IDs
 * - `WorldTimeConfig` — days_per_tick + tick_interval_ms (runner uses these)
 * 
 * **AdminCap** (this module's, distinct from any saga/character AdminCap) is
 * returned to the creator and required for: create_location, advance_tick,
 * set_time_config. Saga registration is package-internal (saga.move calls
 * `register_saga` when a saga is created).
 * 
 * Phase 1.2 — depends on currency.move (display name only, not type).
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::world';
export const AdminCap = new MoveStruct({ name: `${$moduleName}::AdminCap`, fields: {
        id: bcs.Address,
        world_id: bcs.Address
    } });
export const AttributeDefinition = new MoveStruct({ name: `${$moduleName}::AttributeDefinition`, fields: {
        key: bcs.string(),
        label: bcs.string(),
        min_value: bcs.u64(),
        max_value: bcs.u64()
    } });
export const WorldInfo = new MoveStruct({ name: `${$moduleName}::WorldInfo`, fields: {
        name: bcs.string(),
        description: bcs.string()
    } });
export const CurrencyDisplay = new MoveStruct({ name: `${$moduleName}::CurrencyDisplay`, fields: {
        name: bcs.string(),
        symbol: bcs.string()
    } });
export const WorldRules = new MoveStruct({ name: `${$moduleName}::WorldRules`, fields: {
        species_kinds: bcs.vector(bcs.string()),
        attribute_definitions: bcs.vector(AttributeDefinition)
    } });
export const WorldState = new MoveStruct({ name: `${$moduleName}::WorldState`, fields: {
        current_tick: bcs.u64(),
        saga_ids: bcs.vector(bcs.Address),
        location_ids: bcs.vector(bcs.Address),
        created_at_ms: bcs.u64()
    } });
export const WorldTimeConfig = new MoveStruct({ name: `${$moduleName}::WorldTimeConfig`, fields: {
        days_per_tick_bp: bcs.u64(),
        tick_interval_ms: bcs.u64()
    } });
export const World = new MoveStruct({ name: `${$moduleName}::World`, fields: {
        id: bcs.Address,
        info: WorldInfo,
        currency: CurrencyDisplay,
        rules: WorldRules,
        state: WorldState,
        time_config: WorldTimeConfig
    } });
export const LocationInfo = new MoveStruct({ name: `${$moduleName}::LocationInfo`, fields: {
        index: bcs.u64(),
        name: bcs.string(),
        description: bcs.string(),
        terrain: bcs.string()
    } });
export const Position = new MoveStruct({ name: `${$moduleName}::Position`, fields: {
        x: bcs.u64(),
        y: bcs.u64()
    } });
export const LocationGraph = new MoveStruct({ name: `${$moduleName}::LocationGraph`, fields: {
        adjacent_indices: bcs.vector(bcs.u64())
    } });
export const Location = new MoveStruct({ name: `${$moduleName}::Location`, fields: {
        id: bcs.Address,
        world_id: bcs.Address,
        info: LocationInfo,
        position: Position,
        graph: LocationGraph,
        created_at_ms: bcs.u64()
    } });
export const WorldCreated = new MoveStruct({ name: `${$moduleName}::WorldCreated`, fields: {
        world_id: bcs.Address,
        admin_cap_id: bcs.Address,
        name: bcs.string(),
        creator: bcs.Address,
        created_at_ms: bcs.u64()
    } });
export const LocationCreated = new MoveStruct({ name: `${$moduleName}::LocationCreated`, fields: {
        world_id: bcs.Address,
        location_id: bcs.Address,
        index: bcs.u64(),
        name: bcs.string(),
        created_at_ms: bcs.u64()
    } });
export const SagaRegistered = new MoveStruct({ name: `${$moduleName}::SagaRegistered`, fields: {
        world_id: bcs.Address,
        saga_id: bcs.Address,
        registered_at_ms: bcs.u64()
    } });
export const TickAdvanced = new MoveStruct({ name: `${$moduleName}::TickAdvanced`, fields: {
        world_id: bcs.Address,
        new_tick: bcs.u64(),
        advanced_at_ms: bcs.u64()
    } });
export const TimeConfigUpdated = new MoveStruct({ name: `${$moduleName}::TimeConfigUpdated`, fields: {
        world_id: bcs.Address,
        days_per_tick_bp: bcs.u64(),
        tick_interval_ms: bcs.u64(),
        updated_at_ms: bcs.u64()
    } });
export interface CreateWorldArguments {
    info: TransactionArgument;
    currency: TransactionArgument;
    rules: TransactionArgument;
}
export interface CreateWorldOptions {
    package?: string;
    arguments: CreateWorldArguments | [
        info: TransactionArgument,
        currency: TransactionArgument,
        rules: TransactionArgument
    ];
}
export function createWorld(options: CreateWorldOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["info", "currency", "rules"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'create_world',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateLocationArguments {
    adminCap: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
    info: TransactionArgument;
    position: TransactionArgument;
    graph: TransactionArgument;
}
export interface CreateLocationOptions {
    package?: string;
    arguments: CreateLocationArguments | [
        adminCap: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>,
        info: TransactionArgument,
        position: TransactionArgument,
        graph: TransactionArgument
    ];
}
export function createLocation(options: CreateLocationOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "world", "info", "position", "graph"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'create_location',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdvanceTickArguments {
    adminCap: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
}
export interface AdvanceTickOptions {
    package?: string;
    arguments: AdvanceTickArguments | [
        adminCap: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>
    ];
}
/** Advance global world tick (`WorldState.current_tick`). Admin-only. */
export function advanceTick(options: AdvanceTickOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'advance_tick',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetTimeConfigArguments {
    adminCap: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
    daysPerTickBp: RawTransactionArgument<number | bigint>;
    tickIntervalMs: RawTransactionArgument<number | bigint>;
}
export interface SetTimeConfigOptions {
    package?: string;
    arguments: SetTimeConfigArguments | [
        adminCap: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>,
        daysPerTickBp: RawTransactionArgument<number | bigint>,
        tickIntervalMs: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Update world time config. Admin-only. `days_per_tick_bp` 是 basis-points
 * (1/10000)；6 tick/day = 1670 bp。 `tick_interval_ms`
 * 真實 tick 間隔（runner 用；鏈上不執行 cron）。
 */
export function setTimeConfig(options: SetTimeConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "world", "daysPerTickBp", "tickIntervalMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'set_time_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CurrentTickArguments {
    world: RawTransactionArgument<string>;
}
export interface CurrentTickOptions {
    package?: string;
    arguments: CurrentTickArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function currentTick(options: CurrentTickOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'current_tick',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WorldIdArguments {
    world: RawTransactionArgument<string>;
}
export interface WorldIdOptions {
    package?: string;
    arguments: WorldIdArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function worldId(options: WorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminWorldIdArguments {
    adminCap: RawTransactionArgument<string>;
}
export interface AdminWorldIdOptions {
    package?: string;
    arguments: AdminWorldIdArguments | [
        adminCap: RawTransactionArgument<string>
    ];
}
export function adminWorldId(options: AdminWorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'admin_world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DaysPerTickBpArguments {
    world: RawTransactionArgument<string>;
}
export interface DaysPerTickBpOptions {
    package?: string;
    arguments: DaysPerTickBpArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function daysPerTickBp(options: DaysPerTickBpOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'days_per_tick_bp',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TickIntervalMsArguments {
    world: RawTransactionArgument<string>;
}
export interface TickIntervalMsOptions {
    package?: string;
    arguments: TickIntervalMsArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function tickIntervalMs(options: TickIntervalMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'tick_interval_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TimeConfigArguments {
    world: RawTransactionArgument<string>;
}
export interface TimeConfigOptions {
    package?: string;
    arguments: TimeConfigArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function timeConfig(options: TimeConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'time_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaCountArguments {
    world: RawTransactionArgument<string>;
}
export interface SagaCountOptions {
    package?: string;
    arguments: SagaCountArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function sagaCount(options: SagaCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'saga_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SpeciesCountArguments {
    world: RawTransactionArgument<string>;
}
export interface SpeciesCountOptions {
    package?: string;
    arguments: SpeciesCountArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function speciesCount(options: SpeciesCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'species_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeDefinitionCountArguments {
    world: RawTransactionArgument<string>;
}
export interface AttributeDefinitionCountOptions {
    package?: string;
    arguments: AttributeDefinitionCountArguments | [
        world: RawTransactionArgument<string>
    ];
}
export function attributeDefinitionCount(options: AttributeDefinitionCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["world"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'attribute_definition_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsValidSpeciesArguments {
    world: RawTransactionArgument<string>;
    species: RawTransactionArgument<string>;
}
export interface IsValidSpeciesOptions {
    package?: string;
    arguments: IsValidSpeciesArguments | [
        world: RawTransactionArgument<string>,
        species: RawTransactionArgument<string>
    ];
}
export function isValidSpecies(options: IsValidSpeciesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["world", "species"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'is_valid_species',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsValidAttributeValueArguments {
    world: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface IsValidAttributeValueOptions {
    package?: string;
    arguments: IsValidAttributeValueArguments | [
        world: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
}
export function isValidAttributeValue(options: IsValidAttributeValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["world", "key", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'is_valid_attribute_value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LocationWorldIdArguments {
    location: RawTransactionArgument<string>;
}
export interface LocationWorldIdOptions {
    package?: string;
    arguments: LocationWorldIdArguments | [
        location: RawTransactionArgument<string>
    ];
}
export function locationWorldId(options: LocationWorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["location"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'location_world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LocationIdArguments {
    location: RawTransactionArgument<string>;
}
export interface LocationIdOptions {
    package?: string;
    arguments: LocationIdArguments | [
        location: RawTransactionArgument<string>
    ];
}
export function locationId(options: LocationIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["location"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'location_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LocationIndexArguments {
    location: RawTransactionArgument<string>;
}
export interface LocationIndexOptions {
    package?: string;
    arguments: LocationIndexArguments | [
        location: RawTransactionArgument<string>
    ];
}
export function locationIndex(options: LocationIndexOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["location"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'location_index',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsAdjacentArguments {
    current: RawTransactionArgument<string>;
    target: RawTransactionArgument<string>;
}
export interface IsAdjacentOptions {
    package?: string;
    arguments: IsAdjacentArguments | [
        current: RawTransactionArgument<string>,
        target: RawTransactionArgument<string>
    ];
}
/**
 * Two locations are adjacent iff `current.graph` lists `target.info.index`. Caller
 * is responsible for passing two locations from the same World; adjacency itself
 * is a graph-only check.
 */
export function isAdjacent(options: IsAdjacentOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["current", "target"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'is_adjacent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAttributeDefinitionArguments {
    key: RawTransactionArgument<string>;
    label: RawTransactionArgument<string>;
    minValue: RawTransactionArgument<number | bigint>;
    maxValue: RawTransactionArgument<number | bigint>;
}
export interface NewAttributeDefinitionOptions {
    package?: string;
    arguments: NewAttributeDefinitionArguments | [
        key: RawTransactionArgument<string>,
        label: RawTransactionArgument<string>,
        minValue: RawTransactionArgument<number | bigint>,
        maxValue: RawTransactionArgument<number | bigint>
    ];
}
export function newAttributeDefinition(options: NewAttributeDefinitionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["key", "label", "minValue", "maxValue"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_attribute_definition',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeDefinitionKeyArguments {
    def: TransactionArgument;
}
export interface AttributeDefinitionKeyOptions {
    package?: string;
    arguments: AttributeDefinitionKeyArguments | [
        def: TransactionArgument
    ];
}
export function attributeDefinitionKey(options: AttributeDefinitionKeyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["def"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'attribute_definition_key',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeDefinitionLabelArguments {
    def: TransactionArgument;
}
export interface AttributeDefinitionLabelOptions {
    package?: string;
    arguments: AttributeDefinitionLabelArguments | [
        def: TransactionArgument
    ];
}
export function attributeDefinitionLabel(options: AttributeDefinitionLabelOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["def"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'attribute_definition_label',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeDefinitionMinArguments {
    def: TransactionArgument;
}
export interface AttributeDefinitionMinOptions {
    package?: string;
    arguments: AttributeDefinitionMinArguments | [
        def: TransactionArgument
    ];
}
export function attributeDefinitionMin(options: AttributeDefinitionMinOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["def"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'attribute_definition_min',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeDefinitionMaxArguments {
    def: TransactionArgument;
}
export interface AttributeDefinitionMaxOptions {
    package?: string;
    arguments: AttributeDefinitionMaxArguments | [
        def: TransactionArgument
    ];
}
export function attributeDefinitionMax(options: AttributeDefinitionMaxOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["def"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'attribute_definition_max',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsValueInDefinitionsArguments {
    defs: TransactionArgument;
    key: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
}
export interface IsValueInDefinitionsOptions {
    package?: string;
    arguments: IsValueInDefinitionsArguments | [
        defs: TransactionArgument,
        key: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Validate `value` against an arbitrary list of AttributeDefinitions — used by
 * saga-side skill tables that don't live on World.
 */
export function isValueInDefinitions(options: IsValueInDefinitionsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<null>',
        '0x1::string::String',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["defs", "key", "value"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'is_value_in_definitions',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsKeyDefinedArguments {
    defs: TransactionArgument;
    key: RawTransactionArgument<string>;
}
export interface IsKeyDefinedOptions {
    package?: string;
    arguments: IsKeyDefinedArguments | [
        defs: TransactionArgument,
        key: RawTransactionArgument<string>
    ];
}
/** True iff `key` exists in the definitions list. */
export function isKeyDefined(options: IsKeyDefinedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<null>',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["defs", "key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'is_key_defined',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewWorldInfoArguments {
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
}
export interface NewWorldInfoOptions {
    package?: string;
    arguments: NewWorldInfoArguments | [
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>
    ];
}
export function newWorldInfo(options: NewWorldInfoOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "description"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_world_info',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewCurrencyDisplayArguments {
    name: RawTransactionArgument<string>;
    symbol: RawTransactionArgument<string>;
}
export interface NewCurrencyDisplayOptions {
    package?: string;
    arguments: NewCurrencyDisplayArguments | [
        name: RawTransactionArgument<string>,
        symbol: RawTransactionArgument<string>
    ];
}
export function newCurrencyDisplay(options: NewCurrencyDisplayOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "symbol"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_currency_display',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewWorldRulesArguments {
    speciesKinds: RawTransactionArgument<Array<string>>;
    attributeDefinitions: TransactionArgument;
}
export interface NewWorldRulesOptions {
    package?: string;
    arguments: NewWorldRulesArguments | [
        speciesKinds: RawTransactionArgument<Array<string>>,
        attributeDefinitions: TransactionArgument
    ];
}
export function newWorldRules(options: NewWorldRulesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<0x1::string::String>',
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["speciesKinds", "attributeDefinitions"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_world_rules',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewLocationInfoArguments {
    index: RawTransactionArgument<number | bigint>;
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    terrain: RawTransactionArgument<string>;
}
export interface NewLocationInfoOptions {
    package?: string;
    arguments: NewLocationInfoArguments | [
        index: RawTransactionArgument<number | bigint>,
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        terrain: RawTransactionArgument<string>
    ];
}
export function newLocationInfo(options: NewLocationInfoOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u64',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["index", "name", "description", "terrain"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_location_info',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewPositionArguments {
    x: RawTransactionArgument<number | bigint>;
    y: RawTransactionArgument<number | bigint>;
}
export interface NewPositionOptions {
    package?: string;
    arguments: NewPositionArguments | [
        x: RawTransactionArgument<number | bigint>,
        y: RawTransactionArgument<number | bigint>
    ];
}
export function newPosition(options: NewPositionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["x", "y"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_position',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewLocationGraphArguments {
    adjacentIndices: RawTransactionArgument<Array<number | bigint>>;
}
export interface NewLocationGraphOptions {
    package?: string;
    arguments: NewLocationGraphArguments | [
        adjacentIndices: RawTransactionArgument<Array<number | bigint>>
    ];
}
export function newLocationGraph(options: NewLocationGraphOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<u64>'
    ] satisfies (string | null)[];
    const parameterNames = ["adjacentIndices"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'world',
        function: 'new_location_graph',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}