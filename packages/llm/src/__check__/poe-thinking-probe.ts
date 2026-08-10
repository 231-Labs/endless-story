/**
 * Poe 推理旗標探針 —— 「思考關得掉嗎」這題的實證答案。
 *
 * 起因：GLM 在 Poe 這頭似乎無視我們送的 `thinking: {type:'disabled'}`——一次呼叫
 * 想了 32 秒，`content` 回來一個字都沒有（推理把 max_tokens 花光，答案沒地方寫），
 * 於是滿場角色一件心事都長不出來、世界完全靜止。沙箱打不到 api.poe.com，只能由
 * 部署端實測。這支就是那把尺。
 *
 * 每種參數組合各打一次同樣的小題目，印出：延遲、finish_reason、實際輸出 token、
 * 回話長度與開頭。看三件事：
 *   1. 哪一組的 `completion_tokens` 明顯低、延遲明顯短 → 那組真的關掉了推理。
 *   2. 哪一組 `content` 有字 → 那組拿得到答案（沒字就是白花錢）。
 *   3. 若每組都慢且 `finish_reason=length` → 關不掉，只能替推理留額度
 *      （providers.ts 的 GLM_REASONING_HEADROOM_TOKENS 就是這個保命符）。
 *
 *   set -a && source packages/web/.env.local && set +a
 *   pnpm --filter @endless-story/cli exec tsx ../llm/src/__check__/poe-thinking-probe.ts [模型id]
 */

const ENDPOINT = 'https://api.poe.com/v1/chat/completions';

/** 小而確定的題目：一個健康的通道應該幾秒內回一小段 JSON。 */
const TASK = '只輸出 JSON，不要任何其他文字：{"wants":[{"desc":"<12字以內的一件心事>","tension":0.5}]}';

interface Variant {
    label: string;
    extra: Record<string, unknown>;
}

const VARIANTS: Variant[] = [
    { label: '① 什麼都不送（Poe 預設）', extra: {} },
    { label: '② thinking:disabled（我們現在送的）', extra: { thinking: { type: 'disabled' } } },
    { label: '③ reasoning_effort:minimal', extra: { reasoning_effort: 'minimal' } },
    { label: '④ thinking:{budget_tokens:0}', extra: { thinking: { type: 'enabled', budget_tokens: 0 } } },
    { label: '⑤ 只放寬額度（額度 4000，不送旗標）', extra: {}, },
];

async function once(apiKey: string, model: string, v: Variant, maxTokens: number) {
    const t0 = Date.now();
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: TASK }],
                max_tokens: maxTokens,
                stream: false,
                ...v.extra,
            }),
            signal: AbortSignal.timeout(180_000),
        });
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        if (!res.ok) {
            console.log(`${v.label}\n   ✗ HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 160)}\n`);
            return;
        }
        const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>;
            usage?: { completion_tokens?: number; prompt_tokens?: number };
        };
        const choice = data.choices?.[0];
        const content = choice?.message?.content ?? '';
        const reasoning = choice?.message?.reasoning_content ?? '';
        console.log(
            `${v.label}\n` +
                `   ${secs}s · finish_reason=${choice?.finish_reason ?? '?'} · 輸出 ${data.usage?.completion_tokens ?? '?'} tokens\n` +
                `   content ${content.length} 字${content ? `：${content.replace(/\s+/g, ' ').slice(0, 80)}` : ' ← 空的！錢花了，東西沒拿到'}\n` +
                (reasoning ? `   reasoning_content ${reasoning.length} 字（答案可能被放在這裡）\n` : ''),
        );
    } catch (err) {
        console.log(`${v.label}\n   ✗ ${err instanceof Error ? err.message : String(err)}\n`);
    }
}

async function main() {
    const apiKey = process.env.POE_API_KEY;
    if (!apiKey) throw new Error('POE_API_KEY unset —— 先 source 你的 env');
    const model = process.argv[2] ?? process.env.POE_MODEL_PRIMARY ?? 'GLM-4.6';
    console.log(`\n模型：${model}\n題目：一小段 JSON（健康的通道應該幾秒內回完）\n${'─'.repeat(64)}\n`);
    for (const v of VARIANTS) {
        await once(apiKey, model, v, v.label.startsWith('⑤') ? 4000 : 800);
    }
    console.log(
        '判讀：\n' +
            '  · 有哪一組又快、輸出 token 又少、content 有字 → 那組就是關掉推理的正解，抄進 providers.ts。\n' +
            '  · 全都慢且 content 空、finish_reason=length → 關不掉；只能留額度（⑤ 應該就會有字）。\n' +
            '  · 若只有 reasoning_content 有字 → 答案被放錯欄位，providers.ts 的 requireText 已會撿回來。\n',
    );
}

void main();
