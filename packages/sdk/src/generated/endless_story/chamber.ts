/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Chamber — owner-decorated furnishing layer on top of an Endless Story `Scene`.
 * 
 * Why a separate module: `scene.move` is imported by `character.move`, so `scene`
 * CANNOT import `character` (dependency cycle). This module sits in the same
 * package and imports BOTH, letting us gate decorating by the character's
 * `OwnerCap` without touching the audited scene struct.
 * 
 * Authority split (the whole point):
 * 
 * - SAGA keeps narrative control → create_scene / params / character presence stay
 *   StorytellerCap- or package-gated in scene.move.
 * - OWNER gets furnishing control only → `decorate` overwrites ONLY the on-chain
 *   object layout. It cannot reach params / access / characters.
 * 
 * Storage split (answers the Walrus lifecycle problem):
 * 
 * - The MUTABLE, small part — object list + (x,y,z, yaw) — lives ON-CHAIN in a
 *   dynamic field, overwritten in place each decorate. No orphan blobs, no waiting
 *   for expiry, no "edit nukes the whole file".
 * - The IMMUTABLE, heavy part — each object's `.glb` — lives in Walrus, stored
 *   ONCE (long-lived/permanent) and referenced by blob id. A rearrange never
 *   re-uploads an asset. Coordinates are millimetres, offset-encoded (Move has no
 *   signed ints): actual_mm = stored - ORIGIN_MM → range about ±100 m around
 *   origin.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/endless-story::chamber';
export const FurnishingKey = new MoveStruct({ name: `${$moduleName}::FurnishingKey`, fields: {
        dummy_field: bcs.bool()
    } });
export const ObjectPlacement = new MoveStruct({ name: `${$moduleName}::ObjectPlacement`, fields: {
        kind: bcs.u8(),
        asset_blob_id: bcs.vector(bcs.u8()),
        source_object: bcs.option(bcs.Address),
        x_mm: bcs.u32(),
        y_mm: bcs.u32(),
        z_mm: bcs.u32(),
        yaw_deg: bcs.u16(),
        scale_pct: bcs.u16()
    } });
export const Furnishing = new MoveStruct({ name: `${$moduleName}::Furnishing`, fields: {
        chamber_owner_character_id: bcs.Address,
        objects: bcs.vector(ObjectPlacement),
        layout_version: bcs.u64()
    } });
export const ChamberEnabled = new MoveStruct({ name: `${$moduleName}::ChamberEnabled`, fields: {
        scene_id: bcs.Address,
        owner_character_id: bcs.Address
    } });
export const ChamberDecorated = new MoveStruct({ name: `${$moduleName}::ChamberDecorated`, fields: {
        scene_id: bcs.Address,
        owner_character_id: bcs.Address,
        object_count: bcs.u64(),
        layout_version: bcs.u64()
    } });
export const VaultTicket = new MoveStruct({ name: `${$moduleName}::VaultTicket`, fields: {
        id: bcs.Address,
        vault_id: bcs.Address,
        kiosk_id: bcs.Address
    } });
export const PersonalVault = new MoveStruct({ name: `${$moduleName}::PersonalVault`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        kiosk_id: bcs.Address,
        /**
         * Walrus blob id of the full layout JSON (positions, lights, AI props). `none`
         * until the first `save_layout` call.
         */
        layout_blob_id: bcs.option(bcs.string()),
        layout_version: bcs.u64()
    } });
export const PersonalVaultCreated = new MoveStruct({ name: `${$moduleName}::PersonalVaultCreated`, fields: {
        vault_id: bcs.Address,
        kiosk_id: bcs.Address,
        owner: bcs.Address
    } });
export interface CreatePersonalVaultArguments {
    initialLayoutBlobId: RawTransactionArgument<string | null>;
}
export interface CreatePersonalVaultOptions {
    package?: string;
    arguments: CreatePersonalVaultArguments | [
        initialLayoutBlobId: RawTransactionArgument<string | null>
    ];
}
/**
 * Any wallet calls this once. Creates a Kiosk + PersonalVault atomically. Returns
 * (KioskOwnerCap, VaultTicket) — caller's PTB must
 * `transferObjects([cap, ticket], ctx.sender())`. Pass `option::some(blob_id)` in
 * `initial_layout_blob_id` to save an initial layout in the same transaction;
 * `option::none()` otherwise.
 */
