/// Endless Story — Character custody.
///
/// Scope 1: Character + OwnerCap 原型。能 mint，沒生命週期。
/// Scope 2: ControlCap + lifecycle（issue / revoke / reassign）+ is_valid view。
///
/// 後續 scope 接：
///   - Scope 3: seal_approve_control / seal_approve_owner 與 id layout
module endless_story::character;

use sui::event;

// === Errors ===

#[error]
const EWrongCharacter: vector<u8> =
    b"OwnerCap does not correspond to this Character";

// === Structs ===

/// 角色本體。預期由呼叫端 `share` 後成為 shared object。
/// `control_epoch` 是 ControlCap 撤銷的依據；從 1 起跳，0 保留給
/// 「無有效託管」語義。
public struct Character has key {
    id: UID,
    control_epoch: u64,
}

/// 角色根權限。可轉移；持有者即 owner。角色易主 = transfer 這張 cap。
public struct OwnerCap has key, store {
    id: UID,
    character_id: ID,
}

/// 營運權限。`epoch` 對應簽發當下的 `character.control_epoch`。
/// 當 character.control_epoch 變動後，這張 cap 自動失效：
/// `is_valid` 會回 false，Scope 3 的 seal_approve 會 abort。
public struct ControlCap has key, store {
    id: UID,
    character_id: ID,
    epoch: u64,
}

// === Events ===

public struct CharacterCreated has copy, drop {
    character_id: ID,
    owner: address,
}

public struct ControlCapIssued has copy, drop {
    character_id: ID,
    cap_id: ID,
    epoch: u64,
}

public struct ControlRevoked has copy, drop {
    character_id: ID,
    revoked_epoch: u64,
}

public struct SagaReassigned has copy, drop {
    character_id: ID,
    new_epoch: u64,
    cap_id: ID,
}

// === Mint ===

/// 建立角色並核發 OwnerCap 給 sender。
///
/// 回傳 `(Character, OwnerCap)`，由呼叫端決定 `share` / `transfer`，
/// 讓同一個 PTB 可以接續做別的事（例如先寫初始 metadata 再 share）。
public fun mint_character(ctx: &mut TxContext): (Character, OwnerCap) {
    let character = Character {
        id: object::new(ctx),
        control_epoch: 1,
    };
    let character_id = object::id(&character);
    let owner_cap = OwnerCap {
        id: object::new(ctx),
        character_id,
    };

    event::emit(CharacterCreated {
        character_id,
        owner: ctx.sender(),
    });

    (character, owner_cap)
}

/// 把 character 變成 shared object。
/// 拆成獨立函式（而非 mint 內部處理）以保留 PTB 組合性：
/// 呼叫端可在 share 之前先初始化 character 的其他狀態。
public fun share(character: Character) {
    transfer::share_object(character);
}

// === Cap lifecycle ===

/// Owner 簽發一張 ControlCap，綁定當前 `control_epoch`。
/// 回傳 cap 由呼叫端決定 transfer 對象（PTB 組合性）。
public fun issue_control_cap(
    character: &Character,
    owner_cap: &OwnerCap,
    ctx: &mut TxContext,
): ControlCap {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    let cap = ControlCap {
        id: object::new(ctx),
        character_id: owner_cap.character_id,
        epoch: character.control_epoch,
    };

    event::emit(ControlCapIssued {
        character_id: owner_cap.character_id,
        cap_id: object::id(&cap),
        epoch: cap.epoch,
    });

    cap
}

/// Owner 撤銷當前所有 ControlCap。
///
/// 用 epoch +1 達成，而非 destroy 舊 cap object：
/// 舊 cap 還在持有者手上，但 `is_valid` 與 SEAL approve 都會拒，
/// 持有者無從察覺以外的副作用，符合 Sui「不可遠端銷毀別人物件」的限制。
public fun revoke_all_control(character: &mut Character, owner_cap: &OwnerCap) {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    let revoked = character.control_epoch;
    character.control_epoch = character.control_epoch + 1;

    event::emit(ControlRevoked {
        character_id: object::id(character),
        revoked_epoch: revoked,
    });
}

