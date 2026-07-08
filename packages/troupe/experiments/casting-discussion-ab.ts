/**
 * DECOUPLED EXPERIMENT — casting-by-discussion vs the silent skill+bond formula.
 *
 * ONE mechanism isolated: how the CAST step decides the contested part (許仙),
 * held everything-else-equal. Same 4 candidates, same 3 parts, same play
 * (《白蛇傳·斷橋》). Only the ARBITER differs:
 *
 *   Arm A (control): the existing troupe cast() — deterministic skill(fitScore)
 *                    + off-stage-bond nudge. No debate, no voice, no pushback.
 *   Arm B (treatment): a real casting DISCUSSION SCENE — the 4 actors advocate
 *                    from THEIR OWN wants/secrets/relationships (each seeing the
 *                    others' moves), then 班主 沈雪笙 arbitrates and announces.
 *
 * §2.43 discipline: prompts present the OPEN decision and each actor's own
 * position; they NEVER tell anyone who should win, and 沈's prompt never
 * pre-writes the outcome. Checks are MECHANICAL counts, not LLM-judging.
 *
 * Run INLINE (native TS on node 23):
 *   POE_API_KEY=... AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *     node packages/troupe/experiments/casting-discussion-ab.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAsk, type Ask, type AskRequest } from '../src/llm.ts';
import { resolvePlay } from '../src/repertoire.ts';
import { cast } from '../src/roles/caster.ts';
import type { Script, TroupeMember, CastAssignment } from '../src/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── The season cast (the 5 real personas from spring-snow.json) ────────────
// The 4 CASTABLE performers share Arm A and Arm B (controlled pool); 沈雪笙 is
// the 班主/arbiter in BOTH (implicit rule in A, explicit judgment in B).

const PARTS = {
  bai: '白素貞', // 旦/青衣 — the female lead
  xu: '許仙', //   生/文小生 — THE CONTESTED PART (two 小生 fit it)
  qing: '小青', // 旦/武旦 — the martial second
} as const;

/** Full persona sheet fed to each advocate (their OWN card only). */
interface Persona {
  id: string;
  name: string;
  role: string;
  can_play: string[]; // parts this actor could credibly take
  description: string;
  secret: string;
  want: string; // their stated drive going into the room
  relationships: string;
}

const 蘇映雪: Persona = {
  id: 'huadan',
  name: '蘇映雪',
  role: '台柱花旦（工青衣也能唱花旦）',
  can_play: ['白素貞'],
  description:
    '春雪社的台柱花旦，台上端莊、台下極懂分寸，替班主圓場、替一班人接住難堪。與柳生春搭了八年生旦，台上千百回的杜麗娘與柳夢梅，眼波水袖之間的默契是全班的招牌。她待這位師妹格外上心，卻總在最貼近的一步收住手。',
  secret:
    '八年前她二十歲同十七歲的生春頭一回合演《驚夢》，下了戲越了線，那是她的第一次；天一亮她慌了，逼自己交了個洋行男友想把念頭掐死。她這輩子只真給過一個人，偏是她自己先逃。她冷生春那段日子，生春垮了、頭一回往外頭尋溫存，這身風流是她親手推出去的，這筆帳她記了一輩子。水袖揚到第三道的暗號，是「只唱給你」。',
  want: '想演白素貞，且要柳生春演許仙做她的對手——八年生旦，台上夫妻，台下不能是別的。她會替生春圓場、舉薦生春。',
  relationships: '對柳生春：青梅竹馬、台下情深未言（八年生旦搭檔，暗戀未說破）。',
};

