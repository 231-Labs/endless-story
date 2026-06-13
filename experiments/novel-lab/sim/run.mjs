#!/usr/bin/env node
/**
 * Decoupled tick simulator — runs the redesigned narrative mechanism with a
 * REAL LLM, fully off-chain, and writes a rich log you can paste back.
 *
 * Usage:
 *   node experiments/novel-lab/sim/run.mjs --ticks 3
 *   node experiments/novel-lab/sim/run.mjs --ticks 3 --dry      # no LLM: mechanism + prompts only
 *   AI_PROVIDER=poe POE_API_KEY=... node experiments/novel-lab/sim/run.mjs --ticks 4
 *
 * Flags: --ticks N | --dry | --no-sequel | --showrunner-every N | --out PATH
 * Uses the same env/models as prod (see sim/llm.mjs).
 */

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from './llm.mjs';
import { cast as seedCast, resources as seedResources, scenes, resourceMeans } from './cast.mjs';
import * as P from './prompts.mjs';
import * as M from './mechanism.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, def) => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return def;
    const v = args[i + 1];
    return v && !v.startsWith('--') ? v : true;
};
const TICKS = Number(flag('ticks', 3));
const DRY = Boolean(flag('dry', false));
const NO_SEQUEL = Boolean(flag('no-sequel', false));
const SHOWRUNNER_EVERY = Number(flag('showrunner-every', 1));
const BOOK_TITLE = '白蛇傳·上海卷';

// ── logger ──────────────────────────────────────────────────────────────────
mkdirSync(join(__dir, 'logs'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_PATH = flag('out', join(__dir, 'logs', `sim-${stamp}.log`));
writeFileSync(LOG_PATH, '');
function log(s = '') {
    const line = String(s);
    process.stdout.write(line + '\n');
    appendFileSync(LOG_PATH, line + '\n');
}
const hr = (ch = '─') => log(ch.repeat(72));
function section(title) {
    log('');
    log('═'.repeat(72));
    log(`▌ ${title}`);
    log('═'.repeat(72));
}

// ── tolerant JSON ────────────────────────────────────────────────────────────
function extractJson(text) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        return JSON.parse(m[0]);
    } catch {
        return null;
    }
}

// ── world seed (deep copy so we can mutate) ──────────────────────────────────
const world = {
    tick: 0,
    day: 0,
    chapterNo: 0, // ensemble book chapter counter
    perChar: {}, // charId -> chapter counter for their own book
    cast: structuredClone(seedCast),
    resources: structuredClone(seedResources),
    scenes,
    resourceMeans,
    openEvent: null,
    history: [],
    arc: {
        throughline: '春雪社這班人，能不能在上海把「戲比天大」唱成真的，還是終究被名利拆散。',
        lines: [
            { name: '唱片之爭', state: '百代要灌春雪社第一張碟，灌錄權懸而未決。', nextPush: '逼出第一張碟的歸屬。' },
            { name: '搭檔之爭（柳生春）', state: '柳生春與師姐蘇映雪是固定搭檔，新來的乾生江聞鶴是變數。', nextPush: '讓搭檔關係受到第一次真正的擠壓。' },
            { name: '頭牌之爭', state: '頭牌名額尚未定於一人。', nextPush: '視前面的結果再說。' },
        ],
        foreshadow: ['班主沈雪笙當年被拆散的搭檔（白蘭）與那只停了的懷錶。', '江聞鶴夜裡摸著嗓子怕撐不久。'],
    },
};

let client = null;
let llmCalls = 0;
async function ask(opts) {
    if (DRY) return { text: '(dry-run：略過 LLM)' };
    llmCalls++;
    const r = await client.chat(opts);
    return r;
}

// ── header ───────────────────────────────────────────────────────────────────
section('無盡故事 · 解耦 tick 模擬器');
log(`書：《${BOOK_TITLE}》　ticks=${TICKS}　sequel=${!NO_SEQUEL}　showrunner-every=${SHOWRUNNER_EVERY}`);
if (DRY) {
    log('模式：DRY（不呼叫 LLM；卡牌用啟發式，POV/合本只印 prompt）');
} else {
    try {
        client = createClient();
        log(`LLM provider：${client.provider}　primary=${client.models.primary}　cheap=${client.models.cheap}`);
    } catch (err) {
        log(`⚠️ ${err.message}`);
        log('→ 改用 --dry 可先驗機制接線；或設好 API key 再跑。');
        process.exit(1);
    }
}
log(`log 檔：${LOG_PATH}`);

// ── dry heuristic card ───────────────────────────────────────────────────────
function dryCard(c, ev) {
    const holder = world.resources.find((r) => r.label === ev.resourceLabel)?.holder;
    if (holder === c.id) return { card: '守', why: '守成' };
    if (c.disposition <= 62) return { card: '攻', why: '心性烈' };
    return { card: '誘', why: '用手腕' };
}

