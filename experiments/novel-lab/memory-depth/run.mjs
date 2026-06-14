#!/usr/bin/env node
/**
 * 解耦實驗 2 — 初始記憶條數消融：更多/更豐富的開場記憶，會不會提升劇情複雜度與
 * 人物厚度？幾條開始明顯有提升（還是很快飽和）？
 *
 * 控制變因：同一個角色（柳生春）、同一個固定場景（散戲後替蘇映雪繫水袖），
 * 餵入「前 N 條」記憶（pool 依重要性由深到淺排序），各生一篇 POV；最後一個 LLM
 * 評審替每個 N 版打「厚度/複雜度」分並指出明顯躍升出現在哪一檔。
 *
 * pool 排序：1–5 核心（傷口/情/身體秘密）→ 6–10 關係與世界 → 11–15 質地與癖性。
 * 所以 N=3 已含「心」，6–10 加廣度，11–15 加質地——可看出邊際效益在哪。
 *
 * 用法：node experiments/novel-lab/memory-depth/run.mjs            # N=0,3,6,10,15
 *       node ... --ns 0,5,15        # 自訂檔位
 *       node ... --dry              # 不呼叫 LLM
 *       node ... --no-judge         # 不跑評審
 */

import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '../sim/llm.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n, d) => {
    const i = args.indexOf(`--${n}`);
    if (i === -1) return d;
    const v = args[i + 1];
    return v && !v.startsWith('--') ? v : true;
};
const NS = String(flag('ns', '0,3,6,10,15')).split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
const DRY = Boolean(flag('dry', false));
const NO_JUDGE = Boolean(flag('no-judge', false));

mkdirSync(join(__dir, 'logs'), { recursive: true });
const LOG = flag('out', join(__dir, 'logs', `mem-${new Date().toISOString().replace(/[:.]/g, '-')}.log`));
writeFileSync(LOG, '');
const _buf = [];
const log = (s = '') => {
    process.stdout.write(s + '\n');
    _buf.push(s);
    try {
        appendFileSync(LOG, s + '\n');
    } catch {
        /* ignore live-append hiccup; exit handler rewrites the full file */
    }
};
// 結束時整份重寫一次，保證檔案＝完整輸出（即使中途看或 append 出問題）。
process.on('exit', () => {
    try {
        writeFileSync(LOG, _buf.join('\n') + '\n');
    } catch {
        /* nothing more we can do at exit */
    }
});
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

const CHAR = {
    name: '柳生春',
    role: '坤生',
    gender: '女',
    physical: '風流俊秀的女小生，台上濁世佳公子；倒過倉傷過嗓，久站需扶桌沿掩微喘',
};

// 記憶池：依「對人物核心的重要性」由深到淺排序（餵前 N 條 = 由心往外擴）。
const MEMORY_POOL = [
    // —— 1–5 核心：傷口 / 情 / 身體秘密 ——
    '只有勒上頭、著男裝、做那個護著師姐的男兒時，我才覺得那是真正的自己。',
    '進科那年我嗓子倒了倉，是師姐日日替我吊。她說「你這條嗓我等得起」——我等的也不只是這條嗓。',
    '台上她做白娘子，我做許仙；只有在戲裡，我才能光明正大地牽她的手、把不能說的話唱進腔裡。',
    '我怕的不是她嫌我，是怕哪天這層情分被人說破，連安安靜靜守著她都守不成了。',
    '倒倉傷了肺氣，久站就發虛、得扶桌沿——這毛病我藏了多年，沒讓人看破。',
    // —— 6–10 關係與世界 ——
    '我與蘇映雪自幼同科坐科，是拆不散的師姐妹、固定的搭檔。',
    '班主沈雪笙在二樓包廂夾著雪茄審報、算唱片契約，輕易不下樓。',
    '衣箱唐桂蘭管水袖頭面、也管秘密；她替我繫過袖，一眼看得出我的形與心事。',
    '上海四馬路的報館、霞飛路的唱片行——一個名字能不能多活一天，多半在那兒定。',
    '江聞鶴新從紹興男班北上，是來搶小生位的勁敵，台步老辣、嗓子比我「正」。',
    // —— 11–15 質地與癖性 ——
    '去年我偷偷在戲箱內側刻了一個「春」字，誰也沒告訴。',
    '穿舊的褶子我不扔，新衣再亮，底下襯的還是舊衣——舊衣貼身，曉得你的形。',
    '許仙那頂方巾角上磨出一道白邊，是我自己繡的；上台前總要對著鏡子正了又正。',
    '厚底靴的千層底，能把腳下那點虛軟全壓進去，叫人看不出。',
    '幼時家寒，學戲原為口飯；這些年站在她對面唱，才咂摸出別的滋味來。',
];

const OCCASION =
    '散戲後，雲錦台只剩一盞燈。衣箱唐桂蘭回了鄉下，今夜沒人收拾。柳生春替蘇映雪卸下頭面，又蹲身替她重繫一條鬆了的水袖。兩人都隱隱覺出那份遠超台上生旦、遠超師姐妹的情分，可誰也不敢先說破。';

