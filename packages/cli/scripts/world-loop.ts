/**
 * world-loop — drive the autonomous tick loop on an interval.
 *
 * The world only moves when something runs `runTickLoopAction`. The admin
 * SchedulerPanel button does it by hand; this script does it on a timer, so
 * the saga lives on its own: every N seconds it POSTs /api/tick (the web app
 * holds the admin keypair + orchestration), waits for that tick to finish,
 * then sleeps and goes again. Sequential by construction — never overlaps
 * ticks (which would race on the single keypair).
 *
 *   pnpm --filter @endless-story/cli world-loop -- --interval=45 --max=20
 *
 * Tick phase order:
 *   PLAN → MOVE → DRAMA → SOCIAL → ACT → POV → SLEEP → GAZETTE
 *
 * Mirror scheduling (docs/narrative/WORLD_TIME_MIRROR.md): when the world runs
 * on mirror time (`ES_TIME_MODE=mirror`, or `--mirror`), a tick is no longer a
 * unit of time — it's the heartbeat that lets the cast act inside the current
 * 時辰. So the loop stops sleeping a fixed interval and instead sleeps to the
 * next 時辰 boundary (UTC+8 05/09/13/17/21/01), six beats a day. Cold start
 * fires one beat immediately for the 時辰 already underway, then falls into
 * boundary scheduling — never a backlog of catch-up ticks: the world lived
 * through the downtime, nobody was there to perform it.
 *
 * Flags:
 *   --mirror               sleep to the next 時辰 boundary instead of --interval
 *                          (env fallback: ES_TIME_MODE=mirror)
 *   --interval=<seconds>   gap between ticks (default 60; legacy tick mode)
 *   --max=<n>              stop after n ticks (default 0 = run forever)
 *   --dry-run              preview tick output; no advance / chain or memory writes
 *   --max-characters=<n>   cap characters per tick (default server-side)
 *   --character-ids=<ids>  comma-separated exact character ids to process
 *   --json-out=<path>      write full tick JSON records for acceptance review
 *   --no-advance           don't advance the World tick each pass
 *   --no-move | --no-pov | --no-sleep | --no-gazette | --no-plan   skip that phase
 *   --event-spine          Phase 2: drive a 回 as a multi-tick BudgetEvent spine
 *   --llm-framing          Phase 3-A: let the LLM director name each incident
 *   --director-resources   Phase 3-B: let the LLM director add scarce resources
 *   --parallel-events      Stage 1: run many events at once (one per axis)
 *   --attention-budget     Stage 2: concurrent events pull on shared characters
 *   --rival-gravity        draw contenders toward their contest so events form
 *   --max-concurrent-events=<n>  cap for --parallel-events (default 2)
 *      (all default off; see docs/narrative/EVENT_LIFECYCLE.md §5–§7 for what to watch)
 *   --want-engine          §2.36–2.48: want-driven per-scene interaction loops
 *   --centrality           §4d.1: pick the staged contention by relationship centrality
 *   --actor-fatigue        §2.51: spotlight rotation (selection-only, never settlement)
 *   --arc-convergence      §4d.2: off-chain arc convergence state machine
 *   --pov-all              force a POV chapter for every processed character
 *      (all default off; opt-in only)
 *   --showrunner-every=<n> run a Showrunner heartbeat (POST /api/showrunner)
 *                          after every n ticks (default 0 = off; see
 *                          docs/narrative/NARRATIVE_AGENTS.md §12.2)
 *
 * Env (from ../web/.env.local locally, or the service's own EnvironmentFile
 * when deployed standalone). Every flag above has an env fallback
 * (flag > env > default), so a service deployment is tuned entirely via env:
 *   WORLD_LOOP_URL    web base url or full /api/tick url (default http://localhost:3000)
 *   TICK_LOOP_SECRET  bearer token, if the /api/tick route is secured
 *   WORLD_LOOP_INTERVAL       fallback for --interval (seconds)
 *   WORLD_LOOP_MAX_TICKS      fallback for --max
 *   WORLD_LOOP_MAX_CHARACTERS fallback for --max-characters
 *   SHOWRUNNER_EVERY_TICKS    fallback for --showrunner-every
 *   TICK_EVENT_SPINE / TICK_LLM_FRAMING / TICK_DIRECTOR_RESOURCES /
 *   TICK_PARALLEL_EVENTS / TICK_ATTENTION_BUDGET / TICK_RIVAL_GRAVITY /
 *   TICK_MAX_CONCURRENT_EVENTS / TICK_WANT_ENGINE / TICK_CENTRALITY /
 *   TICK_ACTOR_FATIGUE / TICK_ARC_CONVERGENCE
 *                     experimental gates — same names as the web-side env
 *                     resolution, so one .env works on either service (set
 *                     here they're forwarded in the POST body; truthy =
 *                     1/true/yes/on; body only ever forces ON)
 *                     (--pov-all has no env fallback — CLI flag only)
 *   RUNNER_CONTROL_URL optional relayer /control URL; {paused:true} skips the tick
 *   MEMWAL_SERVER_URL fallback base URL for control when RUNNER_CONTROL_URL is unset
 *   RUNNER_CONTROL_SECRET optional bearer token for RUNNER_CONTROL_URL
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Agent } from 'undici';
import {
    formatStoryDate,
    nextBucketBoundaryMs,
    resolveWorldClockConfig,
    storyNow,
    type MirrorTimeConfig,
} from '@endless-story/shared/world-clock';

/** A full tick (plans + beats + POVs + anchoring) can legitimately run past
 *  undici's 300s default headers timeout; give it real headroom. */
