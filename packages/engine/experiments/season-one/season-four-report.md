# Season Four — 班主-agent milestones wired into the season (report)

- provider: **FAKE-LLM smoke** (zero keys, deterministic fallbacks)
- files: `banzhu.ts` (mechanism), `harness-v3.ts` (`runSeasonV3`), `season-four.ts` (smoke)
- reuses `production-spine.ts` + `discussion.ts` verbatim; `season-two.ts` / `harness-v2.ts` untouched.

## Problem (season-v3 real-run diagnosis)

Prose was good but PRODUCTION was INVISIBLE: 立意/選角/排練 advanced in a silent
state machine while the narrated chapters were just actors milling at the 戲台.
The casting scene never surfaced as a beat. The decoupled `banzhu-milestone` test
proved the fix: route production THROUGH the 班主 as an AGENT who announces
milestones in-world and convenes casting.

## What was wired

1. **班主 announces milestones in-world (`announceMilestone`).** On 沈雪笙's
   production turns she decomposes the season goal into the next ladder rung
   (定角 / 排練 / 催場) and SPEAKS it to the troupe. Scheduled off the spine state
   so each announcement PRECEDES the stage it names: 定角 the day before casting
   fires (state `SCRIPTED`), 排練 the day before the staged rehearsal chapter
   (state `VERSIFIED`), 催場 once the build is done. These are narrated beats woven
   into the chapter stream, replacing the silent advance.

2. **Casting convened by 班主 (surfaced).** The spine already runs the validated
   casting DISCUSSION at the `CAST` stage (contested 許仙: 柳生春 + 江聞鶴 both bid).
   Here it is surfaced as convened beats the tick it fires (aspirants advocate →
   rebut → 班主 arbitrates → cast crystallizes → losing aspirant refuses once).

3. **Rhythm + space = the teeth.** After the 排練 milestone, during DAY slots
   `computeRehearsalRouting` (the day-slot sibling of the night home router) routes
   each floor member to the 戲台; at night `computeSpatialRouting` sends them home.
   A member whose hot want out-weighs the pull to the floor goes to the want's
   object instead and is PHYSICALLY ABSENT. 柳生春's unfinished debt (虧欠→金鳳, a
   歌女 who never joins the 會串 cast) flares under the deadline and drags her to
   金鳳寓所 every rehearsal slot; the scene runs without her and 班主 NOTICES in-world
   (`noteAbsence`). The consequence is the absence itself, surfaced in narration.
   There is NO standing/number penalty (rehearsalEffort/box-office are untouched).

4. **床戲 check.** Nights are off-production (home routing frees them). In the fake
   smoke trysts DO form (3). The standing 床戲=0-over-three-real-runs diagnosis is
   a REAL-LLM finding and is surfaced (not papered) in `bedroomFinding.reason`.

## FAKE-LLM smoke — mechanical counter block

