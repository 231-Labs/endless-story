#[allow(unused_field)]
module endless_story::event {
    use std::string::String;
    use sui::clock;
    use sui::event::{Self as event_bus};
    use sui::random::{Self, Random, RandomGenerator};

    use endless_story::saga::{Self, Saga, StorytellerCap};
    use endless_story::scene::{Self, Scene};
    use endless_story::character::{Self, Character, DeathRecord};
    use endless_story::resource::{Self, DramaResource, Transfer};

    const STATUS_OPEN: u8 = 0;
    const STATUS_RESOLVED: u8 = 1;

    const TAG_OP_KIND_ADD: u8 = 0;
    const TAG_OP_KIND_REMOVE: u8 = 1;

    /// Card intent taxonomy (L1 §5.2). Move only sees the coarse class —
    /// `KILL` is structurally load-bearing because `DeathRecord.attributed`
    /// invariants reference it. Other intents are narrative coloring.
    const INTENT_KILL: u8 = 0;
    // 1=ATTACK, 2=DEFEND, 3=HEAL, 4=SOCIAL, 5=FLEE,
    // 6=WITNESS, 7=INTIMATE, 8=CUSTOM (not enforced on-chain)

    const EEventNotOpen: u64 = 1;
    const ENotParticipant: u64 = 2;
    const EInvalidCardIndex: u64 = 3;
    const ESceneMismatch: u64 = 4;
    const EEventNotResolved: u64 = 5;
    const ETagOpIndexOutOfRange: u64 = 6;
    const ETagOpCharacterMismatch: u64 = 7;
    const EUnknownTagOpKind: u64 = 8;
    const EDeathVictimNotParticipant: u64 = 9;
    const EDeathAttributedNotParticipant: u64 = 10;
    const EDeathAttributedDidNotKill: u64 = 11;
    const EDeathIndexOutOfRange: u64 = 12;
    const EDeathCharacterMismatch: u64 = 13;
    const ECurrencyTransferFromNotParticipant: u64 = 14;
    const ECurrencyTransferToNotParticipant: u64 = 15;
    const EAlreadyParticipant: u64 = 16;
    const EJoinerNotInSaga: u64 = 17;
    const EJoinerNotInScene: u64 = 18;
    const EJoinerDead: u64 = 19;
    const ECatalogEmpty: u64 = 20;
    const EInvalidHandSize: u64 = 21;
    const EHandSizeExceedsCatalog: u64 = 22;
    const ECardNotInHand: u64 = 23;
    const EResourceTransferFromNotParticipant: u64 = 24;
    const EResourceTransferToNotParticipant: u64 = 25;

    public struct CardTemplate has copy, drop, store {
        id: u16,
        intent: u8,
        label: String,
        payload: vector<u8>,
    }

    public struct SubmittedAction has copy, drop, store {
        character_id: ID,
        card_index: u64,
        submitted_at_ms: u64,
    }

    public struct CurrencyTransfer has copy, drop, store {
        from_character_id: ID,
        to_character_id: ID,
        amount: u64,
    }

    public struct SignedDelta has copy, drop, store {
        magnitude: u64,
        negative: bool,
    }

    public struct SceneParamDelta has copy, drop, store {
        scene_id: ID,
        atmosphere_delta: SignedDelta,
        danger_delta: SignedDelta,
        prosperity_delta: SignedDelta,
    }

    public struct TagOp has copy, drop, store {
        character_id: ID,
        kind: u8,
        label: String,
    }

    /// Drama-engine supply-side outcome: a reallocation of a contested resource. `resource_id`
    /// names the on-chain DramaResource; (from?, to, amount) is one unit-of-work. Holders are
    /// Character IDs that MUST be event participants (re-validated at resolve time). The actual
    /// ledger mutation + conservation re-check happens in `apply_resource_transfers` against the
    /// shared DramaResource object (one mut ref per call, mirroring the apply_death pattern).
    public struct ResourceTransferOp has copy, drop, store {
        resource_id: ID,
        from: Option<ID>,
        to: ID,
        amount: u64,
    }

    public struct EventOutcomes has copy, drop, store {
        currency_transfers: vector<CurrencyTransfer>,
        scene_deltas: vector<SceneParamDelta>,
        tag_ops: vector<TagOp>,
        commitment_ids: vector<ID>,
        deaths: vector<DeathRecord>,
        resource_transfers: vector<ResourceTransferOp>,
    }

