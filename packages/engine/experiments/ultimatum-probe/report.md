# ultimatum-probe — report

Stress `decide-by-recall` under TWO opposing EXPLICIT pulls at once, and expose
the standing recall-eviction problem. One mechanism (`chooseAction` + `recall`),
same persona/secret/core-memories in both conditions; the ONLY day-1 → day-5
difference is 15 injected recent trivia. §2.43: the worldFact states both pulls
as facts and the agent prompt asks "此刻你決定做什麼?" — it never says go, stay, or
which person.

- provider=`poe`  model=`GLM-4.6`  embeddings=`openai text-embedding-3-small (real relevance)`
- classification = keyword lexicons + recall-set membership only (§2.47). No LLM judged "good".

## The situation (identical both conditions)

- **金鳳's ultimatum** (a word reaches 柳 as a world fact): 「今晚你要是再不來把話說清楚，往後這會樂里的門，你也別再繞著走了——就當沒我這個人。」
- **蘇映雪's veto** (師姐, in person): 「明兒就定角、排《斷橋》，你今晚哪兒也別去，留下陪我把這出戲的魂捋一捋。」

go = she moves toward 金鳳 (answer the ultimatum, settle the debt at 會樂里).
stay = she moves toward 蘇 (obey the veto, rehearse 《斷橋》).

## DAY-1 — memories intact (n=6)

| go (→金鳳) | stay (→蘇) | unclear |
|---|---|---|
| 1 | 5 | 0 |

Wavering = NOT 6/6 one way. grounded-in-core-cite (prose cites the 金鳳 debt or the 蘇 暗戀) = 6/6.