```
==================== SEASON FOUR — MECHANICAL COUNTER BLOCK ====================
mode................................ FAKE-LLM smoke
cast (7)........................... 沈雪笙、柳生春、蘇映雪、金鳳、江聞鶴、連翹、白韻秋
ticks.............................. 12 (6/day → day/night rhythm + rehearsal slots)
prologue injected at t0............ YES
deadline daysLeft by tick.......... 36 → 33 → 30 → 27 → 24 → 21 → 18 → 15 → 12 → 9 → 6 → 3

── 班主-AGENT MILESTONES (production made VISIBLE, not a silent flag) ─────────
班主 in-world milestone announcements (narrated).. 3 (定角/排練/催場)
  〔班主·定角〕(tick 1, 距會串 33 天 · fallback)「後天定角。《斷橋》的許仙、白素貞、小青，都給我拿出真東西來——爭得上的自己開口。」
  〔班主·排練〕(tick 6, 距會串 18 天 · fallback)「角定了，從明兒起排《斷橋》。斷橋那場，我要看見台下那對照見台上，別給我在台上晃。」
  〔班主·催場〕(tick 7, 距會串 15 天 · fallback)「還剩15天。這戲得像個戲——今兒起一遍一遍摳，摳到它立得住為止。」

── CASTING CONVENED BY 班主 (surfaced as narrated beats, not silent) ──────────
casting convened at tick........... 2
  eligible advocates (≥2).......... 3 → 蘇映雪、柳生春、江聞鶴
  cast filled (no deadlock)........ YES → 白素貞=蘇映雪、許仙=柳生春、小青=連翹
  班主 拍板........................ 「許仙，生春演。江老板的本事我看在眼裡，可這齣戲要的是台下那對照見台上——生春同映雪，八年了，這口」
  losing aspirant refused ONCE..... 江聞鶴：「這口氣我先擱著。班主的話我認，可這場戲沒唱成，我不算輸。」

── TRACEABLE NARRATED PRODUCTION CHAIN (announce→casting→rehearse→premiere) ───
  tick  1 · announce-定角        · narrated=YES · 後天定角。《斷橋》的許仙、白素貞、小青，都給我拿出真東西來——爭得上的自己開口。
  tick  2 · casting-convened   · narrated=YES · 白素貞=蘇映雪、許仙=柳生春、小青=連翹
  tick  6 · announce-排練        · narrated=YES · 角定了，從明兒起排《斷橋》。斷橋那場，我要看見台下那對照見台上，別給我在台上晃。
  tick  7 · rehearse           · narrated=YES · 戲中戲排演章回
  tick  7 · announce-催場        · narrated=YES · 還剩15天。這戲得像個戲——今兒起一遍一遍摳，摳到它立得住為止。
  tick 11 · premiere           · narrated=YES · 年底大會串·戲中戲會串章
  chain ordered & complete......... YES   all narrated=YES

── RHYTHM + SPACE = TEETH (rehearsal-slot routing; night = home) ──────────────
rehearsal-day attendance (floor at 戲台 / pulled off):
  tick 6 · 雲錦台戲台 · 到(4)=沈雪笙、蘇映雪、江聞鶴、連翹  缺=柳生春
  tick 7 · 雲錦台戲台 · 到(4)=沈雪笙、蘇映雪、江聞鶴、連翹  缺=柳生春
  tick 8 · 雲錦台戲台 · 到(4)=沈雪笙、蘇映雪、江聞鶴、連翹  缺=柳生春
  tick 9 · 雲錦台戲台 · 到(4)=沈雪笙、蘇映雪、江聞鶴、連翹  缺=柳生春
  ≥3 floor members AT venue on ≥1 slot.. YES (max 4)
  night = home (floor OFF the floor).. tick 10: 私宅 4/5, 戲台 0/5

── ABSENCE TEETH (pulled off by a hot want → absent → noticed in-world) ───────
members pulled off rehearsal by a hot want.. 4
  tick 6 · 柳生春 → 金鳳寓所（人不在排練場）
    〔班主覺察〕柳生春呢？戲台上少一個人，這齣戲就短一塊骨頭。人心在別處，腳就到不了台上——罷了，先走能走的。
  (tick 7/8/9 同上)
  absence surfaced diegetically (班主 noticed).. YES (consequence = the absence itself, NO number penalty)

── 床戲 (night trysts) FINDING ───────────────────────────────────────────────
night private scenes............... 3  kinds=tryst,tryst,tryst
床戲 (tryst) count................. 3
  finding........................ 夜間注房路由 + 夜赴（yearningNightPursuit）在 edge+ 讓愛欲 want 入私宅成幽會。

── V3 GUARANTEES STILL HOLD ──────────────────────────────────────────────────
reached PREMIERED under deadline... YES
all stages advanced................ YES (PROPOSED→SCRIPTED→CAST→SCORED→VERSIFIED→REHEARSING)
REHEARSING produced takes.......... YES (3)
staged 戲中戲 章回 non-empty........ YES (284 chars)
contested parts (>1 bidder)........ 1 → xu
emergent 詞 with OFF-STAGE grudge.. YES (柳生春→金鳳)
詞 grounded in RECALLED thick memory YES (3)
連翹 slot-less want RESHAPED show... YES → 連翹·小青·水鬥踏月亮相
立意 debated & injected............ YES
every discussion rounds≤cap&decided YES (4 total)
章回 produced EVERY tick........... YES (12/12)
  day-end episodes................. 1   finale 章回=YES (284 chars)
living-want mutated................ 37  cross-character leak=0
box-office......................... total=55  quality=0.537 (raw 21.50÷40)  NOT-clamped=YES
  under-rehearsed (½)............. total=50 → discriminates=YES
  same-seed reproducible.......... YES
every cast ≥14 memories............ YES (min 15)
WorldState snapshot/restore........ OK (wants 28→28)
ending predicate................... complete=true
==============================================================================
```

