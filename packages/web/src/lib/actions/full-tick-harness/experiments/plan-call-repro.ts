/**
 * 決定性復現 — 同樣四個模型，但餵 runner 真實 plan 那種「大 prompt」(situation + 8 記憶 + 牽掛 + 名冊 + 舊計畫)，
 * thinking OFF(runner 的設定) + ON。若大 prompt 下 cheap 也飆到 ~240s → 真凶是 prompt 大小×模型；若仍 ~6s →
 * 真凶在 runner 的 client/env 路徑(thinking 偷開了之類)，不在 prompt。
 *
 *   <node23> <tsx/cli.mjs> --env-file=packages/web/.env.local \
 *     packages/web/src/lib/actions/full-tick-harness/experiments/plan-call-repro.ts
 */

const SYS = [
    '你是一個戲園角色，此刻在心裡盤算「我想要什麼、接下來要怎麼走」。這是你的規劃，不是行動。',
    '鐵則：1.承接舊計畫但大事必轉向。2.用記憶與性格定目標。2b.關係也是你能投入的方向。3.三層次：長期目標/眼下打算/未竟之事。4.第一人稱、具體。5.身份不得漂移。6.舞台中心不是管理權力。',
    '輸出嚴格只一個 JSON：{"longTermGoal":"…","dailyPlanHint":"…","openSubgoals":["…","…"]}。不要 markdown。',
].join('\n');

// 仿 buildUserPrompt 的「大 prompt」：當下處境 + 牽掛 + 8 記憶 + 舊計畫 + 名冊
const USER = [
    '# 你是誰',
    '- 姓名：柳生春　- 行當：坤生　- 行當聲口：女子扮小生、巾生路子、持摺扇　- 所屬：春雪社　- 此刻：第1日·日午',
    '## 當下處境（你此刻面對的真實 — 你的打算必須回應它，不能當沒看見照舊）',
    '你在【後台】，同處：蘇映雪、田巧雲、金鳳。',
    '〔山雨欲來〕今晚誰壓軸、誰站台心的暗潮浮上了檯面——蘇映雪是台柱花旦，你是當紅坤生，「柳蘇」是招牌，可班主田巧雲還沒定今晚的生旦。',
    '〔風聲〕金鳳又來後台討風流帳，當著蘇映雪的面纏你。',
    '〔爭的東西〕今晚壓軸的台心位（capacity 1）。',
    '（用你的記憶與性格去讀它：危機怎麼接、在場的人怎麼用、爭的東西怎麼搶——但不可假裝它沒發生。）',
    '## 你心裡的牽掛（你對在場這些人的情分）',
    '- 對蘇映雪：戀慕很深，卻說不出口；自小的師姐，你台下風流是怕被她看穿。',
    '- 對金鳳：逢場作戲的舊相好，心裡其實躲著她。',
    '- 對田巧雲：班主，敬而畏，她眼裡藏著當年白蘭的舊事。',
    '## 你心底翻起的記憶',
    '1. 你自小是蘇映雪的小師妹，賣身入科頭回挨打、是她塞你一顆糖。',
    '2. 倒倉那年你以為嗓子廢了，夜夜趴在師姐膝頭哭，是她守著你，那時你的夜只有她。',
    '3. 紅了之後外面的女人一個接一個，你說不清是貪還是躲。',
    '4. 你台上對蘇映雪遞水袖第三道的暗號，台下卻夜夜不歸。',
    '5. 師父臨終把那柄摺扇交你，只說「戲比天大」。',
    '6. 你不敢回頭看師姐的眼，怕一看這風流的殼就裝不下去了。',
    '7. 頭回滿堂彩你在後台吐了，是師姐替你擦的。',
    '8. 你看當年的大師姐一年年被後輩蓋過，夜裡也怕輪到自己。',
    '## 你先前的打算（在此基礎上推進）',
    '[長期目標] 在春雪社坐穩當紅坤生、那份矚目別涼',
    '[眼下打算] 接住今晚的壓軸、別讓師姐被分了台心',
    '[未竟之事]\n- 探明師姐今晚願不願與我搭這壓軸\n- 別讓金鳳在後台鬧出事\n- 把那句說不出口的話再藏一藏',
    '## 同 saga 公開名冊（只作公開身份與位置）',
    '- 蘇映雪／花旦／後台　- 田巧雲／班主／帳房　- 金鳳／旦／後台前頭',
    '',
    '請輸出你此刻的規劃(JSON)。',
].join('\n');

