#!/usr/bin/env node
/**
 * 解耦實驗 1 — 無發牌：純讓 LLM 自由決定角色行動，看敘事能不能推進。
 *
 * 對照 sim/（卡牌 + 決定性判決）：這裡沒有手牌、沒有固定 6 種姿態，每個角色
 * 每一拍可以「做任何事」（說話/試探/結盟/使手段/退避…），由一個 LLM 導演/裁決者
 * 讀完所有人的自由行動後，裁決客觀上發生了什麼、更新現況、丟下一個懸念，並自評
 * 這一拍有沒有真的推進故事（advanced）。
 *
 * 問題：沒有機制守恆（發牌+決定性判決）時，純 LLM 自由演，故事推得動嗎？會不會
 * 散、會不會裁決偏心/前後矛盾？log 裡每拍都標 advanced + advanceNote 供判讀。
 *
 * 用法：node experiments/novel-lab/free-action/run.mjs --ticks 4
 *       node ... --dry        # 不呼叫 LLM，只印組好的 prompt
 *       node ... --no-pov     # 只跑 行動→裁決 迴圈，不生 POV（省 token）
 */

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '../sim/llm.mjs';
import { cast as seedCast } from '../sim/cast.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => {
    const i = args.indexOf(`--${n}`);
    if (i === -1) return d;
    const v = args[i + 1];
    return v && !v.startsWith('--') ? v : true;
};
const TICKS = Number(flag('ticks', 4));
const DRY = Boolean(flag('dry', false));
const NO_POV = Boolean(flag('no-pov', false));

mkdirSync(join(__dir, 'logs'), { recursive: true });
const LOG = flag('out', join(__dir, 'logs', `free-${new Date().toISOString().replace(/[:.]/g, '-')}.log`));
writeFileSync(LOG, '');
const log = (s = '') => {
    process.stdout.write(s + '\n');
    appendFileSync(LOG, s + '\n');
};
const section = (t) => {
    log('\n' + '═'.repeat(72));
    log('▌ ' + t);
    log('═'.repeat(72));
};
const extractJson = (t) => {
    const m = (t ?? '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        return JSON.parse(m[0]);
    } catch {
        return null;
    }
};

// 取主要三人（也可加班主，但先聚焦對照卡牌版的同一組）
const ACTORS = ['liu', 'su', 'jiang'].map((id) => seedCast.find((c) => c.id === id));

const world = {
    state: '百代洋行要灌春雪社頭一張唱片，灌錄權懸而未決——這是全社此刻的焦點。三人同在雲錦台後台。',
    focus: '春雪社第一張唱片的灌錄權，今日要見分曉：誰的腔能刻進那張碟？',
    history: [],
};

let client = null;
let calls = 0;
async function ask(o) {
    if (DRY) return { text: '(dry)' };
    calls++;
    return client.chat(o);
}

// ── prompts ──
function actorSystem() {
    return [
        '你在一個自治戲班世界裡扮演一名角色。此刻輪到你行動——你可以**做任何事**：',
        '開口說一句、伸手試探、退讓、結盟、使個手段、撂下狠話、暗中佈局、按住不動……',
        '**沒有任何固定選項限制你**。依你的【目標】與【秘密】，決定你這一拍**最可能做的、一個具體可演的行動**。',
        '要像這個角色真的會做的，不要選最聰明的、要選最真的。',
        '只輸出一個 JSON：{"action":"你做了/說了什麼，一句具體的（可含一句台詞）","intent":"你這麼做的動機，20字內"}。',
    ].join('\n');
}
function actorUser(c) {
    return [
        `# 你是 ${c.name}（${c.role}・${c.gender}）`,
        `秘密（只有你知道）：${c.secret}`,
        `當下打算：${c.plan}`,
        '',
        `# 現況`,
        world.state,
        `# 此刻的焦點`,
        world.focus,
        `# 同場還有`,
        ACTORS.filter((x) => x.id !== c.id).map((x) => `${x.name}（${x.role}）`).join('、'),
        '',
        '你這一拍做什麼？只輸出 JSON。',
    ].join('\n');
}
function judgeSystem() {
    return [
        '你是這個自治戲班世界的導演／裁決者。你讀完所有角色這一拍各自的自由行動，要裁決：',
        '1. **客觀上發生了什麼**——並陳各人的行動與後果，不抹平分歧、不替誰圓場、不偏袒。',
        '   依現況、各行動的合理性、人物的實力與處境推演（強行不通的行動會失敗或反噬）。',
        '2. **更新現況**（2-3 句，寫世界此刻的新狀態：誰得了什麼、誰的處境/關係變了）。',
        '3. **下一個懸念**（一句，把故事往前拋）。',
        '4. **這一拍有沒有真的推進故事**：有人的處境/關係/權力被改變了才算推進；只是嘴上交鋒、',
        '   狀態沒變＝沒推進。誠實判斷。',
        '只輸出 JSON：{"beats":["客觀事實1","2",…],"state":"更新後的現況","focus":"下一個懸念","advanced":true|false,"advanceNote":"推進了什麼／或為何原地打轉"}。',
    ].join('\n');
}
function judgeUser(actions) {
    return [
        '# 當前現況',
        world.state,
        '# 此刻焦點',
        world.focus,
        '',
        '# 各角色這一拍的自由行動',
        actions.map((a) => `- ${a.name}：${a.action}　（動機：${a.intent}）`).join('\n'),
        '',
        '請裁決。只輸出 JSON。',
    ].join('\n');
}
function povSystem() {
    return [
        '你是連載小說家，為這個角色寫這一拍的第一人稱 POV（全程「我」）。',
        '承上一拍的現況、寫你這一拍做的事與當下心緒，讓讀者覺得故事往前走了一步。',
        '揭一角你的私帳（材料給的秘密）但別整段復述。民初梨園舊白話，情緒克制，避免套語。',
        '500–800 字，純散文直接進正文。',
    ].join('\n');
}
function povUser(c, myAction, beats) {
    return [
        `# 你是 ${c.name}（${c.role}・${c.gender}）`,
        `私帳：${c.secret}`,
        `# 這一拍你做的事`,
        myAction,
        `# 本場客觀發生（你必須認帳，可詮釋不可改寫）`,
        beats.map((b) => `- ${b}`).join('\n'),
        '',
        '寫你這一拍的第一人稱 POV。直接輸出正文。',
    ].join('\n');
}

