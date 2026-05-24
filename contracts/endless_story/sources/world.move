/// World — the root state object every saga, scene, and character is anchored to.
///
/// One `World` is created once per deployment by `cli bootstrap` (Phase 1+).
/// It owns:
///   - `WorldInfo`         — display name / description
///   - `CurrencyDisplay`   — name + symbol of in-fiction currency (ENDLESS by default)
///   - `WorldRules`        — species kinds + reusable AttributeDefinition catalog
///   - `WorldState`        — current tick, registered saga IDs, location IDs
///   - `WorldTimeConfig`   — days_per_tick + tick_interval_ms (runner uses these)
///
/// **AdminCap** (this module's, distinct from any saga/character AdminCap) is
/// returned to the creator and required for: create_location, advance_tick,
/// set_time_config. Saga registration is package-internal (saga.move calls
/// `register_saga` when a saga is created).
///
/// Phase 1.2 — depends on currency.move (display name only, not type).
module endless_story::world;

use std::string::String;
use sui::clock;
use sui::event;

// ─── errors ──────────────────────────────────────────────────────────

const ENotAdmin: u64 = 1;
const EInvalidTimeConfig: u64 = 2;

// ─── caps ────────────────────────────────────────────────────────────

public struct AdminCap has key, store {
    id: UID,
    world_id: ID,
}

// ─── attribute schema (reused by saga skill tables) ──────────────────

public struct AttributeDefinition has copy, drop, store {
    key: String,
    label: String,
    min_value: u64,
    max_value: u64,
}

// ─── world shape ─────────────────────────────────────────────────────

public struct WorldInfo has copy, drop, store {
    name: String,
    description: String,
}

/// Display-only currency label (e.g. `name: "EndlessCoin", symbol: "ENDLESS"`).
/// The actual `Coin<endless_story::currency::CURRENCY>` lives in the currency
/// module; this is just what UI shows in world headers.
public struct CurrencyDisplay has copy, drop, store {
    name: String,
    symbol: String,
}

public struct WorldRules has copy, drop, store {
    species_kinds: vector<String>,
    attribute_definitions: vector<AttributeDefinition>,
}

public struct WorldState has copy, drop, store {
    current_tick: u64,
    saga_ids: vector<ID>,
    location_ids: vector<ID>,
    created_at_ms: u64,
}

/// World-level time config — 機械層（如 days_per_tick / tick_interval）。
/// Saga-level 節律（hourBoundaries / sleepWindow）走 saga 物件，不在這。
/// `days_per_tick_bp` 用 basis-points (1/10000) 表 days_per_tick：
///   1670  bp = 0.1670 day/tick = 約 1/6 天/tick = 一天 6 tick（戲班用）
///   10000 bp = 1.0 day/tick（每 tick 一整天，老配置）
public struct WorldTimeConfig has copy, drop, store {
    days_per_tick_bp: u64,
    tick_interval_ms: u64,
}

public struct World has key {
    id: UID,
    info: WorldInfo,
    currency: CurrencyDisplay,
    rules: WorldRules,
    state: WorldState,
    time_config: WorldTimeConfig,
}

// ─── location ────────────────────────────────────────────────────────

public struct LocationInfo has copy, drop, store {
    index: u64,
    name: String,
    description: String,
    terrain: String,
}

public struct Position has copy, drop, store {
    x: u64,
    y: u64,
}

public struct LocationGraph has copy, drop, store {
    adjacent_indices: vector<u64>,
}

public struct Location has key {
    id: UID,
    world_id: ID,
    info: LocationInfo,
    position: Position,
    graph: LocationGraph,
    created_at_ms: u64,
}

// ─── events ──────────────────────────────────────────────────────────

public struct WorldCreated has copy, drop {
    world_id: ID,
    admin_cap_id: ID,
    name: String,
    creator: address,
    created_at_ms: u64,
}

public struct LocationCreated has copy, drop {
    world_id: ID,
    location_id: ID,
    index: u64,
    name: String,
    created_at_ms: u64,
}

public struct SagaRegistered has copy, drop {
    world_id: ID,
    saga_id: ID,
    registered_at_ms: u64,
}

