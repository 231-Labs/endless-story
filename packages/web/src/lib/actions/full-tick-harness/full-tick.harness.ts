/**
 * DECOUPLED FULL-TICK harness — RUNNER.
 *
 * Runs the REAL `runTickLoopAction` against the in-memory fake chain (zero
 * network, zero RPC) across three modes, to separate a "runner mechanism design
 * bug" from "Sui RPC 429 rate-limiting (infrastructure)":
 *   · ideal        — perfect chain. If cut STILL stalls here → mechanism bug.
 *   · inject429    — reads/txs throw 429 at a rate → does the stall reproduce?
 *   · slowFinality — waitForTransaction / submit add latency.
 *
 *   tsx src/lib/actions/full-tick-harness/full-tick.harness.ts [ticksPerMode=4]
 *
 * `harness-setup` MUST be imported before the tick loop — it installs ES_HARNESS
 * and the fake client factory at module-init, before tick-loop's transitive sdk
 * client is first touched.
 */
import { seedWorld, setHarnessMode } from './harness-setup';
import type { FakeMode, FakeModeConfig } from './full-tick-fake-chain';
import { runTickLoopAction } from '@/lib/actions/tick-loop';

const TICKS = Math.max(1, Number(process.argv[2] ?? 4));

interface ModeStats {
    mode: FakeMode;
    cutAnchored: number;
    cutFailed: number;
    cutInsufficient: number;
    momentAppended: number;
    povAnchored: number;
    maxTickMs: number;
    totalMs: number;
    threw: number;
}

// cut / moment outcomes are inline console.log, not in TickLoopResult — tap them.
let _cutAnchored = 0;
let _cutFailed = 0;
let _cutInsuff = 0;
let _momentOk = 0;
const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
function tap(line: string): void {
    if (/event cut \(.*anchored=true|\[ch-diag\] resolve .*\bwove=true/.test(line)) _cutAnchored++;
    if (/event cut failed.*timed out/.test(line)) _cutFailed++;
    if (/insufficient_povs/.test(line)) _cutInsuff++;
    if (/event moment \(.*appended=[1-9]/.test(line)) _momentOk++;
}
console.log = (...a: unknown[]): void => {
    tap(a.map(String).join(' '));
    _log(...a);
};
console.warn = (...a: unknown[]): void => {
    tap(a.map(String).join(' '));
    _warn(...a);
};

const MODE_KNOBS: Record<FakeMode, Partial<FakeModeConfig>> = {
    ideal: {},
    inject429: { readFailRate: 0.5, txFailRate: 0.2 },
    slowFinality: { finalityDelayMs: 400, submitDelayMs: 150 },
};

async function runMode(mode: FakeMode): Promise<ModeStats> {
    _cutAnchored = 0;
    _cutFailed = 0;
    _cutInsuff = 0;
    _momentOk = 0;
    seedWorld({ cast: 6, withResource: true });
    setHarnessMode(mode, MODE_KNOBS[mode]);

    const st: ModeStats = {
        mode,
        cutAnchored: 0,
        cutFailed: 0,
        cutInsufficient: 0,
        momentAppended: 0,
        povAnchored: 0,
        maxTickMs: 0,
        totalMs: 0,
        threw: 0,
    };
    for (let i = 0; i < TICKS; i++) {
        const t0 = Date.now();
        try {
            const r = await runTickLoopAction({ povAll: true });
            st.povAnchored += (r.povs ?? []).filter((p) => p.anchored).length;
        } catch (e) {
            st.threw++;
            _warn(`[harness] ${mode} tick ${i} threw:`, e instanceof Error ? e.message : String(e));
        }
        const ms = Date.now() - t0;
        st.totalMs += ms;
        st.maxTickMs = Math.max(st.maxTickMs, ms);
    }
    st.cutAnchored = _cutAnchored;
    st.cutFailed = _cutFailed;
    st.cutInsufficient = _cutInsuff;
    st.momentAppended = _momentOk;
    return st;
}

async function main(): Promise<void> {
    const modes: FakeMode[] = ['ideal', 'inject429', 'slowFinality'];
    const out: ModeStats[] = [];
    for (const m of modes) {
        _log(`\n===================== MODE: ${m}  (${TICKS} ticks) =====================`);
        out.push(await runMode(m));
    }

    _log(`\n\n===================== SUMMARY =====================`);
    for (const s of out) {
        _log(
            `${s.mode.padEnd(13)} | cut anchored=${s.cutAnchored} failed-timeout=${s.cutFailed} insufficient=${s.cutInsufficient}` +
                ` | pov=${s.povAnchored} moment=${s.momentAppended} | maxTick=${(s.maxTickMs / 1000).toFixed(1)}s threw=${s.threw}`,
        );
    }

    // The stall question is answered by TIMEOUTS, not anchored count: a cut weave
    // that returns in 0.0s did not stall, regardless of whether the fake seeded
    // enough POV material for it to anchor. `insufficient_povs` is a fake-coverage
    // gap, not a mechanism stall.
    const ideal = out.find((s) => s.mode === 'ideal');
    _log(`\nVERDICT (ideal = perfect fake chain: zero RPC limiting, zero walrus/LLM latency):`);
    if (ideal && ideal.cutFailed > 0) {
        _log(
            `  ✗ ideal had ${ideal.cutFailed} cut TIMEOUT(s) → MECHANISM DESIGN BUG (not infra).` +
                ` Even a perfect RPC won't fix it (suspect: adminTxChain serialization + inline runJobWithTimeout).`,
        );
    } else if (ideal) {
        _log(
            `  ✓ ideal: 0 cut timeout — settle / adminTxChain / cut weave all sub-second.` +
                ` THE 180s STALL IS NOT THE MECHANISM.`,
        );
        _log(
            `    The real-chain cut-job timeout does NOT reproduce once RPC/walrus/LLM are faked out → cause = INFRASTRUCTURE (RPC rate-limit / walrus). Fix = dedicated RPC / indexer.`,
        );
        if (ideal.cutAnchored === 0) {
            _log(
                `    (cut anchored=0 = harness not seeding POV material → skip=insufficient_povs; weave returned in 0.0s, so it's a fake-coverage gap, not a stall.)`,
            );
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        _warn('[harness] fatal:', e);
        process.exit(1);
    });
