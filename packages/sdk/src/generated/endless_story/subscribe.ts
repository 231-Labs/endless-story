/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Subscribe — minimal on-chain subscription mechanic.
 * 
 * **Purpose**: gate the runner's character POV worker. A character C only gets
 * per-event POV chapters when `C.subscriber_count > 0`. Without subscribers
 * there's no demand, so no LLM tokens are burned.
 * 
 * **What this module does**:
 * 
 * - mint a `Subscription` object (owned by the subscriber, references character +
 *   saga + when it was created)
 * - bump `character.subscriber_count` via the package-private mutator in
 *   `character.move`
 * - emit `Subscribed` / `Unsubscribed` events for off-chain indexing (e.g.
 *   analytics, revenue accounting)
 * 
 * **What this module does NOT do (yet)**:
 * 
 * - charge ENDLESS payment (Phase 1.6 economic module's job)
 * - enforce TTL / auto-expire (a sub never expires until owner burns it)
 * - revenue split (will be wired when subscription pricing arrives)
 * 
 * Demo cadence: subscriber clicks the subscribe button on a character card →
 * wallet co-signs → `Subscription` lands in their address → counter ticks up → POV
 * worker is now eligible to run for that character on its next trigger.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::subscribe';
export const Subscription = new MoveStruct({ name: `${$moduleName}::Subscription`, fields: {
        id: bcs.Address,
        character_id: bcs.Address,
        /**
         * Saga the character belongs to at subscribe-time. Snapshot — if character later
         * moves to a different saga, this is the saga the subscriber originally bought
         * into.
         */
        saga_id_at_subscribe: bcs.option(bcs.Address),
        subscriber: bcs.Address,
        subscribed_at_ms: bcs.u64()
    } });
export const Subscribed = new MoveStruct({ name: `${$moduleName}::Subscribed`, fields: {
        subscription_id: bcs.Address,
        character_id: bcs.Address,
        saga_id: bcs.option(bcs.Address),
        subscriber: bcs.Address,
        /**
         * counter after the increment — runner can use this to short-circuit "first
         * subscriber" branch (e.g. wake POV worker)
         */
        new_subscriber_count: bcs.u64(),
        subscribed_at_ms: bcs.u64()
    } });
export const Unsubscribed = new MoveStruct({ name: `${$moduleName}::Unsubscribed`, fields: {
        subscription_id: bcs.Address,
        character_id: bcs.Address,
        subscriber: bcs.Address,
        new_subscriber_count: bcs.u64(),
        unsubscribed_at_ms: bcs.u64()
    } });
export interface SubscribeArguments {
    character: RawTransactionArgument<string>;
}
export interface SubscribeOptions {
    package?: string;
    arguments: SubscribeArguments | [
        character: RawTransactionArgument<string>
    ];
}
/**
 * Anyone can subscribe (Phase 1 — no payment, no whitelist). The Subscription is
 * transferred to the caller's address.
 */
export function subscribe(options: SubscribeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'subscribe',
        function: 'subscribe',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UnsubscribeArguments {
    sub: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface UnsubscribeOptions {
    package?: string;
    arguments: UnsubscribeArguments | [
        sub: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
/**
 * Owner of a Subscription burns it. Counter goes down. Caller is trusted to bring
 * the matching Character; we sanity-check the ids line up (defensive — wrong
 * Character can't move the counter).
 */
export function unsubscribe(options: UnsubscribeOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["sub", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'subscribe',
        function: 'unsubscribe',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubscriptionCharacterIdArguments {
    sub: RawTransactionArgument<string>;
}
export interface SubscriptionCharacterIdOptions {
    package?: string;
    arguments: SubscriptionCharacterIdArguments | [
        sub: RawTransactionArgument<string>
    ];
}
export function subscriptionCharacterId(options: SubscriptionCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["sub"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'subscribe',
        function: 'subscription_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubscriptionSubscriberArguments {
    sub: RawTransactionArgument<string>;
}
export interface SubscriptionSubscriberOptions {
    package?: string;
    arguments: SubscriptionSubscriberArguments | [
        sub: RawTransactionArgument<string>
    ];
}
export function subscriptionSubscriber(options: SubscriptionSubscriberOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["sub"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'subscribe',
        function: 'subscription_subscriber',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubscriptionSubscribedAtMsArguments {
    sub: RawTransactionArgument<string>;
}
export interface SubscriptionSubscribedAtMsOptions {
    package?: string;
    arguments: SubscriptionSubscribedAtMsArguments | [
        sub: RawTransactionArgument<string>
    ];
}
export function subscriptionSubscribedAtMs(options: SubscriptionSubscribedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["sub"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'subscribe',
        function: 'subscription_subscribed_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}