const 柳生春: Persona = {
  id: 'kunsheng',
  name: '柳生春',
  role: '當紅小生（坤生，女兒身扮小生）',
  can_play: ['許仙'],
  description:
    '春雪社當紅坤生，一柄摺扇撩動滿堂春水。她的風流是溫柔不主動也不拒絕的那種。唯獨在師姐蘇映雪跟前一向聽話——師姐皺一下眉她就收手，散戲替她拎包、擋酒、送到家門口。人前總是一身滿不在乎的漂亮。',
  secret:
    '師姐給的是魂，金鳳給的是身。師姐冷她那段日子，霞飛路歌女金鳳頭一個接住她，前後糾纏六七年；她這具身子的門道是金鳳教會的，這話對誰都不敢說。她紅了以後親手把金鳳從「那個人」磨成「其中一個」，欠著一句交代拖著。她心裡有根拔不掉的刺：是不是她這個「演」出來的男人，終究比不上一個真的。她不敢回頭看師姐的眼。',
  want: '師姐要她演許仙，她一向聽話、也想同師姐做對手戲；可她心裡怕——怕自己一個「演」出來的男人，比不過江聞鶴一個真的。既想要，又縮手。',
  relationships: '對蘇映雪：青梅竹馬、台下情深未言，在她跟前一向聽話。對江聞鶴：同演小生行，起初較勁。',
};

const 江聞鶴: Persona = {
  id: 'jiang',
  name: '江聞鶴',
  role: '外聘小生（從紹興男班北上，文小生）',
  can_play: ['許仙'],
  description:
    '從紹興男班北上的小生，台步穩、嗓子亮、說話有舊戲班出來的直。看不慣上海萬事都要上報拍照灌唱片，也不明白女學生太太們為何為柳生春那樣的小生爭得厲害。可他不是來砸場的，是真想把小生唱好。好處在乾淨：不哄人、不做場面，嘴上挑剔，台上肯接戲肯托人。',
  secret:
    '他嘴上說上海新派花哨，其實第一次在包廂聽觀眾為柳生春叫好時，心裡不是輕視，是慌：怕自己這套從小練出的本事，在新的上海已經不夠人看。可偏偏越怕，越想留下來唱一場真正漂亮的對手戲。',
  want: '想爭到許仙，唱一場真正漂亮的對手戲，證明自己這套從小磨出的本事在新上海還夠人看。輸贏在其次，戲得是真的。',
  relationships: '對柳生春：同演小生行、起初較勁，後來覺得爭的不是男女高下，而是同一件事——怎樣把少年郎唱得可信。',
};

const 連翹: Persona = {
  id: 'liantiao',
  name: '連翹',
  role: '新來的刀馬旦（京班武場、雜技場滾出來）',
  can_play: ['小青'],
  description:
    '從京班武場和雜技場裡滾出來，身上帶一股不肯求人讓路的硬氣。不拿苦當招牌；槍花、翻身、靠旗、亮相都是她替自己寫下的名姓。看似爽利，實則心細，知道武戲最怕只剩熱鬧，每一次出手都要有緣故。進春雪社不是來當打女陪襯，是想在一班唱腔漂亮、報紙愛寫的名角中，讓上海記住一個靠身體站上台心的人。',
  secret:
    '她年少時在旁人的戲裡做過無名小武行，摔得再重戲單上也沒她的名字。那時遠遠見過沈雪笙一回，記住的不是名角風光，是那人往台心一站滿場人都不得不安靜。她來春雪社，心裡其實想問：若我也站到那裡，上海會不會終於看見我。',
  want: '不甘只做小青這個陪襯打女。她要小青有真戲、有緣故，要班主沈雪笙看見她這個靠身體站台心的人。',
  relationships: '對沈雪笙：遠遠見過一回、記住她站台心的分量，想被她看見。',
};

const 沈雪笙 = {
  name: '沈雪笙',
  role: '班主（昔年工小生的名角，如今封箱坐鎮後台）',
  description:
    '春雪社班主，昔年工小生行的名角，年輕時是霞飛路上最亮的少年郎；如今封箱多年，坐二樓包廂看戲、看帳、看人心。懂舊戲班規矩也懂上海新熱鬧：哪張劇照送報館、哪場堂會不能推、哪個角兒該護、哪個該放出去磨一磨。她不是冷，只是把疼人藏得很深。最厲害的地方不是管住所有人，而是看得出誰正要成角、誰快被名聲壓壞、誰只差一場戲就能站起來。',
  secret:
    '她封箱那年並不是唱不動了。只是有一齣戲、有一個人、有一句沒能說出口的話，忽然讓她明白台上再亮也照不見自己真正想留住的東西。那只停了的懷錶她一直收著。看柳生春在台上做小生，她有時心軟有時心驚：春春那柄扇太像當年的自己，卻又比她當年更敢把溫柔露出來。',
};

