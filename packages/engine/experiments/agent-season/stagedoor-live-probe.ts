/**
 * AGENT-SEASON · STAGE-DOOR LIVE PROBE (雙人送客直播 pilot).
 * ============================================================================
 * The livestream show format: after a performance day, the 角兒 stand at the
 * theatre gate seeing guests off — a fixed FORMAT whose content is emergent
 * (who shows, how close they stand, what they answer is the relationship
 * state, never a script). This probe produces the pilot episode from REAL
 * season state and renders it as a live-room page in the web's design tokens
 * (canvas/cinnabar/jade/hairline, light+dark), intended as the future 影片區
 * livestream entry.
 *
 * Pipeline (all from state, no operator copy):
 *   1. restore 柳生春+蘇映雪 from the W3 season-end snapshot (their canon
 *      relationship views/wants as of the 大會串),
 *   2. one PUBLIC scene at 戲園前街 via the engine scene loop (the show),
 *   3. povScene ×2 — the same send-off through each one's eyes (訂閱層),
 *   4. audienceReaction ×3 — real fan-comment highlights for the chat rail.
 *
 * Run:
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/stagedoor-live-probe.ts \
 *     [--restore <dir>] [--art <dir>] [--out <html>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
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
const STAKE =
    '年底大會串剛散戲，滿座的看客從雲錦台湧出來，燈籠一路亮到街口。班中新立的規矩：演出日散戲後，領銜的角兒立在戲園門口送客。你們二人今夜同台領銜《白蛇傳》，這會兒並肩立在門口——看客們一邊道賀一邊拿眼睛瞟你們二人之間那半步的距離。';

function member(c: Char, others: Char[]): SceneLoopCastMember {
    const ties: Record<string, string> = {};
    for (const o of others) {
        const v = c.relationshipViews.get(o.id);
        if (v) ties[o.id] = v;
    }
    return {
        characterId: c.id,
        name: c.name,
        persona: c.persona,
        memories: c.thickMemories.slice().sort((a, b) => b.importance - a.importance).slice(0, 5).map((m) => m.text),
        innerSecret: c.secret,
        role: c.role,
        bodyFact: c.bodyFact,
        carried: c.carried.length ? c.carried : undefined,
        ties,
    };
}

async function main(): Promise<void> {
    const cast = buildCast(['柳生春', '蘇映雪']);
    const [liu, su] = cast;
    // Canon state as of the 大會串 (relationship views incl. 「這半步我不退了」).
    const statePath = path.join(RESTORE, 'cast-state.json');
    if (fs.existsSync(statePath)) {
        const snap = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as CastSnapshot;
        restoreCast(cast, snap);
        console.log(`restored 2 from ${statePath}`);
    } else {
        console.log('（無 restore 檔，用種子關係跑 pilot）');
    }

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    // ── 1. the show: one public scene at the gate ──
    console.log('── 送客場景生成中 ──');
    const loop = await runSceneLoop({
        sceneId: 'stagedoor-live',
        sceneName: VENUE,
        sceneHint: venueByName.get(VENUE)?.hint,
        isPrivate: false,
        clock: CLOCK,
        stake: STAKE,
        etiquette: WORLD_PREMISE,
        cast: [member(liu, [su]), member(su, [liu])],
        wants: [...liu.wants, ...su.wants],
        tick: 125,
        maxTurns: 10,
        agent,
    });
    const beats = loop.beats.map((b) => ({ name: b.name, text: b.text, inner: b.inner }));
    for (const b of beats) console.log(`> ${b.name}：${b.text}`);

    // ── 2. the subscriber layer: each one's eyes ──
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
            beats: beats.map((b) => ({ name: b.name, text: b.text })),
            castBodies: cast.map((x) => ({ name: x.name, bodyFact: x.bodyFact })),
        });
        if (v) povs[c.name] = v;
        console.log(`✓ ${c.name} POV（${v?.length ?? 0} 字）`);
    }

    // ── 3. fan-comment highlights (chat rail) ──
    console.log('── 看客反應 ×3 ──');
    const fanSpecs = [
        { audienceName: '聽雪客', warmth: 0.92 },
        { audienceName: '月白君', warmth: 0.78 },
        { audienceName: '老周（戲園前街麵攤）', warmth: 0.6 },
    ];
    const fans: Array<{ name: string; text: string }> = [];
    for (const f of fanSpecs) {
        const r = await agent.audienceReaction?.({
            audienceName: f.audienceName,
            warmth: f.warmth,
            performanceLines: beats.map((b) => `${b.name}：${b.text}`),
        });
        if (r) fans.push({ name: f.audienceName, text: r });
    }
    console.log(`✓ ${fans.length} 則`);

    // venue art (optional, embedded once)
    let artUri = '';
    if (ART_DIR) {
        const f = path.join(ART_DIR, `${VENUE}.jpg`);
        if (fs.existsSync(f)) artUri = `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}`;
    }

    fs.writeFileSync(OUT, renderLive({ beats, povs, fans, artUri }));
    console.log(`\nlive room: ${OUT}`);
}

// ── the live-room renderer (web design tokens, light+dark) ──────────────────
function renderLive(input: {
    beats: Array<{ name: string; text: string; inner?: string }>;
    povs: Record<string, string>;
    fans: Array<{ name: string; text: string }>;
    artUri: string;
}): string {
    const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const beatsJson = JSON.stringify(input.beats.map((b) => ({ n: b.name, t: b.text })));
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
.stage{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid rgb(var(--hairline));background:#181310 ${input.artUri ? `url(${input.artUri}) center 40%/cover` : 'linear-gradient(180deg,#241c12,#181310)'};background-blend-mode:normal}
.stage::before{content:"";position:absolute;inset:0;background:${input.artUri ? `url(${input.artUri}) center 40%/cover` : 'linear-gradient(180deg,#241c12,#181310)'};z-index:0}
.stage::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(10,6,3,.88) 0%,rgba(10,6,3,.25) 45%,rgba(10,6,3,.15) 100%);z-index:1}
.danmaku{position:absolute;top:0;left:0;right:0;height:40%;overflow:hidden;z-index:3;pointer-events:none}
.dm{position:absolute;white-space:nowrap;font-size:.85rem;color:#f4ead4;text-shadow:0 1px 3px rgba(0,0,0,.7);opacity:.9;animation:drift linear forwards}
@keyframes drift{from{transform:translateX(100%)}to{transform:translateX(-120%)}}
.plaques{position:absolute;left:1rem;top:.9rem;display:flex;gap:.6rem;z-index:4}
.plaque{font-family:var(--kai);font-size:.95rem;color:#f4ead4;background:rgba(20,12,6,.55);border:1px solid rgba(244,234,212,.35);border-radius:4px;padding:.1rem .7rem;transition:all .3s var(--ease)}
.plaque.speaking{background:rgb(var(--seal));border-color:rgb(var(--seal));box-shadow:0 0 14px rgba(200,90,60,.5)}
.caption{position:absolute;left:0;right:0;bottom:2.6rem;padding:0 1.2rem;z-index:3;color:#f6efe0;text-shadow:0 1px 4px rgba(0,0,0,.8)}
.caption .who{font-family:var(--kai);color:rgb(var(--seal));filter:brightness(1.6);margin-right:.5em}
.caption .txt{font-size:1.02rem}
.controls{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:.7rem;padding:.4rem .9rem;z-index:4;background:linear-gradient(to top,rgba(8,5,3,.85),transparent)}
.btn{background:none;border:none;color:#f4ead4;font-size:1rem;cursor:pointer;font-family:var(--kai)}
.bar{flex:1;height:3px;background:rgba(244,234,212,.25);border-radius:2px;overflow:hidden}
.bar i{display:block;height:100%;width:0%;background:rgb(var(--seal));filter:brightness(1.4);transition:width .4s var(--ease)}
.t{font-size:.75rem;color:rgba(244,234,212,.75)}
.rail{display:flex;flex-direction:column;border:1px solid rgb(var(--hairline));border-radius:10px;background:rgb(var(--surface));overflow:hidden;max-height:calc((72em - 22rem)*9/16);min-height:20rem}
.rail header{font-family:var(--kai);font-size:.9rem;padding:.5rem .9rem;border-bottom:1px solid rgb(var(--hairline));color:rgb(var(--mute))}
.chat{flex:1;overflow-y:auto;padding:.6rem .9rem;display:flex;flex-direction:column;gap:.45rem;font-size:.88rem}
.msg .nick{font-family:var(--kai);color:rgb(var(--jade));margin-right:.4em}
.msg.hl{border-left:3px solid rgb(var(--cinnabar));padding:.3rem .6rem;background:rgb(var(--canvas));border-radius:4px}
.msg.hl .nick{color:rgb(var(--cinnabar))}
.msg.gift{font-family:var(--kai);color:rgb(var(--seal))}
.after{margin-top:1.4rem;display:none}
.after.show{display:block;animation:rise .6s var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.after h2{font-family:var(--kai);font-size:1.05rem;color:rgb(var(--cinnabar));border-bottom:1px solid rgb(var(--hairline));padding-bottom:.3rem}
.pov-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));gap:1rem}
.pov-card{border:1px solid rgb(var(--hairline));border-left:3px solid rgb(var(--cinnabar));border-radius:8px;background:rgb(var(--surface));padding:1rem 1.2rem}
.pov-card header{font-family:var(--kai);display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
.pov-card p{margin:.5rem 0;font-size:.93rem;text-indent:2em}
.seal-dot{width:.6rem;height:.6rem;border-radius:2px;background:rgb(var(--seal));transform:rotate(-4deg)}
.sub-tag{margin-left:auto;font-size:.72rem;color:rgb(var(--jade));border:1px solid rgb(var(--jade));border-radius:99px;padding:0 .5rem}
.note{color:rgb(var(--mute));font-size:.8rem;margin-top:.8rem}
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
      <div class="caption"><span class="who" id="who"></span><span class="txt" id="txt">（鑼鼓聲歇，門口的燈籠一盞盞亮起來……）</span></div>
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
    <p class="note">直播為公開內容（屬地：戲園前街）；「她今夜心裡在想什麼」是訂閱者內容。誰出來送客、站多近、答誰的話——都不是排出來的。</p>
  </div>
</div>
<script>
const BEATS=${beatsJson};
const FANS=${fansJson};
const AMBIENT=["好一齣白蛇！","柳老板——這裡！","蘇老板的水袖，繞樑三日","明兒還演麼？","擠什麼，都有得送","那半步……你們瞧見了嗎","燈籠底下這一對，真好看","武戲那一聲響，我現在心口還在跳"];
const names=[...new Set(BEATS.map(b=>b.n))];
const plaques=document.getElementById('plaques');
for(const n of names){const s=document.createElement('span');s.className='plaque';s.dataset.n=n;s.textContent=n;plaques.appendChild(s);}
const chat=document.getElementById('chat');
function say(nick,text,cls){const d=document.createElement('div');d.className='msg'+(cls?' '+cls:'');d.innerHTML='<span class="nick">'+nick+'</span>'+text;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;}
function dm(text){const el=document.createElement('span');el.className='dm';el.textContent=text;el.style.top=(Math.random()*80)+'%';el.style.animationDuration=(9+Math.random()*5)+'s';document.getElementById('dmk').appendChild(el);setTimeout(()=>el.remove(),15000);}
let vc=0;const vcEl=document.getElementById('vc');
setInterval(()=>{vc=Math.min(1362,vc+Math.ceil(Math.random()*23));vcEl.textContent=vc.toLocaleString();},700);
let i=-1,playing=false,timer=null;
const who=document.getElementById('who'),txt=document.getElementById('txt'),prog=document.getElementById('prog'),pp=document.getElementById('pp');
function step(){
  i++;
  if(i>=BEATS.length){end();return;}
  const b=BEATS[i];
  who.textContent=b.n+'：';txt.textContent=b.t;
  document.querySelectorAll('.plaque').forEach(p=>p.classList.toggle('speaking',p.dataset.n===b.n));
  prog.style.width=Math.round(((i+1)/BEATS.length)*100)+'%';
  if(Math.random()<.8)dm(AMBIENT[Math.floor(Math.random()*AMBIENT.length)]);
  if(Math.random()<.5)say('看客'+Math.ceil(Math.random()*900),AMBIENT[Math.floor(Math.random()*AMBIENT.length)]);
  const dur=Math.max(3800,b.t.length*95);
  timer=setTimeout(step,dur);
}
function end(){
  playing=false;pp.textContent='↺';
  document.getElementById('clockt').textContent='已收播';
  who.textContent='';txt.textContent='（燈籠次第熄了，門口只剩掃地的聲音。）';
  document.querySelectorAll('.plaque').forEach(p=>p.classList.remove('speaking'));
  let d=0;for(const f of FANS){setTimeout(()=>say(f.name,f.text,'hl'),d+=900);}
  setTimeout(()=>say('門房','聽雪客留下一盞小燈籠，說給二位老板照路。','gift'),d+=900);
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