section('解耦實驗 1 · 無發牌 · 純自由行動 + LLM 裁決');
if (DRY) log('模式：DRY');
else {
    try {
        client = createClient();
        log(`LLM：${client.provider}　primary=${client.models.primary}　cheap=${client.models.cheap}`);
    } catch (e) {
        log('⚠️ ' + e.message);
        process.exit(1);
    }
}
log(`ticks=${TICKS}　pov=${!NO_POV}　log=${LOG}`);

let advancedCount = 0;
for (let t = 1; t <= TICKS; t++) {
    section(`第 ${t} 拍`);
    log('【現況】' + world.state);
    log('【焦點】' + world.focus);

    // 1) 各角色自由行動
    log('\n【自由行動】（無選項限制，純人設驅動）');
    const actions = [];
    for (const c of ACTORS) {
        if (DRY) {
            log(`  · ${c.name}：(dry) [SYSTEM]\n${actorSystem()}\n[USER]\n${actorUser(c)}`);
            actions.push({ name: c.name, id: c.id, action: '(dry)', intent: '(dry)' });
            continue;
        }
        try {
            const r = await ask({ tier: 'cheap', system: actorSystem(), user: actorUser(c), maxTokens: 300, temperature: 0.95 });
            const j = extractJson(r.text) ?? {};
            const a = { name: c.name, id: c.id, action: String(j.action ?? '(無)'), intent: String(j.intent ?? '') };
            actions.push(a);
            log(`  · ${c.name}：${a.action}　（動機：${a.intent}）`);
        } catch (e) {
            log(`  · ${c.name}：(行動失敗 ${e.message})`);
            actions.push({ name: c.name, id: c.id, action: '(無)', intent: '' });
        }
    }

    // 2) 導演裁決
    log('\n【裁決】（LLM 導演讀全部行動 → 客觀結果＋現況更新＋推進判斷）');
    let beats = [];
    if (DRY) {
        log('[SYSTEM]\n' + judgeSystem());
        log('\n[USER]\n' + judgeUser(actions));
    } else {
        try {
            const r = await ask({ tier: 'primary', system: judgeSystem(), user: judgeUser(actions), maxTokens: 900, temperature: 0.7 });
            const j = extractJson(r.text);
            if (j) {
                beats = Array.isArray(j.beats) ? j.beats : [];
                for (const b of beats) log(`  ▶ ${b}`);
                log(`  【新現況】${j.state ?? ''}`);
                log(`  【下一懸念】${j.focus ?? ''}`);
                log(`  【推進?】${j.advanced ? '✓ 推進' : '✗ 原地'}　— ${j.advanceNote ?? ''}`);
                if (j.advanced) advancedCount++;
                if (j.state) world.state = j.state;
                if (j.focus) world.focus = j.focus;
                world.history.push({ tick: t, beats, advanced: !!j.advanced });
            } else {
                log('  (裁決輸出無法解析)');
            }
        } catch (e) {
            log(`  (裁決失敗 ${e.message})`);
        }
    }

    // 3) POV（可選）
    if (!NO_POV && !DRY) {
        for (const c of ACTORS) {
            const a = actions.find((x) => x.id === c.id);
            log('\n' + '·'.repeat(60));
            log(`POV — ${c.name}（${c.role}）`);
            log('·'.repeat(60));
            try {
                const r = await ask({ tier: 'primary', system: povSystem(), user: povUser(c, a?.action ?? '', beats), maxTokens: 1600, temperature: 0.92 });
                log(r.text.trim());
            } catch (e) {
                log(`(POV 失敗 ${e.message})`);
            }
        }
    }
}

section('完成');
log(`總拍：${TICKS}　推進(advanced)：${advancedCount}/${TICKS}　LLM 呼叫：${calls}`);
log(`最終現況：${world.state}`);
log(`\n👉 log：${LOG}`);
log('   判讀：看「推進?」比例——多數 ✓ = 純自由行動也能推故事；多數 ✗ = 沒機制守恆會原地打轉。');
log('   也看裁決是否公正（有沒有讓不合理的行動硬成功）、現況有沒有真的往前疊。');