export function createPersonalVault(options: CreatePersonalVaultOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        '0x1::option::Option<0x1::string::String>'
    ] satisfies (string | null)[];
    const parameterNames = ["initialLayoutBlobId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'create_personal_vault',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SaveLayoutArguments {
    vault: RawTransactionArgument<string>;
    blobId: RawTransactionArgument<string>;
}
export interface SaveLayoutOptions {
    package?: string;
    arguments: SaveLayoutArguments | [
        vault: RawTransactionArgument<string>,
        blobId: RawTransactionArgument<string>
    ];
}
/**
 * Anchor a new Walrus layout blob for the vault. Only the wallet that created the
 * vault (vault.owner) may call this.
 */
export function saveLayout(options: SaveLayoutOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["vault", "blobId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'save_layout',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VaultOwnerArguments {
    v: RawTransactionArgument<string>;
}
export interface VaultOwnerOptions {
    package?: string;
    arguments: VaultOwnerArguments | [
        v: RawTransactionArgument<string>
    ];
}
export function vaultOwner(options: VaultOwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["v"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'vault_owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VaultKioskIdArguments {
    v: RawTransactionArgument<string>;
}
export interface VaultKioskIdOptions {
    package?: string;
    arguments: VaultKioskIdArguments | [
        v: RawTransactionArgument<string>
    ];
}
export function vaultKioskId(options: VaultKioskIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["v"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'vault_kiosk_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VaultLayoutBlobIdArguments {
    v: RawTransactionArgument<string>;
}
export interface VaultLayoutBlobIdOptions {
    package?: string;
    arguments: VaultLayoutBlobIdArguments | [
        v: RawTransactionArgument<string>
    ];
}
export function vaultLayoutBlobId(options: VaultLayoutBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["v"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'vault_layout_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VaultLayoutVersionArguments {
    v: RawTransactionArgument<string>;
}
export interface VaultLayoutVersionOptions {
    package?: string;
    arguments: VaultLayoutVersionArguments | [
        v: RawTransactionArgument<string>
    ];
}
export function vaultLayoutVersion(options: VaultLayoutVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["v"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'vault_layout_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TicketVaultIdArguments {
    t: RawTransactionArgument<string>;
}
export interface TicketVaultIdOptions {
    package?: string;
    arguments: TicketVaultIdArguments | [
        t: RawTransactionArgument<string>
    ];
}
export function ticketVaultId(options: TicketVaultIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'ticket_vault_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TicketKioskIdArguments {
    t: RawTransactionArgument<string>;
}
export interface TicketKioskIdOptions {
    package?: string;
    arguments: TicketKioskIdArguments | [
        t: RawTransactionArgument<string>
    ];
}
export function ticketKioskId(options: TicketKioskIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'ticket_kiosk_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewPlacementArguments {
    kind: RawTransactionArgument<number>;
    assetBlobId: RawTransactionArgument<Array<number>>;
    sourceObject: RawTransactionArgument<string | null>;
    xMm: RawTransactionArgument<number>;
    yMm: RawTransactionArgument<number>;
    zMm: RawTransactionArgument<number>;
    yawDeg: RawTransactionArgument<number>;
    scalePct: RawTransactionArgument<number>;
}
export interface NewPlacementOptions {
    package?: string;
    arguments: NewPlacementArguments | [
        kind: RawTransactionArgument<number>,
        assetBlobId: RawTransactionArgument<Array<number>>,
        sourceObject: RawTransactionArgument<string | null>,
        xMm: RawTransactionArgument<number>,
        yMm: RawTransactionArgument<number>,
        zMm: RawTransactionArgument<number>,
        yawDeg: RawTransactionArgument<number>,
        scalePct: RawTransactionArgument<number>
    ];
}
export function newPlacement(options: NewPlacementOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        'u8',
        'vector<u8>',
        '0x1::option::Option<0x2::object::ID>',
        'u32',
        'u32',
        'u32',
        'u16',
        'u16'
    ] satisfies (string | null)[];
    const parameterNames = ["kind", "assetBlobId", "sourceObject", "xMm", "yMm", "zMm", "yawDeg", "scalePct"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'new_placement',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EnableChamberArguments {
    cap: RawTransactionArgument<string>;
    saga: RawTransactionArgument<string>;
    scene: RawTransactionArgument<string>;
    ownerCharacterId: RawTransactionArgument<string>;
}
export interface EnableChamberOptions {
    package?: string;
    arguments: EnableChamberArguments | [
        cap: RawTransactionArgument<string>,
        saga: RawTransactionArgument<string>,
        scene: RawTransactionArgument<string>,
        ownerCharacterId: RawTransactionArgument<string>
    ];
}
/**
 * Saga turns an existing Scene into a decoratable chamber owned by a character.
 * Saga-gated — the ONLY saga touchpoint; afterwards the owner decorates
 * independently.
 */
export function enableChamber(options: EnableChamberOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "saga", "scene", "ownerCharacterId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'enable_chamber',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DecorateArguments {
    scene: RawTransactionArgument<string>;
    ownerCap: RawTransactionArgument<string>;
    newObjects: TransactionArgument;
}
export interface DecorateOptions {
    package?: string;
    arguments: DecorateArguments | [
        scene: RawTransactionArgument<string>,
        ownerCap: RawTransactionArgument<string>,
        newObjects: TransactionArgument
    ];
}
/**
 * Character owner re-arranges the room: overwrites ONLY the object layout in
 * place. Cannot touch scene params / access / character presence — those are not
 * reachable from here.
 */
export function decorate(options: DecorateOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null,
        null,
        'vector<null>'
    ] satisfies (string | null)[];
    const parameterNames = ["scene", "ownerCap", "newObjects"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'decorate',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsChamberArguments {
    scene: RawTransactionArgument<string>;
}
export interface IsChamberOptions {
    package?: string;
    arguments: IsChamberArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function isChamber(options: IsChamberOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'is_chamber',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ChamberOwnerArguments {
    scene: RawTransactionArgument<string>;
}
export interface ChamberOwnerOptions {
    package?: string;
    arguments: ChamberOwnerArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function chamberOwner(options: ChamberOwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'chamber_owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LayoutVersionArguments {
    scene: RawTransactionArgument<string>;
}
export interface LayoutVersionOptions {
    package?: string;
    arguments: LayoutVersionArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function layoutVersion(options: LayoutVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'layout_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ObjectCountArguments {
    scene: RawTransactionArgument<string>;
}
export interface ObjectCountOptions {
    package?: string;
    arguments: ObjectCountArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function objectCount(options: ObjectCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'object_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ObjectsArguments {
    scene: RawTransactionArgument<string>;
}
export interface ObjectsOptions {
    package?: string;
    arguments: ObjectsArguments | [
        scene: RawTransactionArgument<string>
    ];
}
export function objects(options: ObjectsOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["scene"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'objects',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementKindArguments {
    p: TransactionArgument;
}
export interface PlacementKindOptions {
    package?: string;
    arguments: PlacementKindArguments | [
        p: TransactionArgument
    ];
}
export function placementKind(options: PlacementKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementAssetBlobIdArguments {
    p: TransactionArgument;
}
export interface PlacementAssetBlobIdOptions {
    package?: string;
    arguments: PlacementAssetBlobIdArguments | [
        p: TransactionArgument
    ];
}
export function placementAssetBlobId(options: PlacementAssetBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_asset_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementSourceObjectArguments {
    p: TransactionArgument;
}
export interface PlacementSourceObjectOptions {
    package?: string;
    arguments: PlacementSourceObjectArguments | [
        p: TransactionArgument
    ];
}
export function placementSourceObject(options: PlacementSourceObjectOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_source_object',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementXMmArguments {
    p: TransactionArgument;
}
export interface PlacementXMmOptions {
    package?: string;
    arguments: PlacementXMmArguments | [
        p: TransactionArgument
    ];
}
export function placementXMm(options: PlacementXMmOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_x_mm',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementYMmArguments {
    p: TransactionArgument;
}
export interface PlacementYMmOptions {
    package?: string;
    arguments: PlacementYMmArguments | [
        p: TransactionArgument
    ];
}
export function placementYMm(options: PlacementYMmOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_y_mm',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementZMmArguments {
    p: TransactionArgument;
}
export interface PlacementZMmOptions {
    package?: string;
    arguments: PlacementZMmArguments | [
        p: TransactionArgument
    ];
}
export function placementZMm(options: PlacementZMmOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_z_mm',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementYawDegArguments {
    p: TransactionArgument;
}
export interface PlacementYawDegOptions {
    package?: string;
    arguments: PlacementYawDegArguments | [
        p: TransactionArgument
    ];
}
export function placementYawDeg(options: PlacementYawDegOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_yaw_deg',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlacementScalePctArguments {
    p: TransactionArgument;
}
export interface PlacementScalePctOptions {
    package?: string;
    arguments: PlacementScalePctArguments | [
        p: TransactionArgument
    ];
}
export function placementScalePct(options: PlacementScalePctOptions) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'placement_scale_pct',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OriginMmOptions {
    package?: string;
    arguments?: [
    ];
}
/** Offset used to encode signed millimetre coordinates into u32. */
export function originMm(options: OriginMmOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/endless-story';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'chamber',
        function: 'origin_mm',
    });
}