const TICK_FETCH_TIMEOUT_MS = 20 * 60 * 1000;
const tickDispatcher = new Agent({
    headersTimeout: TICK_FETCH_TIMEOUT_MS,
    bodyTimeout: TICK_FETCH_TIMEOUT_MS,
});

// Minimal ANSI palette, TTY-gated (off when piped/redirected or NO_COLOR set).
const COLOR = Boolean(process.stdout.isTTY) && process.env.NO_COLOR == null;
const ansi =
    (code: string) =>
    (s: string | number): string =>
        COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s);
const clr = {
    dim: ansi('2'),
    bold: ansi('1'),
    cyan: ansi('36'),
    green: ansi('32'),
    red: ansi('31'),
    yellow: ansi('33'),
};

interface LoopOpts {
    intervalMs: number;
    maxTicks: number;
    input: Record<string, boolean | number | string[]>;
    jsonOut?: string;
    /** Run a Showrunner heartbeat after every n ticks (0 = off). */
    showrunnerEvery: number;
    /** Set when the world runs on mirror time: sleep to 時辰 boundaries, not intervalMs. */
    mirror?: MirrorTimeConfig;
}

/** '1' / 'true' / 'yes' / 'on' — same semantics as the web-side TICK_* gates. */
function envFlag(name: string): boolean {
    const v = (process.env[name] ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function parseArgs(argv: string[]): LoopOpts {
    const get = (name: string): string | undefined => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : undefined;
    };
    const has = (name: string): boolean => argv.includes(`--${name}`);

    // Every knob resolves flag > env > default, so a standalone service
    // deployment (systemd/pm2 with an EnvironmentFile) can be tuned without
    // editing the unit's ExecStart line.
    const interval = Number(get('interval') ?? process.env.WORLD_LOOP_INTERVAL ?? 60);
    const max = Number(get('max') ?? process.env.WORLD_LOOP_MAX_TICKS ?? 0);
    const jsonOut = get('json-out');
    const maxCharacters = Number(get('max-characters') ?? process.env.WORLD_LOOP_MAX_CHARACTERS);
    const characterIds = (get('character-ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    const input: Record<string, boolean | number | string[]> = {};
    if (has('dry-run')) input.dryRun = true;
    if (Number.isFinite(maxCharacters) && maxCharacters > 0) {
        input.maxCharacters = Math.floor(maxCharacters);
    }
    if (characterIds.length > 0) input.characterIds = characterIds;
    if (has('no-advance')) input.advance = false;
    if (has('no-plan')) input.plan = false;
    if (has('no-move')) input.move = false;
    if (has('no-pov')) input.pov = false;
    if (has('no-sleep')) input.sleep = false;
    if (has('no-gazette')) input.gazette = false;
    // EVENT_LIFECYCLE experiments (default off; opt-in for observation runs).
    // Env names match the web-side gates (TICK_*), so the same .env works on
    // either service: set here → forwarded in the POST body; set on the web
    // service → resolved there. Body only ever forces ON (never sends false),
    // so the two layers compose instead of fighting.
    if (has('event-spine') || envFlag('TICK_EVENT_SPINE')) input.eventSpine = true; // Phase 2: multi-tick BudgetEvent spine
    if (has('llm-framing') || envFlag('TICK_LLM_FRAMING')) input.llmFraming = true; // Phase 3-A: LLM names each incident
    if (has('director-resources') || envFlag('TICK_DIRECTOR_RESOURCES')) input.directorResources = true; // Phase 3-B: LLM adds scarcity
    if (has('parallel-events') || envFlag('TICK_PARALLEL_EVENTS')) input.parallelEvents = true; // Stage 1: many events at once
    if (has('attention-budget') || envFlag('TICK_ATTENTION_BUDGET')) input.attentionBudget = true; // Stage 2: cross-event attention pull
    if (has('rival-gravity') || envFlag('TICK_RIVAL_GRAVITY')) input.rivalGravity = true; // draw contenders together so events form
    const maxConcurrent = Number(get('max-concurrent-events') ?? process.env.TICK_MAX_CONCURRENT_EVENTS);
    if (Number.isFinite(maxConcurrent) && maxConcurrent > 0) input.maxConcurrentEvents = Math.floor(maxConcurrent);
    if (has('want-engine') || envFlag('TICK_WANT_ENGINE')) input.wantEngine = true; // §2.36–2.48: want-driven per-scene loops
    if (has('centrality') || envFlag('TICK_CENTRALITY')) input.centrality = true; // §4d.1: contention pick by relationship centrality
    if (has('actor-fatigue') || envFlag('TICK_ACTOR_FATIGUE')) input.actorFatigue = true; // §2.51: spotlight rotation
    if (has('arc-convergence') || envFlag('TICK_ARC_CONVERGENCE')) input.arcConvergence = true; // §4d.2: arc convergence state machine
    if (has('pov-all')) input.povAll = true; // force a chapter for every processed character (no env fallback)
    const showrunnerEvery = Number(get('showrunner-every') ?? process.env.SHOWRUNNER_EVERY_TICKS ?? 0);
    // 曆法由 env 明示（或 --mirror 強制）。排程器讀不到鏈；未明示時先走 legacy
    // interval，首拍回應若自述 mirror（worldTime.mode）即改採時辰邊界排程。
    const clock = resolveWorldClockConfig(has('mirror') ? { ...process.env, ES_TIME_MODE: 'mirror' } : process.env);

    return {
        intervalMs: Math.max(5, Number.isFinite(interval) ? interval : 60) * 1000,
        maxTicks: Number.isFinite(max) && max > 0 ? max : 0,
        input,
        jsonOut,
        showrunnerEvery: Number.isFinite(showrunnerEvery) && showrunnerEvery > 0 ? Math.floor(showrunnerEvery) : 0,
        mirror: clock.mode === 'mirror' ? clock.mirror : undefined,
    };
}

interface ShowrunnerBeatResult {
    ok?: boolean;
    report?: string;
    toolCalls?: Array<{ tool?: string; ok?: boolean }>;
    error?: string;
}

/** POST one Showrunner heartbeat; logs a one-line summary. Never throws. */
async function runShowrunnerBeat(url: string, secret?: string): Promise<void> {
    const t0 = Date.now();
    console.log(clr.dim(`[showrunner] ▶ heartbeat — audit → repair → assess → intervene → log`));
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(secret ? { authorization: `Bearer ${secret}` } : {}),
            },
            body: '{}',
        });
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        let json: ShowrunnerBeatResult | null = null;
        try {
            json = (await res.json()) as ShowrunnerBeatResult;
        } catch {
            /* non-JSON handled below */
        }
        if (!res.ok || !json || json.ok === false) {
            console.warn(
                `${clr.red('[showrunner] ✗')} HTTP ${res.status}${json?.error ? ` — ${json.error}` : ''} ${clr.dim(`(${secs}s)`)}`,
            );
            return;
        }
        const calls = json.toolCalls ?? [];
        const okCalls = calls.filter((c) => c.ok).length;
        const reportLine = (json.report ?? '').replace(/\s+/g, ' ').slice(0, 120);
        console.log(`${clr.green('[showrunner] ✓')} tools ${okCalls}/${calls.length} ${clr.dim(`(${secs}s)`)}${reportLine ? ` — ${reportLine}` : ''}`);
    } catch (err) {
        console.warn(`${clr.red('[showrunner] ✗')} ${err instanceof Error ? err.message : String(err)}`);
    }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * Sleep until the next beat. Mirror worlds wait for the next 時辰 boundary
 * (so a tick always lands at the top of a 時辰); legacy worlds wait intervalMs.
 *
 * 時辰邊界一等就是幾小時，所以鏡像的等待切成小段輪詢 `shouldStop`——
 * 否則 Ctrl-C 之後這裡會壓著不放，還白打一拍才收。
 */