    public struct EventMeta has copy, drop, store {
        saga_id: ID,
        scene_id: ID,
        title: String,
        summary: String,
        scale: u8,
        status: u8,
        created_at_ms: u64,
        resolved_at_ms: u64,
    }

    public struct EventDeck has copy, drop, store {
        participants: vector<ID>,
        catalog: vector<CardTemplate>,
        /// Hand size policy fixed at `push_event` time; every
        /// `deal_participant_hand` call draws this many indices.
        hand_size: u64,
        /// Per-participant hand: indices into `catalog`. `hands[i]` is the
        /// hand dealt to `participants[i]`. Length == hand_size, drawn
        /// without replacement when the participant is dealt in via
        /// `deal_participant_hand`. Visible on chain so owners can audit
        /// fairness (with or without saga card-weight rules).
        hands: vector<vector<u64>>,
    }

    public struct EventResolution has copy, drop, store {
        submitted_actions: vector<SubmittedAction>,
        outcomes: EventOutcomes,
    }

    public struct BudgetEvent has key {
        id: UID,
        meta: EventMeta,
        deck: EventDeck,
        resolution: EventResolution,
    }

    public struct BudgetEventPushed has copy, drop {
        event_id: ID,
        saga_id: ID,
        scene_id: ID,
        participant_count: u64,
        card_count: u64,
        created_at_ms: u64,
    }

    public struct EventActionSubmitted has copy, drop {
        event_id: ID,
        character_id: ID,
        card_index: u64,
        submitted_at_ms: u64,
    }

    public struct BudgetEventResolved has copy, drop {
        event_id: ID,
        resolved_at_ms: u64,
    }

    public struct CharacterJoinedEvent has copy, drop {
        event_id: ID,
        character_id: ID,
        joined_at_ms: u64,
    }

    /// Storyteller creates a new OPEN event with a fixed catalog and
    /// hand-size policy. Participants are NOT taken here — they're added
    /// one-by-one via `deal_participant_hand`, which draws each char's
    /// hand using on-chain RNG and (optionally) the saga's card-weight
    /// rules. This split exists because Move can't express
    /// `vector<&Character>`, so per-char attribute lookup for weighted
    /// draws has to happen in a function that receives one `&Character`
    /// at a time.
    public fun push_event(
        cap: &StorytellerCap,
        saga: &Saga,
        scene_id: ID,
        title: String,
        summary: String,
        scale: u8,
        catalog: vector<CardTemplate>,
        hand_size: u64,
        clock: &clock::Clock,
        ctx: &mut TxContext,
    ) {
        saga::assert_cap(cap, saga);
        let n_catalog = vector::length(&catalog);
        assert!(n_catalog > 0, ECatalogEmpty);
        assert!(hand_size > 0, EInvalidHandSize);
        assert!(hand_size <= n_catalog, EHandSizeExceedsCatalog);

        let created_at_ms = clock::timestamp_ms(clock);
        let saga_id = saga::saga_id(saga);
        let budget_event = BudgetEvent {
            id: object::new(ctx),
            meta: EventMeta {
                saga_id,
                scene_id,
                title,
                summary,
                scale,
                status: STATUS_OPEN,
                created_at_ms,
                resolved_at_ms: 0,
            },
            deck: EventDeck {
                participants: vector::empty<ID>(),
                catalog,
                hand_size,
                hands: vector::empty<vector<u64>>(),
            },
            resolution: EventResolution {
                submitted_actions: vector::empty<SubmittedAction>(),
                outcomes: empty_outcomes(),
            },
        };
        let event_id = object::id(&budget_event);

        event_bus::emit(BudgetEventPushed {
            event_id,
            saga_id,
            scene_id,
            participant_count: 0,
            card_count: n_catalog,
            created_at_ms,
        });

        transfer::share_object(budget_event);
    }

    /// Add a character to an OPEN event and deal them a fresh hand of
    /// `event.deck.hand_size` cards from the catalog. Used both for
    /// initial participants (after `push_event` creates the empty
    /// event) and for mid-event joiners. `entry` so the randomness path
    /// is non-composable per Sui best practice.
    ///
    /// If the saga has card-weight rules (via `enable_card_weighting` +
    /// `set_card_weight_rule`), each card's draw weight is biased by
    /// the participant's matching world attributes:
    ///   weight = 100 + Σ matching_rule.bonus_per_point × char_attr_value
    /// When no rules are configured (default), draws are uniform —
    /// identical to the R3.1a behavior, so this refactor is
    /// behaviorally backwards-compatible.
    entry fun deal_participant_hand(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &mut BudgetEvent,
        character: &Character,
        r: &Random,
        clock: &clock::Clock,
        ctx: &mut TxContext,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_OPEN, EEventNotOpen);
        assert!(
            character::saga_id(character).contains(&saga::saga_id(saga)),
            EJoinerNotInSaga,
        );
        assert!(
            character::current_scene_id(character).contains(&budget_event.meta.scene_id),
            EJoinerNotInScene,
        );
        assert!(!character::is_dead(character), EJoinerDead);
        let character_id = character::character_id(character);
        assert!(
            !budget_event.deck.participants.contains(&character_id),
            EAlreadyParticipant,
        );

