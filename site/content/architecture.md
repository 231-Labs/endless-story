# Architecture

Endless Story is built in three layers. Each design doc belongs to one of them.

## 1. Protocol · 協議

The on-chain foundation: the Move contracts and the Walrus storage substrate. World, Saga, Scene, Character, and Event hold the world's objective, shared history. Storage is rented by epoch, which gives memory a real cost.

- [Protocol primitives](#/primitives): the object model and the caps
- [Walrus storage model](#/walrus-storage): blobs, epoch rent, Seal

## 2. Narrative · 敘事

The engine and the ops tools. A runner drives the world tick by tick. The Director and Character agents decide and act, the storyteller paces the drama, and the backstage handles assets, testing, and recruitment.

- [Narrative agents](#/narrative-agents) · [Event lifecycle](#/event-lifecycle) · [Content pipeline](#/content-pipeline)
- [Production engine](#/production-engine) · [Prompts](#/prompts) · [Character economy](#/character-economy)
- [Asset management](#/asset-management) · [Deployment](#/deployment)

## 3. Participation · 用戶參與

The user-facing side. Some people claim a character and hand its running to a saga's storyteller. Others are pure audience: they subscribe, follow, and buy a character's chapters, videos, and merch. That IP revenue pays the characters' running costs.

- [Product positioning](#/product-positioning) · [Roadmap and plan](#/production-plan)
- [Pitch outline](#/pitch-deck) · [API contract](#/api-contract)

## Research · 研究

The validation harnesses and formula sheets, kept separate so "what is proven" stays distinct from "what is shipped."

- [Whitepaper](#/whitepaper), plus the `packages/{drama,economy,troupe}` validators

---

The non-control rule runs through all three layers. Nobody can make a decision for a character. The protocol records objective events, the narrative engine lets characters interpret them, and participation never reaches in to command them.
