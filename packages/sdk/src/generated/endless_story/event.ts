/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as character from './character.js';
const $moduleName = '@local-pkg/endless-story::event';
export const CardTemplate = new MoveStruct({ name: `${$moduleName}::CardTemplate`, fields: {
        id: bcs.u16(),
        intent: bcs.u8(),
        label: bcs.string(),
        payload: bcs.vector(bcs.u8())
    } });
export const SubmittedAction = new MoveStruct({ name: `${$moduleName}::SubmittedAction`, fields: {
        character_id: bcs.Address,
        card_index: bcs.u64(),
        submitted_at_ms: bcs.u64()
    } });
export const CurrencyTransfer = new MoveStruct({ name: `${$moduleName}::CurrencyTransfer`, fields: {
        from_character_id: bcs.Address,
        to_character_id: bcs.Address,
        amount: bcs.u64()
    } });
export const SignedDelta = new MoveStruct({ name: `${$moduleName}::SignedDelta`, fields: {
        magnitude: bcs.u64(),
        negative: bcs.bool()
    } });
export const SceneParamDelta = new MoveStruct({ name: `${$moduleName}::SceneParamDelta`, fields: {
        scene_id: bcs.Address,
        atmosphere_delta: SignedDelta,
        danger_delta: SignedDelta,
        prosperity_delta: SignedDelta
    } });
export const TagOp = new MoveStruct({ name: `${$moduleName}::TagOp`, fields: {
        character_id: bcs.Address,
        kind: bcs.u8(),
        label: bcs.string()
    } });
export const ResourceTransferOp = new MoveStruct({ name: `${$moduleName}::ResourceTransferOp`, fields: {
        resource_id: bcs.Address,
        from: bcs.option(bcs.Address),
        to: bcs.Address,
        amount: bcs.u64()
    } });
export const EventOutcomes = new MoveStruct({ name: `${$moduleName}::EventOutcomes`, fields: {
        currency_transfers: bcs.vector(CurrencyTransfer),
        scene_deltas: bcs.vector(SceneParamDelta),
        tag_ops: bcs.vector(TagOp),
        commitment_ids: bcs.vector(bcs.Address),
        deaths: bcs.vector(character.DeathRecord),
        resource_transfers: bcs.vector(ResourceTransferOp)
    } });
export const EventMeta = new MoveStruct({ name: `${$moduleName}::EventMeta`, fields: {
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        title: bcs.string(),
        summary: bcs.string(),
        scale: bcs.u8(),
        status: bcs.u8(),
        created_at_ms: bcs.u64(),
        resolved_at_ms: bcs.u64()
    } });
export const EventDeck = new MoveStruct({ name: `${$moduleName}::EventDeck`, fields: {
        participants: bcs.vector(bcs.Address),
        catalog: bcs.vector(CardTemplate),
        /**
         * Hand size policy fixed at `push_event` time; every `deal_participant_hand` call
         * draws this many indices.
         */
        hand_size: bcs.u64(),
        /**
         * Per-participant hand: indices into `catalog`. `hands[i]` is the hand dealt to
         * `participants[i]`. Length == hand_size, drawn without replacement when the
         * participant is dealt in via `deal_participant_hand`. Visible on chain so owners
         * can audit fairness (with or without saga card-weight rules).
         */
        hands: bcs.vector(bcs.vector(bcs.u64()))
    } });
export const EventResolution = new MoveStruct({ name: `${$moduleName}::EventResolution`, fields: {
        submitted_actions: bcs.vector(SubmittedAction),
        outcomes: EventOutcomes
    } });
export const BudgetEvent = new MoveStruct({ name: `${$moduleName}::BudgetEvent`, fields: {
        id: bcs.Address,
        meta: EventMeta,
        deck: EventDeck,
        resolution: EventResolution
    } });
export const BudgetEventPushed = new MoveStruct({ name: `${$moduleName}::BudgetEventPushed`, fields: {
        event_id: bcs.Address,
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        participant_count: bcs.u64(),
        card_count: bcs.u64(),
        created_at_ms: bcs.u64()
    } });
export const EventActionSubmitted = new MoveStruct({ name: `${$moduleName}::EventActionSubmitted`, fields: {
        event_id: bcs.Address,
        character_id: bcs.Address,
        card_index: bcs.u64(),
        submitted_at_ms: bcs.u64()
    } });
export const BudgetEventResolved = new MoveStruct({ name: `${$moduleName}::BudgetEventResolved`, fields: {
        event_id: bcs.Address,
        resolved_at_ms: bcs.u64()
    } });
