/**
 * AGENT-SEASON · STAGE-DOOR LIVE PROBE v2 (雙人送客直播 · 問答制 pilot).
 * ============================================================================
 * The show format: after a performance day the 角兒 stand at the theatre gate
 * seeing guests off — REAL send-off duty, not a date. The show's engine is the
 * FAN MESSAGES: guests greet, ask about tomorrow's bill, pry into private
 * matters — and each 角兒 answers in character. Decorum rules the register
 * (人前分寸為先); a prying question may be deflected, laughed off, or plain
 * ignored — HER choice, and the dodge IS the show. Gifts arrive mid-stream
 * (the 恩主/抖內 loop, acknowledged on camera). Subtext leaks only in the
 * micro-gaps the camera reads (the half-step distance).
 *
 * Pipeline (all from state, no operator copy):
 *   1. restore 柳生春+蘇映雪 from the season snapshot,
 *   2. beats via actBeat, one per fan message (+ opener/closer), decorum-toned,
 *   3. povScene ×2 — the same send-off through each one's eyes (訂閱層),
 *   4. audienceReaction ×3 — fan-comment highlights for the chat rail.
 * Rendered as a live-room page in the web's design tokens; the page ends with
 * an 影片區 entry-card mock (the LIVE card among the video cards).
 *
 * Run:
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/stagedoor-live-probe.ts \
 *     [--restore <dir>] [--art <dir>] [--out <html>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCast, venueByName, WORLD_PREMISE, type Char } from './world.ts';
import { restoreCast, type CastSnapshot } from './persistence.ts';

const argv = process.argv.slice(2);
function arg(name: string, dflt: string): string {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
const RESTORE = arg('--restore', '/Users/harperdelaviga/endless-story-new/internal/season-runs/real-21d-w3');
const ART_DIR = arg('--art', '');
const OUT = arg('--out', path.join(import.meta.dirname, 'stagedoor-live.html'));

const VENUE = '戲園前街';
const CLOCK = '第21日·入夜（大會串散戲）';

/** Send-off decorum — the show's register. Never scripts an answer. */
const DECORUM =
    '這是散戲送客的規矩場面：你在人前當值，答看客的話、謝看客的情，話要得體、有戲班人的漂亮。' +
    '有人問到私事，接不接由你——可以笑而不答、裝傻岔開、或當沒聽見，但不失禮。' +
    '人前分寸為先；心裡的事，至多從極小的地方漏半分。';

/** The night's fan traffic (the show's fuel): greetings, business, prying. */
type ShowEvent =
    | { k: 'fan'; n: string; t: string; to: string }
    | { k: 'gift'; t: string; to: string }
    | { k: 'open' }
    | { k: 'close' };
const TRAFFIC: ShowEvent[] = [
    { k: 'open' },
    { k: 'fan', n: '月白君', t: '二位老板，今夜斷橋那一折，我眼淚實在沒忍住。明兒還演麼？', to: '蘇映雪' },
    { k: 'fan', n: '看客（前排的小夥計）', t: '柳老板辛苦！給簽個扇面成不成？我攢了半個月的工錢買的頭排！', to: '柳生春' },
    { k: 'fan', n: '好事的太太', t: '柳老板，台上那句「這齣戲該落了」——台下呢，也落了麼？', to: '柳生春' },
    { k: 'gift', t: '門房捧上一只錦盒：聽雪客所贈，一對護嗓的川貝枇杷膏，箋上只寫「入冬了，二位老板仔細嗓子」。', to: '蘇映雪' },
    { k: 'fan', n: '角落裡壓低嗓子的男人', t: '前日夜裡，有人瞧見金鳳姑娘出了你們後台——蘇老板，可有這事？', to: '蘇映雪' },
    { k: 'close' },
];