interface Combo { provider: 'zai' | 'poe'; model: string; label: string; testThinkOn: boolean }
const COMBOS: Combo[] = [
    { provider: 'zai', model: 'glm-5.1', label: 'ZAI  primary  glm-5.1', testThinkOn: false },
    { provider: 'zai', model: 'GLM-4.7-FlashX', label: 'ZAI  cheap    GLM-4.7-FlashX', testThinkOn: true },
    { provider: 'poe', model: 'GLM-5.1-FW', label: 'POE  primary  GLM-5.1-FW', testThinkOn: false },
    { provider: 'poe', model: 'GLM-4.7-N', label: 'POE  cheap    GLM-4.7-N', testThinkOn: true },
];
const REPS = 2;
const TIMEOUT_MS = 360_000;

async function callOnce(c: Combo, thinking: boolean): Promise<{ ms: number; ok: boolean; outTok?: number; err?: string }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
        const messages = [{ role: 'system', content: SYS }, { role: 'user', content: USER }];
        let url: string; let headers: Record<string, string>; let body: Record<string, unknown>;
        if (c.provider === 'zai') {
            const key = process.env.ZAI_API_KEY; if (!key) return { ms: 0, ok: false, err: 'no ZAI key' };
            url = (process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '') + '/chat/completions';
            headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
            body = { model: c.model, messages, max_tokens: thinking ? 2048 : 1024, stream: false, thinking: { type: thinking ? 'enabled' : 'disabled' }, temperature: 0.8 };
        } else {
            const key = process.env.POE_API_KEY; if (!key) return { ms: 0, ok: false, err: 'no POE key' };
            url = 'https://api.poe.com/v1/chat/completions';
            headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
            body = { model: c.model, messages, max_tokens: thinking ? 4096 : 1024, stream: false, temperature: 0.8, thinking: thinking ? { type: 'enabled', budget_tokens: 2048 } : { type: 'disabled' } };
        }
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
        const ms = Date.now() - t0;
        if (!res.ok) { const t = await res.text().catch(() => ''); return { ms, ok: false, err: `HTTP ${res.status} ${t.slice(0, 80)}` }; }
        const data = (await res.json()) as { usage?: { completion_tokens?: number; prompt_tokens?: number } };
        return { ms, ok: true, outTok: data.usage?.completion_tokens };
    } catch (e) {
        return { ms: Date.now() - t0, ok: false, err: e instanceof Error ? e.message : String(e) };
    } finally { clearTimeout(timer); }
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
async function main(): Promise<void> {
    console.log(`plan 大-prompt 復現 · 仿 runner 真實 plan(~${Math.round(USER.length / 1.6)} tok 估) · thinking OFF=runner設定\n`);
    for (const c of COMBOS) {
        const thinks = c.testThinkOn ? [false, true] : [false];
        for (const thinking of thinks) {
            for (let r = 0; r < REPS; r++) {
                const res = await callOnce(c, thinking);
                console.log(`  ${c.label.padEnd(28)} think=${thinking ? 'ON ' : 'OFF'} rep${r + 1}: ${res.ok ? fmt(res.ms) : `✗ ${res.err}`}${res.outTok != null ? ` (${res.outTok} out-tok)` : ''}`);
            }
        }
    }
    console.log(`\n讀法：大 prompt + thinking OFF 若 cheap 仍 ~6s → 真凶不在 prompt/模型 → 在 runner client/env(thinking 偷開？)。若飆到 ~200s → 真凶=大prompt×模型。`);
}
main().catch((e) => { console.error(e); process.exit(1); });

export {};