// ── one tick ─────────────────────────────────────────────────────────────────
async function runTick() {
    world.tick++;
    world.day++;
    section(`第 ${world.day} 日 · TICK ${world.tick}`);

    // PHASE: PLAN (cheap LLM updates desirers' plans from recent events)
    log('\n【PLAN】角色更新打算');
    const recent = M.recentDigest(world, 4);
    const planners = world.cast.filter((c) => c.desires.length > 0);
    for (const c of planners) {
        if (DRY) {
            log(`  · ${c.name}：(dry) 維持 → ${c.plan}`);
            continue;
        }
        try {
            const r = await ask({ tier: 'cheap', system: P.planSystem(), user: P.planUser(c, recent), maxTokens: 400, temperature: 0.8 });
            const np = r.text.trim().replace(/\n+/g, ' ');
            if (np) {
                log(`  · ${c.name}：${np}`);
                c.plan = np;
            }
        } catch (e) {
            log(`  · ${c.name}：(plan 失敗 ${e.message})`);
        }
    }

    // PHASE: DRAMA (tension ranking)
    log('\n【DRAMA】張力排序（爭奪熱度）');
    const ranked = M.rankContention(world);
    if (ranked.length === 0) log('  · 無人爭奪任何標的');
    for (const x of ranked) log(`  · ${x.resource.label}　熱度=${x.score}　渴望者：${x.desirers.map((d) => d.name).join('、')}`);

    // PHASE: SPINE open
    const ev = M.openEvent(world);
    if (!ev) {
        log('\n【SPINE】本 tick 無足夠對手成局（<2 人）。');
        return;
    }
    log(`\n【SPINE】開事件 ${ev.id}：「${ev.label}」 @ ${ev.sceneName}`);
    log(`  · 標的：${ev.resourceLabel}　在場：${ev.participantIds.map((id) => world.cast.find((c) => c.id === id).name).join('、')}`);

    // PHASE: ACT (cards) — autonomous, drives the verdict
    log('\n【ACT】各自出牌（決定走向，非我選）');
    const stakes = `${ev.label}。賭注：${world.resourceMeans[ev.resourceLabel]}`;
    for (const id of ev.participantIds) {
        const c = world.cast.find((x) => x.id === id);
        let play;
        if (DRY) play = dryCard(c, ev);
        else {
            try {
                const r = await ask({ tier: 'cheap', system: P.cardSystem(), user: P.cardUser(c, ev.label, stakes), maxTokens: 200, temperature: 0.9 });
                const j = extractJson(r.text);
                play = j && M.VALID_CARDS.includes(j.card) ? { card: j.card, why: String(j.why ?? '') } : { card: '守', why: '(解析失敗預設守)' };
            } catch (e) {
                play = { card: '守', why: `(出牌失敗 ${e.message})` };
            }
        }
        ev.cards[id] = play;
        log(`  · ${c.name}　〔${play.card}〕rank=${M.CARD_RANK[play.card]}　— ${play.why}`);
    }

    // PHASE: RESOLVE (deterministic verdict)
    const res = M.resolveEvent(world);
    log('\n【RESOLVE】決定性判決');
    log(`  ▶ ${res.verdict}`);
    world.history.push({ day: world.day, text: res.verdict });

    // chapter numbering (ensemble book)
    world.chapterNo++;
    const arc = M.arcContext(world, ev.resourceLabel);
    log('\n【弧線座標（接到筆上）】');
    log(`  · 第 ${world.chapterNo} 回　主問：${arc.throughline}`);
    log(`  · 上一回結在：${arc.lastBeat}`);
    log(`  · 本回要推進：${arc.thisPush}`);

    // PHASE: POV (primary LLM) per participant
    log('\n【POV】各角色章回（primary 模型）');
    const povs = [];
    for (const id of ev.participantIds) {
        const c = world.cast.find((x) => x.id === id);
        world.perChar[id] = (world.perChar[id] ?? 0) + 1;
        const ctx = {
            character: c,
            bookTitle: BOOK_TITLE,
            chapterNo: world.perChar[id],
            arc,
            privateLedger: M.targetedRecall(world, id),
            stakes: `這樁事爭的是：${world.resourceMeans[ev.resourceLabel]}`,
            turn: `${ev.label}。各人出了牌：${ev.participantIds.map((pid) => `${world.cast.find((x) => x.id === pid).name}〔${ev.cards[pid].card}〕`).join('、')}。`,
            outcome: res.verdict,
            cost: M.structuredCost(world, id, res),
            relationshipHints: M.relationshipHints(world, id),
            sceneBeats: M.buildSceneBeats(world, c.sceneId, id),
        };
        log('');
        hr('·');
        log(`POV — ${c.name}（${c.role}）· 其個人書第 ${ctx.chapterNo} 章　[召回私帳]「${ctx.privateLedger}」`);
        hr('·');
        if (DRY) {
            log('[SYSTEM]\n' + P.povSystem());
            log('\n[USER]\n' + P.povUser(ctx));
            povs.push({ id, name: c.name, role: c.role, body: '(dry)' });
            continue;
        }
        try {
            const r = await ask({ tier: 'primary', system: P.povSystem(), user: P.povUser(ctx), maxTokens: 2200, temperature: 0.92 });
            log(r.text.trim());
            povs.push({ id, name: c.name, role: c.role, body: r.text.trim() });
        } catch (e) {
            log(`(POV 失敗 ${e.message})`);
        }
    }

    // PHASE: CUT (primary LLM) — ensemble 梨園版
    if (povs.filter((p) => p.body && p.body !== '(dry)').length >= 2 || DRY) {
        log('');
        section(`【合本·梨園版】第 ${world.chapterNo} 回（由 ${povs.length} 篇 POV 織成）`);
        const cutCtx = {
            bookTitle: BOOK_TITLE,
            chapterNo: world.chapterNo,
            day: world.day,
            sceneName: ev.sceneName,
            eventLabel: ev.label,
            outcome: res.verdict,
            povs,
        };
        if (DRY) {
            log('[SYSTEM]\n' + P.cutSystem());
            log('\n[USER]\n' + P.cutUser(cutCtx));
        } else {
            try {
                const r = await ask({ tier: 'primary', system: P.cutSystem(), user: P.cutUser(cutCtx), maxTokens: 2400, temperature: 0.9 });
                log(r.text.trim());
            } catch (e) {
                log(`(合本失敗 ${e.message})`);
            }
        }
    }

    // PHASE: SEQUEL (餘波) for the loser — quiet, non-competition
    if (!NO_SEQUEL && res.losers.length > 0) {
        const loser = world.cast.find((c) => c.id === res.losers[0].id);
        world.perChar[loser.id] = (world.perChar[loser.id] ?? 0) + 1;
        log('');
        section(`【餘波回】${loser.name} · 其個人書第 ${world.perChar[loser.id]} 章`);
        const sctx = {
            character: loser,
            bookTitle: BOOK_TITLE,
            chapterNo: world.perChar[loser.id],
            arc,
            deltaType: '一個私下的決定',
            deltaNote: '輸了之後，他獨自消化，悄悄定下一件之後會結果的事',
            occasion: `散場後${loser.sceneId === 'sc_yunjin' ? '雲錦台只剩一盞燈' : '一個人留下'}，${loser.name}獨自待著（${loser.role}的習慣：${loser.role === '乾生' || loser.role === '坤生' ? '吊嗓 / 收拾行頭' : '收箱 / 算帳'}）`,
            undercurrent: `今日「${ev.label}」的結果——${res.verdict}——還壓在心上；他嘴上不提，手上的活卻洩了底。`,
            privateLedger: M.targetedRecall(world, loser.id),
            relationshipHints: M.relationshipHints(world, loser.id),
        };
        if (DRY) {
            log('[SYSTEM]\n' + P.sequelSystem());
            log('\n[USER]\n' + P.sequelUser(sctx));
        } else {
            try {
                const r = await ask({ tier: 'primary', system: P.sequelSystem(), user: P.sequelUser(sctx), maxTokens: 1800, temperature: 0.92 });
                log(r.text.trim());
            } catch (e) {
                log(`(餘波失敗 ${e.message})`);
            }
        }
    }

    world.openEvent = null; // resolved this tick
}