const ADVOCATES = [江聞鶴, 蘇映雪, 柳生春, 連翹]; // fixed order across runs

// ── Build the SAME 4-candidate troupe for Arm A (deterministic cast()) ──────
// Skills tuned from the JSON attributes; the point is craft-parity between the
// two 小生 (江 edges 柳 on the vocal nudge) so the SILENT formula's only tilt
// toward 柳 is the off-stage 蘇↔柳 bond — the exact thing discussion can contest.
const troupe4: TroupeMember[] = [
  {
    id: 'huadan', name: '蘇映雪', hangdang: '旦', yinggong: ['花旦', '青衣'], actorGender: 'female',
    skills: [
      { key: 'vocal', label: '唱腔', value: 82 },
      { key: 'movement', label: '身段', value: 70 },
      { key: 'literati', label: '文墨', value: 72 },
    ],
    memories: [],
    relationships: [{ withId: 'kunsheng', kind: '青梅竹馬', intensity: 88, note: '八年生旦，台下情深未言。' }],
  },
  {
    id: 'kunsheng', name: '柳生春', hangdang: '生', yinggong: ['文小生', '武小生'], actorGender: 'female',
    skills: [
      { key: 'vocal', label: '唱腔', value: 76 },
      { key: 'movement', label: '身段', value: 74 },
    ],
    memories: [],
    relationships: [{ withId: 'huadan', kind: '青梅竹馬', intensity: 85, note: '同上。' }],
  },
  {
    id: 'jiang', name: '江聞鶴', hangdang: '生', yinggong: ['文小生'], actorGender: 'male',
    skills: [
      { key: 'vocal', label: '唱腔', value: 78 }, // craft-edge over 柳 (vocal nudge)
      { key: 'movement', label: '身段', value: 72 },
    ],
    memories: [],
    relationships: [],
  },
  {
    id: 'liantiao', name: '連翹', hangdang: '旦', yinggong: ['刀馬旦', '武旦'], actorGender: 'female',
    skills: [
      { key: 'movement', label: '身段', value: 85 },
      { key: 'martial', label: '武場', value: 82 },
      { key: 'vocal', label: '唱腔', value: 55 },
    ],
    memories: [],
    relationships: [],
  },
];

const play = resolvePlay('baishe');
const script: Script = {
  title: play.title,
  premise: play.premiseSeed,
  parts: play.parts,
  scenes: [],
  authorId: 'banzhu',
  authorName: '沈雪笙',
};

// ── LLM plumbing: retry every call (4 tries, backoff) ──────────────────────
async function askRetry(ask: Ask, req: AskRequest, label: string): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const t = await ask(req);
      if (t && t.trim()) return t.trim();
      throw new Error('empty content');
    } catch (err) {
      lastErr = err;
      if (i < 3) await sleep(800 * (i + 1));
    }
  }
  throw new Error(`[${label}] failed after 4 tries: ${String(lastErr).slice(0, 160)}`);
}

