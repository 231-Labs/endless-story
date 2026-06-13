/**
 * Standalone LLM client — mirrors packages/llm config + providers, but
 * zero-dependency (native fetch) and decoupled from the workspace so the sim
 * runs with `node` alone. Same env vars / default models as prod, so what you
 * test here is what ships.
 *
 *   AI_PROVIDER  auto|zai|poe|anthropic   (default auto: zai→poe→anthropic)
 *   ZAI_API_KEY / POE_API_KEY / ANTHROPIC_API_KEY
 *   *_MODEL_PRIMARY / *_MODEL_CHEAP overrides
 */

const DEFAULTS = {
    zaiModelPrimary: 'glm-5.1',
    zaiModelCheap: 'GLM-4.7-FlashX',
    zaiBaseUrl: 'https://api.z.ai/api/paas/v4',
    poeModelPrimary: 'GLM-5.1-FW',
    poeModelCheap: 'GLM-4.7-N',
    anthropicModelPrimary: 'claude-sonnet-4-6',
    anthropicModelCheap: 'claude-haiku-4-5',
};

const POE_ENDPOINT = 'https://api.poe.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const THINKING_MODELS = new Set(['Claude-Sonnet-4.6', 'Claude-Opus-4.1', 'claude-sonnet-4-6', 'claude-opus-4-6']);

export function loadConfig(overrides = {}) {
    const env = process.env;
    return {
        zaiApiKey: env.ZAI_API_KEY,
        zaiModelPrimary: env.ZAI_MODEL_PRIMARY ?? DEFAULTS.zaiModelPrimary,
        zaiModelCheap: env.ZAI_MODEL_CHEAP ?? DEFAULTS.zaiModelCheap,
        zaiBaseUrl: env.ZAI_BASE_URL ?? DEFAULTS.zaiBaseUrl,
        poeApiKey: env.POE_API_KEY,
        poeModelPrimary: env.POE_MODEL_PRIMARY ?? DEFAULTS.poeModelPrimary,
        poeModelCheap: env.POE_MODEL_CHEAP ?? DEFAULTS.poeModelCheap,
        anthropicApiKey: env.ANTHROPIC_API_KEY,
        anthropicModelPrimary: env.ANTHROPIC_MODEL_PRIMARY ?? DEFAULTS.anthropicModelPrimary,
        anthropicModelCheap: env.ANTHROPIC_MODEL_CHEAP ?? DEFAULTS.anthropicModelCheap,
        aiProvider: env.AI_PROVIDER ?? 'auto',
        ...overrides,
    };
}

export function resolveProvider(cfg) {
    const p = cfg.aiProvider;
    if (p === 'zai') return cfg.zaiApiKey ? 'zai' : null;
    if (p === 'poe') return cfg.poeApiKey ? 'poe' : null;
    if (p === 'anthropic') return cfg.anthropicApiKey ? 'anthropic' : null;
    if (cfg.zaiApiKey) return 'zai';
    if (cfg.poeApiKey) return 'poe';
    if (cfg.anthropicApiKey) return 'anthropic';
    return null;
}

function modelFor(cfg, provider, tier) {
    const key = tier === 'primary' ? 'Primary' : 'Cheap';
    return cfg[`${provider}Model${key}`];
}

async function callZAI(apiKey, baseUrl, req) {
    const messages = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push(...req.messages);
    const body = {
        model: req.model,
        messages,
        max_tokens: Math.max(req.maxTokens ?? 2048, 1024),
        stream: false,
        thinking: { type: 'disabled' },
    };
    if (typeof req.temperature === 'number') body.temperature = req.temperature;
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw httpErr(res.status, 'zai', req.model, await res.text().catch(() => ''));
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? '', model: req.model, provider: 'zai', usage: data.usage };
}

async function callPoe(apiKey, req) {
    const messages = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push(...req.messages);
    const needsThinking = THINKING_MODELS.has(req.model);
    const body = {
        model: req.model,
        messages,
        max_tokens: needsThinking ? Math.max(req.maxTokens ?? 2048, 4096) : (req.maxTokens ?? 2048),
        stream: false,
    };
    if (needsThinking) body.thinking = { type: 'enabled', budget_tokens: Math.max(2048, req.maxTokens ?? 2048) };
    else if (typeof req.temperature === 'number') body.temperature = req.temperature;
    const res = await fetch(POE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw httpErr(res.status, 'poe', req.model, await res.text().catch(() => ''));
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? '', model: req.model, provider: 'poe', usage: data.usage };
}

async function callAnthropic(apiKey, req) {
    const needsThinking = THINKING_MODELS.has(req.model);
    const body = {
        model: req.model,
        max_tokens: needsThinking ? Math.max(req.maxTokens ?? 2048, 4096) : (req.maxTokens ?? 2048),
        messages: req.messages,
    };
    if (req.system) body.system = req.system;
    if (needsThinking) body.thinking = { type: 'enabled', budget_tokens: Math.max(2048, req.maxTokens ?? 2048) };
    else if (typeof req.temperature === 'number') body.temperature = req.temperature;
    const res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw httpErr(res.status, 'anthropic', req.model, await res.text().catch(() => ''));
    const data = await res.json();
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, model: req.model, provider: 'anthropic', usage: data.usage };
}

function httpErr(status, provider, model, body) {
    const e = new Error(`[${provider}] HTTP ${status} on ${model}: ${String(body).slice(0, 200)}`);
    e.status = status;
    return e;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a client bound to a resolved provider. `chat({tier, ...})` picks the
 * primary/cheap model and retries 429/503/529 with backoff.
 */
export function createClient(cfg = loadConfig()) {
    const provider = resolveProvider(cfg);
    if (!provider) {
        throw new Error('無可用 LLM provider：請設定 ZAI_API_KEY / POE_API_KEY / ANTHROPIC_API_KEY 之一');
    }
    const apiKey =
        provider === 'zai' ? cfg.zaiApiKey : provider === 'poe' ? cfg.poeApiKey : cfg.anthropicApiKey;

    async function chat({ tier = 'primary', system, user, messages, maxTokens = 2048, temperature }) {
        const model = modelFor(cfg, provider, tier);
        const req = {
            model,
            system,
            messages: messages ?? [{ role: 'user', content: user }],
            maxTokens,
            temperature,
        };
        let lastErr;
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                if (provider === 'zai') return await callZAI(apiKey, cfg.zaiBaseUrl, req);
                if (provider === 'poe') return await callPoe(apiKey, req);
                return await callAnthropic(apiKey, req);
            } catch (err) {
                lastErr = err;
                const retryable = [429, 503, 529].includes(err?.status);
                if (!retryable || attempt === 3) throw err;
                await sleep(1000 * 2 ** attempt + Math.random() * 500);
            }
        }
        throw lastErr;
    }

    return { provider, models: { primary: modelFor(cfg, provider, 'primary'), cheap: modelFor(cfg, provider, 'cheap') }, chat };
}