async function sleepToNextBeat(
    intervalMs: number,
    mirror: MirrorTimeConfig | undefined,
    shouldStop: () => boolean,
): Promise<void> {
    if (!mirror) {
        await sleep(intervalMs);
        return;
    }
    const nextMs = nextBucketBoundaryMs(Date.now(), mirror);
    const at = storyNow(nextMs, mirror);
    const mins = Math.round((nextMs - Date.now()) / 60_000);
    console.log(
        `${clr.dim('[world-loop]')} 下一拍：${clr.bold(hhmm(at.hour, at.minute))} ${clr.dim(`（${at.partOfDay}）· ${mins} 分後`)}`,
    );
    while (Date.now() < nextMs && !shouldStop()) {
        await sleep(Math.min(1000, nextMs - Date.now()));
    }
}

interface TickResult {
    ok?: boolean;
    advanced?: boolean;
    worldTime?: { day?: number; partOfDay?: string; mode?: string; dateLabel?: string };
    plans?: unknown[];
    moves?: { ok: boolean; toSceneId?: string }[];
    drama?: {
        active?: boolean;
        resourceCount?: number;
        commitmentId?: string;
        top?: Array<{ name?: string; characterId?: string; statement?: string; tension?: number }>;
    };
    socials?: Array<{
        ok: boolean;
        kind?: string;
        name?: string;
        targetName?: string;
        line?: string;
        observation?: string;
        reason?: string;
    }>;
    acts?: { ok: boolean }[];
    resolves?: { ok: boolean }[];
    povs?: { ok?: boolean; anchored?: boolean }[];
    sleeps?: { anchored?: boolean }[];
    gazette?: { anchored?: boolean };
    memoryWarnings?: string[];
    memoryDegraded?: boolean;
    error?: string;
}

