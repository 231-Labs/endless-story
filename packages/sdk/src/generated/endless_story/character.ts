/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Endless Story — Character custody + mint paths.
 * 
 * **Scope 1 (legacy):** Character + OwnerCap base structure. **Scope 2 (legacy):**
 * ControlCap + lifecycle (issue / revoke / reassign). **Scope 3 (legacy):** SEAL
 * approve (control / owner) + id layout helper. **Phase 1.5a (prior):** Character
 * struct enrichment + three mint paths
 * 
 * - validation invariants + death writer + value-type constructors. Voucher-driven
 *   mint lives in the sibling `recruit` module. **Phase 1.5b (prior):**
 *   ControlCap.saga_id binding + scene movement
 * - wild release + wild walk + ControlCapKey DOF + take/bind helpers. **Phase 1.5c
 *   (new):** per-saga skill table (DOF keyed by SagaSkillsKey)
 * - image update (two paths: storyteller-signed and owner-signed) + Display V2
 *   init (Character + OwnerCap visible in wallets) + `find_attribute_value_in`
 *   public helper for recruit's requirements check.
 * 
 * **Cap matrix:**
 * 
 * - `OwnerCap` = root ownership (transferrable; holder = owner)
 * - `ControlCap` = operational delegation (epoch-bound; auto-invalidated by
 *   `revoke_all_control` / `reassign_saga`)
 * 
 * See AGENTS.md → 「鏈上架構」 for module dependency rules.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::character';
export const AttributeValue = new MoveStruct({ name: `${$moduleName}::AttributeValue`, fields: {
        key: bcs.string(),
        value: bcs.u64(),
        seed: bcs.vector(bcs.u8())
    } });
export const PhysicalFacts = new MoveStruct({ name: `${$moduleName}::PhysicalFacts`, fields: {
        species: bcs.string(),
        gender: bcs.string(),
        body: bcs.string(),
        age_years: bcs.u8()
    } });
export const CharacterProfile = new MoveStruct({ name: `${$moduleName}::CharacterProfile`, fields: {
        name: bcs.string(),
        description: bcs.string(),
        physical_facts: PhysicalFacts
    } });
export const MediaAsset = new MoveStruct({ name: `${$moduleName}::MediaAsset`, fields: {
        kind: bcs.u8(),
        uri: bcs.string(),
        walrus_blob_id: bcs.vector(bcs.u8()),
        metadata_uri: bcs.string()
    } });
export const Tag = new MoveStruct({ name: `${$moduleName}::Tag`, fields: {
        label: bcs.string(),
        source_event_id: bcs.option(bcs.Address),
        affirmed_at_ms: bcs.u64()
    } });
export const CharacterState = new MoveStruct({ name: `${$moduleName}::CharacterState`, fields: {
        world_id: bcs.Address,
        saga_id: bcs.option(bcs.Address),
        current_scene_id: bcs.option(bcs.Address),
        /**
         * Always tracked, even when in a scene (derived from scene's location at mint/move
         * time). Wild characters have scene = None but location = Some, since they roam
         * the map between locations.
         */
        current_location_id: bcs.option(bcs.Address),
        birth_ms: bcs.u64()
    } });
export const DeathRecord = new MoveStruct({ name: `${$moduleName}::DeathRecord`, fields: {
        victim: bcs.Address,
        recorded_at_ms: bcs.u64(),
        by_event: bcs.option(bcs.Address),
        attributed_characters: bcs.vector(bcs.Address)
    } });
export const Character = new MoveStruct({ name: `${$moduleName}::Character`, fields: {
        id: bcs.Address,
        control_epoch: bcs.u64(),
        profile: CharacterProfile,
        attributes: bcs.vector(AttributeValue),
        media_assets: bcs.vector(MediaAsset),
        state: CharacterState,
        tags: bcs.vector(Tag),
        /**
         * User-facing display image URL. Defaults to first media asset's uri on mint;
         * mutable via `update_character_image` (added in 1.5c).
         */
        image_url: bcs.string(),
        /**
         * `Some` once the character has died. Set by `mark_dead` (called from event.move's
         * apply_death in 1.6).
         */
        death: bcs.option(DeathRecord)
    } });
