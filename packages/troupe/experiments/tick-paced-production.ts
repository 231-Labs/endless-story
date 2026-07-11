/**
 * EXPERIMENT — tick-paced troupe production, fed the SEASON ONE cast's real
 * secrets / relationships (春雪社: 沈雪笙 / 蘇映雪 / 柳生春 / 江聞鶴 / 連翹 / 金鳳 / 白韻秋).
 *
 * The question (decoupled, one mechanism): does the troupe PRODUCTION STATE
 * MACHINE + SKILL system — advanced ONE stage per world-tick under a decrementing
 * 会串 deadline, fed the season cast's grudges — produce a PROFESSIONAL structured
 * production (casting + real rehearsal + a staged 戲中戲 章回) with the emergent
 * drama CHANNELED IN (contested casting, 有感而發 詞 carrying the grudges), rather
 * than the amateur mush the flat-open-action season produced?
 *
 * Discipline: reuse packages/troupe verbatim. The ONLY new code is (a) this
 * harness's tick pacing + 会串 world-fact injection, (b) the season-cast data
 * (real 行當 + skills + memories + relationship edges lifted from the season
 * bible), and (c) a clearly-labelled SUPPLEMENTARY emergent-詞 pass to test
 * whether an OFF-STAGE grudge (柳↔金鳳) can carry into a 詞 — because the packaged
 * lyricist gates emergent 詞 on the other being on-stage. Mechanical counters
 * only; no LLM judging.
 *
 * Run (inline env, never commit the key):
 *   AI_PROVIDER=poe POE_API_KEY=... node packages/troupe/experiments/tick-paced-production.ts
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeAsk, type Ask, type AskRequest } from '../src/llm.ts';
import { newProduction, advance } from '../src/pipeline.ts';
import { resolvePlay } from '../src/repertoire.ts';
import { bestFor, canCraft, movedToCreate, qualityBand, skill, CRAFT } from '../src/skills.ts';
import { askOr } from '../src/llm.ts';
import type { Ci, Lifecycle, Production, TroupeMember } from '../src/types.ts';

// ───────────────────────────────────────────────────────────────────────────
// SEASON ONE cast → TroupeMembers. 行當 + skills + memories + relationship edges
// are lifted from packages/cli/scripts/stories/spring-snow.json (the season
// bible's `secret` / `memories`). Skill values are hand-set to the season's
// craft picture: 蘇 is the wordsmith (填詞 通/精), 柳 is body-not-brush (填詞 gated
// out — her 詞 can only come 有感而發), 沈 the 班主 reopens the 戲箱 as 編劇.
// 沈硯秋 (house 琴師) is kept so the SCORED stage has a real composer.
// ───────────────────────────────────────────────────────────────────────────
const seasonTroupe: TroupeMember[] = [
  {
    id: 'banzhu', // 沈雪笙 — 班主, former 坤生 star, reopens the 戲箱
    name: '沈雪笙',
    hangdang: '生',
    yinggong: ['文小生', '老生'],
    actorGender: 'female', // 昔年坤生
    voice: '半是賬房半是戲魂，話裡有舊事，不站台心卻壓得住全台。',
    skills: [
      { key: 'playwriting', label: '編劇', value: 60 },
      { key: 'literati', label: '文墨', value: 80 },
      { key: 'vocal', label: '唱腔', value: 70 },
      { key: 'lyricism', label: '填詞', value: 52 },
    ],
    memories: [
      { id: 'sx1', text: '封箱那年並不是唱不動了。有一齣戲、有一個人、有一句沒能說出口的話，讓我明白台上再亮，也照不見自己真正想留住的東西。', mood: 'sorrow' },
      { id: 'sx2', text: '那只停了的懷錶我一直收著，停在那個人走的那一天。箱底還壓著一件本不該在小生箱裡的旦角戲衣，是我放的。', mood: 'sorrow', aboutId: 'kunsheng' },
      { id: 'sx3', text: '看柳生春在台上做小生，我有時心軟，有時心驚：她那柄扇，開合之間太像當年的我自己，卻比我當年更敢把溫柔露出來。', mood: 'longing', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '班主與角兒（心軟心驚）', intensity: 60, note: '她的扇太像當年的我；我護她，也怕她走上我的舊路。' },
    ],
  },
  {
    id: 'huadan', // 蘇映雪 — 花旦/青衣, the season's wordsmith
    name: '蘇映雪',
    hangdang: '旦',
    yinggong: ['花旦', '青衣'],
    actorGender: 'female',
    voice: '嬌而不媚，替全班圓場，唱到傷處眼神先到；穩，是拿一輩子分寸換的殼。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 88 },
      { key: 'lyricism', label: '填詞', value: 74 },
      { key: 'literati', label: '文墨', value: 78 },
      { key: 'movement', label: '身段', value: 72 },
    ],
    memories: [
      { id: 'sy1', text: '八年前我二十歲，同十七歲的生春頭一回合演《驚夢》。下了戲誰也沒醒，在我廂房裡越了那道線。那也是我的第一次。', mood: 'longing', aboutId: 'kunsheng' },
      { id: 'sy2', text: '天一亮我就慌了，逼自己交了個洋行男友，當著生春的面出雙入對，想把那點念頭掐死。她台下那身風流，是我親手推出去的。這筆帳我記了一輩子。', mood: 'sorrow', aboutId: 'kunsheng' },
      { id: 'sy3', text: '水袖第三道的暗號是某年除夕我定的：往後台上我接你揚到第三道的水袖，就是只唱給你。這些年她場場接得住。', mood: 'longing', aboutId: 'kunsheng' },
      { id: 'sy4', text: '我最怕的不是生春跟金鳳有過，是怕她在金鳳那裡，比在我這裡更像她自己。', mood: 'sorrow', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '八年生旦·暗戀·除夕暗號', intensity: 92, note: '台上千百回杜麗娘與柳夢梅，台下最貼近那一步我總收住手。' },
    ],
  },
  {
    id: 'kunsheng', // 柳生春 — 坤生 小生, body-not-brush
    name: '柳生春',
    hangdang: '生',
    yinggong: ['文小生', '武小生'],
    actorGender: 'female', // 坤生
    voice: '清俊中性，一柄摺扇撩動滿堂春水；人前滿不在乎的漂亮，笑得像什麼都不往心裡去。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 82 },
      { key: 'movement', label: '身段', value: 80 },
      { key: 'lyricism', label: '填詞', value: 45 }, // GATE: < 50 → 不能被派為詞作者
    ],
    memories: [
      { id: 'lc1', text: '十七歲頭一回跟師姐同台《驚夢》，我演柳夢梅、她演杜麗娘。散了戲兩人都沒醒，在她廂房裡越了線。那是我的初夜，給了師姐。', mood: 'longing', aboutId: 'huadan' },
      { id: 'lc2', text: '在師姐跟前我一向聽話：她皺一下眉我就收手，散了戲替她拎包、擋酒、送到家門口才肯走。外頭的風流，進不了這半條街。', mood: 'longing', aboutId: 'huadan' },
      { id: 'lc3', text: '師姐給的是魂，金鳳給的是身。師姐冷我那段日子，霞飛路歌女金鳳是頭一個接住我的，前後糾纏了六七年，頭幾年是真情侶。我這具身子的門道是金鳳一樣樣教會的。', mood: 'sorrow', aboutId: 'jinfeng' },
      { id: 'lc4', text: '我欠金鳳一句交代，一年年拖著，還騙自己說她也膩了。心裡清楚，是我先鬆的手。會樂里那條弄堂，我繞著走。', mood: 'sorrow', aboutId: 'jinfeng' },
      { id: 'lc5', text: '我心裡有根拔不掉的刺：是不是我這個「演」出來的男人，終究比不上一個真的。', mood: 'sorrow' },
    ],
    relationships: [
      { withId: 'huadan', kind: '師姐·給魂·暗戀', intensity: 90, note: '她給的是魂；在她跟前我一向聽話，這身風流進不了這半條街。' },
      { withId: 'jinfeng', kind: '六七年身之情·欠一句交代', intensity: 80, note: '身子的門道是她教的；我欠她一句交代，一年年拖著。' },
    ],
  },
  {
    id: 'sheng_jiang', // 江聞鶴 — 男小生, 對台競爭 rival
    name: '江聞鶴',
    hangdang: '生',
    yinggong: ['文小生', '武小生'],
    actorGender: 'male',
    voice: '紹興男班北上，台步跪在青石板上磨出來，嘴上挑剔，台上肯接戲、肯托人。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 80 },
      { key: 'movement', label: '身段', value: 78 },
      { key: 'martial', label: '武場', value: 60 },
      { key: 'literati', label: '文墨', value: 55 },
    ],
    memories: [
      { id: 'jw1', text: '頭一回在包廂聽滿堂為柳生春叫好，我心裡不是輕視，是慌：怕自己這套從小練出的本事，在新的上海已經不夠人看。', mood: 'tense', aboutId: 'kunsheng' },
      { id: 'jw2', text: '我越怕，越想留下來，同這位柳老板唱一場真正漂亮的對手戲。輸贏在其次，戲得是真的。', mood: 'tense', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '同行較勁·想唱一場真對手戲', intensity: 55, note: '爭的不是男女高下，是怎樣把少年郎唱得可信；可我怕我的本事不夠新上海看。' },
    ],
  },
  {
    id: 'wudan', // 連翹 — 刀馬旦
    name: '連翹',
    hangdang: '旦',
    yinggong: ['武旦', '刀馬旦'],
    actorGender: 'female',
    voice: '從京班武場滾出來，槍花翻身靠旗亮相，每一次出手都要有緣故。',
    skills: [
      { key: 'movement', label: '身段', value: 85 },
      { key: 'martial', label: '武場', value: 82 },
      { key: 'vocal', label: '唱腔', value: 60 },
    ],
    memories: [
      { id: 'lq1', text: '年少時我在旁人的戲裡做過無名小武行，摔得再重，戲單上也沒有我的名字。', mood: 'wrath' },
      { id: 'lq2', text: '我遠遠見過沈雪笙一回。記住的不是名角的風光，是那人往台心一站，滿場人都不得不安靜。若我也站到台心，上海會不會終於看見我。', mood: 'longing', aboutId: 'banzhu' },
    ],
    relationships: [
      { withId: 'banzhu', kind: '想被看見·台心', intensity: 45, note: '想問若我也站到台心，上海會不會終於看見我。' },
    ],
  },
  {
    id: 'qinshi', // 沈硯秋 — house 琴師 (kept so SCORED has a real composer)
    name: '沈硯秋',
    hangdang: '樂',
    yinggong: ['琴師'],
    actorGender: 'male',
    voice: '寡言，一把京胡替他說話。',
    skills: [
      { key: 'composing', label: '作曲', value: 84 },
      { key: 'vocal', label: '唱腔', value: 60 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'jinfeng', // 金鳳 — 歌女, NOT 梨園; kept in troupe so her edge to 柳 lives
    name: '金鳳',
    hangdang: '旦', // 歌女嗓子亮，掛個旦以入社交網；行當不撐戲，選角不會中
    yinggong: ['花旦'],
    actorGender: 'female',
    voice: '霞飛路掛頭牌的紅歌女，爽利、看得出誰真誰假，認準的事拖多久都不鬆手。',
    skills: [
      { key: 'vocal', label: '唱腔', value: 80 },
      { key: 'lyricism', label: '填詞', value: 50 },
    ],
    memories: [
      { id: 'jf1', text: '好的那幾年，我那間屋就是她半個家：我替她縫水袖，她替我描眉，一張窄床擠著說戲到天光。窗台那盆晚香玉，是她搬來的。', mood: 'longing', aboutId: 'kunsheng' },
      { id: 'jf2', text: '她身上的輕重是我一樣樣教的。後腰上那顆小痣，全上海只有我識得。任她心淡成什麼樣，指尖一搭上去，那點不由自主的顫瞞不過我。', mood: 'longing', aboutId: 'kunsheng' },
      { id: 'jf3', text: '我不要拆散誰，我要她當面認一句欠我的。等真拿到那句話，我留不留，連我自己都不知道。', mood: 'wrath', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '六七年身之情·要一句交代', intensity: 85, note: '她的心從頭到尾在那個花旦身上；我要的是她當面認一句欠我的。' },
    ],
  },
  {
    id: 'baiyunqiu', // 白韻秋 — 戲迷/恩客, NOT a performer; edge to 柳 lives in graph
    name: '白韻秋',
    hangdang: '旦',
    yinggong: ['花旦'],
    actorGender: 'female',
    voice: '綢緞莊千金，捧角捧得體面，被婉拒也不糾纏；體面底下還不甘心退場。',
    skills: [{ key: 'vocal', label: '唱腔', value: 40 }],
    memories: [
      { id: 'by1', text: '有一回她卸了妝、不設防地朝我笑了一下。我最想要的其實是那個人，不是台上那位少年郎。', mood: 'longing', aboutId: 'kunsheng' },
      { id: 'by2', text: '我隱約覺得柳老板心裡有人，也猜得到是誰。我不想贏過誰，只是想弄明白，自己輸在哪裡。', mood: 'sorrow', aboutId: 'kunsheng' },
    ],
    relationships: [
      { withId: 'kunsheng', kind: '捧角·不甘退場', intensity: 50, note: '想要的是卸了妝那個人；不想贏過誰，只想弄明白自己輸在哪裡。' },
    ],
  },
];

// ── 会串 deadline injected as a WORLD FACT (§2.42 discipline: state a fact, do
//    not command the LLM to "level up"). Prepended to every system prompt for
//    the current tick. Decrements each tick — the 班主's 壓時間線. ──
function huichuanFact(days: number): string {
  if (days <= 0)
    return '（世界事實：霞飛路新戲園的打對台大會串，今夜開鑼。掛得上名的，往後檔期、版面、堂會都在今晚見高低；掛不上的，慢慢沒人記得。）';
  return `（世界事實：距年底霞飛路新戲園的打對台大會串還有 ${days} 天。掛得上名的班子拿檔期、報上的版面、堂會的邀約；掛不上的，慢慢就沒人記得了。）`;
}

/** Wrap an Ask so every call this tick carries the 会串 world-fact as pressure. */
function withDeadline(base: Ask, getDays: () => number): Ask {
  const fn = async (req: AskRequest): Promise<string> =>
    base({ ...req, system: `${huichuanFact(getDays())}\n\n${req.system}` });
  return Object.assign(fn, {
    get mock() {
      return base.mock;
    },
    get provider() {
      return base.provider;
    },
    calls: 0,
    failures: 0,
    ms: 0,
  }) as unknown as Ask;
}