function povSystem() {
    return [
        '你是連載小說家，為「柳生春」寫一段第一人稱（全程「我」）的感情戲 POV。',
        '場景固定：散戲後替師姐蘇映雪繫水袖，愛而不得、誰也不敢說破。',
        '**只能用我給你的記憶材料**來加深這個人——沒有給的就不要編。記憶越多，你越能讓她的',
        '反應、聯想、矛盾有來歷；記憶為空時，就只能寫眼前動作。',
        '民初梨園舊白話，情緒克制，靠潛台詞與動作，不直白告白。600–900 字，純散文直接進正文。',
    ].join('\n');
}
function povUser(mems) {
    const memBlock = mems.length
        ? mems.map((m, i) => `${i + 1}. ${m}`).join('\n')
        : '（無——這個角色此刻沒有任何可用的過往記憶）';
    return [
        `# 角色`,
        `${CHAR.name}（${CHAR.role}・${CHAR.gender}）：${CHAR.physical}`,
        '',
        `# 這場戲`,
        OCCASION,
        '',
        `# 你能動用的記憶材料（共 ${mems.length} 條；只可化用、不可逐條複述、不可超出這些另編）`,
        memBlock,
        '',
        '請寫這一段 POV。直接輸出正文。',
    ].join('\n');
}

function judgeSystem() {
    return [
        '你是嚴格的小說編輯。下面是同一個角色、同一場戲、餵入「不同條數開場記憶」生成的多個版本。',
        '請替每個版本評分（1–10）：',
        '- 厚度depth：人物有沒有來歷、過去與當下的呼應、可信的內在；',
        '- 複雜度complexity：情感與動機有沒有層次/矛盾/潛台詞，而非單一情緒。',
        '再判斷：**從哪一個記憶條數檔位開始，厚度/複雜度有「明顯」躍升**？之後是否邊際遞減/飽和？',
        '只輸出 JSON：{"ratings":[{"n":0,"depth":x,"complexity":y,"added":"這檔比上一檔多帶出什麼"}],"threshold":N,"thresholdNote":"為何在這檔明顯提升","saturation":"從哪檔起邊際效益變小或無"}。',
    ].join('\n');
}
function judgeUser(versions) {
    return [
        '# 各版本（標著記憶條數 N）',
        versions.map((v) => `\n===== N=${v.n} =====\n${v.text}`).join('\n'),
        '',
        '請評分並判斷躍升門檻。只輸出 JSON。',
    ].join('\n');
}

section('解耦實驗 2 · 初始記憶條數消融（柳生春・繫水袖）');
let client = null;
let calls = 0;
async function ask(o) {
    if (DRY) return { text: '(dry)' };
    calls++;
    return client.chat(o);
}
if (DRY) log('模式：DRY');
else {
    try {
        client = createClient();
        log(`LLM：${client.provider}　primary=${client.models.primary}`);
    } catch (e) {
        log('⚠️ ' + e.message);
        process.exit(1);
    }
}
log(`檔位 N = ${NS.join(', ')}　judge=${!NO_JUDGE}　log=${LOG}`);

const versions = [];
for (const n of NS) {
    const mems = MEMORY_POOL.slice(0, n);
    section(`N = ${n} 條記憶`);
    if (mems.length) log('餵入記憶：\n' + mems.map((m, i) => `  ${i + 1}. ${m}`).join('\n'));
    else log('餵入記憶：（無）');
    log('');
    if (DRY) {
        log('[SYSTEM]\n' + povSystem());
        log('\n[USER]\n' + povUser(mems));
        versions.push({ n, text: '(dry)' });
        continue;
    }
    try {
        const r = await ask({ tier: 'primary', system: povSystem(), user: povUser(mems), maxTokens: 1800, temperature: 0.9 });
        const text = r.text.trim();
        log(text);
        versions.push({ n, text });
    } catch (e) {
        log(`(生成失敗 ${e.message})`);
        versions.push({ n, text: `(失敗 ${e.message})` });
    }
}

if (!NO_JUDGE && !DRY) {
    section('評審：厚度/複雜度評分 + 明顯躍升門檻');
    try {
        const r = await ask({ tier: 'primary', system: judgeSystem(), user: judgeUser(versions), maxTokens: 1200, temperature: 0.3 });
        const j = extractJson(r.text);
        if (j && Array.isArray(j.ratings)) {
            log('N　厚度　複雜度　這檔多帶出什麼');
            for (const x of j.ratings) log(`${x.n}\t${x.depth}\t${x.complexity}\t${x.added ?? ''}`);
            log(`\n▶ 明顯躍升門檻：N=${j.threshold}　— ${j.thresholdNote ?? ''}`);
            log(`▶ 邊際飽和：${j.saturation ?? ''}`);
        } else {
            log('(評審輸出無法解析)\n' + r.text);
        }
    } catch (e) {
        log(`(評審失敗 ${e.message})`);
    }
}

section('完成');
log(`LLM 呼叫：${calls}`);
log(`\n👉 log：${LOG}`);
log('   判讀：對讀各 N 版——心(傷口/愛)在第幾檔出來、關係/世界在第幾檔讓情節變立體、');
log('   質地癖性(刻「春」字/舊褶子)在高檔加了多少。評審的 threshold 就是「幾條開始明顯」。');