interface TickRecord {
    tick: number;
    seconds: number;
    ok: boolean;
    skipped?: boolean;
    status?: number;
    statusText?: string;
    result?: TickResult;
    error?: string;
    responseSnippet?: string;
}

function summarize(r: TickResult): string {
    if (r.error) return `error: ${r.error}`;
    const ok = (arr?: { ok: boolean }[]) => (arr ?? []).filter((x) => x.ok).length;
    const moved = (arr?: { ok: boolean; toSceneId?: string }[]) =>
        (arr ?? []).filter((x) => x.ok && x.toSceneId).length;
    const anchored = (arr?: { anchored?: boolean }[]) =>
        (arr ?? []).filter((x) => x.anchored).length;
    const chapters = (arr?: { ok?: boolean; anchored?: boolean }[]) =>
        (arr ?? []).filter((x) => x.ok || x.anchored).length;
    const day = r.worldTime?.dateLabel
        ? `${r.worldTime.dateLabel} · ${r.worldTime.partOfDay}`
        : r.worldTime?.day != null ? `Day ${r.worldTime.day} · ${r.worldTime.partOfDay}` : '—';
    const drama = r.drama?.active
        ? `tension ${r.drama.resourceCount ?? 0}${r.drama.commitmentId ? '⛓' : ''}`
        : null;
    const socialCount = (r.socials ?? []).filter((x) => x.ok && x.kind !== 'idle').length;
    const memory = r.memoryDegraded ? `memory-degraded ${r.memoryWarnings?.length ?? 0}` : null;
    return [
        clr.bold(day),
        `plan ${(r.plans ?? []).length}`,
        `move ${moved(r.moves)}`,
        ...(drama ? [drama] : []),
        `talk ${socialCount}`,
        `act ${ok(r.acts)}`,
        `resolve ${ok(r.resolves)}`,
        `chapter ${chapters(r.povs)}${anchored(r.povs) ? `(${anchored(r.povs)}⛓)` : ''}`,
        `sleep ${anchored(r.sleeps)}`,
        `gazette ${r.gazette?.anchored ? clr.green('✓') : '—'}`,
        ...(memory ? [clr.yellow(memory)] : []),
    ].join(clr.dim(' · '));
}

