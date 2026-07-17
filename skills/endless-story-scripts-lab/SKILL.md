---
name: endless-story-scripts-lab
description: >-
  Endless Story dev-branch workflow: private scripts + lab repos, ES_SCRIPTS_ROOT/ES_LAB_ROOT,
  engine runs, lab:publish, pub:propose, PR hygiene (no research JSON in public repo).
  Use when branching from dev for narrative/engine work, season runs, economy physics,
  cleaning internal/, migrating to endless-story-scripts or endless-story-lab, or preparing PRs to dev.
---

# Endless Story — dev 分支 × scripts / lab 工作流

> **工具路徑（單一來源）**：[`skills/endless-story-scripts-lab/SKILL.md`](../../skills/endless-story-scripts-lab/SKILL.md)。Cursor → `.cursor/skills/`（symlink）；Claude Code → `.claude/skills/`（symlink）；Codex → repo 根 [`AGENTS.md`](../../AGENTS.md)。

## 何時啟用

- 從 **`dev`** 開 feature 分支做 narrative / engine / economy 實驗
- 跑 season、整理研究產物、開 PR 進 `dev`
- 使用者提到：**scripts**、**lab**、**internal/**、**season JSON**、**研究文檔**、**lab:publish**、**pub:propose**

## 三層架構（必記）

| 層 | Repo | 放什麼 |
|----|------|--------|
| 公開引擎 | `231-Labs/endless-story` | 程式、確定性測試、bootstrap seed（`spring-snow.json`） |
| 劇本庫 | `231-Labs/endless-story-scripts` | `seeds/`、`seasons/`、成品 `stories/` |
| 實驗室 | `231-Labs/endless-story-lab` | `runs/`、`research/`、`publications/` |

**規則**：完整 season 劇本、實驗結果、發文草稿 **不進公開 repo**。CI 用 `packages/engine/test/fixtures/anchun-acceptance-frame.ts`（程式化 fixture）。

## 環境變數（`packages/web/.env.local`，gitignore）

```bash
ES_SCRIPTS_ROOT=/Users/<you>/endless-story-scripts
ES_LAB_ROOT=/Users/<you>/endless-story-lab
ES_ACTIVE_PRESET=spring-snow
ES_ACTIVE_SEASON=anchun-after-curtain   # 對應 scripts/seasons/<id>.json
```

若未 clone private repo，先：

```bash
git clone git@github.com:231-Labs/endless-story-scripts.git ~/endless-story-scripts
git clone git@github.com:231-Labs/endless-story-lab.git ~/endless-story-lab
```

## Agent 標準流程

### A. 開分支

```bash
git fetch origin dev
git checkout dev && git pull
git checkout -b feat/<topic>
```

### B. 開發與跑季

```bash
# 讀取 env（cli / engine 會用 --env-file-if-exists=../web/.env.local）
pnpm --filter @endless-story/engine engine -- \
  run --ticks 18 --real-llm --relationship-fallback
```

有 `ES_LAB_ROOT` 時，預設輸出：`$ES_LAB_ROOT/runs/<YYYY-MM-DD>/engine-run/`。  
有 `ES_ACTIVE_PRESET` / `ES_ACTIVE_SEASON` 時，可省略 `--preset` / `--season`。

### C. Run 收尾 → lab

```bash
pnpm --filter @endless-story/cli lab:publish -- \
  --staging "$ES_LAB_ROOT/runs/$(date +%Y-%m-%d)/engine-run" \
  --slug <short-name> --commit
```

在 lab repo 內 `--commit` 會 local commit；**需手動 `git push`**（除非使用者要求代 push）。

### D. 故事成品 → scripts

在 `$ES_SCRIPTS_ROOT/stories/<YYYY-MM-DD>/<slug>/` 放：

- `manifest.json`（引用 lab run、`engineCommit`、用的 seed/season）
- `anthology.md` / `dossiers/` 等讀者向產物

更新 `catalog.json` 若為新劇目。

### E. 發文草稿（可選）

```bash
pnpm --filter @endless-story/cli pub:propose -- --topic "<標題>"
```

產物在 `lab/publications/drafts/`；審核後移到 `ready/`。

### F. 開 PR 前檢查（公開 repo）

**不要 commit：**

- `docs/narrative/*_RESULT.md`、實驗筆記、handoff 草稿
- `packages/cli/scripts/seasons/*.json`（完整 season 只在 scripts）
- `packages/world-kernel/`、`packages/world-lab/`、大 JSON fixtures
- `internal/` 任何內容（gitignore，但勿 `git add -f`）
- `engine-run/`、demo 影片

**應保留在公開 PR：**

- engine / economy / runner 程式與測試
- 程式化 test fixture（非 JSON 劇本檔）
- `docs/SCRIPT_LAB_WORKFLOW.md` 等正式 workflow 說明

跑測試：

```bash
pnpm --filter @endless-story/economy test
pnpm --filter @endless-story/engine test
```

PR 目標分支：**`dev`**（除非使用者指定 main）。

## internal/ 清理（migrate 到 lab 前）

| 內容 | 建議 |
|------|------|
| `media/`（demo 影片） | 刪除，不進 repo |
| `season-runs/*/memory/` | 刪除；只留 `cast-state.json` + `manifest.json` |
| `archive/` 與 `research-economy-physics-2026` 重複 | 只留一份進 lab |
| `research/`、`experiments/` | → `endless-story-lab` |

migrate 後更新 `internal/README.md` 指向兩個 private repo。

## 程式錨點（公開 repo）

- 路徑解析：`packages/engine/src/workspace-paths.ts`
- Preset / season 載入：`packages/engine/src/preset.ts`（`ES_SCRIPTS_ROOT` → `seeds/`、`seasons/`）
- CLI：`packages/cli/scripts/lab-publish.ts`、`pub-propose.ts`
- 詳細說明：[`docs/SCRIPT_LAB_WORKFLOW.md`](../../docs/SCRIPT_LAB_WORKFLOW.md)

## 常見使用者請求 → 動作

| 使用者說 | Agent 做 |
|----------|----------|
| 「跑一季 / engine run」 | 確認 `.env.local`，跑 engine，必要時 `lab:publish` |
| 「整理 internal」 | 依上表清理 → migrate 到 lab/scripts → push private repos |
| 「這個 season 不要進 dev」 | 移到 `ES_SCRIPTS_ROOT/seasons/`，測試改用 fixture 或 `buildAnchunAcceptanceFrame()` |
| 「準備 PR 到 dev」 | 執行 F 節 checklist + 測試，開 PR base=`dev` |
| 「寫 Medium / InkRay 稿」 | `pub:propose`，編輯 `lab/publications/drafts/` |

## 回覆使用者

完成後簡述：改了什麼、產物在哪（scripts / lab 路徑）、是否已 push private repo、公開 PR 還差什麼。