export const OwnerCap = new MoveStruct({ name: `${$moduleName}::OwnerCap`, fields: {
        id: bcs.Address,
        character_id: bcs.Address,
        world_id: bcs.Address,
        minted_at_ms: bcs.u64(),
        /**
         * Phase 2 IP revenue accumulator. Always 0 in Phase 1; revenue posting machinery
         * lands post-launch.
         */
        cumulative_revenue: bcs.u64()
    } });
export const ControlCap = new MoveStruct({ name: `${$moduleName}::ControlCap`, fields: {
        id: bcs.Address,
        character_id: bcs.Address,
        epoch: bcs.u64(),
        saga_id: bcs.option(bcs.Address)
    } });
export const ControlCapKey = new MoveStruct({ name: `${$moduleName}::ControlCapKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const SagaSkillsKey = new MoveStruct({ name: `${$moduleName}::SagaSkillsKey`, fields: {
        saga_id: bcs.Address
    } });
export const CHARACTER = new MoveStruct({ name: `${$moduleName}::CHARACTER`, fields: {
        dummy_field: bcs.bool()
    } });
export const ControlCapIssued = new MoveStruct({ name: `${$moduleName}::ControlCapIssued`, fields: {
        character_id: bcs.Address,
        cap_id: bcs.Address,
        epoch: bcs.u64()
    } });
export const ControlRevoked = new MoveStruct({ name: `${$moduleName}::ControlRevoked`, fields: {
        character_id: bcs.Address,
        revoked_epoch: bcs.u64()
    } });
export const SagaReassigned = new MoveStruct({ name: `${$moduleName}::SagaReassigned`, fields: {
        character_id: bcs.Address,
        new_epoch: bcs.u64(),
        cap_id: bcs.Address
    } });
export const CharacterMinted = new MoveStruct({ name: `${$moduleName}::CharacterMinted`, fields: {
        character_id: bcs.Address,
        world_id: bcs.Address,
        saga_id: bcs.option(bcs.Address),
        scene_id: bcs.option(bcs.Address),
        owner_cap_id: bcs.Address,
        control_cap_id: bcs.Address,
        name: bcs.string(),
        owner: bcs.Address,
        minted_at_ms: bcs.u64()
    } });
export const CharacterDied = new MoveStruct({ name: `${$moduleName}::CharacterDied`, fields: {
        character_id: bcs.Address,
        by_event: bcs.option(bcs.Address),
        attributed_count: bcs.u64(),
        recorded_at_ms: bcs.u64()
    } });
export const CharacterMoved = new MoveStruct({ name: `${$moduleName}::CharacterMoved`, fields: {
        character_id: bcs.Address,
        from_scene_id: bcs.Address,
        to_scene_id: bcs.Address,
        moved_at_ms: bcs.u64()
    } });
export const CharacterWalked = new MoveStruct({ name: `${$moduleName}::CharacterWalked`, fields: {
        character_id: bcs.Address,
        from_location_id: bcs.Address,
        to_location_id: bcs.Address,
        walked_at_ms: bcs.u64()
    } });
export const CharacterTransferredToWild = new MoveStruct({ name: `${$moduleName}::CharacterTransferredToWild`, fields: {
        character_id: bcs.Address,
        from_saga_id: bcs.Address,
        at_ms: bcs.u64()
    } });
export const CharacterAcceptedIntoSaga = new MoveStruct({ name: `${$moduleName}::CharacterAcceptedIntoSaga`, fields: {
        character_id: bcs.Address,
        saga_id: bcs.Address,
        scene_id: bcs.Address,
        accepted_at_ms: bcs.u64()
    } });
export const CharacterImageUpdated = new MoveStruct({ name: `${$moduleName}::CharacterImageUpdated`, fields: {
        character_id: bcs.Address,
        new_image_url: bcs.string(),
        updated_by_owner: bcs.bool(),
        updated_at_ms: bcs.u64()
    } });
export const SkillSet = new MoveStruct({ name: `${$moduleName}::SkillSet`, fields: {
        character_id: bcs.Address,
        saga_id: bcs.Address,
        key: bcs.string(),
        value: bcs.u64()
    } });
export const SkillCleared = new MoveStruct({ name: `${$moduleName}::SkillCleared`, fields: {
        character_id: bcs.Address,
        saga_id: bcs.Address,
        key: bcs.string()
    } });
export interface MintGenesisCharacterArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
    scene: RawTransactionArgument<string>;
    profile: TransactionArgument;
    mediaAssets: TransactionArgument;
    attributes: TransactionArgument;
    ownerRecipient: RawTransactionArgument<string>;
}
export interface MintGenesisCharacterOptions {
    package?: string;
    arguments: MintGenesisCharacterArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>,
        scene: RawTransactionArgument<string>,
        profile: TransactionArgument,
        mediaAssets: TransactionArgument,
        attributes: TransactionArgument,
        ownerRecipient: RawTransactionArgument<string>
    ];
}
/**
 * Storyteller mints a canonical character into a specific scene. Used at bootstrap
 * (genesis cast) and for storyteller-fiat additions mid-saga. Increments the
 * saga's character count + adds character to scene state.
 */
export function mintGenesisCharacter(options: MintGenesisCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        'vector<null>',
        'vector<null>',
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "world", "scene", "profile", "mediaAssets", "attributes", "ownerRecipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'mint_genesis_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MintCollectibleCharacterArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    world: RawTransactionArgument<string>;
    profile: TransactionArgument;
    mediaAssets: TransactionArgument;
    attributes: TransactionArgument;
    ownerRecipient: RawTransactionArgument<string>;
}
export interface MintCollectibleCharacterOptions {
    package?: string;
    arguments: MintCollectibleCharacterArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        world: RawTransactionArgument<string>,
        profile: TransactionArgument,
        mediaAssets: TransactionArgument,
        attributes: TransactionArgument,
        ownerRecipient: RawTransactionArgument<string>
    ];
}
/**
 * Storyteller mints a non-canon (collectible / external) character into a saga
 * without placing in a scene. Used for "guest cameo" mints where the character
 * isn't yet placed on the map.
 */
export function mintCollectibleCharacter(options: MintCollectibleCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        'vector<null>',
        'vector<null>',
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "world", "profile", "mediaAssets", "attributes", "ownerRecipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'mint_collectible_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IssueControlCapArguments {
    character: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
}
export interface IssueControlCapOptions {
    package?: string;
    arguments: IssueControlCapArguments | [
        character: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>
    ];
}
/**
 * Owner 簽發一張 ControlCap，綁定當前
 * `control_epoch`。回傳 cap 由呼叫端決定 transfer 對象（PTB 組合性）。
 */
export function issueControlCap(options: IssueControlCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character", "ownerCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'issue_control_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeAllControlArguments {
    character: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
}
export interface RevokeAllControlOptions {
    package?: string;
    arguments: RevokeAllControlArguments | [
        character: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>
    ];
}
/**
 * Owner 撤銷當前所有 ControlCap (epoch +1)。舊 cap 物件仍在持有者手上，但
 * `is_valid` / SEAL approve 都會拒。
 */
export function revokeAllControl(options: RevokeAllControlOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character", "ownerCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'revoke_all_control',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReassignSagaArguments {
    character: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
}
export interface ReassignSagaOptions {
    package?: string;
    arguments: ReassignSagaArguments | [
        character: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>
    ];
}
/**
 * Owner 把角色託管轉給新 Saga：一筆 tx 完成「撤銷舊 + 簽發新」。emit
 * `SagaReassigned`（而非 `ControlRevoked` +
 * `ControlCapIssued`）讓 indexer 能區分「主動撤銷」與「換託管」兩種意圖。
 */
export function reassignSaga(options: ReassignSagaOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character", "ownerCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'reassign_saga',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MoveCharacterArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    fromScene: RawTransactionArgument<string>;
    toScene: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface MoveCharacterOptions {
    package?: string;
    arguments: MoveCharacterArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        fromScene: RawTransactionArgument<string>,
        toScene: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
/**
 * Move a character between two scenes inside the same saga. Storyteller-signed.
 * Aborts if either scene is in a different saga, the character isn't in this saga,
 * isn't actually in `from_scene`, the two scenes are identical, or the character
 * is dead.
 */
export function moveCharacter(options: MoveCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "fromScene", "toScene", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'move_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseCharacterToWildArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    controlCap: RawTransactionArgument<string>;
    currentScene: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface ReleaseCharacterToWildOptions {
    package?: string;
    arguments: ReleaseCharacterToWildArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        controlCap: RawTransactionArgument<string>,
        currentScene: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
/**
 * Saga storyteller releases a character to wild status. CONSUMES the ControlCap
 * and stores it on the character via DOF (extracted later by
 * `recruit::accept_character_into_saga` when a new saga takes custody). `saga_id`
 * and `current_scene_id` flip to None; `current_location_id` is preserved (wild
 * characters keep walking from where they left).
 */
export function releaseCharacterToWild(options: ReleaseCharacterToWildOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "controlCap", "currentScene", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'release_character_to_wild',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ForceReleaseCharacterArguments {
    adminCap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    controlCap: RawTransactionArgument<string>;
    currentScene: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface ForceReleaseCharacterOptions {
    package?: string;
    arguments: ForceReleaseCharacterArguments | [
        adminCap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        controlCap: RawTransactionArgument<string>,
        currentScene: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
/**
 * World-admin emergency release. Same end state as `release_character_to_wild` but
 * bypasses storyteller signature.
 */
export function forceReleaseCharacter(options: ForceReleaseCharacterOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "saga", "controlCap", "currentScene", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'force_release_character',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WalkInWorldArguments {
    ownerCap: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    currentLocation: RawTransactionArgument<string>;
    newLocation: RawTransactionArgument<string>;
}
export interface WalkInWorldOptions {
    package?: string;
    arguments: WalkInWorldArguments | [
        ownerCap: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        currentLocation: RawTransactionArgument<string>,
        newLocation: RawTransactionArgument<string>
    ];
}
/**
 * Wild character walks one step on the location graph. Owner-signed via OwnerCap
 * (auto-driver / sovereign skill both work — rule is "caller holds OwnerCap", not
 * "caller is a specific service"). Aborts if the character is in any saga, dead,
 * not actually at `current_location`, or if `new_location` isn't adjacent.
 */
export function walkInWorld(options: WalkInWorldOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["ownerCap", "character", "currentLocation", "newLocation"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'walk_in_world',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetCharacterSkillArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
    seed: RawTransactionArgument<Array<number>>;
}
export interface SetCharacterSkillOptions {
    package?: string;
    arguments: SetCharacterSkillArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>,
        seed: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Set or update a single skill value on a character for a specific saga.
 * Storyteller of `saga` signs. Validates:
 *
 * 1.  cap matches saga
 * 2.  character is currently in this saga
 * 3.  skill `key` is declared in `saga::saga_attribute_defs`
 * 4.  `value` is within the def's [min, max] range
 * 5.  character is not dead
 *
 * Stored as a DOF on the character keyed by `SagaSkillsKey { saga_id }`, so
 * per-saga skill sets are preserved across saga transitions.
 */
export function setCharacterSkill(options: SetCharacterSkillOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x1::string::String',
        'u64',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "character", "key", "value", "seed"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'set_character_skill',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearCharacterSkillArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
}
export interface ClearCharacterSkillOptions {
    package?: string;
    arguments: ClearCharacterSkillArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>
    ];
}
/**
 * Remove a per-saga skill entry by key. Storyteller-signed. No-op if missing
 * (defensive). Note: clearing only removes from this saga's DOF — other sagas'
 * skill tables on the same character are untouched.
 */
export function clearCharacterSkill(options: ClearCharacterSkillOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "character", "key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'clear_character_skill',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterSkillsForSagaArguments {
    character: RawTransactionArgument<string>;
    sagaId: RawTransactionArgument<string>;
}
export interface CharacterSkillsForSagaOptions {
    package?: string;
    arguments: CharacterSkillsForSagaArguments | [
        character: RawTransactionArgument<string>,
        sagaId: RawTransactionArgument<string>
    ];
}
/**
 * Snapshot a character's per-saga skill table. Returns empty if no skills have
 * been set for this saga.
 */
export function characterSkillsForSaga(options: CharacterSkillsForSagaOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["character", "sagaId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'character_skills_for_saga',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UpdateImageByStorytellerArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    newImageUrl: RawTransactionArgument<string>;
}
export interface UpdateImageByStorytellerOptions {
    package?: string;
    arguments: UpdateImageByStorytellerArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        newImageUrl: RawTransactionArgument<string>
    ];
}
/**
 * Storyteller-signed image update. Character must be in this saga, not dead. Used
 * when storyteller's AI portrait generator produces a new image during saga
 * events.
 */
export function updateImageByStoryteller(options: UpdateImageByStorytellerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "character", "newImageUrl"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'update_image_by_storyteller',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UpdateImageByOwnerArguments {
    ownerCap: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
    newImageUrl: RawTransactionArgument<string>;
}
export interface UpdateImageByOwnerOptions {
    package?: string;
    arguments: UpdateImageByOwnerArguments | [
        ownerCap: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>,
        newImageUrl: RawTransactionArgument<string>
    ];
}
/**
 * Owner-signed image update. Allowed at any time (wild or in-saga, dead or alive —
 * owner's call). Owner may want to refresh their character's public portrait
 * independently of saga storyteller.
 */
export function updateImageByOwner(options: UpdateImageByOwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["ownerCap", "character", "newImageUrl"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'update_image_by_owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsValidArguments {
    cap: RawTransactionArgument<string>;
    character: RawTransactionArgument<string>;
}
export interface IsValidOptions {
    package?: string;
    arguments: IsValidArguments | [
        cap: RawTransactionArgument<string>,
        character: RawTransactionArgument<string>
    ];
}
export function isValid(options: IsValidOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'is_valid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerCapCharacterIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface OwnerCapCharacterIdOptions {
    package?: string;
    arguments: OwnerCapCharacterIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function ownerCapCharacterId(options: OwnerCapCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'owner_cap_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerCapWorldIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface OwnerCapWorldIdOptions {
    package?: string;
    arguments: OwnerCapWorldIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function ownerCapWorldId(options: OwnerCapWorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'owner_cap_world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerCapMintedAtMsArguments {
    cap: RawTransactionArgument<string>;
}
export interface OwnerCapMintedAtMsOptions {
    package?: string;
    arguments: OwnerCapMintedAtMsArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function ownerCapMintedAtMs(options: OwnerCapMintedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'owner_cap_minted_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerCapCumulativeRevenueArguments {
    cap: RawTransactionArgument<string>;
}
export interface OwnerCapCumulativeRevenueOptions {
    package?: string;
    arguments: OwnerCapCumulativeRevenueArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function ownerCapCumulativeRevenue(options: OwnerCapCumulativeRevenueOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'owner_cap_cumulative_revenue',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ControlCapCharacterIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface ControlCapCharacterIdOptions {
    package?: string;
    arguments: ControlCapCharacterIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function controlCapCharacterId(options: ControlCapCharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'control_cap_character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ControlCapEpochArguments {
    cap: RawTransactionArgument<string>;
}
export interface ControlCapEpochOptions {
    package?: string;
    arguments: ControlCapEpochArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function controlCapEpoch(options: ControlCapEpochOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'control_cap_epoch',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ControlCapSagaIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface ControlCapSagaIdOptions {
    package?: string;
    arguments: ControlCapSagaIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function controlCapSagaId(options: ControlCapSagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'control_cap_saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CharacterIdArguments {
    character: RawTransactionArgument<string>;
}
export interface CharacterIdOptions {
    package?: string;
    arguments: CharacterIdArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function characterId(options: CharacterIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'character_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ControlEpochArguments {
    character: RawTransactionArgument<string>;
}
export interface ControlEpochOptions {
    package?: string;
    arguments: ControlEpochArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function controlEpoch(options: ControlEpochOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'control_epoch',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WorldIdArguments {
    character: RawTransactionArgument<string>;
}
export interface WorldIdOptions {
    package?: string;
    arguments: WorldIdArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function worldId(options: WorldIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'world_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SagaIdArguments {
    character: RawTransactionArgument<string>;
}
export interface SagaIdOptions {
    package?: string;
    arguments: SagaIdArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function sagaId(options: SagaIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'saga_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CurrentSceneIdArguments {
    character: RawTransactionArgument<string>;
}
export interface CurrentSceneIdOptions {
    package?: string;
    arguments: CurrentSceneIdArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function currentSceneId(options: CurrentSceneIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'current_scene_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CurrentLocationIdArguments {
    character: RawTransactionArgument<string>;
}
export interface CurrentLocationIdOptions {
    package?: string;
    arguments: CurrentLocationIdArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function currentLocationId(options: CurrentLocationIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'current_location_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BirthMsArguments {
    character: RawTransactionArgument<string>;
}
export interface BirthMsOptions {
    package?: string;
    arguments: BirthMsArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function birthMs(options: BirthMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'birth_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProfileArguments {
    character: RawTransactionArgument<string>;
}
export interface ProfileOptions {
    package?: string;
    arguments: ProfileArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function profile(options: ProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PhysicalFactsArguments {
    profile: TransactionArgument;
}
export interface PhysicalFactsOptions {
    package?: string;
    arguments: PhysicalFactsArguments | [
        profile: TransactionArgument
    ];
}
export function physicalFacts(options: PhysicalFactsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["profile"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'physical_facts',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProfileNameArguments {
    profile: TransactionArgument;
}
export interface ProfileNameOptions {
    package?: string;
    arguments: ProfileNameArguments | [
        profile: TransactionArgument
    ];
}
export function profileName(options: ProfileNameOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["profile"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'profile_name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProfileDescriptionArguments {
    profile: TransactionArgument;
}
export interface ProfileDescriptionOptions {
    package?: string;
    arguments: ProfileDescriptionArguments | [
        profile: TransactionArgument
    ];
}
export function profileDescription(options: ProfileDescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["profile"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'profile_description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PhysicalSpeciesArguments {
    facts: TransactionArgument;
}
export interface PhysicalSpeciesOptions {
    package?: string;
    arguments: PhysicalSpeciesArguments | [
        facts: TransactionArgument
    ];
}
export function physicalSpecies(options: PhysicalSpeciesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["facts"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'physical_species',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PhysicalGenderArguments {
    facts: TransactionArgument;
}
export interface PhysicalGenderOptions {
    package?: string;
    arguments: PhysicalGenderArguments | [
        facts: TransactionArgument
    ];
}
export function physicalGender(options: PhysicalGenderOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["facts"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'physical_gender',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PhysicalBodyArguments {
    facts: TransactionArgument;
}
export interface PhysicalBodyOptions {
    package?: string;
    arguments: PhysicalBodyArguments | [
        facts: TransactionArgument
    ];
}
export function physicalBody(options: PhysicalBodyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["facts"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'physical_body',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PhysicalAgeYearsArguments {
    facts: TransactionArgument;
}
export interface PhysicalAgeYearsOptions {
    package?: string;
    arguments: PhysicalAgeYearsArguments | [
        facts: TransactionArgument
    ];
}
export function physicalAgeYears(options: PhysicalAgeYearsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["facts"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'physical_age_years',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributesArguments {
    character: RawTransactionArgument<string>;
}
export interface AttributesOptions {
    package?: string;
    arguments: AttributesArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function attributes(options: AttributesOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'attributes',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeKeyArguments {
    attr: TransactionArgument;
}
export interface AttributeKeyOptions {
    package?: string;
    arguments: AttributeKeyArguments | [
        attr: TransactionArgument
    ];
}
export function attributeKey(options: AttributeKeyOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["attr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'attribute_key',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeValueArguments {
    attr: TransactionArgument;
}
export interface AttributeValueOptions {
    package?: string;
    arguments: AttributeValueArguments | [
        attr: TransactionArgument
    ];
}
export function attributeValue(options: AttributeValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["attr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'attribute_value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AttributeSeedArguments {
    attr: TransactionArgument;
}
export interface AttributeSeedOptions {
    package?: string;
    arguments: AttributeSeedArguments | [
        attr: TransactionArgument
    ];
}
export function attributeSeed(options: AttributeSeedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["attr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'attribute_seed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FindAttributeValueArguments {
    character: RawTransactionArgument<string>;
    key: RawTransactionArgument<string>;
}
export interface FindAttributeValueOptions {
    package?: string;
    arguments: FindAttributeValueArguments | [
        character: RawTransactionArgument<string>,
        key: RawTransactionArgument<string>
    ];
}
/** Find the first `AttributeValue` with `key`, or `None`. */
export function findAttributeValue(options: FindAttributeValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["character", "key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'find_attribute_value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FindAttributeValueInArguments {
    attributes: TransactionArgument;
    key: RawTransactionArgument<string>;
}
export interface FindAttributeValueInOptions {
    package?: string;
    arguments: FindAttributeValueInArguments | [
        attributes: TransactionArgument,
        key: RawTransactionArgument<string>
    ];
}
/**
 * Find an attribute by key in any vector<AttributeValue> — same algorithm as
 * `find_attribute_value` but operates on a raw slice. Used by
 * `recruit::check_voucher_requirements` to validate proposed attributes before
 * mint, without needing a Character struct yet.
 */
export function findAttributeValueIn(options: FindAttributeValueInOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<null>',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["attributes", "key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'find_attribute_value_in',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MediaAssetsArguments {
    character: RawTransactionArgument<string>;
}
export interface MediaAssetsOptions {
    package?: string;
    arguments: MediaAssetsArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function mediaAssets(options: MediaAssetsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'media_assets',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ImageUrlArguments {
    character: RawTransactionArgument<string>;
}
export interface ImageUrlOptions {
    package?: string;
    arguments: ImageUrlArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function imageUrl(options: ImageUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'image_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasTagArguments {
    character: RawTransactionArgument<string>;
    label: RawTransactionArgument<string>;
}
export interface HasTagOptions {
    package?: string;
    arguments: HasTagArguments | [
        character: RawTransactionArgument<string>,
        label: RawTransactionArgument<string>
    ];
}
export function hasTag(options: HasTagOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["character", "label"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'has_tag',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagCountArguments {
    character: RawTransactionArgument<string>;
}
export interface TagCountOptions {
    package?: string;
    arguments: TagCountArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function tagCount(options: TagCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'tag_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagsArguments {
    character: RawTransactionArgument<string>;
}
export interface TagsOptions {
    package?: string;
    arguments: TagsArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function tags(options: TagsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'tags',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagLabelArguments {
    tag: TransactionArgument;
}
export interface TagLabelOptions {
    package?: string;
    arguments: TagLabelArguments | [
        tag: TransactionArgument
    ];
}
export function tagLabel(options: TagLabelOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'tag_label',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagSourceEventIdArguments {
    tag: TransactionArgument;
}
export interface TagSourceEventIdOptions {
    package?: string;
    arguments: TagSourceEventIdArguments | [
        tag: TransactionArgument
    ];
}
export function tagSourceEventId(options: TagSourceEventIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'tag_source_event_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TagAffirmedAtMsArguments {
    tag: TransactionArgument;
}
export interface TagAffirmedAtMsOptions {
    package?: string;
    arguments: TagAffirmedAtMsArguments | [
        tag: TransactionArgument
    ];
}
export function tagAffirmedAtMs(options: TagAffirmedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["tag"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'tag_affirmed_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsDeadArguments {
    character: RawTransactionArgument<string>;
}
export interface IsDeadOptions {
    package?: string;
    arguments: IsDeadArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function isDead(options: IsDeadOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'is_dead',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathRecordArguments {
    character: RawTransactionArgument<string>;
}
export interface DeathRecordOptions {
    package?: string;
    arguments: DeathRecordArguments | [
        character: RawTransactionArgument<string>
    ];
}
export function deathRecord(options: DeathRecordOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["character"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'death_record',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathVictimArguments {
    record: TransactionArgument;
}
export interface DeathVictimOptions {
    package?: string;
    arguments: DeathVictimArguments | [
        record: TransactionArgument
    ];
}
export function deathVictim(options: DeathVictimOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["record"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'death_victim',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathByEventArguments {
    record: TransactionArgument;
}
export interface DeathByEventOptions {
    package?: string;
    arguments: DeathByEventArguments | [
        record: TransactionArgument
    ];
}
export function deathByEvent(options: DeathByEventOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["record"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'death_by_event',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathAttributedArguments {
    record: TransactionArgument;
}
export interface DeathAttributedOptions {
    package?: string;
    arguments: DeathAttributedArguments | [
        record: TransactionArgument
    ];
}
export function deathAttributed(options: DeathAttributedOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["record"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'death_attributed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeathRecordedAtMsArguments {
    record: TransactionArgument;
}
export interface DeathRecordedAtMsOptions {
    package?: string;
    arguments: DeathRecordedAtMsArguments | [
        record: TransactionArgument
    ];
}
export function deathRecordedAtMs(options: DeathRecordedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["record"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'death_recorded_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealApproveControlArguments {
    id: RawTransactionArgument<Array<number>>;
    character: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface SealApproveControlOptions {
    package?: string;
    arguments: SealApproveControlArguments | [
        id: RawTransactionArgument<Array<number>>,
        character: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Saga 變體：持有當前有效 ControlCap 的人可以解密。三層檢查：cap 屬此 character /
 * cap epoch 未撤銷 / SEAL id suffix 指向此 character.
 */
export function sealApproveControl(options: SealApproveControlOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<u8>',
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["id", "character", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'seal_approve_control',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealApproveOwnerArguments {
    id: RawTransactionArgument<Array<number>>;
    character: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
}
export interface SealApproveOwnerOptions {
    package?: string;
    arguments: SealApproveOwnerArguments | [
        id: RawTransactionArgument<Array<number>>,
        character: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>
    ];
}
/**
 * Owner 變體：持有 OwnerCap 的人可解密（唯讀審計）。owner 的「唯讀」由 app 層保證（owner
 * client 不暴露 remember API）。
 */
export function sealApproveOwner(options: SealApproveOwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'vector<u8>',
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["id", "character", "ownerCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'seal_approve_owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAttributeValueArguments {
    key: RawTransactionArgument<string>;
    value: RawTransactionArgument<number | bigint>;
    seed: RawTransactionArgument<Array<number>>;
}
export interface NewAttributeValueOptions {
    package?: string;
    arguments: NewAttributeValueArguments | [
        key: RawTransactionArgument<string>,
        value: RawTransactionArgument<number | bigint>,
        seed: RawTransactionArgument<Array<number>>
    ];
}
export function newAttributeValue(options: NewAttributeValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        'u64',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["key", "value", "seed"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_attribute_value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewPhysicalFactsArguments {
    species: RawTransactionArgument<string>;
    gender: RawTransactionArgument<string>;
    body: RawTransactionArgument<string>;
    ageYears: RawTransactionArgument<number>;
}
export interface NewPhysicalFactsOptions {
    package?: string;
    arguments: NewPhysicalFactsArguments | [
        species: RawTransactionArgument<string>,
        gender: RawTransactionArgument<string>,
        body: RawTransactionArgument<string>,
        ageYears: RawTransactionArgument<number>
    ];
}
export function newPhysicalFacts(options: NewPhysicalFactsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["species", "gender", "body", "ageYears"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_physical_facts',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewCharacterProfileArguments {
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    physicalFacts: TransactionArgument;
}
export interface NewCharacterProfileOptions {
    package?: string;
    arguments: NewCharacterProfileArguments | [
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        physicalFacts: TransactionArgument
    ];
}
export function newCharacterProfile(options: NewCharacterProfileOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["name", "description", "physicalFacts"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_character_profile',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewMediaAssetArguments {
    kind: RawTransactionArgument<number>;
    uri: RawTransactionArgument<string>;
    walrusBlobId: RawTransactionArgument<Array<number>>;
    metadataUri: RawTransactionArgument<string>;
}
export interface NewMediaAssetOptions {
    package?: string;
    arguments: NewMediaAssetArguments | [
        kind: RawTransactionArgument<number>,
        uri: RawTransactionArgument<string>,
        walrusBlobId: RawTransactionArgument<Array<number>>,
        metadataUri: RawTransactionArgument<string>
    ];
}
export function newMediaAsset(options: NewMediaAssetOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u8',
        '0x1::string::String',
        'vector<u8>',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["kind", "uri", "walrusBlobId", "metadataUri"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_media_asset',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewTagArguments {
    label: RawTransactionArgument<string>;
    sourceEventId: RawTransactionArgument<string | null>;
    affirmedAtMs: RawTransactionArgument<number | bigint>;
}
export interface NewTagOptions {
    package?: string;
    arguments: NewTagArguments | [
        label: RawTransactionArgument<string>,
        sourceEventId: RawTransactionArgument<string | null>,
        affirmedAtMs: RawTransactionArgument<number | bigint>
    ];
}
export function newTag(options: NewTagOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::option::Option<0x2::object::ID>',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["label", "sourceEventId", "affirmedAtMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_tag',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewDeathRecordArguments {
    victim: RawTransactionArgument<string>;
    recordedAtMs: RawTransactionArgument<number | bigint>;
    byEvent: RawTransactionArgument<string | null>;
    attributedCharacters: RawTransactionArgument<Array<string>>;
}
export interface NewDeathRecordOptions {
    package?: string;
    arguments: NewDeathRecordArguments | [
        victim: RawTransactionArgument<string>,
        recordedAtMs: RawTransactionArgument<number | bigint>,
        byEvent: RawTransactionArgument<string | null>,
        attributedCharacters: RawTransactionArgument<Array<string>>
    ];
}
/**
 * Construct a DeathRecord. Caller owns the invariants on attribution (validity of
 * `attributed_characters` IDs etc.).
 */
export function newDeathRecord(options: NewDeathRecordOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x2::object::ID',
        'u64',
        '0x1::option::Option<0x2::object::ID>',
        'vector<0x2::object::ID>'
    ] satisfies (string | null)[];
    const parameterNames = ["victim", "recordedAtMs", "byEvent", "attributedCharacters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'character',
        function: 'new_death_record',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}