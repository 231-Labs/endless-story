<div align="center">

<img src="pitch/assets/logo.png" alt="Endless Story" width="120" />

# 無盡敘界

**一套驅動「持久、鏈上故事世界」的引擎。** 這裡的角色是會隨時間長大的記憶資產，而不是一張你收藏的靜態圖。

用 MemWal SDK 寫進 Walrus，靠 Sui NFT 持有 IP。**春雪社**是跑在這套引擎上的第一個 *Saga*，也是本次 demo 展示的世界。

[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026-6FBCF0)](https://sui.io)
[![Walrus Track](https://img.shields.io/badge/Track-Walrus-1B6B5B)](https://walrus.xyz)
[![Live demo](https://img.shields.io/badge/demo-spring--snow.231labs.xyz-B0492F)](https://spring-snow.231labs.xyz)

[**線上 Demo**](https://spring-snow.231labs.xyz) · [**簡報**](#簡報) · [English](README.md)

</div>

> Sui Overflow 2026 · Walrus 賽道 hackathon 專案。

---

## 簡報

無盡敘界是什麼、為什麼是 Walrus 與 Sui、怎麼運作，完整的故事都在簡報裡：

▶ **[開啟簡報](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light.html)** &nbsp;·&nbsp; [English deck](https://htmlpreview.github.io/?https://github.com/231-Labs/endless-story/blob/main/pitch/endless-story-pitch-light-en.html)

<!-- TODO: 部署到 VPS 後換成自架網址，例如 https://spring-snow.231labs.xyz/pitch -->

簡報原始檔在 [`pitch/`](pitch/)，自包含（直接開 `.html` 檔即可）。

---

## 本地執行

```bash
nvm use                                  # Node 23.7.0（.nvmrc 鎖定）
pnpm install
pnpm --filter @endless-story/web dev     # http://localhost:3000
```

需要 Sui testnet 存取權，外加 Poe、OpenAI、MemWal 憑證。接著開 `http://localhost:3000/admin/deploy` 部署合約並 bootstrap 故事 preset。

---

## 授權

TBD。由 **231 Labs** 為 Sui Overflow 2026 打造，建構於 [Walrus](https://walrus.xyz) + [Seal](https://github.com/MystenLabs/seal)、[MemWal SDK](https://memwal.ai) 與 [Sui](https://sui.io)。