// ── showrunner heartbeat (updates arc plan) ──────────────────────────────────
async function showrunner() {
    section(`【SHOWRUNNER】更新弧線計畫（第 ${world.day} 日）`);
    if (DRY) {
        log('(dry) 維持現有弧線：');
        log(JSON.stringify(world.arc, null, 2));
        return;
    }
    try {
        const r = await ask({
            tier: 'cheap',
            system: P.showrunnerSystem(),
            user: P.showrunnerUser(JSON.stringify(world.arc), M.recentDigest(world, 6)),
            maxTokens: 900,
            temperature: 0.5,
        });
        const j = extractJson(r.text);
        if (j && j.throughline && Array.isArray(j.lines)) {
            world.arc = { throughline: j.throughline, lines: j.lines, foreshadow: j.foreshadow ?? world.arc.foreshadow };
            log('弧線已更新：');
            log(JSON.stringify(world.arc, null, 2));
        } else {
            log('(showrunner 輸出無法解析，沿用舊弧線)');
        }
    } catch (e) {
        log(`(showrunner 失敗 ${e.message})`);
    }
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
    for (let t = 0; t < TICKS; t++) {
        await runTick();
        if (SHOWRUNNER_EVERY > 0 && (t + 1) % SHOWRUNNER_EVERY === 0) await showrunner();
    }
    section('完成');
    log(`總 tick：${world.tick}　LLM 呼叫：${llmCalls}　合本回數：${world.chapterNo}`);
    log('各角色個人書章數：' + Object.entries(world.perChar).map(([id, n]) => `${world.cast.find((c) => c.id === id).name}=${n}`).join('、'));
    log(`\n資源最終持有：`);
    for (const r of world.resources) log(`  · ${r.label} → ${r.holder ? world.cast.find((c) => c.id === r.holder).name : '（無人）'}`);
    log(`\n👉 log 已存到：${LOG_PATH}`);
    log('   把整份 log 貼回來，我比對「機制決策 + 私帳召回 + 弧線承接 + 實際文風」是否與推估一致。');
})();
