/**
 * 實測模型速度交叉表 — Poe vs ZAI × primary vs cheap × thinking on/off. Direct fetch (full control
 * over the `thinking` flag, bypassing the client's GLM-forces-disabled logic), SAME plan-sized prompt
 * for every cell, sequential (clean wall-clock), 2 reps each, 360s timeout. Answers: is the cheap tier
 * actually slow, and is it the model or the thinking flag?
 *
 *   <node23> <tsx/cli.mjs> --env-file=packages/web/.env.local \
 *     packages/web/src/lib/actions/full-tick-harness/experiments/model-speed-bench.ts
 */

const SYS = '你是一個戲園角色，此刻在心裡盤算「我想要什麼、接下來要怎麼走」。輸出嚴格只一個 JSON：{"longTermGoal":"…","dailyPlanHint":"…","openSubgoals":["…","…"]}。不要 markdown、不要多餘文字。';
const USER = [
    '# 你是誰',
    '- 姓名：柳生春　- 行當：坤生　- 所屬：春雪社',
    '## 當下處境（你的打算必須回應它）',
    '後台，蘇映雪、田巧雲、金鳳都在；今晚誰壓軸、誰站台心的暗潮浮上了檯面。',
    '## 你心底翻起的記憶',
    '1. 倒倉那年你以為廢了，是師姐蘇映雪夜夜守著你。',
    '2. 紅了之後外面的女人一個接一個，你說不清是貪還是躲。',
    '3. 你台上對蘇映雪遞水袖第三道的暗號，台下卻夜夜不歸。',
    '## 你先前的打算',
    '[長期目標] 在春雪社坐穩當紅坤生　[眼下打算] 接住今晚的壓軸　[未竟之事] - 探明師姐的心意',
    '',
    '請輸出你此刻的規劃(JSON)。',
].join('\n');

interface Combo { provider: 'zai' | 'poe'; model: string; label: string }
const COMBOS: Combo[] = [
    { provider: 'zai', model: 'glm-5.1', label: 'ZAI  primary  glm-5.1' },
    { provider: 'zai', model: 'GLM-4.7-FlashX', label: 'ZAI  cheap    GLM-4.7-FlashX' },
    { provider: 'poe', model: 'GLM-5.1-FW', label: 'POE  primary  GLM-5.1-FW' },
    { provider: 'poe', model: 'GLM-4.7-N', label: 'POE  cheap    GLM-4.7-N' },
];
const REPS = 2;
const TIMEOUT_MS = 360_000;

interface CallResult { ms: number; ok: boolean; outTok?: number; err?: string }

async function callOnce(c: Combo, thinking: boolean): Promise<CallResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
        let url: string;
        let headers: Record<string, string>;
        let body: Record<string, unknown>;
        const messages = [{ role: 'system', content: SYS }, { role: 'user', content: USER }];
        if (c.provider === 'zai') {
            const key = process.env.ZAI_API_KEY;
            if (!key) return { ms: 0, ok: false, err: 'no ZAI_API_KEY' };
            url = (process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '') + '/chat/completions';
            headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
            // ZAI counts reasoning against max_tokens → give thinking-on room so it isn't truncated.
            body = { model: c.model, messages, max_tokens: thinking ? 2048 : 1024, stream: false, thinking: { type: thinking ? 'enabled' : 'disabled' }, temperature: 0.8 };
        } else {
            const key = process.env.POE_API_KEY;
            if (!key) return { ms: 0, ok: false, err: 'no POE_API_KEY' };
            url = 'https://api.poe.com/v1/chat/completions';
            headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
            body = { model: c.model, messages, max_tokens: thinking ? 4096 : 1024, stream: false, temperature: 0.8 };
            body.thinking = thinking ? { type: 'enabled', budget_tokens: 2048 } : { type: 'disabled' };
        }
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
        const ms = Date.now() - t0;
        if (!res.ok) { const t = await res.text().catch(() => ''); return { ms, ok: false, err: `HTTP ${res.status} ${t.slice(0, 80)}` }; }
        const data = (await res.json()) as { usage?: { completion_tokens?: number } };
        return { ms, ok: true, outTok: data.usage?.completion_tokens };
    } catch (e) {
        const ms = Date.now() - t0;
        return { ms, ok: false, err: e instanceof Error ? e.message : String(e) };
    } finally {
        clearTimeout(timer);
    }
}

function fmt(ms: number): string { return `${(ms / 1000).toFixed(1)}s`; }
function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

async function main(): Promise<void> {
    console.log(`模型速度交叉實測 · reps=${REPS} · 同一個 plan-sized prompt · 序列跑(乾淨計時)\n`);
    const rows: { label: string; thinking: boolean; times: number[]; oks: number; tok?: number }[] = [];
    for (const c of COMBOS) {
        for (const thinking of [false, true]) {
            const times: number[] = []; let oks = 0; let tok: number | undefined;
            for (let r = 0; r < REPS; r++) {
                const res = await callOnce(c, thinking);
                process.stdout.write(`  ${c.label.padEnd(28)} think=${thinking ? 'ON ' : 'OFF'} rep${r + 1}: ${res.ok ? fmt(res.ms) : `✗ ${res.err}`}${res.outTok != null ? ` (${res.outTok} out-tok)` : ''}\n`);
                if (res.ok) { times.push(res.ms); oks++; if (res.outTok != null) tok = res.outTok; }
            }
            rows.push({ label: c.label, thinking, times, oks, tok });
        }
    }

    console.log(`\n${'═'.repeat(76)}\n交叉表（中位數秒；out-tok = 最後一次完成的輸出 token）\n${'─'.repeat(76)}`);
    console.log(`${'provider / tier / model'.padEnd(30)}${'think OFF'.padEnd(20)}think ON`);
    console.log('─'.repeat(76));
    for (const c of COMBOS) {
        const off = rows.find((r) => r.label === c.label && !r.thinking);
        const on = rows.find((r) => r.label === c.label && r.thinking);
        const offStr = off && off.oks ? `${fmt(median(off.times))}${off.tok != null ? ` (${off.tok}t)` : ''}` : '✗';
        const onStr = on && on.oks ? `${fmt(median(on.times))}${on.tok != null ? ` (${on.tok}t)` : ''}` : '✗';
        console.log(`${c.label.padEnd(30)}${offStr.padEnd(20)}${onStr}`);
    }
    console.log('═'.repeat(76));
    console.log('讀法：① 同層(primary vs cheap) Poe 與 ZAI 是否真的差不多 ② cheap 到底慢不慢 ③ thinking ON 的延遲稅多大。');
}

main().catch((e) => { console.error(e); process.exit(1); });

export {};