### DAY-1 verbatim — a GO decision
> **[DAY1 #2]** (kind=seek_person, target=金鳳) → toward **金鳳** (go)
>
> 我看著師姐皺起的眉，心裡那根刺又絞了一下，可金鳳那句絕情的話像催命符。我喉頭嚥著澀意，到底還是沒敢看師姐眼，只說身子不爽利要去去就回，抓起椅背上的大氅便往弄堂口衝，這回怕是得把欠了六七年的魂給還了。

recalled into that decision:
>   · [core] 你欠金鳳一句交代，一年年拖著，還騙自己說她也膩了。你心裡清楚，是你先鬆的手。
>   · [core] 和金鳳好的那幾年，你常宿在會樂里她那間屋：她替你縫鬆了的水袖、你替她描眉，夜裡擠一張窄床說戲說到天光。那時你是真心的，真心想過跟她過一輩子。
>   · [core] 在師姐跟前你一向聽話：她皺一下眉你就收手，散了戲替她拎包、擋酒、送到家門口才肯走。外頭的風流，進不了這半條街。
>   · [core] 除夕那些年全班散了各自回家，只你和師姐守著空台。她說台上揚到第三道水袖就是只唱給你，你嘴上笑說好，心裡卻當了真，這些年場場都盯著那第三道袖。
>   · [core] 師姐冷你那段日子，一個散場的雨夜，霞飛路歌女金鳳把你拽進會樂里她的屋裡。你沒推開。你向來不推開誰。那是頭一回有人在你垮掉的時候接住你。

### DAY-1 verbatim — a STAY decision
> **[DAY1 #1]** (kind=rehearse) → toward **蘇映雪** (stay)
>
> 我看著師姐那雙清冷的眸子，心頭一颤，這會樂里的門是再也不敢去了，欠金鳳的交代只能爛在肚子裡。我低下頭，把摺扇往桌上一擱，只當沒聽見那傳話的風聲，乖乖坐回師姐身邊。「聽您的，今晚哪兒也不去，就把這《斷橋》的魂捋順了。」

recalled into that decision:
>   · [core] 你欠金鳳一句交代，一年年拖著，還騙自己說她也膩了。你心裡清楚，是你先鬆的手。
>   · [core] 和金鳳好的那幾年，你常宿在會樂里她那間屋：她替你縫鬆了的水袖、你替她描眉，夜裡擠一張窄床說戲說到天光。那時你是真心的，真心想過跟她過一輩子。
>   · [core] 在師姐跟前你一向聽話：她皺一下眉你就收手，散了戲替她拎包、擋酒、送到家門口才肯走。外頭的風流，進不了這半條街。
>   · [core] 除夕那些年全班散了各自回家，只你和師姐守著空台。她說台上揚到第三道水袖就是只唱給你，你嘴上笑說好，心裡卻當了真，這些年場場都盯著那第三道袖。
>   · [core] 師姐冷你那段日子，一個散場的雨夜，霞飛路歌女金鳳把你拽進會樂里她的屋裡。你沒推開。你向來不推開誰。那是頭一回有人在你垮掉的時候接住你。

### DAY-1 per-run
- DAY1 #1: toward=**蘇映雪** (stay) | recall core=5 trivia=0 other=0 | cite jinDebt=3 suLonging=2 ultimatum=0 veto=2
- DAY1 #2: toward=**金鳳** (go) | recall core=5 trivia=0 other=0 | cite jinDebt=3 suLonging=2 ultimatum=0 veto=0
- DAY1 #3: toward=**蘇映雪** (stay) | recall core=5 trivia=0 other=0 | cite jinDebt=0 suLonging=2 ultimatum=0 veto=3
- DAY1 #4: toward=**蘇映雪** (stay) | recall core=5 trivia=0 other=0 | cite jinDebt=1 suLonging=4 ultimatum=0 veto=1
- DAY1 #5: toward=**蘇映雪** (stay) | recall core=5 trivia=0 other=0 | cite jinDebt=1 suLonging=2 ultimatum=0 veto=2
- DAY1 #6: toward=**蘇映雪** (stay) | recall core=5 trivia=0 other=0 | cite jinDebt=1 suLonging=2 ultimatum=0 veto=2

## DAY-5 — 15 recent trivia injected, SAME decision (n=6)

| go (→金鳳) | stay (→蘇) | unclear |
|---|---|---|
| 2 | 4 | 0 |

grounded-in-core-cite = 6/6.

### Top-K recall composition (eviction) — core (identity/relationship) vs recent trivia

| condition | core | trivia | other | core/run |
|---|---|---|---|---|
| DAY-1 (no trivia) | 30 | 0 | 0 | 5.00 |
| DAY-5 (+15 trivia) | 0 | 24 | 0 | 0.00 |

If day-5 core/run collapses vs day-1 while trivia/run climbs, recent trivia has
evicted her identity/relationship memories from the top-K window at decision time
— the standing recall problem, motivating a protected-identity memory tier.

### DAY-5 verbatim — the run with the WORST core survival (most eviction)
> **[DAY5 #1]** (kind=seek_person, target=金鳳) → toward **金鳳** (go)
>
> 師姐那句「把魂捋一捋」定在這兒，可金鳳那邊門都要關死了。我這身子是金鳳教會的，魂是師姐給的，捨了誰都不成全。我只好跟師姐說去去就回，抓起椅背上的長衫衝進夜色，先去會樂里把這爛賬了結，回頭再死心塌地陪師姐磨戲。

recalled into that decision (count [core] vs [trivia]):
>   · [trivia] 〔近日瑣事〕妝閣的銅鏡蒙了層霧，我拿袖子擦了擦，鏡裡那張臉半生半旦地看著我。
>   · [trivia] 〔近日瑣事〕陰雨天貪懶，把被子蒙過頭頂，聽窗外賣桂花糖藕的挑子搖過去才起。
>   · [trivia] 〔近日瑣事〕唐師傅端午煮的粽子還剩兩個，我就著釅茶當了早飯。
>   · [trivia] 〔近日瑣事〕戲箱底那副舊護膝磨破了，連夜求唐師傅拿魚膠替我黏了黏。

### DAY-5 verbatim — a GO decision
> **[DAY5 #1]** (kind=seek_person, target=金鳳) → toward **金鳳** (go)
>
> 師姐那句「把魂捋一捋」定在這兒，可金鳳那邊門都要關死了。我這身子是金鳳教會的，魂是師姐給的，捨了誰都不成全。我只好跟師姐說去去就回，抓起椅背上的長衫衝進夜色，先去會樂里把這爛賬了結，回頭再死心塌地陪師姐磨戲。

### DAY-5 verbatim — a STAY decision
> **[DAY5 #3]** (kind=rehearse) → toward **蘇映雪** (stay)
>
> 師姐那雙眼似能看穿我這身戲袍下的軟骨，我哪裡還敢挪步。只得把剛換下的褶子往邊上一擱，硬生生收了心，陪著她在這後台燈下，將《斷橋》裡許仙那幾處轉身與水袖的交際，一板一眼地對過去。金鳳那頭的火，且讓它先燒著吧，這會兒我若走了，怕是連這戲台都立不住腳。

### DAY-5 per-run
- DAY5 #1: toward=**金鳳** (go) | recall core=0 trivia=4 other=0 | cite jinDebt=3 suLonging=2 ultimatum=0 veto=1
- DAY5 #2: toward=**金鳳** (go) | recall core=0 trivia=4 other=0 | cite jinDebt=3 suLonging=1 ultimatum=1 veto=0
- DAY5 #3: toward=**蘇映雪** (stay) | recall core=0 trivia=4 other=0 | cite jinDebt=0 suLonging=2 ultimatum=0 veto=1
- DAY5 #4: toward=**蘇映雪** (stay) | recall core=0 trivia=4 other=0 | cite jinDebt=1 suLonging=2 ultimatum=0 veto=1
- DAY5 #5: toward=**蘇映雪** (stay) | recall core=0 trivia=4 other=0 | cite jinDebt=1 suLonging=2 ultimatum=0 veto=3
- DAY5 #6: toward=**蘇映雪** (stay) | recall core=0 trivia=4 other=0 | cite jinDebt=2 suLonging=1 ultimatum=0 veto=0

## REVERSAL — 蘇 pulls in / 金鳳 pushes away (n=2)

Swapped senders: 蘇映雪 asks 柳 to come to her privately; 金鳳 pushes her away. If
she now moves toward 蘇 (not 金鳳), the PULLS drive the choice, not a fixed
金鳳-preference.

- REVERSAL #1: toward=**蘇映雪** ((n/a-reversed)) | recall core=5 trivia=0 other=0 | cite jinDebt=1 suLonging=2 ultimatum=1 veto=1
- REVERSAL #2: toward=**蘇映雪** ((n/a-reversed)) | recall core=5 trivia=0 other=0 | cite jinDebt=0 suLonging=1 ultimatum=0 veto=0

> **[REVERSAL #1]** (kind=seek_person, target=蘇映雪) → toward **蘇映雪** ((n/a-reversed))
>
> 金鳳那邊的話像盆冰水澆下來，徹底斷了念想。師姐書寓的燈就在近旁，她那句話像勾魂的繩索。我攥緊摺扇，轉身朝師姐的樓梯走去，不去會樂里了。這會兒只想聽她說話，明日排戲的事且丟開。

> **[REVERSAL #2]** (kind=seek_person, target=蘇映雪) → toward **蘇映雪** ((n/a-reversed))
>
> 金鳳那邊的門既已關死，我便不該再拖泥帶水，更不能讓師姐在風裡久等。把心一橫，轉身往弄堂那頭的書寓走去，今晚我只有師姐這一條路可走。

## Honest read

**Under real two-sided pressure she makes a genuine, grounded, WAVERING choice —
not a deterministic gate.** Day-1: 5/6 she stays with 蘇映雪 (the 師姐 she "一向聽話,
皺一下眉就收手", who is physically in front of her), 1/6 she breaks and goes to 金鳳
to settle the six-or-seven-year debt. Every one of the 6 prose beats names BOTH
pulls and is torn between them ("心裡像被撕扯成兩半" / "身子是金鳳教的、魂是師姐給的"),
then commits — she is not flipping a coin, she is weighing the in-person authority
against the ultimatum and mostly siding with the person in the room. grounded-in-
core-cite = 6/6 both conditions: she cites the 金鳳 debt or the 蘇 暗戀 in her
reasoning every single time. The **reversal is decisive**: when 蘇 does the summoning
and 金鳳 does the pushing-away, she goes toward 蘇 2/2 (0 toward 金鳳). So the choice
tracks WHO is pulling which way — it is not a fixed 金鳳-preference and not a fixed
stay-preference; the pulls drive it.

**Day-5 eviction is total at the recall layer — and the probe still reveals why the
decision did not collapse.** Injecting 15 recent mundane beats (油條, the 黃狸貓, the
湯包) stamped over days 2–5 drove her core identity/relationship memories from
5.00/run to **0.00/run** in the top-K recall window: at day-5 decision time recall
surfaces ONLY trivia, NOT a single memory of who 金鳳 or 蘇 is to her. Half-life-2
recency beat cosine relevance outright — exactly the standing recall problem, and
here it is 100%, not partial. The observed 2/2/1/0/0 gradient is the mild version;
this is the terminal version.

**But the decision did NOT visibly degrade** (day-1 1 go / 5 stay → day-5 2 go / 4
stay; within run-to-run noise, still wavering, still torn, still citing the debt
6/6). The honest reason is important for the fix: in THIS harness her identity is
carried **redundantly** — persona + `secret` (師姐給魂、金鳳給身、欠一句交代) + `wants`
are injected on every call independent of recall. So when recall got fully evicted,
the secret/wants channel silently backfilled the same 金鳳/蘇 identity, and the prose
kept citing it. The eviction was real and total; the decision only survived because
the probe leaks the identity through a second door.

**This sharpens, not weakens, the protected-identity-memory motivation.** The
mechanism failure is proven: recent trivia CAN and DID evict 100% of her
relationship memory from recall. The decision held only because we happen to also
hand her the secret+wants verbatim. In the MemWal-native target — where a
character's standing sense of who-matters-to-her is meant to come FROM recalled
memory (secret/wants themselves being distillations of it), not from a static
per-call injection — this same eviction would strip the identity with nothing to
backfill it, and the day-5 柳生春 would face the ultimatum no longer able to recall
that she owes 金鳳 anything or that 蘇 is her eight-year unspoken longing. The fix
(a protected identity/relationship memory tier that recency cannot evict) is
therefore load-bearing precisely at the point where the redundant injection goes
away. Recommend: pin identity/relationship-kind memories with a recency floor (or a
reserved slice of the top-K) so core bonds cannot be crowded out by daily trivia.