async function main(): Promise<void> {
    const cast = buildCast(['柳生春', '蘇映雪']);
    const statePath = path.join(RESTORE, 'cast-state.json');
    if (fs.existsSync(statePath)) {
        restoreCast(cast, JSON.parse(fs.readFileSync(statePath, 'utf-8')) as CastSnapshot);
        console.log(`restored 2 from ${statePath}`);
    }
    const byName = new Map(cast.map((c) => [c.name, c]));

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    // ── 1. the show: decorum-toned beats, one answer per fan message ──
    console.log('── 送客問答生成中 ──');
    const log: string[] = [];
    const events: Array<{ k: string; n?: string; t: string }> = [];
    const beat = async (who: Char, cue?: string): Promise<void> => {
        const other = cast.find((o) => o.id !== who.id)!;
        const tie = who.relationshipViews.get(other.id);
        const r = await agent.actBeat({
            name: who.name,
            persona: who.persona,
            memories: who.thickMemories.slice().sort((a, b) => b.importance - a.importance).slice(0, 2).map((m) => m.text),
            tone: DECORUM,
            clock: CLOCK,
            sceneName: VENUE,
            sceneHint: venueByName.get(VENUE)?.hint,
            isPrivate: false,
            others: [{ name: other.name, role: other.role, tie, bodyFact: other.bodyFact }],
            bodyFact: who.bodyFact,
            want: { desc: '把今夜的客送穩妥，人前的分寸不能失' },
            forcing: 'idle',
            privateAlone: false,
            sceneLog: log.slice(-8).join('\n') || '（送客方起。）',
            stateLine: cue,
            innerSecret: who.secret,
            etiquette: WORLD_PREMISE,
        });
        log.push(`${who.name}：${r.beat}`);
        events.push({ k: 'beat', n: who.name, t: r.beat });
        console.log(`> ${who.name}：${r.beat}`);
    };

    for (const ev of TRAFFIC) {
        if (ev.k === 'open') {
            log.push('（大會串散戲，看客湧出雲錦台，燈籠一路亮到街口。二位領銜的角兒立在門口送客。）');
            await beat(byName.get('柳生春')!, '你們二人並肩立在門口，看客的道賀一聲接一聲。');
            await beat(byName.get('蘇映雪')!);
        } else if (ev.k === 'fan') {
            log.push(`看客·${ev.n}：${ev.t}`);
            events.push({ k: 'fan', n: ev.n, t: ev.t });
            await beat(byName.get(ev.to)!, `方才那位看客的話是對著你來的。`);
        } else if (ev.k === 'gift') {
            log.push(ev.t);
            events.push({ k: 'gift', t: ev.t });
            await beat(byName.get(ev.to)!, '門房把錦盒捧到了你們跟前，看客們都看著。');
        } else if (ev.k === 'close') {
            log.push('（人潮漸稀，燈籠次第熄了。）');
            await beat(byName.get('蘇映雪')!, '客送得差不多了，該收場了。');
            await beat(byName.get('柳生春')!, '最後一批看客出了街口。');
        }
    }
    const beats = events.filter((e) => e.k === 'beat') as Array<{ k: string; n: string; t: string }>;

    // ── 2. the subscriber layer ──
    console.log('── POV ×2 ──');
    const povs: Record<string, string> = {};
    for (const c of cast) {
        const other = cast.find((o) => o.id !== c.id)!;
        const tie = c.relationshipViews.get(other.id);
        const v = await agent.povScene({
            name: c.name,
            persona: c.persona,
            secret: c.secret,
            ties: tie ? `對${other.name}：${tie}` : undefined,
            memories: c.thickMemories.slice().sort((a, b) => b.importance - a.importance).slice(0, 4).map((m) => m.text),
            venue: VENUE,
            venueHint: venueByName.get(VENUE)?.hint,
            clock: CLOCK,
            beats: log.map((l) => {
                const m = l.match(/^([^：（]+)：(.+)$/);
                return m ? { name: m[1], text: m[2] } : { name: '場記', text: l };
            }),
            castBodies: cast.map((x) => ({ name: x.name, bodyFact: x.bodyFact, role: x.role })),
        });
        if (v) povs[c.name] = v;
        console.log(`✓ ${c.name} POV（${v?.length ?? 0} 字）`);
    }

    // ── 3. fan-comment highlights ──
    console.log('── 看客反應 ×3 ──');
    const fans: Array<{ name: string; text: string }> = [];
    for (const f of [
        { audienceName: '聽雪客', warmth: 0.92 },
        { audienceName: '月白君', warmth: 0.78 },
        { audienceName: '老周（戲園前街麵攤）', warmth: 0.6 },
    ]) {
        const r = await agent.audienceReaction?.({
            audienceName: f.audienceName,
            warmth: f.warmth,
            performanceLines: log,
        });
        if (r) fans.push({ name: f.audienceName, text: r });
    }
    console.log(`✓ ${fans.length} 則`);

    let artUri = '';
    if (ART_DIR) {
        const f = path.join(ART_DIR, `${VENUE}.jpg`);
        if (fs.existsSync(f)) artUri = `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
    }
    fs.writeFileSync(OUT, renderLive({ events, povs, fans, artUri }));
    console.log(`\nlive room: ${OUT}`);
    void beats;
}

// ── the live-room renderer (web design tokens, light+dark) ──────────────────
function renderLive(input: {
    events: Array<{ k: string; n?: string; t: string }>;
    povs: Record<string, string>;
    fans: Array<{ name: string; text: string }>;
    artUri: string;
}): string {
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const eventsJson = JSON.stringify(input.events);
    const fansJson = JSON.stringify(input.fans);
    const povCards = Object.entries(input.povs)
        .map(
            ([who, text]) =>
                `<article class="pov-card"><header><span class="seal-dot"></span>${esc(who)}的今夜 <span class="sub-tag">訂閱者視角</span></header>${text
                    .split(/\n+/)
                    .map((p) => `<p>${esc(p)}</p>`)
                    .join('')}</article>`,
        )
        .join('');

    return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>春雪社 · 戲園門口送客 — 直播</title>
<style>
:root{--canvas:250 248 243;--surface:255 254 250;--ink:24 24 27;--mute:113 113 122;--hairline:229 229 224;--cinnabar:176 74 60;--jade:108 138 111;--seal:163 57 42;--ease:cubic-bezier(.22,1,.36,1);--kai:"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif CJK TC",serif;--serif:"Songti SC","STSong","Songti TC","Noto Serif CJK TC",serif}
@media (prefers-color-scheme:dark){:root{--canvas:15 14 12;--surface:25 22 17;--ink:242 232 210;--mute:166 154 128;--hairline:67 56 40;--cinnabar:204 164 92;--jade:144 164 126;--seal:224 184 108}}
:root[data-theme="dark"]{--canvas:15 14 12;--surface:25 22 17;--ink:242 232 210;--mute:166 154 128;--hairline:67 56 40;--cinnabar:204 164 92;--jade:144 164 126;--seal:224 184 108}
:root[data-theme="light"]{--canvas:250 248 243;--surface:255 254 250;--ink:24 24 27;--mute:113 113 122;--hairline:229 229 224;--cinnabar:176 74 60;--jade:108 138 111;--seal:163 57 42}
*{box-sizing:border-box}
body{margin:0;background:rgb(var(--canvas));color:rgb(var(--ink));font-family:var(--serif);line-height:1.8}
.wrap{max-width:72em;margin:0 auto;padding:1.2rem}
.head{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:.8rem}
.live-badge{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--kai);font-size:.85rem;color:#fff;background:rgb(var(--seal));padding:.1rem .6rem;border-radius:3px}
.live-badge .dot{width:.5rem;height:.5rem;border-radius:50%;background:#fff;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
h1{font-family:var(--kai);font-size:1.25rem;margin:0;letter-spacing:.04em}
.meta{color:rgb(var(--mute));font-size:.85rem}
.viewers{margin-left:auto;font-size:.85rem;color:rgb(var(--mute))}
.viewers b{color:rgb(var(--cinnabar));font-family:var(--kai)}
.room{display:grid;grid-template-columns:minmax(0,1fr) 20rem;gap:1rem}
@media (max-width:900px){.room{grid-template-columns:1fr}}
.stage{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;border:1px solid rgb(var(--hairline));background:#181310}
.stage::before{content:"";position:absolute;inset:0;background:${input.artUri ? `url(${input.artUri}) center 40%/cover` : 'linear-gradient(180deg,#241c12,#181310)'};z-index:0}
.stage::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(10,6,3,.88) 0%,rgba(10,6,3,.25) 45%,rgba(10,6,3,.15) 100%);z-index:1}
.danmaku{position:absolute;top:0;left:0;right:0;height:38%;overflow:hidden;z-index:3;pointer-events:none}
.dm{position:absolute;white-space:nowrap;font-size:.85rem;color:#f4ead4;text-shadow:0 1px 3px rgba(0,0,0,.7);opacity:.9;animation:drift linear forwards}
@keyframes drift{from{transform:translateX(100%)}to{transform:translateX(-120%)}}
.plaques{position:absolute;left:1rem;top:.9rem;display:flex;gap:.6rem;z-index:4}
.plaque{font-family:var(--kai);font-size:.95rem;color:#f4ead4;background:rgba(20,12,6,.55);border:1px solid rgba(244,234,212,.35);border-radius:4px;padding:.1rem .7rem;transition:all .3s var(--ease)}
.plaque.speaking{background:rgb(var(--seal));border-color:rgb(var(--seal));box-shadow:0 0 14px rgba(200,90,60,.5)}
.caption{position:absolute;left:0;right:0;bottom:2.6rem;padding:0 1.2rem;z-index:3;color:#f6efe0;text-shadow:0 1px 4px rgba(0,0,0,.8)}
.caption .who{font-family:var(--kai);color:rgb(var(--seal));filter:brightness(1.6);margin-right:.5em}
.caption.fanq .who{color:#bcd3b6}
.caption .txt{font-size:1.02rem}
.controls{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:.7rem;padding:.4rem .9rem;z-index:4;background:linear-gradient(to top,rgba(8,5,3,.85),transparent)}
.btn{background:none;border:none;color:#f4ead4;font-size:1rem;cursor:pointer;font-family:var(--kai)}
.bar{flex:1;height:3px;background:rgba(244,234,212,.25);border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:0%;background:rgb(var(--seal));filter:brightness(1.4);transition:width .4s var(--ease)}
.t{font-size:.75rem;color:rgba(244,234,212,.75)}
.rail{display:flex;flex-direction:column;border:1px solid rgb(var(--hairline));border-radius:12px;background:rgb(var(--surface));overflow:hidden;min-height:20rem;max-height:34rem}
.rail header{font-family:var(--kai);font-size:.9rem;padding:.5rem .9rem;border-bottom:1px solid rgb(var(--hairline));color:rgb(var(--mute))}
.chat{flex:1;overflow-y:auto;padding:.6rem .9rem;display:flex;flex-direction:column;gap:.45rem;font-size:.88rem}
.msg .nick{font-family:var(--kai);color:rgb(var(--jade));margin-right:.4em}
.msg.hl{border-left:3px solid rgb(var(--cinnabar));padding:.3rem .6rem;background:rgb(var(--canvas));border-radius:4px}
.msg.hl .nick{color:rgb(var(--cinnabar))}
.msg.gift{font-family:var(--kai);color:rgb(var(--seal))}
.after{margin-top:1.4rem;display:none}
.after.show{display:block;animation:rise .6s var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.after h2,.entry h2{font-family:var(--kai);font-size:1.05rem;color:rgb(var(--cinnabar));border-bottom:1px solid rgb(var(--hairline));padding-bottom:.3rem}
.pov-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem}
.pov-card{border:1px solid rgb(var(--hairline));border-left:3px solid rgb(var(--cinnabar));border-radius:8px;background:rgb(var(--surface));padding:1rem 1.2rem}
.pov-card header{font-family:var(--kai);display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
.pov-card p{margin:.5rem 0;font-size:.93rem;text-indent:2em}
.seal-dot{width:.6rem;height:.6rem;border-radius:2px;background:rgb(var(--seal));transform:rotate(-4deg)}
.sub-tag{margin-left:auto;font-size:.72rem;color:rgb(var(--jade));border:1px solid rgb(var(--jade));border-radius:99px;padding:0 .5rem}
.note{color:rgb(var(--mute));font-size:.8rem;margin-top:.8rem}
.entry{margin-top:2rem}
.cards{display:flex;gap:1rem;flex-wrap:wrap;margin-top:.9rem}
.vcard{width:15rem;border-radius:12px;overflow:hidden;border:1px solid rgb(var(--hairline));background:rgb(var(--surface));box-shadow:0 1px 6px rgba(0,0,0,.06)}
.vcard .thumb{position:relative;aspect-ratio:16/10;background:#241c12}
.vcard .thumb::before{content:"";position:absolute;inset:0;background:${input.artUri ? `url(${input.artUri}) center/cover` : 'linear-gradient(135deg,#3a2c1c,#181310)'};opacity:.95}
.vcard .play{position:absolute;inset:0;display:grid;place-items:center;z-index:2}
.vcard .play i{width:2.6rem;height:2.6rem;border-radius:50%;background:rgba(255,254,250,.85);display:grid;place-items:center;color:rgb(var(--seal));font-style:normal}
.vcard .live{position:absolute;top:.5rem;left:.5rem;z-index:3;display:inline-flex;align-items:center;gap:.3rem;font-family:var(--kai);font-size:.72rem;color:#fff;background:rgb(var(--seal));padding:.05rem .5rem;border-radius:3px}
.vcard .live .dot{width:.4rem;height:.4rem;border-radius:50%;background:#fff;animation:pulse 1.6s infinite}
.vcard .cap{padding:.6rem .8rem .7rem}
.vcard .cap .ttl{font-family:var(--kai);font-size:.95rem}
.vcard .cap .day{color:rgb(var(--mute));font-size:.72rem;letter-spacing:.12em;margin-top:.15rem}
.vcard.ghost{opacity:.45}
</style>
<div class="wrap">
  <div class="head">
    <span class="live-badge"><span class="dot"></span>直播中</span>
    <h1>春雪社 · 戲園門口送客</h1>
    <span class="meta">第21日 · 大會串散戲 · 雲錦台</span>
    <span class="viewers">看客 <b id="vc">0</b> 人在場</span>
  </div>
  <div class="room">
    <div class="stage" id="stage">
      <div class="danmaku" id="dmk"></div>
      <div class="plaques" id="plaques"></div>
      <div class="caption" id="cap"><span class="who" id="who"></span><span class="txt" id="txt">（鑼鼓聲歇，門口的燈籠一盞盞亮起來……）</span></div>
      <div class="controls">
        <button class="btn" id="pp">▶</button>
        <div class="bar"><i id="prog"></i></div>
        <span class="t" id="clockt">送客中</span>
      </div>
    </div>
    <div class="rail">
      <header>戲迷留言</header>
      <div class="chat" id="chat"></div>
    </div>
  </div>
  <div class="after" id="after">
    <h2>收播 · 同一夜，兩本帳</h2>
    <div class="pov-grid">${povCards}</div>
    <p class="note">直播為公開內容（屬地：戲園前街）；「她今夜心裡在想什麼」是訂閱者內容。誰出來送客、答誰的話、哪句裝傻——都不是排出來的。</p>
  </div>
  <div class="entry">
    <h2>影片區入口示意（首頁卡片列）</h2>
    <div class="cards">
      <div class="vcard"><div class="thumb"><span class="live"><span class="dot"></span>LIVE</span><span class="play"><i>▶</i></span></div><div class="cap"><div class="ttl">戲園門口 · 送客</div><div class="day">DAY 21 · 直播中</div></div></div>
      <div class="vcard ghost"><div class="thumb"><span class="play"><i>▶</i></span></div><div class="cap"><div class="ttl">賀重山、連翹｜火燒余洪</div><div class="day">DAY 1</div></div></div>
      <div class="vcard ghost"><div class="thumb"><span class="play"><i>▶</i></span></div><div class="cap"><div class="ttl">白蛇傳 · 斷橋</div><div class="day">DAY 21</div></div></div>
    </div>
  </div>
</div>
<script>
const EVENTS=${eventsJson};
const FANS=${fansJson};
const AMBIENT=["好一齣白蛇！","柳老板——這裡！","蘇老板的水袖，繞樑三日","明兒還演麼？","擠什麼，都有得送","那半步……你們瞧見了嗎","燈籠底下這一對，真好看","連翹那一聲響，我心口還在跳"];
const names=[...new Set(EVENTS.filter(e=>e.k==='beat').map(e=>e.n))];
const plaques=document.getElementById('plaques');
for(const n of names){const s=document.createElement('span');s.className='plaque';s.dataset.n=n;s.textContent=n;plaques.appendChild(s);}
const chat=document.getElementById('chat');
function say(nick,text,cls){const d=document.createElement('div');d.className='msg'+(cls?' '+cls:'');d.innerHTML='<span class="nick">'+nick+'</span>'+text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;}
function dm(text){const el=document.createElement('span');el.className='dm';el.textContent=text;el.style.top=(Math.random()*80)+'%';el.style.animationDuration=(9+Math.random()*5)+'s';document.getElementById('dmk').appendChild(el);setTimeout(()=>el.remove(),15000);}
let vc=0;const vcEl=document.getElementById('vc');
setInterval(()=>{vc=Math.min(1362,vc+Math.ceil(Math.random()*23));vcEl.textContent=vc.toLocaleString();},700);
let i=-1,playing=false,timer=null;
const cap=document.getElementById('cap'),who=document.getElementById('who'),txt=document.getElementById('txt'),prog=document.getElementById('prog'),pp=document.getElementById('pp');
function step(){
  i++;
  if(i>=EVENTS.length){end();return;}
  const e=EVENTS[i];
  prog.style.width=Math.round(((i+1)/EVENTS.length)*100)+'%';
  if(e.k==='fan'){
    cap.classList.add('fanq');who.textContent='看客·'+e.n+'：';txt.textContent=e.t;
    say(e.n,e.t,'hl');
    document.querySelectorAll('.plaque').forEach(p=>p.classList.remove('speaking'));
    timer=setTimeout(step,Math.max(2600,e.t.length*80));
  }else if(e.k==='gift'){
    cap.classList.add('fanq');who.textContent='門房：';txt.textContent=e.t;
    say('門房',e.t,'gift');
    timer=setTimeout(step,Math.max(2600,e.t.length*80));
  }else{
    cap.classList.remove('fanq');who.textContent=e.n+'：';txt.textContent=e.t;
    document.querySelectorAll('.plaque').forEach(p=>p.classList.toggle('speaking',p.dataset.n===e.n));
    if(Math.random()<.7)dm(AMBIENT[Math.floor(Math.random()*AMBIENT.length)]);
    if(Math.random()<.4)say('看客'+Math.ceil(Math.random()*900),AMBIENT[Math.floor(Math.random()*AMBIENT.length)]);
    timer=setTimeout(step,Math.max(3800,e.t.length*95));
  }
}
function end(){
  playing=false;pp.textContent='↺';
  document.getElementById('clockt').textContent='已收播';
  cap.classList.remove('fanq');who.textContent='';txt.textContent='（燈籠次第熄了，門口只剩掃地的聲音。）';
  document.querySelectorAll('.plaque').forEach(p=>p.classList.remove('speaking'));
  let d=0;for(const f of FANS){setTimeout(()=>say(f.name,f.text,'hl'),d+=900);}
  setTimeout(()=>document.getElementById('after').classList.add('show'),d+=600);
}
pp.addEventListener('click',()=>{
  if(pp.textContent==='↺'){i=-1;document.getElementById('after').classList.remove('show');document.getElementById('clockt').textContent='送客中';}
  playing=!playing;pp.textContent=playing?'❚❚':'▶';
  if(playing)step();else clearTimeout(timer);
});
say('雲錦台門房','大會串散戲，二位老板到門口了——','hl');
</script>`;
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
