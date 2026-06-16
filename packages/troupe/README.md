# @endless-story/troupe

鏈解耦的**戲班製作驗證 harness**。證明一個自治戲班能**真的**寫劇本、選角、作曲、填詞、演一齣「舊戲新唱」，產出**可用的產物**——而完全不碰鏈 / Walrus / Move。

定位等同 `packages/economy` 之於經濟層：先在純 package 裡把可行性驗證過，**上鏈是 gate-after**。

## 跑

**零依賴、零安裝**（LLM client 是 harness 自帶 fetch 版，不 import `@endless-story/llm`）。只需 **node ≥ 23.6**（原生跑 TS；`nvm use` 鎖 23.7）。

```bash
# 無金鑰，本機模板（結構、邏輯、譜、MIDI 全部照出）
node packages/troupe/driver/run.ts --mock

# 有金鑰，真 LLM（劇本/詞/POV 文采上來）— 行內 env 即可
AI_PROVIDER=poe POE_API_KEY=你的key node packages/troupe/driver/run.ts --play 紅樓夢
```

跑完會印 **LLM 統計**，一眼判斷有沒有真打到：
`真 LLM（poe）：呼叫 9 次，全部成功 ✓，耗時 18.4s`（失敗會標 `⚠️ N/N 失敗` + 首個錯誤）。

**選戲碼** `--play`（預設白蛇）：`--play 紅樓夢`（honglou）/ `--play 白蛇`（baishe）/ `--play 大戲`（白蛇傳·全本，七場、生旦淨丑齊全）。戲碼目錄在 [`src/repertoire.ts`](src/repertoire.ts)，戲班在 [`src/fixtures/spring-snow.ts`](src/fixtures/spring-snow.ts)；加戲/加角＝加一個 entry。紅樓/大戲裡柳生春（文小生坤伶）演寶玉/許仙＝**坤生**，與蘇映雪青梅竹馬照樣觸發**有感而發**的詞。

**純排戲** `--no-score`：跳過琴師作曲/出譜（音律），只走 編劇→選角→演戲中戲，產出一份可收藏的 `00_戲折.md`（班底＋分場＋折子章回＋角兒私詞）。

```bash
# 七場大戲、不管音律、純排戲
AI_PROVIDER=poe POE_API_KEY=你的key node packages/troupe/driver/run.ts --play 大戲 --no-score
```

**傳 key**：讀 `ZAI_API_KEY` / `POE_API_KEY` / `ANTHROPIC_API_KEY`（`AI_PROVIDER` 可指定），行內或放 `packages/troupe/.env.local`（用 `pnpm --filter @endless-story/troupe run` 會自動載 .env.local）。沒有 key → 自動 mock。

> node < 23.6（如預設 18）→ 改用 `pnpm --filter @endless-story/troupe run:tsx`（需 `pnpm install` 一次裝 tsx）。

## 它輸出什麼（`out/`）

| 檔 | 行當 | 內容 |
|---|---|---|
| `00_戲折.md` | — | **可收藏戲折**：一折＝整齣戲（班底＋分場＋折子章回＋角兒私詞）。未來上鏈為數位藏品的形狀 |
| `01_brief.md` | 班主 | 舊戲新唱立意、氣質、分場 |
| `02_script.md` | 編劇 | 分場劇本 + 念白/科介 |
| `03_cast.{json,md}` | 導演 | **行當粒度選角**：生旦淨丑 + 應工 + **乾旦/坤生**（演員性別 ⊥ 角色性別） |
| `04_score_*.{json,mid,md}` | 琴師 | **可演奏的譜**：板式 + 简谱 + **真的 `.mid` 檔**（你會樂器就能彈） |
| `05_ci.md` | 花旦等 | **雙源詞**：①應場填詞 ②**有感而發**（從關係/記憶長出來，附 provenance） |
| `06_戲中戲_章回.md` | 全體 | 各人第一人稱 POV 織成的羅生門式「戲中戲」章回 |
| `production.json` | — | 完整狀態機快照 |

## 設計重點

- **音樂是確定性的、不靠 LLM**（[`src/music.ts`](src/music.ts)）。琴師依場景情緒選板式 → 出 简谱 + SMF。所以「會彈吉他就能自己彈」這件事在 mock 模式就成立——譜是真作品，音色合成只是其中一種渲染器。
- **技能系統**（[`src/skills.ts`](src/skills.ts)）模擬鏈上 per-saga 技能（0–100）：gate「誰能寫」+ dial「寫多好」。對應 repo 既有的 `SagaSkillsKey` DOF（搬回寫入路徑即可上鏈）。
- **各司其職 ≠ 派工**（[`src/roles/lyricist.ts`](src/roles/lyricist.ts)）。花旦不一定是被指派的詞作者；強烈的關係/記憶會讓她「有感而發」自發創作，那首私詞再被戲借去。
- **狀態機**（[`src/pipeline.ts`](src/pipeline.ts)）：`PROPOSED→SCRIPTED→CAST→SCORED→VERSIFIED→REHEARSING→PREMIERED`，一步一「敘事日」，每步 idempotent、可 resume——對應產品的 tick loop。

## 不在這裡（gate-after）

真音色合成（sample 京胡）、念白 TTS、演出影片、`production.move` 共有 IP、技能 DOF 上鏈、Walrus 存放。先用這個 harness 驗證「創作鏈」站得住，再逐層加。
