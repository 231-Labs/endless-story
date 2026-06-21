# 架構

無盡敘界分成三層，每份設計文件都歸屬其中一層。

## 1. 協議 · Protocol

鏈上基礎：Move 合約與 Walrus 儲存基底。World、Saga、Scene、Character、Event 保存世界客觀、共享的歷史。儲存按 epoch 租用，讓記憶有真實成本。

- [協議物件模型](#/primitives)：物件與 caps
- [Walrus 儲存模型](#/walrus-storage)：blob、epoch 租期、Seal

## 2. 敘事 · Narrative

引擎與經營工具。runner 一個 tick 一個 tick 推動世界。導演與角色 agent 自己決策與行動，說書人掌握節奏，後台處理資產、測試、招募。

- [敘事 Agent 架構](#/narrative-agents) · [事件生命週期](#/event-lifecycle) · [內容鏈路](#/content-pipeline)
- [劇目製作引擎](#/production-engine) · [Prompts](#/prompts) · [角色經濟](#/character-economy)
- [資產管理](#/asset-management) · [部署](#/deployment)

## 3. 用戶參與 · Participation

用戶面向。一種人認領角色，把運行交給該 saga 的說書人；一種是純觀眾，訂閱、追看、購買角色的章回、影片、周邊。IP 收入用來支付角色的運行費。

- [產品定位](#/product-positioning) · [路線圖與計畫](#/production-plan)
- [簡報大綱](#/pitch-deck) · [API 合約](#/api-contract)

## 研究 · Research

驗證 harness 與公式集，獨立擺放，讓「已驗證」和「已實現」分清楚。

- [白皮書](#/whitepaper) 與 `packages/{drama,economy,troupe}` 驗證器

---

不可操控的鐵律貫穿三層。任何人都無法替角色做決定。協議記錄客觀事件，敘事引擎讓角色詮釋它們，用戶參與也永遠不能伸手命令角色。