function snippet(text: string, max = 220): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function detailLines(r: TickResult): string[] {
    const lines: string[] = [];
    const top = r.drama?.top?.slice(0, 6) ?? [];
    if (top.length > 0) {
        lines.push(
            `[detail] drama top: ${top
                .map((t) => `${t.name ?? t.characterId?.slice(0, 8) ?? '—'}「${t.statement ?? '—'}」`)
                .join(' / ')}`,
        );
    }
    const socials = (r.socials ?? []).filter((s) => s.ok && s.kind !== 'idle').slice(0, 4);
    if (socials.length > 0) {
        lines.push(
            `[detail] social: ${socials
                .map((s) => `${s.name ?? '—'} ${s.kind}${s.targetName ? `→${s.targetName}` : ''}${s.line ? `：「${s.line}」` : s.observation ? `：${s.observation}` : ''}`)
                .join(' / ')}`,
        );
    }
    return lines;
}

function resolveControlUrl(): string {
    const explicit = process.env.RUNNER_CONTROL_URL?.trim();
    if (explicit) return explicit;
    const relayer = process.env.MEMWAL_SERVER_URL?.trim();
    return relayer ? `${relayer.replace(/\/$/, '')}/control` : '';
}

async function readRunnerPaused(controlUrl: string, secret?: string): Promise<{
    paused: boolean;
    warning?: string;
}> {
    try {
        const res = await fetch(controlUrl, {
            headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            return { paused: false, warning: `control ${res.status} ${res.statusText}` };
        }
        const body = (await res.json()) as { paused?: unknown };
        return { paused: body.paused === true };
    } catch (err) {
        return {
            paused: false,
            warning: err instanceof Error ? err.message : String(err),
        };
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const { intervalMs, maxTicks, input, jsonOut, showrunnerEvery } = opts;
    // mutable：首拍回應自述 mirror 時，當場升級為時辰邊界排程。
    let mirror = opts.mirror;
    const base = process.env.WORLD_LOOP_URL ?? 'http://localhost:3000';
    const secret = process.env.TICK_LOOP_SECRET;
    const controlUrl = resolveControlUrl();
    const controlSecret = process.env.RUNNER_CONTROL_SECRET ?? process.env.RELAYER_SECRET;
    const cleanBase = base.replace(/\/$/, '');
    const url = cleanBase.endsWith('/api/tick') ? cleanBase : `${cleanBase}/api/tick`;
    const showrunnerUrl = cleanBase.endsWith('/api/tick')
        ? cleanBase.replace(/\/api\/tick$/, '/api/showrunner')
        : `${cleanBase}/api/showrunner`;
    const startedAt = new Date().toISOString();

    console.log(clr.dim('──────────────────────────────────────────────────────'));
    console.log(`   ${clr.bold(clr.cyan('ENDLESS STORY'))} ${clr.dim('· world-loop')}`);
    console.log(clr.dim('   autonomous narrative engine — the saga lives, one tick at a time'));
    console.log(clr.dim('──────────────────────────────────────────────────────'));
    if (mirror) {
        // 冷啟動先為「已經在走的這個時辰」補打一拍，再進入邊界排程；絕不補歷史積壓。
        const now = storyNow(Date.now(), mirror);
        console.log(
            `${clr.dim('[world-loop]')} driving ${url} ${clr.bold('鏡像時間')}${clr.dim('（一日六拍，打在時辰邊界）')}` +
                (maxTicks ? ` ${clr.dim(`(max ${maxTicks} ticks)`)}` : clr.dim(' (forever — Ctrl-C to stop)')),
        );
        console.log(
            `${clr.dim('[world-loop]')} 此刻 ${clr.bold(formatStoryDate(now.date))} ${clr.bold(hhmm(now.hour, now.minute))} ` +
                clr.dim(`（${now.partOfDay} · ${now.shichen}）—— 先為當前時辰補打一拍`),
        );
    } else {
        console.log(
            `${clr.dim('[world-loop]')} driving ${url} every ${clr.bold(`${intervalMs / 1000}s`)}` +
                (maxTicks ? ` ${clr.dim(`(max ${maxTicks} ticks)`)}` : clr.dim(' (forever — Ctrl-C to stop)')),
        );
    }
    if (Object.keys(input).length) console.log(`[world-loop] phase overrides:`, input);
    if (controlUrl) console.log(`[world-loop] control ${controlUrl}`);
    if (showrunnerEvery > 0) {
        console.log(`[world-loop] showrunner heartbeat every ${showrunnerEvery} ticks → ${showrunnerUrl}`);
    }

    let n = 0;
    let failures = 0;
    const records: TickRecord[] = [];
    let stopping = false;
    process.on('SIGINT', () => {
        console.log('\n[world-loop] stopping after current tick…');
        stopping = true;
    });

    for (;;) {
        n += 1;
        const t0 = Date.now();
        if (controlUrl) {
            const control = await readRunnerPaused(controlUrl, controlSecret);
            if (control.warning) {
                console.warn(`[tick ${n}] control warning: ${control.warning}; continuing`);
            }
            if (control.paused) {
                const seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
                records.push({ tick: n, seconds, ok: true, skipped: true });
                console.log(`\n${clr.cyan(`[tick ${n}]`)} ${clr.yellow('⏸ paused by runner control')} ${clr.dim(`(${seconds}s)`)}`);
                if (stopping || (maxTicks && n >= maxTicks)) break;
                await sleepToNextBeat(intervalMs, mirror, () => stopping);
                if (stopping) break;
                continue;
            }
        }
        console.log(`\n${clr.cyan(`[tick ${n}]`)} ▶ ${clr.dim('start — ~tens of seconds to minutes; step-by-step detail in the server terminal')}`);
        // Heartbeat so this terminal isn't silent during the long tick. The
        // step-by-step detail prints in the `next dev` terminal (server side).
        const heartbeat = setInterval(() => {
            process.stdout.write(`${clr.dim(`   …running ${((Date.now() - t0) / 1000).toFixed(0)}s`)}\r`);
        }, 3000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
                },
                body: JSON.stringify(input),
                signal: AbortSignal.timeout(TICK_FETCH_TIMEOUT_MS),
                // undici's default headersTimeout (300s) fires independently of
                // the signal; the devnet stress run showed a 301s tick marked
                // "failed" here while the server finished it fine.
                dispatcher: tickDispatcher,
            } as RequestInit);
            const raw = await res.text();
            let json: TickResult | null = null;
            if (raw.trim()) {
                try {
                    json = JSON.parse(raw) as TickResult;
                } catch {
                    /* handled below as non-JSON */
                }
            }
            clearInterval(heartbeat);
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            const seconds = Number(secs);
            if (!res.ok) {
                failures += 1;
                records.push({
                    tick: n,
                    seconds,
                    ok: false,
                    status: res.status,
                    statusText: res.statusText,
                    error: `HTTP ${res.status} ${res.statusText}`,
                    responseSnippet: raw ? snippet(raw, 1000) : undefined,
                });
                console.warn(
                    `[tick ${n}] request failed: HTTP ${res.status} ${res.statusText}` +
                        (raw ? ` — ${snippet(raw)}` : ''),
                );
            } else if (!json) {
                failures += 1;
                records.push({
                    tick: n,
                    seconds,
                    ok: false,
                    status: res.status,
                    statusText: res.statusText,
                    error: 'non-JSON response',
                    responseSnippet: raw ? snippet(raw, 1000) : undefined,
                });
                console.warn(`[tick ${n}] request failed: non-JSON response${raw ? ` — ${snippet(raw)}` : ''}`);
            } else {
                if (json.ok === false) failures += 1;
                records.push({
                    tick: n,
                    seconds,
                    ok: json.ok !== false,
                    status: res.status,
                    statusText: res.statusText,
                    result: json,
                    error: json.ok === false ? json.error ?? 'tick returned ok:false' : undefined,
                });
                console.log(`${clr.cyan(`[tick ${n}]`)} ${json.ok === false ? clr.red('✗') : clr.green('✓')} ${summarize(json)} ${clr.dim(`(${secs}s)`)}`);
                for (const line of detailLines(json)) console.log(line);
                // 世界自述曆法：tick 回應說 mirror 而排程器還在 legacy interval，
                // 當場改採時辰邊界——毋須任何人記得在 loop 環境設 ES_TIME_MODE。
                if (!mirror && json.worldTime?.mode === 'mirror') {
                    mirror = resolveWorldClockConfig({ ...process.env, ES_TIME_MODE: 'mirror' }).mirror;
                    console.log(`${clr.dim('[world-loop]')} 世界走${clr.bold('鏡像時間')}——改為時辰邊界排程（一日六拍）`);
                }
            }
        } catch (err) {
            clearInterval(heartbeat);
            failures += 1;
            const message = err instanceof Error ? err.message : String(err);
            records.push({
                tick: n,
                seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
                ok: false,
                error: message,
            });
            console.warn(`[tick ${n}] request failed:`, message);
        }

        // Showrunner heartbeat — sequential after the tick (shares the admin
        // keypair via the web app; never overlaps the tick body).
        if (showrunnerEvery > 0 && n % showrunnerEvery === 0 && !stopping) {
            await runShowrunnerBeat(showrunnerUrl, secret);
        }

        if (stopping || (maxTicks && n >= maxTicks)) break;
        await sleepToNextBeat(intervalMs, mirror, () => stopping);
        if (stopping) break;
    }
    if (jsonOut) {
        const outPath = path.resolve(process.cwd(), jsonOut);
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(
            outPath,
            JSON.stringify(
                {
                    url,
                    controlUrl: controlUrl ?? null,
                    input,
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    tickCount: n,
                    failures,
                    records,
                },
                null,
                2,
            ),
            'utf8',
        );
        console.log(`[world-loop] wrote ${outPath}`);
    }
    console.log(`${clr.dim('[world-loop]')} done — ${clr.bold(`${n} ticks`)}${failures ? clr.red(`, ${failures} failed`) : ''}.`);
    // Finite runs are usually deployment smoke tests; make failures machine-visible.
    if (maxTicks && failures > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[world-loop] fatal:', err);
    process.exit(1);
});