/// World daemon: monotonic tick index. Scene decay / natural-death hooks can
/// be chained in PTBs or later modules.
public struct TickAdvanced has copy, drop {
    world_id: ID,
    new_tick: u64,
    advanced_at_ms: u64,
}

public struct TimeConfigUpdated has copy, drop {
    world_id: ID,
    days_per_tick_bp: u64,
    tick_interval_ms: u64,
    updated_at_ms: u64,
}

// ─── defaults ────────────────────────────────────────────────────────

/// Default time config — used by `create_world`. Override later via
/// `set_time_config`. Default = 一天 6 tick、每 tick 2 min（戲班用）。
const DEFAULT_DAYS_PER_TICK_BP: u64 = 1670; // 0.1670 day/tick
const DEFAULT_TICK_INTERVAL_MS: u64 = 120_000; // 2 minutes

// ─── world lifecycle ─────────────────────────────────────────────────

public fun create_world(
    info: WorldInfo,
    currency: CurrencyDisplay,
    rules: WorldRules,
    clock: &clock::Clock,
    ctx: &mut TxContext,
): AdminCap {
    let created_at_ms = clock::timestamp_ms(clock);
    let world = World {
        id: object::new(ctx),
        info,
        currency,
        rules,
        state: WorldState {
            current_tick: 0,
            saga_ids: vector[],
            location_ids: vector[],
            created_at_ms,
        },
        time_config: WorldTimeConfig {
            days_per_tick_bp: DEFAULT_DAYS_PER_TICK_BP,
            tick_interval_ms: DEFAULT_TICK_INTERVAL_MS,
        },
    };
    let world_id = object::id(&world);
    let admin_cap = AdminCap { id: object::new(ctx), world_id };
    let admin_cap_id = object::id(&admin_cap);

    event::emit(WorldCreated {
        world_id,
        admin_cap_id,
        name: world.info.name,
        creator: ctx.sender(),
        created_at_ms,
    });

    transfer::share_object(world);
    admin_cap
}

public fun create_location(
    admin_cap: &AdminCap,
    world: &mut World,
    info: LocationInfo,
    position: Position,
    graph: LocationGraph,
    clock: &clock::Clock,
    ctx: &mut TxContext,
) {
    let world_id = object::id(world);
    assert!(admin_cap.world_id == world_id, ENotAdmin);

    let created_at_ms = clock::timestamp_ms(clock);
    let location = Location {
        id: object::new(ctx),
        world_id,
        info,
        position,
        graph,
        created_at_ms,
    };
    let location_id = object::id(&location);
    vector::push_back(&mut world.state.location_ids, location_id);

    event::emit(LocationCreated {
        world_id,
        location_id,
        index: location.info.index,
        name: location.info.name,
        created_at_ms,
    });

    transfer::share_object(location);
}