        let rules = saga::card_weight_rules(saga);
        // Attribute lookup chain (R3.3): world attrs first, then saga
        // skills DOF for this saga. compute_card_weights walks both.
        let saga_skills =
            character::character_skills_for_saga(character, saga::saga_id(saga));
        let mut generator = random::new_generator(r, ctx);
        let hand = draw_weighted_hand(
            &mut generator,
            &budget_event.deck.catalog,
            budget_event.deck.hand_size,
            &rules,
            character::attributes(character),
            &saga_skills,
        );

        vector::push_back(&mut budget_event.deck.participants, character_id);
        vector::push_back(&mut budget_event.deck.hands, hand);

        event_bus::emit(CharacterJoinedEvent {
            event_id: object::id(budget_event),
            character_id,
            joined_at_ms: clock::timestamp_ms(clock),
        });
    }

    /// Compute per-card weights for a single participant by walking the
    /// rule list. Cards whose intent matches no rule keep base weight.
    /// Attribute lookup chain (R3.3): world attrs first, then saga
    /// skills (the per-saga DOF) — first hit wins.
    fun compute_card_weights(
        catalog: &vector<CardTemplate>,
        rules: &vector<saga::CardIntentWeight>,
        char_attrs: &vector<character::AttributeValue>,
        saga_skills: &vector<character::AttributeValue>,
    ): vector<u64> {
        let n = vector::length(catalog);
        let mut weights = vector::empty<u64>();
        let mut i = 0;
        while (i < n) {
            let card = vector::borrow(catalog, i);
            let mut w: u64 = 100;
            let m = vector::length(rules);
            let mut k = 0;
            while (k < m) {
                let rule = vector::borrow(rules, k);
                if (saga::card_weight_intent(rule) == card.intent) {
                    let key = saga::card_weight_attribute_key(rule);
                    // World attrs first, then saga skills.
                    // New-repo helper for raw-vector lookup is
                    // `find_attribute_value_in` (the `_in` suffix);
                    // `find_attribute_value` (no suffix) takes &Character.
                    let mut val_opt = character::find_attribute_value_in(char_attrs, key);
                    if (option::is_none(&val_opt)) {
                        val_opt = character::find_attribute_value_in(saga_skills, key);
                    };
                    if (option::is_some(&val_opt)) {
                        let attr_val = *option::borrow(&val_opt);
                        let bonus = saga::card_weight_bonus_per_point(rule) as u64;
                        w = w + attr_val * bonus;
                    };
                };
                k = k + 1;
            };
            vector::push_back(&mut weights, w);
            i = i + 1;
        };
        weights
    }

    /// Weighted-without-replacement draw of `hand_size` indices. Each
    /// pick rolls a u64 in [0, total_weight), walks the cumulative sum,
    /// then zeroes that index's weight and repeats. O(hand_size × n)
    /// — fine for the catalog sizes we deal with (<32). Equivalent to
    /// uniform draw when all weights are equal (the default).
    fun draw_weighted_hand(
        generator: &mut RandomGenerator,
        catalog: &vector<CardTemplate>,
        hand_size: u64,
        rules: &vector<saga::CardIntentWeight>,
        char_attrs: &vector<character::AttributeValue>,
        saga_skills: &vector<character::AttributeValue>,
    ): vector<u64> {
        let n_catalog = vector::length(catalog);
        assert!(n_catalog > 0, ECatalogEmpty);
        assert!(hand_size > 0, EInvalidHandSize);
        assert!(hand_size <= n_catalog, EHandSizeExceedsCatalog);

        let mut weights = compute_card_weights(catalog, rules, char_attrs, saga_skills);
        let mut hand = vector::empty<u64>();
        let mut drawn = 0;
        while (drawn < hand_size) {
            let mut total: u64 = 0;
            let mut t = 0;
            while (t < n_catalog) {
                total = total + *vector::borrow(&weights, t);
                t = t + 1;
            };
            // total is guaranteed > 0: we only zero out cards we picked,
            // and remaining cards always retain at least their base weight (100).
            let roll = random::generate_u64_in_range(generator, 0, total);
            let mut cumulative: u64 = 0;
            let mut picked = 0;
            let mut j = 0;
            while (j < n_catalog) {
                cumulative = cumulative + *vector::borrow(&weights, j);
                if (roll < cumulative) {
                    picked = j;
                    break
                };
                j = j + 1;
            };
            vector::push_back(&mut hand, picked);
            *vector::borrow_mut(&mut weights, picked) = 0;
            drawn = drawn + 1;
        };
        hand
    }

    public fun participant_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.deck.participants)
    }

    public fun has_participant(budget_event: &BudgetEvent, character_id: ID): bool {
        budget_event.deck.participants.contains(&character_id)
    }

    public fun submit_action(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &mut BudgetEvent,
        character_id: ID,
        card_index: u64,
        clock: &clock::Clock,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_OPEN, EEventNotOpen);
        let pos_opt = budget_event.deck.participants.find_index!(|id| *id == character_id);
        assert!(pos_opt.is_some(), ENotParticipant);
        let pos = *pos_opt.borrow();
        assert!(card_index < vector::length(&budget_event.deck.catalog), EInvalidCardIndex);
        let hand = vector::borrow(&budget_event.deck.hands, pos);
        assert!(hand.contains(&card_index), ECardNotInHand);

        let submitted_at_ms = clock::timestamp_ms(clock);
        vector::push_back(&mut budget_event.resolution.submitted_actions, SubmittedAction {
            character_id,
            card_index,
            submitted_at_ms,
        });

        event_bus::emit(EventActionSubmitted {
            event_id: object::id(budget_event),
            character_id,
            card_index,
            submitted_at_ms,
        });
    }

    public fun resolve_event(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &mut BudgetEvent,
        scene: &mut Scene,
        outcomes: EventOutcomes,
        clock: &clock::Clock,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_OPEN, EEventNotOpen);
        assert!(scene::scene_id(scene) == budget_event.meta.scene_id, ESceneMismatch);

        let event_scene_id = budget_event.meta.scene_id;

        // Apply scene_deltas (only this scene, mutable available).
        let mut i = 0;
        let n = vector::length(&outcomes.scene_deltas);
        while (i < n) {
            let SceneParamDelta {
                scene_id: delta_scene_id,
                atmosphere_delta,
                danger_delta,
                prosperity_delta,
            } = *vector::borrow(&outcomes.scene_deltas, i);
            assert!(delta_scene_id == event_scene_id, ESceneMismatch);
            scene::apply_params_delta(
                scene,
                atmosphere_delta.magnitude,
                atmosphere_delta.negative,
                danger_delta.magnitude,
                danger_delta.negative,
                prosperity_delta.magnitude,
                prosperity_delta.negative,
            );
            i = i + 1;
        };

        // Validate death invariants now (composer-side correctness): victim
        // and each attributed must be participants; each attributed must
        // have submitted a KILL-intent card. The actual `character.death`
        // mutation happens in `apply_death` (one Character mut ref per call).
        let mut i = 0;
        let n = vector::length(&outcomes.deaths);
        while (i < n) {
            let record = vector::borrow(&outcomes.deaths, i);
            let victim = character::death_victim(record);
            assert!(
                budget_event.deck.participants.contains(&victim),
                EDeathVictimNotParticipant,
            );
            let attributed = character::death_attributed(record);
            let mut j = 0;
            let m = vector::length(attributed);
            while (j < m) {
                let attrib = *vector::borrow(attributed, j);
                assert!(
                    budget_event.deck.participants.contains(&attrib),
                    EDeathAttributedNotParticipant,
                );
                assert!(
                    attributed_played_kill(
                        &budget_event.resolution.submitted_actions,
                        &budget_event.deck.catalog,
                        attrib,
                    ),
                    EDeathAttributedDidNotKill,
                );
                j = j + 1;
            };
            i = i + 1;
        };

        // Validate currency_transfers: from/to must be event participants.
        // Actual balance movement is deferred (per-character treasury
        // primitives land with subscribe_pay/claim_revenue in a later
        // round); transfers stay as narrative-attributed metadata for now.
        let mut i = 0;
        let n = vector::length(&outcomes.currency_transfers);
        while (i < n) {
            let xfer = vector::borrow(&outcomes.currency_transfers, i);
            assert!(
                budget_event.deck.participants.contains(&xfer.from_character_id),
                ECurrencyTransferFromNotParticipant,
            );
            assert!(
                budget_event.deck.participants.contains(&xfer.to_character_id),
                ECurrencyTransferToNotParticipant,
            );
            i = i + 1;
        };

        // Validate resource_transfers: every holder (from?, to) must be an event participant.
        // The ledger MUTATION (+ conservation re-check) is applied separately, per resource,
        // in `apply_resource_transfers` — one DramaResource mut ref per call, mirroring how
        // `apply_death` defers the Character mutation. Here we only validate participant scope;
        // resolve_event takes no DramaResource ref so a multi-resource event stays composable.
        let mut i = 0;
        let n = vector::length(&outcomes.resource_transfers);
        while (i < n) {
            let op = vector::borrow(&outcomes.resource_transfers, i);
            if (option::is_some(&op.from)) {
                assert!(
                    budget_event.deck.participants.contains(option::borrow(&op.from)),
                    EResourceTransferFromNotParticipant,
                );
            };
            assert!(
                budget_event.deck.participants.contains(&op.to),
                EResourceTransferToNotParticipant,
            );
            i = i + 1;
        };

        let resolved_at_ms = clock::timestamp_ms(clock);
        budget_event.meta.status = STATUS_RESOLVED;
        budget_event.meta.resolved_at_ms = resolved_at_ms;
        budget_event.resolution.outcomes = outcomes;

        event_bus::emit(BudgetEventResolved {
            event_id: object::id(budget_event),
            resolved_at_ms,
        });
    }

    fun attributed_played_kill(
        actions: &vector<SubmittedAction>,
        catalog: &vector<CardTemplate>,
        attrib: ID,
    ): bool {
        let mut k = 0;
        let p = vector::length(actions);
        while (k < p) {
            let action = vector::borrow(actions, k);
            if (action.character_id == attrib) {
                let card = vector::borrow(catalog, action.card_index);
                if (card.intent == INTENT_KILL) {
                    return true
                };
            };
            k = k + 1;
        };
        false
    }

    /// Apply one DeathRecord to the targeted Character. Storyteller calls
    /// this once per (event, death_index) triple after `resolve_event` has
    /// flipped the event to RESOLVED. Idempotent: re-applying to an
    /// already-dead character is a no-op (handled by `character::mark_dead`).
    public fun apply_death(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &BudgetEvent,
        character: &mut Character,
        death_index: u64,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_RESOLVED, EEventNotResolved);
        assert!(
            death_index < vector::length(&budget_event.resolution.outcomes.deaths),
            EDeathIndexOutOfRange,
        );
        let record = *vector::borrow(&budget_event.resolution.outcomes.deaths, death_index);
        assert!(
            character::death_victim(&record) == character::character_id(character),
            EDeathCharacterMismatch,
        );
        character::mark_dead(character, record);
    }

    /// Apply this resolved event's resource transfers FOR ONE DramaResource. Storyteller calls
    /// it once per (event, resource) after `resolve_event`. We gather every op naming this
    /// resource — in recorded (canonical) order — into a batch and hand it to
    /// `resource::apply_transfers`, which re-validates conservation and applies atomically
    /// (any violation aborts the whole tx → no partial state, the TS RESOURCE-PHASE mirror).
    ///
    /// Multi-resource events: call once per resource; each call is its own atomic batch. The
    /// `resource_id` on each op guards against passing the wrong DramaResource object.
    public fun apply_resource_transfers(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &BudgetEvent,
        drama_resource: &mut DramaResource,
        clock: &clock::Clock,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_RESOLVED, EEventNotResolved);
        let rid = object::id(drama_resource);
        let ops = &budget_event.resolution.outcomes.resource_transfers;
        let mut batch = vector::empty<Transfer>();
        let mut i = 0;
        let n = vector::length(ops);
        while (i < n) {
            let op = vector::borrow(ops, i);
            if (op.resource_id == rid) {
                if (option::is_some(&op.from)) {
                    vector::push_back(&mut batch, resource::reallocate(*option::borrow(&op.from), op.to, op.amount));
                } else {
                    vector::push_back(&mut batch, resource::acquire(op.to, op.amount));
                };
            };
            i = i + 1;
        };
        // apply the gathered batch atomically (conservation re-checked inside)
        resource::apply_transfers(cap, saga, drama_resource, batch, clock);
    }

    /// Apply one TagOp recorded in a resolved BudgetEvent to the targeted Character.
    /// Storyteller calls this once per (event, op_index, character) triple; per L1 v0.3
    /// §6.6 Move does not enforce semantic uniqueness, but apply_tag is idempotent
    /// on duplicate label and revoke_tag is idempotent on missing label.
    public fun apply_tag_op(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &BudgetEvent,
        character: &mut Character,
        op_index: u64,
        clock: &clock::Clock,
    ) {
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_RESOLVED, EEventNotResolved);
        assert!(
            op_index < vector::length(&budget_event.resolution.outcomes.tag_ops),
            ETagOpIndexOutOfRange,
        );

        let TagOp { character_id, kind, label } =
            *vector::borrow(&budget_event.resolution.outcomes.tag_ops, op_index);
        assert!(character_id == character::character_id(character), ETagOpCharacterMismatch);

        if (kind == TAG_OP_KIND_ADD) {
            character::apply_tag(
                character,
                &label,
                option::some(object::id(budget_event)),
                clock::timestamp_ms(clock),
            );
        } else if (kind == TAG_OP_KIND_REMOVE) {
            character::revoke_tag(character, &label);
        } else {
            abort EUnknownTagOpKind
        }
    }

    public fun empty_outcomes(): EventOutcomes {
        EventOutcomes {
            currency_transfers: vector::empty<CurrencyTransfer>(),
            scene_deltas: vector::empty<SceneParamDelta>(),
            tag_ops: vector::empty<TagOp>(),
            commitment_ids: vector::empty<ID>(),
            deaths: vector::empty<DeathRecord>(),
            resource_transfers: vector::empty<ResourceTransferOp>(),
        }
    }

    /// Production constructor for a resource-transfer op (the SDK builds these for resolve).
    public fun new_resource_transfer_op(
        resource_id: ID,
        from: Option<ID>,
        to: ID,
        amount: u64,
    ): ResourceTransferOp {
        ResourceTransferOp { resource_id, from, to, amount }
    }

    /// Build outcomes that carry ONLY resource transfers (the common drama path); other
    /// dimensions empty. Keeps the SDK/test call sites terse.
    public fun outcomes_with_resource_transfers(
        resource_transfers: vector<ResourceTransferOp>,
    ): EventOutcomes {
        EventOutcomes {
            currency_transfers: vector::empty<CurrencyTransfer>(),
            scene_deltas: vector::empty<SceneParamDelta>(),
            tag_ops: vector::empty<TagOp>(),
            commitment_ids: vector::empty<ID>(),
            deaths: vector::empty<DeathRecord>(),
            resource_transfers,
        }
    }

    /// Production constructor for one public identity/status tag operation.
    /// The operation is recorded in `BudgetEvent.resolution.outcomes`, then
    /// applied to the target `Character` via `apply_tag_op` after resolution.
    public fun new_tag_op(character_id: ID, kind: u8, label: String): TagOp {
        TagOp { character_id, kind, label }
    }

    /// Build outcomes that carry ONLY tag operations. This is the public
    /// identity path: the event log says when a social label such as
    /// `role:小生` or `status:二太太` became externally affirmed.
    public fun outcomes_with_tag_ops(tag_ops: vector<TagOp>): EventOutcomes {
        EventOutcomes {
            currency_transfers: vector::empty<CurrencyTransfer>(),
            scene_deltas: vector::empty<SceneParamDelta>(),
            tag_ops,
            commitment_ids: vector::empty<ID>(),
            deaths: vector::empty<DeathRecord>(),
            resource_transfers: vector::empty<ResourceTransferOp>(),
        }
    }

    public fun resource_transfer_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.resource_transfers)
    }

    public fun death_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.deaths)
    }

    public fun event_id(budget_event: &BudgetEvent): ID {
        object::id(budget_event)
    }

    public fun status(budget_event: &BudgetEvent): u8 {
        budget_event.meta.status
    }

    public fun submitted_action_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.submitted_actions)
    }

    public fun scene_delta_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.scene_deltas)
    }

    public fun tag_op_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.tag_ops)
    }

    public fun commitment_id_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.commitment_ids)
    }

    public fun currency_transfer_count(budget_event: &BudgetEvent): u64 {
        vector::length(&budget_event.resolution.outcomes.currency_transfers)
    }

    public fun tag_op_kind_add(): u8 { TAG_OP_KIND_ADD }
    public fun tag_op_kind_remove(): u8 { TAG_OP_KIND_REMOVE }

    /// Production constructor for `CardTemplate`. Needed because off-chain
    /// storytellers (Skill API / runner orchestrator) build the catalog
    /// for `push_event` and Move's pure-arg rules forbid passing a
    /// struct vector directly via BCS-encoded bytes (`vector<CardTemplate>`
    /// is not a pure type). With this constructor, callers do
    /// `tx.makeMoveVec({ type: …::CardTemplate, elements: cards.map(c =>
    /// tx.moveCall(new_card_template(...))) })`.
    public fun new_card_template(
        id: u16,
        intent: u8,
        label: String,
        payload: vector<u8>,
    ): CardTemplate {
        CardTemplate { id, intent, label, payload }
    }

    #[test_only]
    public fun new_card_template_for_testing(
        id: u16,
        intent: u8,
        label: String,
        payload: vector<u8>,
    ): CardTemplate {
        CardTemplate { id, intent, label, payload }
    }

    #[test_only]
    public fun new_currency_transfer_for_testing(
        from_character_id: ID,
        to_character_id: ID,
        amount: u64,
    ): CurrencyTransfer {
        CurrencyTransfer { from_character_id, to_character_id, amount }
    }

    #[test_only]
    public fun new_signed_delta_for_testing(magnitude: u64, negative: bool): SignedDelta {
        SignedDelta { magnitude, negative }
    }

    #[test_only]
    public fun new_scene_param_delta_for_testing(
        scene_id: ID,
        atmosphere_delta: SignedDelta,
        danger_delta: SignedDelta,
        prosperity_delta: SignedDelta,
    ): SceneParamDelta {
        SceneParamDelta { scene_id, atmosphere_delta, danger_delta, prosperity_delta }
    }

    #[test_only]
    public fun new_tag_op_for_testing(character_id: ID, kind: u8, label: String): TagOp {
        TagOp { character_id, kind, label }
    }

    #[test_only]
    public fun new_event_outcomes_for_testing(
        currency_transfers: vector<CurrencyTransfer>,
        scene_deltas: vector<SceneParamDelta>,
        tag_ops: vector<TagOp>,
        commitment_ids: vector<ID>,
        deaths: vector<DeathRecord>,
    ): EventOutcomes {
        EventOutcomes {
            currency_transfers, scene_deltas, tag_ops, commitment_ids, deaths,
            resource_transfers: vector::empty<ResourceTransferOp>(),
        }
    }

    #[test_only]
    public fun intent_kill_for_testing(): u8 { INTENT_KILL }

    /// Test helper that mirrors push_event but takes pre-computed hands
    /// directly — sidesteps Sui Random for unit tests. Default hand
    /// pattern: each participant gets [0, 1, ..., hand_size-1] (the
    /// first `hand_size` catalog indices).
    #[test_only]
    public fun new_event_for_testing(
        cap: &StorytellerCap,
        saga: &Saga,
        scene_id: ID,
        title: String,
        summary: String,
        scale: u8,
        participants: vector<ID>,
        catalog: vector<CardTemplate>,
        hand_size: u64,
        created_at_ms: u64,
        ctx: &mut TxContext,
    ): BudgetEvent {
        saga::assert_cap(cap, saga);
        let n_participants = vector::length(&participants);
        let n_catalog = vector::length(&catalog);
        assert!(hand_size <= n_catalog, EHandSizeExceedsCatalog);
        let mut hands = vector::empty<vector<u64>>();
        let mut i = 0;
        while (i < n_participants) {
            let mut hand = vector::empty<u64>();
            let mut j = 0;
            while (j < hand_size) {
                vector::push_back(&mut hand, j);
                j = j + 1;
            };
            vector::push_back(&mut hands, hand);
            i = i + 1;
        };
        BudgetEvent {
            id: object::new(ctx),
            meta: EventMeta {
                saga_id: saga::saga_id(saga),
                scene_id,
                title,
                summary,
                scale,
                status: STATUS_OPEN,
                created_at_ms,
                resolved_at_ms: 0,
            },
            deck: EventDeck { participants, catalog, hand_size, hands },
            resolution: EventResolution {
                submitted_actions: vector::empty<SubmittedAction>(),
                outcomes: empty_outcomes(),
            },
        }
    }

    #[test_only]
    public fun hand_for_testing(budget_event: &BudgetEvent, participant_pos: u64): &vector<u64> {
        vector::borrow(&budget_event.deck.hands, participant_pos)
    }

    /// Test variant of `deal_participant_hand` with a deterministic hand
    /// `[0..hand_size)` instead of a real RNG draw. Same invariants.
    #[test_only]
    public fun deal_participant_hand_for_testing(
        cap: &StorytellerCap,
        saga: &Saga,
        budget_event: &mut BudgetEvent,
        character: &Character,
        clock: &clock::Clock,
    ) {
        let hand_size = budget_event.deck.hand_size;
        saga::assert_cap(cap, saga);
        assert!(budget_event.meta.status == STATUS_OPEN, EEventNotOpen);
        assert!(
            character::saga_id(character).contains(&saga::saga_id(saga)),
            EJoinerNotInSaga,
        );
        assert!(
            character::current_scene_id(character).contains(&budget_event.meta.scene_id),
            EJoinerNotInScene,
        );
        assert!(!character::is_dead(character), EJoinerDead);
        let character_id = character::character_id(character);
        assert!(
            !budget_event.deck.participants.contains(&character_id),
            EAlreadyParticipant,
        );
        let n_catalog = vector::length(&budget_event.deck.catalog);
        assert!(n_catalog > 0, ECatalogEmpty);
        assert!(hand_size > 0, EInvalidHandSize);
        assert!(hand_size <= n_catalog, EHandSizeExceedsCatalog);
        let mut hand = vector::empty<u64>();
        let mut j = 0;
        while (j < hand_size) {
            vector::push_back(&mut hand, j);
            j = j + 1;
        };
        vector::push_back(&mut budget_event.deck.participants, character_id);
        vector::push_back(&mut budget_event.deck.hands, hand);
        event_bus::emit(CharacterJoinedEvent {
            event_id: object::id(budget_event),
            character_id,
            joined_at_ms: clock::timestamp_ms(clock),
        });
    }

    #[test_only]
    public fun status_open_for_testing(): u8 {
        STATUS_OPEN
    }

    #[test_only]
    public fun status_resolved_for_testing(): u8 {
        STATUS_RESOLVED
    }

    #[test_only]
    public fun destroy_event_for_testing(budget_event: BudgetEvent) {
        let BudgetEvent { id, meta: _, deck: _, resolution: _ } = budget_event;
        id.delete();
    }

    #[test]
    fun test_empty_outcomes() {
        let outcomes = empty_outcomes();
        assert!(vector::length(&outcomes.currency_transfers) == 0, 10);
        assert!(vector::length(&outcomes.scene_deltas) == 0, 11);
        assert!(vector::length(&outcomes.tag_ops) == 0, 12);
        assert!(vector::length(&outcomes.commitment_ids) == 0, 13);
    }

    #[test]
    fun new_card_template_round_trips_fields() {
        let card = new_card_template(7, INTENT_KILL, b"strike".to_string(), b"payload");
        assert!(card.id == 7, 20);
        assert!(card.intent == INTENT_KILL, 21);
        assert!(card.label == b"strike".to_string(), 22);
        assert!(card.payload == b"payload", 23);
    }

    #[test]
    fun new_tag_op_and_outcomes_with_tag_ops_round_trips_fields() {
        let character_id = object::id_from_address(@0xBEEF);
        let op = new_tag_op(character_id, TAG_OP_KIND_ADD, b"role:小生".to_string());
        assert!(op.character_id == character_id, 24);
        assert!(op.kind == TAG_OP_KIND_ADD, 25);
        assert!(op.label == b"role:小生".to_string(), 26);

        let outcomes = outcomes_with_tag_ops(vector[op]);
        assert!(vector::length(&outcomes.tag_ops) == 1, 27);
        assert!(vector::length(&outcomes.resource_transfers) == 0, 28);
        let recorded = vector::borrow(&outcomes.tag_ops, 0);
        assert!(recorded.character_id == character_id, 29);
        assert!(recorded.label == b"role:小生".to_string(), 30);
    }

    #[test]
    fun tag_op_kind_constants_are_distinct() {
        // Sanity guard: if anyone touches the constants, this catches it.
        assert!(tag_op_kind_add() == 0, 30);
        assert!(tag_op_kind_remove() == 1, 31);
        assert!(tag_op_kind_add() != tag_op_kind_remove(), 32);
    }

    #[test]
    fun status_constants_are_distinct() {
        assert!(status_open_for_testing() == 0, 40);
        assert!(status_resolved_for_testing() == 1, 41);
        assert!(status_open_for_testing() != status_resolved_for_testing(), 42);
    }

    #[test]
    fun intent_kill_is_load_bearing_constant() {
        // KILL is the only intent Move enforces (DeathRecord invariants
        // reference it). If this value changes, death attribution breaks.
        assert!(intent_kill_for_testing() == 0, 50);
    }
}