/// Owner 把角色託管轉給新 Saga：一筆 tx 完成「撤銷舊 + 簽發新」。
///
/// 跟連續呼叫 `revoke_all_control` + `issue_control_cap` 在 epoch 上等價，
/// 但 emit `SagaReassigned`（而非 `ControlRevoked` + `ControlCapIssued`），
/// 讓 indexer 能區分「主動撤銷」與「換託管」兩種意圖。
public fun reassign_saga(
    character: &mut Character,
    owner_cap: &OwnerCap,
    ctx: &mut TxContext,
): ControlCap {
    assert!(owner_cap.character_id == object::id(character), EWrongCharacter);

    character.control_epoch = character.control_epoch + 1;

    let cap = ControlCap {
        id: object::new(ctx),
        character_id: owner_cap.character_id,
        epoch: character.control_epoch,
    };

    event::emit(SagaReassigned {
        character_id: object::id(character),
        new_epoch: character.control_epoch,
        cap_id: object::id(&cap),
    });

    cap
}

// === Views ===

/// 判斷 cap 是否（仍）對 character 有效。
/// SDK 在 SEAL fetchKeys 前可預檢，省下白費的 dry-run。
/// 用 method syntax：`cap.is_valid(&character)`。
public fun is_valid(cap: &ControlCap, character: &Character): bool {
    cap.character_id == object::id(character) && cap.epoch == character.control_epoch
}

// === Tests ===

#[test_only]
use std::unit_test::{assert_eq, destroy};

#[test]
fun mint_character_sets_initial_epoch_and_links_owner_cap() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character(&mut ctx);

    assert_eq!(character.control_epoch, 1);
    assert_eq!(owner_cap.character_id, object::id(&character));

    destroy(character);
    destroy(owner_cap);
}

#[test]
fun issue_creates_cap_bound_to_current_epoch() {
    let mut ctx = tx_context::dummy();
    let (character, owner_cap) = mint_character(&mut ctx);

    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);

    assert_eq!(cap.epoch, 1);
    assert_eq!(cap.character_id, object::id(&character));
    assert!(cap.is_valid(&character));

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test]
fun revoke_invalidates_existing_cap() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character(&mut ctx);
    let cap = issue_control_cap(&character, &owner_cap, &mut ctx);

    revoke_all_control(&mut character, &owner_cap);

    assert_eq!(character.control_epoch, 2);
    assert!(!cap.is_valid(&character));

    destroy(character);
    destroy(owner_cap);
    destroy(cap);
}

#[test]
fun reassign_invalidates_old_cap_and_issues_fresh_one() {
    let mut ctx = tx_context::dummy();
    let (mut character, owner_cap) = mint_character(&mut ctx);
    let cap_a = issue_control_cap(&character, &owner_cap, &mut ctx);

    let cap_b = reassign_saga(&mut character, &owner_cap, &mut ctx);

    assert!(!cap_a.is_valid(&character));
    assert!(cap_b.is_valid(&character));
    assert_eq!(cap_b.epoch, 2);
    assert_eq!(character.control_epoch, 2);

    destroy(character);
    destroy(owner_cap);
    destroy(cap_a);
    destroy(cap_b);
}

#[test, expected_failure(abort_code = EWrongCharacter)]
fun issue_with_wrong_owner_cap_aborts() {
    let mut ctx = tx_context::dummy();
    let (char_a, owner_a) = mint_character(&mut ctx);
    let (char_b, owner_b) = mint_character(&mut ctx);

    // owner_b 簽發 char_a 的 cap → 預期 abort
    let cap = issue_control_cap(&char_a, &owner_b, &mut ctx);

    // 執行時抵達不了，但 compiler 要求 linear 值在所有路徑被消費。
    destroy(char_a);
    destroy(owner_a);
    destroy(char_b);
    destroy(owner_b);
    destroy(cap);
}
