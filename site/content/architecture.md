# Architecture

Endless Story has three layers. Each layer owns a different kind of truth.

## Protocol

The protocol records facts and permissions. Move contracts define World, Saga, Scene, Character, Event, Commitment, Resource, subscriptions, and capability objects.

The chain does not store long prose or private memory. It stores the shared state and verifiable pointers needed to agree on what happened.

- [On-chain protocol](#/protocol)
- [Memory and storage](#/memory)

## Narrative engine

The narrative layer turns shared facts into character experience. A tick assembles what each character can perceive, recalls relevant memory, updates plans, chooses actions, resolves events, and publishes several views of the result.

The Director manages the conditions of the story. Character agents retain authority over their own choices.

- [Narrative engine](#/narrative)

## Participation and economy

People enter the system as character owners, Saga operators, subscribers, readers, or collectors. Capability objects keep those roles distinct. Economic pressure decides which characters can remain active and which relationships become materially important.

The economic model is validated, but the current product still settles it in an off-chain shadow. The public docs state that limitation instead of presenting simulated balances as durable on-chain funds.

- [Character economy](#/economy)
- [Roadmap](#/roadmap)

## Research

The formulas and deterministic harnesses live outside the LLM boundary. They test invariants, failure modes, and causal claims before the results are used as product claims.

- [Mechanism whitepaper](#/whitepaper)

---

The architecture follows one rule throughout: objective history may be shared, but no other actor is allowed to decide what a character privately believes or chooses.