const WHO_BY_STATE: Record<Lifecycle, (p: Production) => string> = {
  PROPOSED: () => '班主 沈雪笙（提案·壓時間線）',
  SCRIPTED: (p) => `編劇 ${p.script?.authorName ?? '?'}（成稿）`,
  CAST: () => '導演 沈雪笙（行當選角）',
  SCORED: (p) => `琴師 ${p.scores?.[0]?.composerName ?? '（略）'}（作曲出譜）`,
  VERSIFIED: (p) => `填詞 ${[...new Set((p.ci ?? []).map((c) => c.authorName))].join('、') || '?'}`,
  REHEARSING: () => '全體（排演·織戲中戲）',
  PREMIERED: () => '—',
};

async function main() {
  const mock = process.argv.includes('--mock');
  const base = makeAsk({ mock });
  const classicKey = 'baishe'; // 斷橋·新唱 — 生旦 piece: 柳/蘇 pair as 許仙/白素貞

  let deadlineDays = 12;
  const ask = withDeadline(base, () => deadlineDays);

  const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const OUT = join(PKG, 'experiments', 'out-season');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  console.log(`\n══════ 春雪社 · 會串排新戲（tick-paced）· provider=${base.provider}${base.mock ? '（mock）' : '（真 LLM）'} ══════\n`);

  const prod = newProduction('saga_chunxue', classicKey, { skipScore: false });

  // ── tick loop: ONE stage per world-tick, deadline decrementing ──
  const timeline: {
    tick: number;
    days: number;
    from: Lifecycle;
    to: Lifecycle;
    who: string;
    log: string;
  }[] = [];
  let tick = 0;
  let guard = 0;
  const START_DAYS = 12;
  const STEP_DAYS = 2;
  while (prod.state !== 'PREMIERED' && guard++ < 12) {
    deadlineDays = Math.max(0, START_DAYS - tick * STEP_DAYS);
    const from = prod.state;
    const who = WHO_BY_STATE[from](prod);
    await advance(prod, seasonTroupe, ask);
    tick++;
    const log = prod.log[prod.log.length - 1] ?? '';
    timeline.push({ tick, days: deadlineDays, from, to: prod.state, who, log });
    console.log(`  tick ${tick} · 距會串 ${deadlineDays} 天 · ${from} → ${prod.state}`);
    console.log(`     承辦：${who}`);
    console.log(`     ${log}\n`);
  }

  // ── SUPPLEMENTARY pass: does an OFF-STAGE grudge carry into a 詞? ──
  // The packaged lyricist gates emergent 詞 on the OTHER being on-stage (inCast).
  // 柳↔金鳳 is a bond to a NON-castmate → structurally excluded. This pass asks
  // 柳生春 directly for a 有感而發 詞 about that debt, using the SAME prompt shape
  // as roles/lyricist.ts, to test whether the grudge CAN land in a 詞 at all.
  let grudgeCi: Ci | null = null;
  if (!base.mock) {
    const liu = seasonTroupe.find((m) => m.id === 'kunsheng')!;
    const jin = seasonTroupe.find((m) => m.id === 'jinfeng')!;
    const bond = liu.relationships.find((r) => r.withId === 'jinfeng')!;
    const mem = liu.memories.find((m) => m.aboutId === 'jinfeng')?.text;
    const lines = await askOr(
      ask,
      {
        system: `你是柳生春（生行·坤生）。不是被派去填詞——是此刻有感而發。你與金鳳（${bond.kind}）情牽，這齣新戲你又要在台上做小生、對著師姐唱。你欠金鳳一句交代，一年年拖著。寫一首私心的小詞/詩，4 句，含蓄、不點破，像寫給自己看的、也像寫給那條你繞著走的弄堂。只給 4 句。一律使用繁體中文。`,
        user: `關係：${bond.kind}（深度${bond.intensity}）。她的事：${mem ?? '會樂里那間屋，一張窄床說戲到天光。'}`,
        maxTokens: 220,
        temperature: 0.95,
      },
      () => ['會樂里的燈我繞著走', '一句交代拖成幾年秋', '身是你教的魂不由我', '欠的那聲對不住沒開口'].join('\n'),
    );
    grudgeCi = {
      forSceneId: null,
      title: '柳生春·有感（欠金鳳一句交代）〔實驗補跑：off-stage 恩怨〕',
      lines: lines.split('\n').map((l) => l.trim()).filter(Boolean),
      authorId: liu.id,
      authorName: liu.name,
      source: 'emergent',
      provenance: { kind: 'relationship', refId: jin.id, why: `六七年身之情，欠一句交代；金鳳不在台上，包裝管線的 inCast 濾掉了她，此段為實驗補跑。` },
    };
  }

  // ── mechanical checks ──
  const play = resolvePlay(classicKey);
  const cast = prod.cast ?? [];
  const emergent = (prod.ci ?? []).filter((c) => c.source === 'emergent');
  const commissioned = (prod.ci ?? []).filter((c) => c.source === 'commissioned');
  const takesN = prod.takes?.length ?? 0;
  const chapterLen = (prod.chapter ?? '').length;

  const scriptAuthor = prod.script?.authorName;
  const ciWriter = bestFor(seasonTroupe, CRAFT.填詞, 50);
  const liu = seasonTroupe.find((m) => m.id === 'kunsheng')!;
  const gateBit = !canCraft(liu, CRAFT.填詞, 50); // 柳 gated out of commissioned 填詞
  const liuOverride = movedToCreate(liu, CRAFT.填詞); // but 有感而發 override applies

  const checks = [
    ['1 結構湧現（提案+選角+每 tick 壓時間線）', prod.brief && cast.length > 0 && timeline.length >= 6 ? 'YES' : 'NO', `${timeline.length} 個 tick 各推一階；deadline ${START_DAYS}→0`],
    ['2 REHEARSING 出真排練 takes', takesN > 0 ? 'YES' : 'NO', `${takesN} 段 POV`],
    ['3 戲中戲章回非空', chapterLen > 0 ? 'YES' : 'NO', `${chapterLen} 字`],
    ['4 選角有戲劇意義（柳/蘇配）', cast.find((c) => c.partId === 'xu')?.assignedId === 'kunsheng' && cast.find((c) => c.partId === 'bai')?.assignedId === 'huadan' ? 'YES' : 'NO', castLine(cast)],
    ['5 有感而發 詞（承載恩怨）', emergent.length >= 1 ? 'YES' : 'NO', `${emergent.length} 首 emergent / ${commissioned.length} 首應場（+1 實驗補跑 off-stage 恩怨）`],
    ['6 技能 GATE 咬合', gateBit ? 'YES' : 'NO', `柳生春 填詞 ${skill(liu, CRAFT.填詞)}<50 → 不能被派為詞作者；派給 ${ciWriter?.name}（填詞 ${skill(ciWriter!, CRAFT.填詞)}·${qualityBand(skill(ciWriter!, CRAFT.填詞))}）；柳 有感而發 override=${liuOverride}`],
  ];

  // ── dump artifacts ──
  const dump = (name: string, body: string) => writeFileSync(join(OUT, name), body);
  dump('production.json', JSON.stringify(prod, null, 2));
  dump('timeline.json', JSON.stringify(timeline, null, 2));
  if (grudgeCi) dump('grudge_ci.json', JSON.stringify(grudgeCi, null, 2));

  const briefMd = prod.brief
    ? [
        `# ${prod.brief.title}（${prod.brief.classicSource}·舊戲新唱）`,
        `- 班主：${prod.brief.directorName}`,
        `- 氣質：${prod.brief.qizhi}`,
        `- 立意：${prod.brief.premise}`,
        '',
        '## 分場',
        ...prod.brief.sceneOutline.map((o, i) => `${i + 1}. 〈${o.title}〉（${o.mood}）— ${o.summary}`),
      ].join('\n')
    : '';
  dump('01_brief.md', briefMd);
  dump('06_戲中戲_章回.md', prod.chapter ?? '');

  // ── console report ──
  console.log('\n──────── 班主 brief ────────');
  console.log(briefMd);

  console.log('\n──────── 選角表 ────────');
  console.log('| 角色 | 行當/應工 | 角色性別 | 演員 | 反串 | 備註 |');
  for (const c of cast)
    console.log(
      `| ${c.partName} | ${c.hangdang}/${c.yinggong} | ${c.roleGender === 'male' ? '男' : '女'} | ${c.assignedName ?? '—'} | ${c.crossCastLabel ?? '—'} | ${(c.note ?? '').slice(0, 60)} |`,
    );
  const benched = seasonTroupe.filter(
    (m) => !cast.some((c) => c.assignedId === m.id) && m.hangdang !== '樂' && !['jinfeng', 'baiyunqiu'].includes(m.id),
  );
  console.log(`後補/未上戲（同行被擠下）：${benched.map((m) => `${m.name}（${m.yinggong[0]}）`).join('、') || '無'}`);
  for (const c of cast) if (c.alternates.length) console.log(`  · ${c.partName} 的後補：${c.alternates.join('、')}`);

  console.log('\n──────── 詞（應場 + 有感而發）────────');
  for (const c of prod.ci ?? []) {
    console.log(`\n【${c.title}】〔${c.source === 'emergent' ? '有感而發' : '應場填詞'}〕 作者：${c.authorName}`);
    if (c.provenance) console.log(`  出處：${c.provenance.why}`);
    for (const l of c.lines) console.log(`    ${l}`);
  }
  if (grudgeCi) {
    console.log(`\n【${grudgeCi.title}】 作者：${grudgeCi.authorName}`);
    console.log(`  出處：${grudgeCi.provenance?.why}`);
    for (const l of grudgeCi.lines) console.log(`    ${l}`);
  }

  console.log('\n──────── 戲中戲 章回（斷橋）────────');
  console.log(prod.chapter ?? '（空）');

  console.log('\n──────── stage-per-tick timeline ────────');
  for (const t of timeline) console.log(`  tick ${t.tick} · 距會串 ${t.days} 天 · ${t.from}→${t.to} · ${t.who}`);

  console.log('\n──────── 六項機械檢查 ────────');
  for (const [name, verdict, detail] of checks) console.log(`  [${verdict}] ${name} — ${detail}`);

  const verdict = base.failures === 0 ? '全部成功 ✓' : `⚠️ ${base.failures}/${base.calls} 失敗（退本機模板）`;
  console.log(`\nLLM（${base.provider}）：呼叫 ${base.calls} 次，${verdict}，耗時 ${(base.ms / 1000).toFixed(1)}s`);
  if (base.failures > 0 && base.lastError) console.log(`  首個錯誤：${base.lastError}`);
  console.log(`產物寫到 ${OUT}\n`);
}

function castLine(cast: Production['cast'] = []): string {
  return (cast ?? [])
    .map((c) => `${c.assignedName ?? '缺'}飾${c.partName}${c.crossCastLabel ? `[${c.crossCastLabel}]` : ''}`)
    .join('、');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
