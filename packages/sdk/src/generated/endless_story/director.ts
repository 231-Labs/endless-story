/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Director — saga-level capability bus.
 * 
 * The saga storyteller (or LLM director acting on their behalf) emits typed events
 * from this module to nudge the world without writing prose. Downstream services
 * (character workers, gazette compiler, reflection trigger) subscribe to these
 * events and react.
 * 
 * **Why a separate module**: keeping director vocabulary out of `saga.move` keeps
 * the surface small and easily extensible. New capabilities = new entry function +
 * new event type, no schema migration on existing Saga objects.
 * 
 * **Why events only (no state)**: every capability is fire-and-forget from the
 * chain's perspective. The CHAIN doesn't track active storylets, attribute
 * pressures, etc. — off-chain runner services reduce these events into their own
 * internal state. This keeps the chain footprint minimal and matches the "events
 * are message bus" architectural decision.
 * 
 * **Auth**: every capability requires the saga's `StorytellerCap`. Runner (admin
 * signer) holds the cap during demo phase.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::director';
export const StoryletOpened = new MoveStruct({ name: `${$moduleName}::StoryletOpened`, fields: {
        /**
           * Synthetic id minted at emit time — `tx_digest || event_seq` style. Allows
           * downstream services to dedupe + reference back.
           */
        storylet_id: bcs.Address,
        saga_id: bcs.Address,
        template_id: bcs.string(),
        scene_id: bcs.Address,
        character_ids: bcs.vector(bcs.Address),
        opened_at_ms: bcs.u64()
    } });
export const AttributePressureApplied = new MoveStruct({ name: `${$moduleName}::AttributePressureApplied`, fields: {
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        /** "atmosphere" | "danger" | "prosperity" */
        axis: bcs.string(),
        delta: bcs.u8(),
        /** true = subtract delta, false = add delta (Move u8 can't be negative) */
        is_negative: bcs.bool(),
        applied_at_ms: bcs.u64()
    } });
export const CharacterCalled = new MoveStruct({ name: `${$moduleName}::CharacterCalled`, fields: {
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        character_id: bcs.Address,
        reason: bcs.string(),
        called_at_ms: bcs.u64()
    } });
export const RelationshipSeeded = new MoveStruct({ name: `${$moduleName}::RelationshipSeeded`, fields: {
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        character_a: bcs.Address,
        character_b: bcs.Address,
        /** e.g. "romance" | "tension" | "rivalry" | "wary" | "estrangement" | "mentorship" */
        tone: bcs.string(),
        seeded_at_ms: bcs.u64()
    } });
export const PhaseAdvanced = new MoveStruct({ name: `${$moduleName}::PhaseAdvanced`, fields: {
        saga_id: bcs.Address,
        next_phase: bcs.string(),
        advanced_at_ms: bcs.u64()
    } });
export interface OpenStoryletArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    templateId: RawTransactionArgument<string>;
    sceneId: RawTransactionArgument<string>;
    characterIds: RawTransactionArgument<Array<string>>;
}
export interface OpenStoryletOptions {
    package?: string;
    arguments: OpenStoryletArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        templateId: RawTransactionArgument<string>,
        sceneId: RawTransactionArgument<string>,
        characterIds: RawTransactionArgument<Array<string>>
    ];
}
/**
 * Storyteller signals a storylet should activate. The runner picks this up
 * off-chain and starts driving the scene + character workers.
 */
export function openStorylet(options: OpenStoryletOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x2::object::ID',
        'vector<0x2::object::ID>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "templateId", "sceneId", "characterIds"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'director',
        function: 'open_storylet',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributePressureArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    sceneId: RawTransactionArgument<string>;
    axis: RawTransactionArgument<string>;
    deltaMagnitude: RawTransactionArgument<number>;
    isNegative: RawTransactionArgument<boolean>;
}
export interface AttributePressureOptions {
    package?: string;
    arguments: AttributePressureArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        sceneId: RawTransactionArgument<string>,
        axis: RawTransactionArgument<string>,
        deltaMagnitude: RawTransactionArgument<number>,
        isNegative: RawTransactionArgument<boolean>
    ];
}
/**
 * Apply attribute pressure. Delta is split into `(u8, bool)` since Move u8 is
 * unsigned — caller passes magnitude + sign flag.
 */
export function attributePressure(options: AttributePressureOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x1::string::String',
        'u8',
        'bool',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "sceneId", "axis", "deltaMagnitude", "isNegative"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'director',
        function: 'attribute_pressure',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterCallArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    sceneId: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
    reason: RawTransactionArgument<string>;
}
export interface CharacterCallOptions {
    package?: string;
    arguments: CharacterCallArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        sceneId: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>,
        reason: RawTransactionArgument<string>
    ];
}
export function characterCall(options: CharacterCallOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x2::object::ID',
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "sceneId", "characterId", "reason"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'director',
        function: 'character_call',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RelationshipSeedArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    sceneId: RawTransactionArgument<string>;
    characterA: RawTransactionArgument<string>;
    characterB: RawTransactionArgument<string>;
    tone: RawTransactionArgument<string>;
}
export interface RelationshipSeedOptions {
    package?: string;
    arguments: RelationshipSeedArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        sceneId: RawTransactionArgument<string>,
        characterA: RawTransactionArgument<string>,
        characterB: RawTransactionArgument<string>,
        tone: RawTransactionArgument<string>
    ];
}
export function relationshipSeed(options: RelationshipSeedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "sceneId", "characterA", "characterB", "tone"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'director',
        function: 'relationship_seed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdvancePhaseArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    nextPhase: RawTransactionArgument<string>;
}
export interface AdvancePhaseOptions {
    package?: string;
    arguments: AdvancePhaseArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        nextPhase: RawTransactionArgument<string>
    ];
}
export function advancePhase(options: AdvancePhaseOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "nextPhase"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'director',
        function: 'advance_phase',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}