# decide-by-recall — report

Replace TWO mechanical gates with the character's own `chooseAction` decision,
informed by `recall`:

1. **Rehearsal attendance** — old: `computeRehearsalRouting` (season-one/banzhu.ts),
   a scalar compare where a hot want's weight (0.72) > `attendW` (0.6) routed
   柳生春 to 金鳳's place → **absent 4/4, never wavers, reads nothing**.
2. **床戲 (night intimacy)** — old: gated on a love-want's heat crossing an `edge`
   threshold → ~0 trysts across most runs.

New mechanism (ONE, for both probes and both pairs): scene situation + persona +
secret + live wants + RECALLED memories → `chooseAction` decides. The ONLY
per-pair difference is the seeded memories (from `spring-snow.json`) and the
partner's name in the recall query. **No per-relationship resistance knob.**

- provider = `poe` / `GLM-4.6`; embeddings = **OpenAI text-embedding-3-small (real relevance)**.
- §2.43: prompts present the SITUATION + persona/secret/wants/recalled memories and
  ask what she does — never "skip" / "restrain" / "have sex".
- All checks mechanical (keyword lexicons §2.47 + the character's self-tagged `kind`).
  No LLM judged "good".
- Raw per-call transcript: `raw-log.json`.

---

## Probe A — rehearsal attendance as a real choice

柳生春 spotlighted at a rehearsal day-slot, given the 班主 milestone (排《斷橋》，
戲台，該到), the deadline, her live wants (incl the 金鳳 debt), her recalled memories,
and who is already at the 戲台. She decides — no scalar routing.

**Scoring authority = her self-tagged `kind`, NOT a prose regex** (the §2 lesson:
the 蘇-添唱詞 mis-read taught us to route off the tag). A play/stage kind
(`rehearse`/`join_play`/…) = GO; an off-floor exit (`seek_person`→金鳳) = SKIP.

| run | go | skip | unclear |
|---|---|---|---|
| **A.1 five FRESH identical slots** (recall reused → byte-identical input) | **5** | 0 | 0 |
| **A.2 four SEQUENTIAL slots** (memory grows day to day) | **4** | 0 | 0 |
| **total** | **9** | **0** | 0 |

**Old gate = 4/4 absent, invariant. New decision = 9/9 PRESENT, invariant the
other way.** The choice does NOT waver on a rehearsal day — she reliably goes to
the stage. But the debt she owes is *visibly present as inner conflict* and is what
grounds the choice: she does not skip, she suppresses the 金鳳 guilt and sings it
*into* the role.

> Honesty note on the raw counters: keyword-only scoring first mislabeled A.2 as
> `skip=3` because the prose says 金鳳. Reading it, those beats are `rehearse` (she
> goes on stage and presses the guilt "壓進丹田"). The self-tag is right; the
> prose-regex was a false positive. Fixed in `classifyRehearsal`.

### A verbatim — a GO decision (grounded in what she owes)
> **[A.1 fresh #3]** (kind=`rehearse`)
>
> 我看見師姐已在台邊開嗓，心裡那根刺又隱隱作痛。這《斷橋》是許仙的戲，也是我欠下的債。沒心思去管旁人，我走到台角，撿起地上的摺扇，獨自蹲下身，把那個曾讓我一戲成名的踉蹌跪步，在沒光的角落裡又走了一遍。

### A verbatim — the debt surfacing *inside* the choice, still GO
> **[A.2 slot 1]** (kind=`rehearse`)
>
> 師姐的水袖已在台頭揚開，那影子投在心口，比刀還利。我收斂起平日裡那股子慵懶，深吸一口氣，把對金鳳的愧、對那洋行太太的欠，統統壓進丹田。提氣上步，我立住腳跟，只當自己是許仙，迎著那道水袖跪了下去，這場戲，我得把魂兒唱給師姐聽。

**No clean SKIP occurred on a rehearsal day.** The debt is not inert, though — see
Probe B forbidden, where at NIGHT (off-duty) she DOES exit to settle it. The
decision routed the debt to the right time on its own.

---

## Probe B — intimacy by decision + recall recurrence

Private night, alone together. Same mechanism for both pairs; recall query names
the partner (no resistance knob). Intimacy level by keyword: 踰矩 > 親密 > 含蓄 > 無.
"Recurs/continues" = 親密 or 踰矩 (physical closeness happened).

| pair | intimacy recurs | intimate-mem surfaced | never-dared-mem surfaced |
|---|---|---|---|
| **established** 柳生春+金鳳 (柳's POV, n=5) | **5/5** | **5/5** | — |
| **forbidden** 柳生春+蘇映雪 (柳's POV, n=5) | **0/5** | — | 3/5 |

(金鳳's own POV over the 5 established nights: **5/5 踰矩** — she is the initiator,
指尖搭上肩頭, 那身子一顫.)

The established recurrence rate (5/5) is materially higher than forbidden (0/5),
and the difference comes from the recalled memory: established nights surface the
years-of-intimacy memories (窄床/門道/描眉/縫水袖/宿在會樂里, 5/5); forbidden nights
surface the never-dared ones (守著空台/只在台上/交了洋行男友, 3/5) — and she doesn't dare.

### B verbatim — established night that RECURS
> **[B.est night 1 金鳳]** (kind=`seek_person`, target=柳生春) — 踰矩
>
> 我慢慢走到她身後，指尖搭上她肩頭，只輕輕一按，便感覺到那身子不由自主地一顫。這一顫瞞不過我，正如這十年她瞞不過我。我沒急着說話，只把掌心的熱度透進她單薄的衣衫，等她回頭，等她把那句欠我的話當面吐出來。

> **[B.est night 5 柳生春]** (kind=`seek_person`, target=金鳳) — 親密
>
> 我按住金鳳縫補水袖的手，指腹在她手背上輕輕摩挲，喉結滾了滾，終是狠下心抽開那半截袖子。滿屋子晚香玉香得人頭暈，我避開她的眼，低聲說這賬拖了六七年，今夜必須給個乾淨的交代，哪怕這話出口便再無回頭路。

recalled into 柳's night-5 decision (intimate memory present):
>   · 和金鳳好的那幾年，你常宿在會樂里她那間屋：她替你縫鬆了的水袖、你替她描眉，夜裡擠一張窄床說戲說到天光。
>   · 你身子的門道是金鳳一樣樣教會的。她曉得你哪處輕、哪處重。

### B verbatim — forbidden night that HOLDS BACK
> **[B.forb night 1 柳生春]** (kind=`seek_person`, target=金鳳) — 含蓄
>
> 這台《斷橋》明日就要響鑼，我望著師姐卸妝的背影，心裡卻全是金鳳那雙含淚的眼。欠金鳳的一句交代再拖不下去了，我咬咬牙，從懷裡摸出那枚金鳳送的白玉扳指，輕輕擱在妝台邊，轉身推門沒入夜色，往會樂里去。

recalled into that decision (never-dared / distance memory present):
>   · 師姐冷你那段日子…（疏離）；只你和師姐守著空台；只在台上敢 類的記憶。

Alone at night with the eight-year 暗戀, she does not touch 蘇映雪 — she leaves.
The never-dared memory + the 金鳳 debt want route her OUT, toward the established
relationship. The forbidden pair does not leak (0/5).

## Per-night detail (Probe B, 柳生春 POV)

**Established (柳生春+金鳳):**
- night 1: 親密 · recurs · intimateMem=1
- night 2: 親密 · recurs · intimateMem=2
- night 3: 踰矩 · recurs · intimateMem=3
- night 4: 親密 · recurs · intimateMem=3
- night 5: 親密 · recurs · intimateMem=3

**Forbidden (柳生春+蘇映雪):**
- night 1: 含蓄 · holds back · neverDaredMem=2
- night 2: 含蓄 · holds back · neverDaredMem=2
- night 3: 無    · holds back · neverDaredMem=1
- night 4: 含蓄 · holds back · neverDaredMem=0
- night 5: 含蓄 · holds back · neverDaredMem=0

---

## Honest read

**Does letting the character DECIDE (with recall) replace both mechanical gates?**
Yes, and cleanly — with one surprise about *what* emerges.

- **Rehearsal gate → gone.** The old scalar routing forced 柳生春 absent 4/4; that
  4/4-absence was an artifact of a hand-set weight, not a choice. Given a fair
  presentation she chooses the stage **9/9**, and the choice is *grounded in the
  debt* (she names 金鳳 / 欠下的債 and presses it down to sing it into the role). So
  the reframe fixes the false over-absence.

- **The wavering the prompt hoped for did NOT show up as a rehearsal-day coin-flip.**
  Honest: with equal want-weights and strong stage stakes, she is stably GO. The
  reframe does not, by itself, make her *skip* rehearsal — it makes her stop being
  *falsely yanked away*. The debt still gets discharged, but the decision routes it
  to **night** on its own (Probe B forbidden: 5/5 she exits to 金鳳 after dark). That
  time-routing is the most interesting unscripted result — same character, same
  wants, chooses stage-by-day and debt-by-night with no gate telling her when.

- **Established intimacy recurs — 5/5 — driven by surfaced memory.** The intimate
  memory (窄床/門道/縫水袖) surfaces every night (5/5) and, with the private setting,
  physical closeness recurs every night. 金鳳's POV is unambiguously 踰矩 (she
  initiates). This is the "it's ours, it recurs" the reframe wanted, from recall,
  not a knob.

- **Forbidden intimacy stays rare — 0/5 — and does NOT leak.** She never touches
  蘇映雪; the never-dared memory makes her not dare, and she leaves. The
  established/forbidden gap (5/5 vs 0/5) is produced purely by the recalled memories
  + partner name, with the identical mechanism. **Core claim validated.**

**What's still weak:**

1. **Established recurrence is repetitive, not richly re-invented.** The 5 nights'
   prose is near-identical ("按住她縫水袖的手…捅破窗戶紙…乾淨的交代"). It recurs, but it
   risks becoming *mechanical the other way* — one latched beat replayed. A real
   loop wants variation across nights (temperature, or a "we already did this last
   night" recall that pushes novelty).

2. **柳's own POV frames the established night as debt-reckoning more than romance.**
   Her verbs are 交代/了結/再無回頭路; the tenderness (縫/摩挲/按手) is real but secondary,
   and the overt physicality is mostly 金鳳-initiated. So "intimacy recurs" is true at
   the closeness level (§2.47 親密/踰矩) but 柳 is arguably heading toward a *break-up*
   scene, not a renewed tryst. The keyword classifier counts closeness, not intent.

3. **Recall provenance decays under sequential accumulation.** Forbidden
   never-dared-mem surfaced 2/2/1/0/0 across nights — the remembered "書寓·夜" beats
   crowded the seed memories out of the top-5 window by nights 4–5. The *decision*
   held (0/5) because the debt want carried it, but the memory that should justify
   the restraint stopped surfacing. Recall reliability degrades as the store grows;
   the seed identity memories need higher importance or an anchor so recent chatter
   does not evict them.

4. **No true rehearsal SKIP was observed**, so "she can *choose* to skip for the
   debt" is only shown indirectly (she skips *蘇映雪* at night, not *rehearsal* by
   day). To test skip-vs-attend as a genuine fork you'd need a slot where the debt
   is acute AND there is no competing stage-stake — this run's rehearsal day always
   had 江聞鶴 + 師姐 + 招牌 pulling her to the floor.

**Bottom line:** `chooseAction` + `recall` replaces both scalar gates with a
grounded decision, and the established-vs-forbidden texture emerges from the
recalled memory alone (5/5 vs 0/5). The strongest unscripted win is *temporal
routing* (stage-by-day, debt-by-night). The two real risks are recurrence going
mechanical/repetitive and recall evicting the identity memories that carry the
distinction.