`✅ SEASON FOUR FAKE-LLM SMOKE GREEN — all mechanical counters pass.`

## Chapter-recording diagnosis (real-run report of fake daily 章回)

The real run reported the ARCHIVED daily 章回 + day episode coming out as
FakeSceneAgent output (`（假織回）`, `X繞著「want」打轉`), while beats were real in
stdout and the rehearsal/casting archived real.

Findings after investigation:

- `（假織回）` / `X繞著「want」打轉` exist ONLY in `fake-scene-agent.ts` (lines 116 /
  43). The real weave/episode (`sceneRecord.weaveTickChapter`,
  `eventChapter.composeEpisode`) return `null` on failure (never a fake string),
  and `characterAgent.actBeat` fails to `（沉默。）` (never the fake template). So
  those strings can ONLY be emitted by a **FakeSceneAgent instance** used as `agent`.
- `harness-v3.ts`'s daily weave/episode/record path is byte-identical to the
  working `harness-v2.ts`: it uses the passed-in `agent.weaveTickChapter` /
  `agent.composeEpisode` throughout, with a real-beats fallback. No stray fake.
- Reproduced the real code path with the real `RunnerSceneAgent` (engine LLM
  stubbed via `ES_HARNESS=1`, zero keys): every archived daily 章回 + the day
  episode contained REAL woven prose (`〔織回〕…`, `## 這一回 …`), **zero fake
  markers**. Proof the daily record path is correct when `agent` is the real agent.

Root cause = **archive dir confusion**: the old `season-four.ts` deleted the temp
dir on a SUCCESSFUL run (`fs.rmSync`), so a successful real run left NO archive and
any leftover `es-season4-*` dir was from a fake/failed run. Fix:

- REAL runs now write to a STABLE, announced dir (`SEASON_OUT_DIR` override, default
  `os.tmpdir()/es-season4-real`), wiped at start and **PRESERVED** at the end; the
  path is printed at start and end. FAKE smoke keeps a throwaway dir cleaned on pass.
- Banner + counter block now reflect the actual mode (was hard-coded FAKE).

### Verify the real record path WITHOUT keys (real agent + stubbed LLM)

```
ES_HARNESS=1 SEASON_REAL_LLM=1 ./node_modules/.bin/tsx experiments/season-one/season-four.ts
# archive → $TMPDIR/es-season4-real/archive  (real-path woven prose; note: a
# downstream want-rewrite assertion fails only because the STUB LLM emits no valid
# rewrite JSON — irrelevant to the archive, which is written before assertions)
```

## Real-LLM command (keys via env; archive is preserved + printed)

```
POE_API_KEY=… OPENAI_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
  SEASON_REAL_LLM=1 ./node_modules/.bin/tsx experiments/season-one/season-four.ts
# real archive PRESERVED at (printed at start+end): $TMPDIR/es-season4-real/archive
# open d1-t*-chapter-*回-*.md and d1-t5-episode-*.md — must be real woven prose,
# NOT （假織回） / 繞著「…」打轉
```

## What the real run will stress

- **Do the days feel mechanical?** The rhythm marches the floor to the 戲台 on cue.
  It reads alive only if the LLM rehearsal beats and 班主 announcements carry
  distinct voices; the risk is a uniform "everyone reports for rehearsal" cadence.
  The announcement voice (short/狠/底下有暖) and the per-member 風格 are the levers.
- **Does the absence read as drama or a logged no-show?** The teeth land only if
  `noteAbsence` gives 班主 a real reaction (疼與惱 藏得極深) AND 柳's own pulled-away
  beat at 金鳳寓所 shows the debt she's chasing. Otherwise it is just a name missing
  from a roster. The engineered flare (deadline squeezing the debt to the surface)
  needs the prose to make that pressure legible, not just mechanical.
- **床戲.** Nights are freed by home routing; whether trysts form under the real
  LLM depends on love-want heat reaching `edge` (heat/frust accumulation), the
  welcome gate, and the night gate. The `bedroomFinding` surfaces the count and, if
  0, the reason — the standing three-run diagnosis to confirm or refute.