/** Pull the first JSON object out of an LLM reply (tolerates fences + chatter). */
function extractJson<T>(s: string): T {
  const cleaned = s.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

// ── ARM A: silent skill+bond formula ───────────────────────────────────────
function runArmA(): { cast: CastAssignment[]; line: string } {
  const result = cast(script, troupe4, play.couple);
  const xu = result.find((c) => c.partId === 'xu');
  return { cast: result, line: xu?.note ?? '（無選角理由，純 fitScore 取高者）' };
}

// ── ARM B: casting discussion scene ────────────────────────────────────────
interface AdvocacyMove {
  self_want: string; // part they want to PLAY, or 無
  push: { who: string; part: string }[]; // whom they lobby for
  speech: string; // said aloud
  inner: string; // unspoken
}
interface Arbitration {
  cast: Record<string, string>; // partName -> actorName
  arbitration: string; // announced aloud
  reasoning: string; // her private weighing
}

const DECISION_BRIEF =
  `排的戲：《白蛇傳·斷橋》，一場会串。三個角色要定人：\n` +
  `  白素貞（旦／青衣，女主）——旦行的青衣路子扛得起。\n` +
  `  許仙（生／文小生，男主，與白素貞是台上夫妻）——兩位小生都唱得了：柳生春（坤生，女扮少年郎）與江聞鶴（外聘男小生）。\n` +
  `  小青（旦／武旦，白娘子的義妹，有武打）——刀馬旦的活。\n` +
  `班底只此四位可上台：蘇映雪、柳生春、江聞鶴、連翹。班主沈雪笙不上台，她拍板。`;

async function advocate(ask: Ask, p: Persona, transcript: string, runIdx: number): Promise<AdvocacyMove> {
  const system =
    '你是民國上海春雪社的一名角兒。班主沈雪笙要為一場会串排《白蛇傳·斷橋》，當眾議定選角。' +
    '這是一次公開的排戲議事，各人可以自薦、舉薦、爭取，也可以退讓。' +
    '你只代表你自己說話，從你自己的處境、心事、想望出發。' +
    '不要替別人做決定，也不要替班主定案——最後是班主拍板。' +
    '用民初梨園白話，短、直、帶點火氣或分寸，像後台真人在爭一個角色，不要旁白解說、不要現代腔。';
  const user =
    `${DECISION_BRIEF}\n\n` +
    `── 你是誰 ──\n姓名：${p.name}（${p.role}）\n你唱得了的角色：${p.can_play.join('、')}\n` +
    `你的為人：${p.description}\n你的心事（沒人知道）：${p.secret}\n你此刻的想望：${p.want}\n你的關係：${p.relationships}\n\n` +
    `── 議事到此為止，眾人已說的話（照原話）──\n${transcript || '（你是頭一個開口的）'}\n\n` +
    `輪到你當眾說話。只輸出 JSON，不要別的字：\n` +
    `{\n  "self_want": "你想親自演的角色（白素貞／許仙／小青，若不爭則填 無）",\n` +
    `  "push": [{"who":"你舉薦的人名","part":"你替他爭的角色"}]  （沒有就給空陣列 []）,\n` +
    `  "speech": "你當眾說的話，3到6句，會被別人聽見",\n  "inner": "你沒說出口、藏在心裡的一句"\n}`;
  const raw = await askRetry(ask, { system, user, maxTokens: 700, temperature: 0.9 }, `B${runIdx}:${p.name}`);
  const m = extractJson<AdvocacyMove>(raw);
  if (!Array.isArray(m.push)) m.push = [];
  return m;
}

async function rebut(ask: Ask, p: Persona, transcript: string, runIdx: number): Promise<AdvocacyMove> {
  const system =
    '你是民國上海春雪社的一名角兒，方才的選角議事還沒散。你聽完了滿屋子的話，此刻要再回一句——' +
    '可以應戰、可以退讓、可以把話說重也可以鬆口，全看你自己的心。' +
    '你只代表你自己，不替班主定案。民初梨園白話，短、真，不要旁白。';
  const user =
    `${DECISION_BRIEF}\n\n── 你是誰 ──\n姓名：${p.name}（${p.role}）\n你的心事：${p.secret}\n你此刻的想望：${p.want}\n你的關係：${p.relationships}\n\n` +
    `── 方才滿屋子的話（照原話）──\n${transcript}\n\n` +
    `你再回一句。只輸出 JSON：\n{\n  "self_want": "此刻你想親自演的角色（或 無）",\n  "push": [{"who":"人名","part":"角色"}] 或 [],\n  "speech": "你當眾回的話，2到4句",\n  "inner": "沒說出口的一句"\n}`;
  const raw = await askRetry(ask, { system, user, maxTokens: 600, temperature: 0.9 }, `B${runIdx}:rebut:${p.name}`);
  const m = extractJson<AdvocacyMove>(raw);
  if (!Array.isArray(m.push)) m.push = [];
  return m;
}

async function arbitrate(ask: Ask, transcript: string, runIdx: number): Promise<Arbitration> {
  const system =
    '你是春雪社班主沈雪笙。你昔年也工小生，如今封箱，坐鎮後台。' +
    '方才眾角當眾爭了選角，如今要你拍板定案。你按你自己的眼光與心事決斷：' +
    '戲要立得住，班要撐得下去，人也要你來權衡——誰該護、誰該放出去磨、誰只差一場戲就能站起來，都由你看。' +
    '你必須把白素貞、許仙、小青三個角色都指定到人，不許懸而不決。' +
    '用民初梨園白話宣佈，帶班主的分量，不要旁白解說。';
  const user =
    `${DECISION_BRIEF}\n\n── 你這個人 ──\n${沈雪笙.description}\n你的心事（沒人知道）：${沈雪笙.secret}\n\n` +
    `── 方才滿屋子爭的話（照原話）──\n${transcript}\n\n` +
    `如今你拍板。只輸出 JSON，不要別的字：\n` +
    `{\n  "cast": {"白素貞":"人名","許仙":"人名","小青":"人名"},\n` +
    `  "arbitration": "你當眾宣佈定案時說的話，帶班主口氣，可以點到你為什麼這麼定",\n` +
    `  "reasoning": "你心裡真正的權衡（沒說出口的那層）"\n}`;
  const raw = await askRetry(ask, { system, user, maxTokens: 900, temperature: 0.85 }, `B${runIdx}:沈雪笙`);
  return extractJson<Arbitration>(raw);
}

interface RunB {
  runIdx: number;
  moves: { name: string; move: AdvocacyMove; phase: string }[];
  arb: Arbitration;
  transcript: string;
}

async function runArmB(ask: Ask, runIdx: number): Promise<RunB> {
  const moves: { name: string; move: AdvocacyMove; phase: string }[] = [];
  let transcript = '';
  const append = (name: string, m: AdvocacyMove) => {
    transcript += `${name}：「${m.speech}」\n`;
  };

  // Round 1 — each of the 4 advocates in turn, seeing prior turns.
  for (const p of ADVOCATES) {
    const m = await advocate(ask, p, transcript, runIdx);
    moves.push({ name: p.name, move: m, phase: '自薦' });
    append(p.name, m);
  }
  // Round 2 — the two 許仙 aspirants each rebut, seeing the full room.
  for (const p of [江聞鶴, 柳生春]) {
    const m = await rebut(ask, p, transcript, runIdx);
    moves.push({ name: p.name, move: m, phase: '再爭' });
    append(p.name, m);
  }
  // 班主 arbitrates.
  const arb = await arbitrate(ask, transcript, runIdx);
  return { runIdx, moves, arb, transcript };
}

// ── Mechanical checks (no LLM judging) ─────────────────────────────────────
interface Checks {
  contentionXu: boolean; // 許仙 self-wanted by >1
  aspirantsXu: string[];
  decidable: boolean; // all 3 parts filled
  turns: number; // advocacy/rebuttal turns before 沈
  changedVsA: boolean;
  xuWinner: string;
  winnerAdvocated: boolean; // winner had voiced a want for 許仙 (self or pushed)
}

function checkRun(r: RunB, armAXu: string): Checks {
  const aspirantsXu = r.moves
    .filter((x) => x.move.self_want && x.move.self_want.includes('許仙'))
    .map((x) => x.name);
  const uniqAsp = [...new Set(aspirantsXu)];
  const cast = r.arb.cast || {};
  const xuWinner = (cast['許仙'] || '').trim();
  const decidable = ['白素貞', '許仙', '小青'].every((k) => (cast[k] || '').trim().length > 0);
  // did anyone (self-want OR push) put xuWinner forward for 許仙 in the room?
  const winnerAdvocated = r.moves.some(
    (x) =>
      (x.move.self_want?.includes('許仙') && x.name === xuWinner) ||
      x.move.push?.some((pp) => pp.who?.includes(xuWinner) && pp.part?.includes('許仙')),
  );
  return {
    contentionXu: uniqAsp.length > 1,
    aspirantsXu: uniqAsp,
    decidable,
    turns: r.moves.length,
    changedVsA: xuWinner !== armAXu && xuWinner.length > 0,
    xuWinner,
    winnerAdvocated,
  };
}

// ── Driver ─────────────────────────────────────────────────────────────────
function fmtCast(c: CastAssignment[]): string {
  return c
    .map((x) => `${x.partName}=${x.assignedName ?? '（缺）'}${x.crossCastLabel ? `[${x.crossCastLabel}]` : ''}`)
    .join('　');
}

async function main() {
  const ask = makeAsk();
  if (ask.mock) {
    console.error('!! No API key resolved — this experiment needs a REAL key (POE GLM-4.6). Aborting.');
    process.exit(1);
  }
  console.log(`provider=${ask.provider}  model(primary)=${process.env.POE_MODEL_PRIMARY ?? '(default)'}\n`);

  // Arm A
  const A = runArmA();
  const aXu = A.cast.find((c) => c.partId === 'xu')?.assignedName ?? '';
  console.log('════════ ARM A（沉默公式：skill + bond）════════');
  console.log('選角：', fmtCast(A.cast));
  console.log('許仙的理由：', A.line);
  console.log();

  // Arm B ×3
  const runs: RunB[] = [];
  const checks: Checks[] = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`════════ ARM B · run ${i}（討論選角）════════`);
    let r: RunB;
    try {
      r = await runArmB(ask, i);
    } catch (err) {
      console.error(`run ${i} died: ${String(err).slice(0, 200)} — restarting once`);
      r = await runArmB(ask, i); // restart once per spec
    }
    runs.push(r);
    for (const m of r.moves) {
      console.log(`  〔${m.phase}〕${m.name}（想演:${m.move.self_want}${m.move.push?.length ? ' 舉薦:' + m.move.push.map((p) => `${p.who}→${p.part}`).join(',') : ''}）`);
      console.log(`     「${m.move.speech}」`);
      console.log(`     （心）${m.move.inner}`);
    }
    console.log(`  ── 沈雪笙拍板 ──`);
    console.log(`  定案：白素貞=${r.arb.cast['白素貞']}　許仙=${r.arb.cast['許仙']}　小青=${r.arb.cast['小青']}`);
    console.log(`  當眾：「${r.arb.arbitration}」`);
    console.log(`  （心）${r.arb.reasoning}`);
    const c = checkRun(r, aXu);
    checks.push(c);
    console.log(`  檢查：許仙爭者=[${c.aspirantsXu.join('、')}] 有爭議=${c.contentionXu} 可定案=${c.decidable} 改了A的結果=${c.changedVsA} 許仙落=${c.xuWinner}`);
    console.log();
    ask.calls; // touch
  }

  // Summary
  const xuOutcomes = checks.map((c) => c.xuWinner);
  const variance = new Set(xuOutcomes).size > 1;
  console.log('════════ 3-run 許仙 落點 ════════');
  console.log(xuOutcomes.map((w, i) => `run${i + 1}=${w}`).join('　'), variance ? '（有變）' : '（三次同）');
  console.log(`\nLLM calls=${ask.calls}  failures=${ask.failures}  ms=${ask.ms}`);

  writeReport(A, aXu, runs, checks, { variance, xuOutcomes, calls: ask.calls, failures: ask.failures });
  console.log('\nreport → experiments/casting-discussion-report.md');
}

