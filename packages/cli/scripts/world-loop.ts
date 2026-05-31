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
 * Flags:
 *   --interval=<seconds>   gap between ticks (default 60)
 *   --max=<n>              stop after n ticks (default 0 = run forever)
 *   --no-advance           don't advance the World tick each pass
 *   --no-move | --no-sleep | --no-gazette | --no-plan   skip that phase
 *
 * Env (from ../web/.env.local):
 *   WORLD_LOOP_URL    base url of the running web app (default http://localhost:3000)
 *   TICK_LOOP_SECRET  bearer token, if the /api/tick route is secured
 */

interface LoopOpts {
    intervalMs: number;
    maxTicks: number;
    input: Record<string, boolean>;
}

function parseArgs(argv: string[]): LoopOpts {
    const get = (name: string): string | undefined => {
        const hit = argv.find((a) => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : undefined;
    };
    const has = (name: string): boolean => argv.includes(`--${name}`);

    const interval = Number(get('interval') ?? 60);
    const max = Number(get('max') ?? 0);
    const input: Record<string, boolean> = {};
    if (has('no-advance')) input.advance = false;
    if (has('no-plan')) input.plan = false;
    if (has('no-move')) input.move = false;
    if (has('no-sleep')) input.sleep = false;
    if (has('no-gazette')) input.gazette = false;

    return {
        intervalMs: Math.max(5, Number.isFinite(interval) ? interval : 60) * 1000,
        maxTicks: Number.isFinite(max) && max > 0 ? max : 0,
        input,
    };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface TickResult {
    ok?: boolean;
    advanced?: boolean;
    worldTime?: { day?: number; partOfDay?: string };
    plans?: unknown[];
    moves?: { ok: boolean }[];
    acts?: { ok: boolean }[];
    resolves?: { ok: boolean }[];
    povs?: { anchored?: boolean }[];
    sleeps?: { anchored?: boolean }[];
    gazette?: { anchored?: boolean };
    error?: string;
}

function summarize(r: TickResult): string {
    if (r.error) return `error: ${r.error}`;
    const ok = (arr?: { ok: boolean }[]) => (arr ?? []).filter((x) => x.ok).length;
    const anchored = (arr?: { anchored?: boolean }[]) =>
        (arr ?? []).filter((x) => x.anchored).length;
    const day = r.worldTime?.day != null ? `第${r.worldTime.day}日·${r.worldTime.partOfDay}` : '—';
    return [
        day,
        `規劃${(r.plans ?? []).length}`,
        `移動${ok(r.moves)}`,
        `出牌${ok(r.acts)}`,
        `收尾${ok(r.resolves)}`,
        `章回${anchored(r.povs)}`,
        `睡${anchored(r.sleeps)}`,
        `公報${r.gazette?.anchored ? '✓' : '—'}`,
    ].join(' · ');
}

async function main() {
    const { intervalMs, maxTicks, input } = parseArgs(process.argv.slice(2));
    const base = process.env.WORLD_LOOP_URL ?? 'http://localhost:3000';
    const secret = process.env.TICK_LOOP_SECRET;
    const url = `${base.replace(/\/$/, '')}/api/tick`;

    console.log(
        `[world-loop] driving ${url} every ${intervalMs / 1000}s` +
            (maxTicks ? ` (max ${maxTicks} ticks)` : ' (forever — Ctrl-C to stop)'),
    );
    if (Object.keys(input).length) console.log(`[world-loop] phase overrides:`, input);

    let n = 0;
    let stopping = false;
    process.on('SIGINT', () => {
        console.log('\n[world-loop] stopping after current tick…');
        stopping = true;
    });

    for (;;) {
        n += 1;
        const t0 = Date.now();
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
            const json = (await res.json()) as TickResult;
            clearInterval(heartbeat);
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            console.log(`[tick ${n}] ✓ ${summarize(json)} (${secs}s)`);
        } catch (err) {
            clearInterval(heartbeat);
            console.warn(`[tick ${n}] request failed:`, err instanceof Error ? err.message : err);
        }

        if (stopping || (maxTicks && n >= maxTicks)) break;
        await sleep(intervalMs);
    }
    console.log(`[world-loop] done — ${n} ticks.`);
}

main().catch((err) => {
    console.error('[world-loop] fatal:', err);
    process.exit(1);
});