export const CharacterJoinedEvent = new MoveStruct({ name: `${$moduleName}::CharacterJoinedEvent`, fields: {
        event_id: bcs.Address,
        character_id: bcs.Address,
        joined_at_ms: bcs.u64()
    } });
export interface PushEventArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    sceneId: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
    summary: RawTransactionArgument<string>;
    scale: RawTransactionArgument<number>;
    catalog: TransactionArgument;
    handSize: RawTransactionArgument<number | bigint>;
}
export interface PushEventOptions {
    package?: string;
    arguments: PushEventArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        sceneId: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>,
        summary: RawTransactionArgument<string>,
        scale: RawTransactionArgument<number>,
        catalog: TransactionArgument,
        handSize: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Storyteller creates a new OPEN event with a fixed catalog and hand-size policy.
 * Participants are NOT taken here — they're added one-by-one via
 * `deal_participant_hand`, which draws each char's hand using on-chain RNG and
 * (optionally) the saga's card-weight rules. This split exists because Move can't
 * express `vector<&Character>`, so per-char attribute lookup for weighted draws
 * has to happen in a function that receives one `&Character` at a time.
 */
export function pushEvent(options: PushEventOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x1::string::String',
        '0x1::string::String',
        'u8',
        'vector<null>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "sceneId", "title", "summary", "scale", "catalog", "handSize"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'push_event',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DealParticipantHandArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface DealParticipantHandOptions {
    package?: string;
    arguments: DealParticipantHandArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
/**
 * Add a character to an OPEN event and deal them a fresh hand of
 * `event.deck.hand_size` cards from the catalog. Used both for initial
 * participants (after `push_event` creates the empty event) and for mid-event
 * joiners. `entry` so the randomness path is non-composable per Sui best practice.
 *
 * If the saga has card-weight rules (via `enable_card_weighting` +
 * `set_card_weight_rule`), each card's draw weight is biased by the participant's
 * matching world attributes: weight = 100 + Σ matching_rule.bonus_per_point ×
 * char_attr_value When no rules are configured (default), draws are uniform —
 * identical to the R3.1a behavior, so this refactor is behaviorally
 * backwards-compatible.
 */
export function dealParticipantHand(options: DealParticipantHandOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        '0x2::random::Random',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "budgetEvent", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'deal_participant_hand',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ParticipantCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface ParticipantCountOptions {
    package?: string;
    arguments: ParticipantCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function participantCount(options: ParticipantCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'participant_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasParticipantArguments {
    budgetEvent: RawTransactionArgument<string>;
    characterId: RawTransactionArgument<string>;
}
export interface HasParticipantOptions {
    package?: string;
    arguments: HasParticipantArguments | [
        budgetEvent: RawTransactionArgument<string>,
        characterId: RawTransactionArgument<string>
    ];
}
export function hasParticipant(options: HasParticipantOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent", "characterId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'has_participant',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubmitActionArguments {
    Cap: RawTransactionArgument<string>;
    Saga: RawTransactionArgument<string>;
    BudgetEvent: RawTransactionArgument<string>;
    CharacterId: RawTransactionArgument<string>;
    CardIndex: RawTransactionArgument<number | bigint>;
}
export interface SubmitActionOptions {
    package?: string;
    arguments: SubmitActionArguments | [
        Cap: RawTransactionArgument<string>,
        Saga: RawTransactionArgument<string>,
        BudgetEvent: RawTransactionArgument<string>,
        CharacterId: RawTransactionArgument<string>,
        CardIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * DEPRECATED (event.move 1.7). Card play moved to the character's OWN ControlCap —
 * the StorytellerCap (director god-cap) must not author a character's action, or
 * the actor/director agent boundary collapses. Kept as an aborting stub so the Sui
 * package UPGRADE stays signature- compatible; every caller must switch to
 * `submit_action_as_character`.
 */
export function submitAction(options: SubmitActionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::object::ID',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["Cap", "Saga", "BudgetEvent", "CharacterId", "CardIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'submit_action',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubmitActionAsCharacterArguments {
    controlCap: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    cardIndex: RawTransactionArgument<number | bigint>;
}
export interface SubmitActionAsCharacterOptions {
    package?: string;
    arguments: SubmitActionAsCharacterArguments | [
        controlCap: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        cardIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * A character plays one card from their dealt hand, authorized by their OWN
 * ControlCap (owner-issued, epoch-bound, revocable) instead of the saga's
 * StorytellerCap. This is what returns card-play agency to the character agent:
 * the runner holds the character's ControlCap and signs the play on its behalf.
 * `character` is the shared Character object — its id IS the participant id, and
 * `is_valid` binds the cap to it + the current control_epoch, so a
 * revoked/reassigned cap can no longer act.
 */
export function submitActionAsCharacter(options: SubmitActionAsCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["controlCap", "budgetEvent", "character", "cardIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'submit_action_as_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ResolveEventArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    scene: RawTransactionArgument<string>;
    outcomes: TransactionArgument;
}
export interface ResolveEventOptions {
    package?: string;
    arguments: ResolveEventArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        scene: RawTransactionArgument<string>,
        outcomes: TransactionArgument
    ];
}
export function resolveEvent(options: ResolveEventOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "budgetEvent", "scene", "outcomes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'resolve_event',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ApplyDeathArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    deathIndex: RawTransactionArgument<number | bigint>;
}
export interface ApplyDeathOptions {
    package?: string;
    arguments: ApplyDeathArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        deathIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Apply one DeathRecord to the targeted Character. Storyteller calls this once per
 * (event, death_index) triple after `resolve_event` has flipped the event to
 * RESOLVED. Idempotent: re-applying to an already-dead character is a no-op
 * (handled by `character::mark_dead`).
 */
export function applyDeath(options: ApplyDeathOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "budgetEvent", "character", "deathIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'apply_death',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ApplyResourceTransfersArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    dramaResource: RawTransactionArgument<string>;
}
export interface ApplyResourceTransfersOptions {
    package?: string;
    arguments: ApplyResourceTransfersArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        dramaResource: RawTransactionArgument<string>
    ];
}
/**
 * Apply this resolved event's resource transfers FOR ONE DramaResource.
 * Storyteller calls it once per (event, resource) after `resolve_event`. We gather
 * every op naming this resource — in recorded (canonical) order — into a batch and
 * hand it to `resource::apply_transfers`, which re-validates conservation and
 * applies atomically (any violation aborts the whole tx → no partial state, the TS
 * RESOURCE-PHASE mirror).
 *
 * Multi-resource events: call once per resource; each call is its own atomic
 * batch. The `resource_id` on each op guards against passing the wrong
 * DramaResource object.
 */
export function applyResourceTransfers(options: ApplyResourceTransfersOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "budgetEvent", "dramaResource"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'apply_resource_transfers',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ApplyTagOpArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    budgetEvent: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    opIndex: RawTransactionArgument<number | bigint>;
}
export interface ApplyTagOpOptions {
    package?: string;
    arguments: ApplyTagOpArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        budgetEvent: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        opIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Apply one TagOp recorded in a resolved BudgetEvent to the targeted Character.
 * Storyteller calls this once per (event, op_index, character) triple; per L1 v0.3
 * §6.6 Move does not enforce semantic uniqueness, but apply_tag is idempotent on
 * duplicate label and revoke_tag is idempotent on missing label.
 */
export function applyTagOp(options: ApplyTagOpOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "budgetEvent", "character", "opIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'apply_tag_op',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmptyOutcomesOptions {
    package?: string;
    arguments?: [
    ];
}
export function emptyOutcomes(options: EmptyOutcomesOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'empty_outcomes',
    });
}
export interface NewResourceTransferOpArguments {
    resourceId: RawTransactionArgument<string>;
    from: RawTransactionArgument<string | null>;
    to: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface NewResourceTransferOpOptions {
    package?: string;
    arguments: NewResourceTransferOpArguments | [
        resourceId: RawTransactionArgument<string>,
        from: RawTransactionArgument<string | null>,
        to: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Production constructor for a resource-transfer op (the SDK builds these for
 * resolve).
 */
export function newResourceTransferOp(options: NewResourceTransferOpOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x1::option::Option<0x2::object::ID>',
        '0x2::object::ID',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["resourceId", "from", "to", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'new_resource_transfer_op',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OutcomesWithResourceTransfersArguments {
    resourceTransfers: TransactionArgument;
}
export interface OutcomesWithResourceTransfersOptions {
    package?: string;
    arguments: OutcomesWithResourceTransfersArguments | [
        resourceTransfers: TransactionArgument
    ];
}
/**
 * Build outcomes that carry ONLY resource transfers (the common drama path); other
 * dimensions empty. Keeps the SDK/test call sites terse.
 */
export function outcomesWithResourceTransfers(options: OutcomesWithResourceTransfersOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["resourceTransfers"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'outcomes_with_resource_transfers',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewTagOpArguments {
    characterId: RawTransactionArgument<string>;
    kind: RawTransactionArgument<number>;
    label: RawTransactionArgument<string>;
}
export interface NewTagOpOptions {
    package?: string;
    arguments: NewTagOpArguments | [
        characterId: RawTransactionArgument<string>,
        kind: RawTransactionArgument<number>,
        label: RawTransactionArgument<string>
    ];
}
/**
 * Production constructor for one public identity/status tag operation. The
 * operation is recorded in `BudgetEvent.resolution.outcomes`, then applied to the
 * target `Character` via `apply_tag_op` after resolution.
 */
export function newTagOp(options: NewTagOpOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x2::object::ID',
        'u8',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["characterId", "kind", "label"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'new_tag_op',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OutcomesWithTagOpsArguments {
    tagOps: TransactionArgument;
}
export interface OutcomesWithTagOpsOptions {
    package?: string;
    arguments: OutcomesWithTagOpsArguments | [
        tagOps: TransactionArgument
    ];
}
/**
 * Build outcomes that carry ONLY tag operations. This is the public identity path:
 * the event log says when a social label such as `role:小生` or `status:二太太`
 * became externally affirmed.
 */
export function outcomesWithTagOps(options: OutcomesWithTagOpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["tagOps"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'outcomes_with_tag_ops',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ResourceTransferCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface ResourceTransferCountOptions {
    package?: string;
    arguments: ResourceTransferCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function resourceTransferCount(options: ResourceTransferCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'resource_transfer_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface DeathCountOptions {
    package?: string;
    arguments: DeathCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function deathCount(options: DeathCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'death_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EventIdArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface EventIdOptions {
    package?: string;
    arguments: EventIdArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function eventId(options: EventIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'event_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface StatusArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface StatusOptions {
    package?: string;
    arguments: StatusArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function status(options: StatusOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'status',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubmittedActionCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface SubmittedActionCountOptions {
    package?: string;
    arguments: SubmittedActionCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function submittedActionCount(options: SubmittedActionCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'submitted_action_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SceneDeltaCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface SceneDeltaCountOptions {
    package?: string;
    arguments: SceneDeltaCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function sceneDeltaCount(options: SceneDeltaCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'scene_delta_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagOpCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface TagOpCountOptions {
    package?: string;
    arguments: TagOpCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function tagOpCount(options: TagOpCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'tag_op_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CommitmentIdCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface CommitmentIdCountOptions {
    package?: string;
    arguments: CommitmentIdCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function commitmentIdCount(options: CommitmentIdCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'commitment_id_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CurrencyTransferCountArguments {
    budgetEvent: RawTransactionArgument<string>;
}
export interface CurrencyTransferCountOptions {
    package?: string;
    arguments: CurrencyTransferCountArguments | [
        budgetEvent: RawTransactionArgument<string>
    ];
}
export function currencyTransferCount(options: CurrencyTransferCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["budgetEvent"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'currency_transfer_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagOpKindAddOptions {
    package?: string;
    arguments?: [
    ];
}
export function tagOpKindAdd(options: TagOpKindAddOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'tag_op_kind_add',
    });
}
export interface TagOpKindRemoveOptions {
    package?: string;
    arguments?: [
    ];
}
export function tagOpKindRemove(options: TagOpKindRemoveOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'tag_op_kind_remove',
    });
}
export interface NewCardTemplateArguments {
    id: RawTransactionArgument<number>;
    intent: RawTransactionArgument<number>;
    label: RawTransactionArgument<string>;
    payload: RawTransactionArgument<Array<number>>;
}
export interface NewCardTemplateOptions {
    package?: string;
    arguments: NewCardTemplateArguments | [
        id: RawTransactionArgument<number>,
        intent: RawTransactionArgument<number>,
        label: RawTransactionArgument<string>,
        payload: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Production constructor for `CardTemplate`. Needed because off-chain storytellers
 * (Skill API / runner orchestrator) build the catalog for `push_event` and Move's
 * pure-arg rules forbid passing a struct vector directly via BCS-encoded bytes
 * (`vector<CardTemplate>` is not a pure type). With this constructor, callers do
 * `tx.makeMoveVec({ type: …::CardTemplate, elements: cards.map(c =>  tx.moveCall(new_card_template(...))) })`.
 */
export function newCardTemplate(options: NewCardTemplateOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u16',
        'u8',
        '0x1::string::String',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["id", "intent", "label", "payload"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'event',
        function: 'new_card_template',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}