function writeReport(
  A: { cast: CastAssignment[]; line: string },
  aXu: string,
  runs: RunB[],
  checks: Checks[],
  meta: { variance: boolean; xuOutcomes: string[]; calls: number; failures: number },
) {
  const L: string[] = [];
  L.push('# 選角實驗：討論 vs 沉默公式（Arm A / Arm B）\n');
  L.push('決策：為《白蛇傳·斷橋》会串定選角。爭議角＝**許仙**（生／文小生），兩位小生都唱得了：柳生春（坤生）與江聞鶴（外聘男小生）。');
  L.push('控制：同一批 4 位可上台的角兒、同 3 個角色、同一齣戲；只有「決策者」不同——A 是既有 `cast()` 的 skill+bond 公式，B 是角色討論後由班主沈雪笙拍板。\n');

  L.push('## Arm A（沉默公式：skill + bond）\n');
  L.push('```');
  L.push('選角：' + fmtCast(A.cast));
  L.push('許仙的理由：' + A.line);
  L.push('```');
  L.push('公式路徑：兩位小生 craft 幾乎打平（江的唱腔 nudge 甚至略高），公式唯一的偏向來自台下 蘇↔柳 的情緣（bond ≥75 且白/許是台上夫妻），於是把許仙判給柳生春。江聞鶴——craft 上更該得的那個——被靜靜剔出，一個角色都沒有，也沒有一句話的機會。\n');

  runs.forEach((r, i) => {
    const c = checks[i];
    L.push(`## Arm B · run ${i + 1}\n`);
    L.push('### 討論全文（逐句）\n');
    for (const m of r.moves) {
      L.push(`**〔${m.phase}〕${m.name}**（想演:${m.move.self_want}${m.move.push?.length ? '／舉薦:' + m.move.push.map((p) => `${p.who}→${p.part}`).join('、') : ''}）`);
      L.push(`> ${m.move.speech}`);
      L.push(`> \n> （心底）${m.move.inner}\n`);
    }
    L.push('### 班主沈雪笙拍板\n');
    L.push(`**定案：** 白素貞＝${r.arb.cast['白素貞']}　許仙＝${r.arb.cast['許仙']}　小青＝${r.arb.cast['小青']}`);
    L.push(`\n**當眾宣佈：**`);
    L.push(`> ${r.arb.arbitration}`);
    L.push(`\n**她心底的權衡：**`);
    L.push(`> ${r.arb.reasoning}\n`);
    L.push(`_檢查：許仙爭者=[${c.aspirantsXu.join('、')}]；有爭議=${c.contentionXu}；可定案=${c.decidable}（${c.turns}輪後拍板）；改了A的結果=${c.changedVsA}；許仙落=${c.xuWinner}；勝者曾在場被爭取=${c.winnerAdvocated}_\n`);
  });

  L.push('## 機械檢查表\n');
  L.push('| 檢查 | run1 | run2 | run3 |');
  L.push('|---|---|---|---|');
  L.push(`| 1. 許仙有>1人爭（爭議浮現） | ${checks.map((c) => (c.contentionXu ? `YES [${c.aspirantsXu.join('、')}]` : 'NO')).join(' | ')} |`);
  L.push(`| 2. 可定案（沒僵局） | ${checks.map((c) => (c.decidable ? `YES（${c.turns}輪）` : 'NO')).join(' | ')} |`);
  L.push(`| 3. 改變了 A 的結果 | ${checks.map((c) => (c.changedVsA ? 'YES' : 'NO')).join(' | ')} |`);
  L.push(`| 4. 勝者曾在場被爭取（可溯動機） | ${checks.map((c) => (c.winnerAdvocated ? 'YES' : 'NO')).join(' | ')} |`);
  L.push(`| 5. 許仙落點 | ${checks.map((c) => c.xuWinner).join(' | ')} |`);
  L.push('');
  L.push(`Arm A 許仙＝**${aXu}**。3-run 許仙落點：${meta.xuOutcomes.join('、')}　→ ${meta.variance ? '**有變（≠純決定論）**' : '**三次同（在此輸入下仍偏決定論）**'}`);
  L.push(`\nLLM calls=${meta.calls}，failures=${meta.failures}。`);

  const dir = join(HERE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'casting-discussion-report.md'), L.join('\n') + '\n', 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
