/// Endless Story — Character custody.
///
/// Scope 1: Character + OwnerCap 原型。能 mint，沒生命週期。
///
/// 後續 scope 接：
///   - Scope 2: ControlCap、issue_control_cap、revoke_all_control、reassign_saga
///   - Scope 3: seal_approve_control / seal_approve_owner 與 id layout
module endless_story::character;

use sui::event;

// === Structs ===

/// 角色本體。預期由呼叫端 `share` 後成為 shared object。
/// `control_epoch` 是日後 ControlCap 撤銷的依據；從 1 起跳，
/// 0 保留給「無有效託管」語義。
public struct Character has key {
    id: UID,
    control_epoch: u64,
}

/// 角色根權限。可轉移；持有者即 owner。角色易主 = transfer 這張 cap。
public struct OwnerCap has key, store {
    id: UID,
    character_id: ID,
}

// === Events ===

public struct CharacterCreated has copy, drop {
    character_id: ID,
    owner: address,
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