/// Package-internal: saga.move calls this when a saga is created so its ID
/// is tracked on World. Not exposed to PTB.
public(package) fun register_saga(world: &mut World, saga_id: ID, clock: &clock::Clock) {
    vector::push_back(&mut world.state.saga_ids, saga_id);
    event::emit(SagaRegistered {
        world_id: object::id(world),
        saga_id,
        registered_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── tick ────────────────────────────────────────────────────────────

/// Advance global world tick (`WorldState.current_tick`). Admin-only.
public fun advance_tick(admin_cap: &AdminCap, world: &mut World, clock: &clock::Clock) {
    let world_id = object::id(world);
    assert!(admin_cap.world_id == world_id, ENotAdmin);
    world.state.current_tick = world.state.current_tick + 1;
    event::emit(TickAdvanced {
        world_id,
        new_tick: world.state.current_tick,
        advanced_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── time config ─────────────────────────────────────────────────────

/// Update world time config. Admin-only.
/// `days_per_tick_bp` 是 basis-points (1/10000)；6 tick/day = 1670 bp。
/// `tick_interval_ms` 真實 tick 間隔（runner 用；鏈上不執行 cron）。
public fun set_time_config(
    admin_cap: &AdminCap,
    world: &mut World,
    days_per_tick_bp: u64,
    tick_interval_ms: u64,
    clock: &clock::Clock,
) {
    let world_id = object::id(world);
    assert!(admin_cap.world_id == world_id, ENotAdmin);
    assert!(days_per_tick_bp > 0, EInvalidTimeConfig);
    assert!(tick_interval_ms > 0, EInvalidTimeConfig);
    world.time_config.days_per_tick_bp = days_per_tick_bp;
    world.time_config.tick_interval_ms = tick_interval_ms;
    event::emit(TimeConfigUpdated {
        world_id,
        days_per_tick_bp,
        tick_interval_ms,
        updated_at_ms: clock::timestamp_ms(clock),
    });
}

// ─── view: world ─────────────────────────────────────────────────────

public fun current_tick(world: &World): u64 { world.state.current_tick }

public fun world_id(world: &World): ID { object::id(world) }

public fun admin_world_id(admin_cap: &AdminCap): ID { admin_cap.world_id }

public fun days_per_tick_bp(world: &World): u64 { world.time_config.days_per_tick_bp }

public fun tick_interval_ms(world: &World): u64 { world.time_config.tick_interval_ms }

public fun time_config(world: &World): &WorldTimeConfig { &world.time_config }

public fun saga_count(world: &World): u64 { vector::length(&world.state.saga_ids) }

public fun species_count(world: &World): u64 { vector::length(&world.rules.species_kinds) }

public fun attribute_definition_count(world: &World): u64 {
    vector::length(&world.rules.attribute_definitions)
}

public fun is_valid_species(world: &World, species: &String): bool {
    world.rules.species_kinds.contains(species)
}

public fun is_valid_attribute_value(world: &World, key: &String, value: u64): bool {
    let idx = world.rules.attribute_definitions.find_index!(|def| def.key == *key);
    if (idx.is_none()) return false;
    let def = vector::borrow(&world.rules.attribute_definitions, *idx.borrow());
    value >= def.min_value && value <= def.max_value
}

// ─── view: location ──────────────────────────────────────────────────

public fun location_world_id(location: &Location): ID { location.world_id }

public fun location_id(location: &Location): ID { object::id(location) }

public fun location_index(location: &Location): u64 { location.info.index }

/// Two locations are adjacent iff `current.graph` lists `target.info.index`.
/// Caller is responsible for passing two locations from the same World;
/// adjacency itself is a graph-only check.
public fun is_adjacent(current: &Location, target: &Location): bool {
    current.graph.adjacent_indices.contains(&target.info.index)
}

// ─── attribute-definition helpers (shared with saga skill tables) ────

public fun new_attribute_definition(
    key: String,
    label: String,
    min_value: u64,
    max_value: u64,
): AttributeDefinition {
    AttributeDefinition { key, label, min_value, max_value }
}

public fun attribute_definition_key(def: &AttributeDefinition): &String { &def.key }

public fun attribute_definition_label(def: &AttributeDefinition): &String { &def.label }

public fun attribute_definition_min(def: &AttributeDefinition): u64 { def.min_value }

public fun attribute_definition_max(def: &AttributeDefinition): u64 { def.max_value }

/// Validate `value` against an arbitrary list of AttributeDefinitions —
/// used by saga-side skill tables that don't live on World.
public fun is_value_in_definitions(
    defs: &vector<AttributeDefinition>,
    key: &String,
    value: u64,
): bool {
    let n = vector::length(defs);
    let mut i = 0;
    while (i < n) {
        let def = vector::borrow(defs, i);
        if (def.key == *key) {
            return value >= def.min_value && value <= def.max_value
        };
        i = i + 1;
    };
    false
}

/// True iff `key` exists in the definitions list.
public fun is_key_defined(defs: &vector<AttributeDefinition>, key: &String): bool {
    let n = vector::length(defs);
    let mut i = 0;
    while (i < n) {
        if (vector::borrow(defs, i).key == *key) return true;
        i = i + 1;
    };
    false
}

// ─── constructors (used by cli PTB bootstrap) ────────────────────────

public fun new_world_info(name: String, description: String): WorldInfo {
    WorldInfo { name, description }
}

public fun new_currency_display(name: String, symbol: String): CurrencyDisplay {
    CurrencyDisplay { name, symbol }
}

public fun new_world_rules(
    species_kinds: vector<String>,
    attribute_definitions: vector<AttributeDefinition>,
): WorldRules {
    WorldRules { species_kinds, attribute_definitions }
}

public fun new_location_info(
    index: u64,
    name: String,
    description: String,
    terrain: String,
): LocationInfo {
    LocationInfo { index, name, description, terrain }
}

public fun new_position(x: u64, y: u64): Position {
    Position { x, y }
}

public fun new_location_graph(adjacent_indices: vector<u64>): LocationGraph {
    LocationGraph { adjacent_indices }
}

// ─── tests ───────────────────────────────────────────────────────────

#[test]
fun test_new_world_for_testing() {
    let mut ctx = sui::tx_context::dummy();
    let (world, admin_cap) = new_world_for_testing(
        WorldInfo {
            name: std::string::utf8(b"Test World"),
            description: std::string::utf8(b"Testing"),
        },
        CurrencyDisplay {
            name: std::string::utf8(b"Credits"),
            symbol: std::string::utf8(b"CR"),
        },
        WorldRules {
            species_kinds: vector[std::string::utf8(b"human")],
            attribute_definitions: vector[AttributeDefinition {
                key: std::string::utf8(b"will"),
                label: std::string::utf8(b"Will"),
                min_value: 0,
                max_value: 100,
            }],
        },
        7,
        &mut ctx,
    );
    assert!(saga_count(&world) == 0, 10);
    assert!(species_count(&world) == 1, 11);
    assert!(attribute_definition_count(&world) == 1, 12);
    assert!(admin_world_id(&admin_cap) == world_id(&world), 13);
    destroy_world_for_testing(world, admin_cap);
}

#[test]
fun advance_tick_increments_counter() {
    let mut ctx = sui::tx_context::dummy();
    let clock = sui::clock::create_for_testing(&mut ctx);
    let (mut world, admin_cap) = new_world_for_testing(
        WorldInfo {
            name: std::string::utf8(b"T"),
            description: std::string::utf8(b"t"),
        },
        CurrencyDisplay {
            name: std::string::utf8(b"C"),
            symbol: std::string::utf8(b"C"),
        },
        WorldRules {
            species_kinds: vector[std::string::utf8(b"human")],
            attribute_definitions: vector[],
        },
        100,
        &mut ctx,
    );
    assert!(current_tick(&world) == 0, 1);
    advance_tick(&admin_cap, &mut world, &clock);
    assert!(current_tick(&world) == 1, 2);
    advance_tick(&admin_cap, &mut world, &clock);
    assert!(current_tick(&world) == 2, 3);
    destroy_world_for_testing(world, admin_cap);
    clock.destroy_for_testing();
}

#[test_only]
public fun new_world_for_testing(
    info: WorldInfo,
    currency: CurrencyDisplay,
    rules: WorldRules,
    created_at_ms: u64,
    ctx: &mut TxContext,
): (World, AdminCap) {
    let world = World {
        id: object::new(ctx),
        info,
        currency,
        rules,
        state: WorldState {
            current_tick: 0,
            saga_ids: vector[],
            location_ids: vector[],
            created_at_ms,
        },
        time_config: WorldTimeConfig {
            days_per_tick_bp: DEFAULT_DAYS_PER_TICK_BP,
            tick_interval_ms: DEFAULT_TICK_INTERVAL_MS,
        },
    };
    let world_id = object::id(&world);
    let admin_cap = AdminCap { id: object::new(ctx), world_id };
    (world, admin_cap)
}

#[test_only]
public fun destroy_world_for_testing(world: World, admin_cap: AdminCap) {
    let World { id, info: _, currency: _, rules: _, time_config: _, state: _ } = world;
    id.delete();
    let AdminCap { id, world_id: _ } = admin_cap;
    id.delete();
}

#[test_only]
public fun destroy_location_for_testing(location: Location) {
    let Location { id, world_id: _, info: _, position: _, graph: _, created_at_ms: _ } = location;
    id.delete();
}
