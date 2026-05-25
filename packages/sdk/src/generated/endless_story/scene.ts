/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Scene — an anchored stage in a (Saga, Location) cell.
 * 
 * A `Scene` carries:
 * 
 * - `SceneInfo` — display name / description / image metadata URI
 * - `ScenePlacement` — (world, saga, location) coordinates + (pos_x, pos_y) for
 *   map layout
 * - `SceneAccess` — privacy_level (0 = public … 4 = extremely private; not
 *   enforced on-chain, LLM hint)
 * - `SceneParams` — atmosphere / danger / prosperity (event mechanics input)
 * - `SceneState` — causal_commitment_ids + current_character_ids + created_at_ms
 * 
 * **Created via:** `StorytellerCap` of the parent Saga. Scene auto-registers
 * itself as an anchor scene on the Saga via `saga::add_anchor_scene`.
 * 
 * **Mutations** (package-only): add/remove characters (called by `character.move`
 * walk_in_world), apply_params_delta (called by `event.move` after resolve).
 * 
 * Phase 1.4 — depends on saga.move (StorytellerCap + Saga + assert_cap +
 * add_anchor_scene) and world.move (Location + location_world_id).
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::scene';
export const SCENE = new MoveStruct({ name: `${$moduleName}::SCENE`, fields: {
        dummy_field: bcs.bool()
    } });
export const SceneInfo = new MoveStruct({ name: `${$moduleName}::SceneInfo`, fields: {
        name: bcs.string(),
        description: bcs.string(),
        metadata_uri: bcs.string()
    } });
export const ScenePlacement = new MoveStruct({ name: `${$moduleName}::ScenePlacement`, fields: {
        world_id: bcs.Address,
        saga_id: bcs.Address,
        location_id: bcs.Address,
        pos_x: bcs.u64(),
        pos_y: bcs.u64()
    } });
export const SceneAccess = new MoveStruct({ name: `${$moduleName}::SceneAccess`, fields: {
        privacy_level: bcs.u8()
    } });
export const SceneParams = new MoveStruct({ name: `${$moduleName}::SceneParams`, fields: {
        atmosphere: bcs.u64(),
        danger: bcs.u64(),
        prosperity: bcs.u64()
    } });
export const SceneState = new MoveStruct({ name: `${$moduleName}::SceneState`, fields: {
        causal_commitment_ids: bcs.vector(bcs.Address),
        current_character_ids: bcs.vector(bcs.Address),
        created_at_ms: bcs.u64()
    } });
export const Scene = new MoveStruct({ name: `${$moduleName}::Scene`, fields: {
        id: bcs.Address,
        info: SceneInfo,
        placement: ScenePlacement,
        access: SceneAccess,
        params: SceneParams,
        state: SceneState
    } });
export const SceneCreated = new MoveStruct({ name: `${$moduleName}::SceneCreated`, fields: {
        scene_id: bcs.Address,
        saga_id: bcs.Address,
        world_id: bcs.Address,
        location_id: bcs.Address,
        name: bcs.string(),
        privacy_level: bcs.u8(),
        created_at_ms: bcs.u64()
    } });
export interface CreateSceneArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    location: RawTransactionArgument<string>;
    info: TransactionArgument;
    access: TransactionArgument;
    posX: RawTransactionArgument<number | bigint>;
    posY: RawTransactionArgument<number | bigint>;
    params: TransactionArgument;
    causalCommitmentIds: RawTransactionArgument<Array<string>>;
}
export interface CreateSceneOptions {
    package?: string;
    arguments: CreateSceneArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        location: RawTransactionArgument<string>,
        info: TransactionArgument,
        access: TransactionArgument,
        posX: RawTransactionArgument<number | bigint>,
        posY: RawTransactionArgument<number | bigint>,
        params: TransactionArgument,
        causalCommitmentIds: RawTransactionArgument<Array<string>>
    ];
}
export function createScene(options: CreateSceneOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        'u64',
        'u64',
        null,
        'vector<0x2::object::ID>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "location", "info", "access", "posX", "posY", "params", "causalCommitmentIds"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'create_scene',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasCharacterArguments {
    scene: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
}
export interface HasCharacterOptions {
    package?: string;
    arguments: HasCharacterArguments | [
        scene: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>
    ];
}
export function hasCharacter(options: HasCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["scene", "characterId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'has_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SceneIdArguments {
    scene: RawTransactionArgument<string>;
}
export interface SceneIdOptions {
    package?: string;
    arguments: SceneIdArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function sceneId(options: SceneIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'scene_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaIdArguments {
    scene: RawTransactionArgument<string>;
}
export interface SagaIdOptions {
    package?: string;
    arguments: SagaIdArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function sagaId(options: SagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WorldIdArguments {
    scene: RawTransactionArgument<string>;
}
export interface WorldIdOptions {
    package?: string;
    arguments: WorldIdArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function worldId(options: WorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LocationIdArguments {
    scene: RawTransactionArgument<string>;
}
export interface LocationIdOptions {
    package?: string;
    arguments: LocationIdArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function locationId(options: LocationIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'location_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AtmosphereArguments {
    scene: RawTransactionArgument<string>;
}
export interface AtmosphereOptions {
    package?: string;
    arguments: AtmosphereArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function atmosphere(options: AtmosphereOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'atmosphere',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DangerArguments {
    scene: RawTransactionArgument<string>;
}
export interface DangerOptions {
    package?: string;
    arguments: DangerArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function danger(options: DangerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'danger',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProsperityArguments {
    scene: RawTransactionArgument<string>;
}
export interface ProsperityOptions {
    package?: string;
    arguments: ProsperityArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function prosperity(options: ProsperityOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'prosperity',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PrivacyLevelArguments {
    scene: RawTransactionArgument<string>;
}
export interface PrivacyLevelOptions {
    package?: string;
    arguments: PrivacyLevelArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function privacyLevel(options: PrivacyLevelOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'privacy_level',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterCountArguments {
    scene: RawTransactionArgument<string>;
}
export interface CharacterCountOptions {
    package?: string;
    arguments: CharacterCountArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function characterCount(options: CharacterCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'character_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewSceneInfoArguments {
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    metadataUri: RawTransactionArgument<string>;
}
export interface NewSceneInfoOptions {
    package?: string;
    arguments: NewSceneInfoArguments | [
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        metadataUri: RawTransactionArgument<string>
    ];
}
export function newSceneInfo(options: NewSceneInfoOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "description", "metadataUri"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'new_scene_info',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewSceneAccessArguments {
    privacyLevel: RawTransactionArgument<number>;
}
export interface NewSceneAccessOptions {
    package?: string;
    arguments: NewSceneAccessArguments | [
        privacyLevel: RawTransactionArgument<number>
    ];
}
export function newSceneAccess(options: NewSceneAccessOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["privacyLevel"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'new_scene_access',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewSceneParamsArguments {
    atmosphere: RawTransactionArgument<number | bigint>;
    danger: RawTransactionArgument<number | bigint>;
    prosperity: RawTransactionArgument<number | bigint>;
}
export interface NewSceneParamsOptions {
    package?: string;
    arguments: NewSceneParamsArguments | [
        atmosphere: RawTransactionArgument<number | bigint>,
        danger: RawTransactionArgument<number | bigint>,
        prosperity: RawTransactionArgument<number | bigint>
    ];
}
export function newSceneParams(options: NewSceneParamsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u64',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["atmosphere", "danger", "prosperity"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'scene',
        function: 'new_scene_params',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}