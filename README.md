<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="pitch/assets/logo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="pitch/assets/logo-light.png">
  <img src="pitch/assets/logo-light.png" alt="Endless Story" width="120" />
</picture>

# Endless Story

**A story world whose characters keep it moving.**

Characters remember what happened, form relationships, and choose what to do next. Their private memory is stored on Walrus and protected by Seal. A running world loop keeps the story moving without waiting for a player prompt.

[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026-6FBCF0)](https://sui.io)
[![Walrus Track](https://img.shields.io/badge/Track-Walrus-1B6B5B)](https://walrus.xyz)
[![Live demo](https://img.shields.io/badge/demo-spring--snow.231labs.xyz-B0492F)](https://spring-snow.231labs.xyz)

[**Live demo**](https://spring-snow.231labs.xyz) · [**Pitch deck**](#pitch-deck) · [繁體中文](README.zh-TW.md)

</div>

> Hackathon project for **Sui Overflow 2026 · Walrus track**.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="pitch/assets/hero_dark.jpg">
    <source media="(prefers-color-scheme: light)" srcset="pitch/assets/hero_light.jpg">
    <img src="pitch/assets/hero_dark.jpg" alt="Spring Snow Troupe, the first saga running on Endless Story" width="720" />
  </picture>
</p>

---

## The idea

Endless Story is an engine and on-chain protocol for persistent story worlds. Events belong to one shared history, but every character interprets them through a different set of memories and relationships. Follow another character and the same scene becomes a different story.

**Spring Snow Troupe (春雪社)** is the first Saga built with the engine. It is the world featured in the demo.

## What works today

- **An autonomous cast.** The world loop lets characters plan, move, talk, ask for help, support one another, and respond to events in the same shared world.
- **Memory that affects the next scene.** Character memory is written to Walrus and recalled by importance, narrative recency, and relevance before a decision is made.
- **A story told from many sides.** Shared events become character-specific point-of-view chapters, so readers can follow the same world through anyone in the cast.
- **Ownership without handing over creative control.** Sui records ownership and operating authority separately. The owner holds the `OwnerCap`; a Saga receives a revocable `ControlCap` for permitted actions.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="pitch/assets/cinema-dark.jpg">
    <source media="(prefers-color-scheme: light)" srcset="pitch/assets/cinema-light.jpg">
    <img src="pitch/assets/cinema-dark.jpg" alt="Character profile and chapter trailers in Spring Snow Troupe" width="720" />
  </picture>
  <br /><sub>Character pages and chapter trailers — pick a character, follow their story.</sub>
</p>

## Why Walrus, Sui, and Seal

- **Walrus** stores encrypted memories and published media such as portraits, chapters, gazettes, and trailers. Epoch-based storage makes the lifetime and cost of each blob explicit.
- **Sui** anchors shared history and character state. The Move contracts define ownership caps, delegated authority, subscriptions, and character balances on-chain.
- **Seal** scopes encrypted memory to one character. The `OwnerCap` holder can audit that character's memory; Saga access uses an epoch-bound `ControlCap` that the owner can revoke.

The Move contracts live in [`contracts/endless_story/`](contracts/endless_story/). For a feature-by-feature view of what is shipped, partially wired, or planned, see the [project roadmap](site/content/roadmap.md).

---

## Run it locally

```bash
nvm use                                  # Node 23.7.0 (pinned in .nvmrc)
pnpm install
pnpm --filter @endless-story/web dev     # http://localhost:3000
```

The web app can start without every external service configured. For the full flow, copy [`packages/web/.env.example`](packages/web/.env.example) to `.env.local` and add:

- a Z.AI, Poe, or Anthropic key for text generation;
- an OpenAI key for portraits and embeddings;
- Sui testnet access and `SUI_ADMIN_PRIVATE_KEY` for signed admin actions;
- MemWal credentials for long-term, Seal-encrypted memory.

To publish contracts from the admin setup page, the machine running Next.js must also have the Sui CLI on `PATH`. Run the read-only preflight first, then deploy and bootstrap a story preset at `http://localhost:3000/admin/deploy`.

## Pitch deck

For the product story and a visual walkthrough of the system:

▶ **[View the pitch deck](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light-en.html)** &nbsp;·&nbsp; [中文版](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light.html)

The source files live in [`pitch/`](pitch/) and can be opened directly in a browser.

## License

No license has been published yet. Built by **231 Labs** for Sui Overflow 2026 with [Walrus](https://walrus.xyz), [Seal](https://github.com/MystenLabs/seal), the [MemWal SDK](https://memwal.ai), and [Sui](https://sui.io).
