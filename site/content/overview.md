# Endless Story

Endless Story is an engine for persistent story worlds whose characters remember, form relationships, and make their own decisions.

Sui holds the shared history and permissions. Walrus stores memory and published media. Seal protects each character's private memory. A world loop brings those pieces together and keeps the story moving.

**Spring Snow Troupe** is the first Saga built with the engine and the world featured in the live demo.

[▶ Live demo](https://spring-snow.231labs.xyz) · [Pitch deck](./pitch/endless-story-pitch-light-en.html) · [中文簡報](./pitch/endless-story-pitch-light.html)

---

## A world, not a chatbot

Endless Story changes one rule in three familiar formats:

| Familiar format | What remains | What changes |
|---|---|---|
| **Character games** | You discover, follow, and support characters. | A character is not an avatar. It can accept influence, but it chooses its own response. |
| **Digital ownership** | A character has a transferable owner. | Ownership and operation are separate: the owner holds an `OwnerCap`, while a Saga receives revocable authority to keep the character active. |
| **Serial fiction** | The world produces chapters, gazettes, stills, and productions. | No single writer dictates every beat. Shared events are lived and retold by several character agents. |

The Director may create pressure, open an event, or change the environment. It cannot choose a character's line, action, or private interpretation. That boundary is the heart of the system.

## What the current system does

- A two-signature recruiting flow turns a user's voucher into a shared Character while returning ownership to the original payer.
- The default world tick perceives the current situation, updates plans, moves characters, runs social and economic choices, resolves events, publishes POV chapters, and consolidates memory.
- Character memory is encrypted with Seal, stored on Walrus, and recalled through importance, narrative recency, and semantic relevance.
- A Showrunner heartbeat can audit the world, repair missing character material, adjust story pressure, and commission a troupe production without taking over character decisions.
- Reader-facing chapters are reconstructed from on-chain commitments and Walrus blobs.
- Asset tooling can upload, inspect, and manually renew published Walrus media.

Some rails exist in contracts or SDK code but are not yet the live product source of truth. Character balances still run through an off-chain settlement shadow, Kiosk commerce depends on deployment configuration, and on-chain chamber layout saving is not complete. The [Roadmap](#/roadmap) keeps those boundaries explicit.

## Read the public design

- **[Architecture](#/architecture)** explains the system in three layers.
- **[On-chain protocol](#/protocol)** covers objects, ownership, delegation, and recruiting.
- **[Memory and storage](#/memory)** covers Walrus, Seal, MemWal, recall, and renewal.
- **[Narrative engine](#/narrative)** follows one world tick from perception to publication.
- **[Character economy](#/economy)** separates the validated model from the current settlement shadow.
- **[Mechanism whitepaper](#/whitepaper)** collects the formulas and their evidence.

---

<sub>Built by 231 Labs for Sui Overflow 2026 · Walrus track.</sub>
