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
 * Flags:
 *   --interval=<seconds>   gap between ticks (default 60)
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
 *   --max-concurrent-events=<n>  cap for --parallel-events (default 2)
 *      (all default off; see docs/EVENT_LIFECYCLE.md §5–§7 for what to watch)
 *
 * Env (from ../web/.env.local):
 *   WORLD_LOOP_URL    web base url or full /api/tick url (default http://localhost:3000)
 *   TICK_LOOP_SECRET  bearer token, if the /api/tick route is secured
 *   RUNNER_CONTROL_URL optional relayer /control URL; {paused:true} skips the tick
 *   MEMWAL_SERVER_URL fallback base URL for control when RUNNER_CONTROL_URL is unset
 *   RUNNER_CONTROL_SECRET optional bearer token for RUNNER_CONTROL_URL
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface LoopOpts {
    intervalMs: number;
    maxTicks: number;
    input: Record<string, boolean | number | string[]>;
    jsonOut?: string;
}

function parseArgs(argv: string[]): LoopOpts {
    const get = (name: string): string | undefined => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : undefined;
    };
    const has = (name: string): boolean => argv.includes(`--${name}`);

    const interval = Number(get('interval') ?? 60);
    const max = Number(get('max') ?? 0);
    const jsonOut = get('json-out');
    const maxCharacters = Number(get('max-characters'));
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
    if (has('event-spine')) input.eventSpine = true; // Phase 2: multi-tick BudgetEvent spine
    if (has('llm-framing')) input.llmFraming = true; // Phase 3-A: LLM names each incident
    if (has('director-resources')) input.directorResources = true; // Phase 3-B: LLM adds scarcity
    if (has('parallel-events')) input.parallelEvents = true; // Stage 1: many events at once
    if (has('attention-budget')) input.attentionBudget = true; // Stage 2: cross-event attention pull
    const maxConcurrent = Number(get('max-concurrent-events'));
    if (Number.isFinite(maxConcurrent) && maxConcurrent > 0) input.maxConcurrentEvents = Math.floor(maxConcurrent);

    return {
        intervalMs: Math.max(5, Number.isFinite(interval) ? interval : 60) * 1000,
        maxTicks: Number.isFinite(max) && max > 0 ? max : 0,
        input,
        jsonOut,
    };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface TickResult {
    ok?: boolean;
    advanced?: boolean;
    worldTime?: { day?: number; partOfDay?: string };
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
    const day = r.worldTime?.day != null ? `第${r.worldTime.day}日·${r.worldTime.partOfDay}` : '—';
    const drama = r.drama?.active
        ? `張力${r.drama.resourceCount ?? 0}${r.drama.commitmentId ? '⛓' : ''}`
        : null;
    const socialCount = (r.socials ?? []).filter((x) => x.ok && x.kind !== 'idle').length;
    const memory = r.memoryDegraded ? `記憶降級${r.memoryWarnings?.length ?? 0}` : null;
    return [
        day,
        `規劃${(r.plans ?? []).length}`,
        `移動${moved(r.moves)}`,
        ...(drama ? [drama] : []),
        `互動${socialCount}`,
        `出牌${ok(r.acts)}`,
        `收尾${ok(r.resolves)}`,
        `章回${chapters(r.povs)}${anchored(r.povs) ? `(${anchored(r.povs)}⛓)` : ''}`,
        `睡${anchored(r.sleeps)}`,
        `公報${r.gazette?.anchored ? '✓' : '—'}`,
        ...(memory ? [memory] : []),
    ].join(' · ');
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
    const { intervalMs, maxTicks, input, jsonOut } = parseArgs(process.argv.slice(2));
    const base = process.env.WORLD_LOOP_URL ?? 'http://localhost:3000';
    const secret = process.env.TICK_LOOP_SECRET;
    const controlUrl = resolveControlUrl();
    const controlSecret = process.env.RUNNER_CONTROL_SECRET ?? process.env.RELAYER_SECRET;
    const cleanBase = base.replace(/\/$/, '');
    const url = cleanBase.endsWith('/api/tick') ? cleanBase : `${cleanBase}/api/tick`;
    const startedAt = new Date().toISOString();

    console.log(
        `[world-loop] driving ${url} every ${intervalMs / 1000}s` +
            (maxTicks ? ` (max ${maxTicks} ticks)` : ' (forever — Ctrl-C to stop)'),
    );
    if (Object.keys(input).length) console.log(`[world-loop] phase overrides:`, input);
    if (controlUrl) console.log(`[world-loop] control ${controlUrl}`);

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
                console.log(`\n[tick ${n}] ⏸ paused by runner control (${seconds}s)`);
                if (stopping || (maxTicks && n >= maxTicks)) break;
                await sleep(intervalMs);
                continue;
            }
        }
        console.log(`\n[tick ${n}] ▶ 開始（一輪約數十秒~數分鐘；伺服器終端有逐步進度）`);
        // Heartbeat so this terminal isn't silent during the long tick. The
        // step-by-step detail prints in the `next dev` terminal (server side).
        const heartbeat = setInterval(() => {
            process.stdout.write(`   …執行中 ${((Date.now() - t0) / 1000).toFixed(0)}s\r`);
        }, 3000);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
                },
                body: JSON.stringify(input),
            });
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
                console.log(`[tick ${n}] ${json.ok === false ? '✗' : '✓'} ${summarize(json)} (${secs}s)`);
                for (const line of detailLines(json)) console.log(line);
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

        if (stopping || (maxTicks && n >= maxTicks)) break;
        await sleep(intervalMs);
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
    console.log(`[world-loop] done — ${n} ticks${failures ? `, ${failures} failed` : ''}.`);
    // Finite runs are usually deployment smoke tests; make failures machine-visible.
    if (maxTicks && failures > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[world-loop] fatal:', err);
    process.exit(1);
});
