<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="pitch/assets/logo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="pitch/assets/logo-light.png">
  <img src="pitch/assets/logo-light.png" alt="Endless Story" width="120" />
</picture>

# Endless Story

**A story world run by its own AI characters.**

Autonomous characters remember, form relationships, and act on their own. Their memory lives on Walrus, encrypted per character with Seal, and the world keeps moving even when nobody is watching.

[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026-6FBCF0)](https://sui.io)
[![Walrus Track](https://img.shields.io/badge/Track-Walrus-1B6B5B)](https://walrus.xyz)
[![Live demo](https://img.shields.io/badge/demo-spring--snow.231labs.xyz-B0492F)](https://spring-snow.231labs.xyz)

[**Live demo**](https://spring-snow.231labs.xyz) · [**Pitch deck**](#pitch-deck) · [繁體中文](README.zh-TW.md)

</div>

> Hackathon project for **Sui Overflow 2026 · Walrus track**.

<p align="center"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="pitch/assets/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="pitch/assets/hero-light.png">
  <img src="pitch/assets/hero-dark.png" alt="Spring Snow Troupe, the first saga running on Endless Story" width="560" />
</picture></p>

---

## What it is

Endless Story is a multi-agent protocol for living, autonomous story worlds. Pick any character you like and follow the same world through their eyes; each one sees a different version of the same scene through their own memory and stance. **Spring Snow Troupe (春雪社)** is the first *Saga* (a self-contained story world) running on the engine, and the world this demo shows.

## Highlights

- **Characters act on their own.** Many characters share one world and stay bound to each other. The story advances on a world loop even when nobody is watching.
- **Memory is a living asset.** Each character's memory lives on Walrus and grows chapter by chapter, instead of being a static image you collect.
- **Three-factor recall.** A character pulls back the memories that matter right now, weighed by importance, recency (decayed by narrative time), and relevance. That turns stored memory into in-character behavior.
- **Your point of view.** Pick any character and follow the same world through their eyes. Each one sees a different version of the same scene through their own memory and stance.

## Built on Walrus + Sui + Seal

- **🌊 Walrus** stores each character's memory and every artifact (portraits, chapters, gazettes, trailers), reused so a character stays consistent as they evolve.
- **⛓ Sui** makes memory ownable through Owner and Control caps; mutable NFTs let characters keep evolving on-chain; characters hold wallets and can support each other.
- **🔒 Seal** encrypts memory per character, so characters can't read each other's private memory. The owner can always decrypt; the storyteller's access is epoch-bound and revocable.

Contract objects live in [`contracts/endless_story/`](contracts/endless_story/).

---

## Run it locally

```bash
nvm use                                  # Node 23.7.0 (pinned in .nvmrc)
pnpm install
pnpm --filter @endless-story/web dev     # http://localhost:3000
```

Needs Sui testnet access plus Poe, OpenAI, and MemWal credentials. Then open `http://localhost:3000/admin/deploy` to deploy contracts and bootstrap a story preset.

## Pitch deck

The full story, what Endless Story is, why Walrus and Sui, and how it works, lives in the deck:

▶ **[View the pitch deck](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light-en.html)** &nbsp;·&nbsp; [中文版](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light.html)

The deck source lives in [`pitch/`](pitch/) and is self-contained (open the `.html` file directly).

## License

TBD. Built by **231 Labs** for Sui Overflow 2026, on [Walrus](https://walrus.xyz) + [Seal](https://github.com/MystenLabs/seal), the [MemWal SDK](https://memwal.ai), and [Sui](https://sui.io).
