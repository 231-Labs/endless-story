/**
 * Revocation-gap pilot harness.
 *
 *   # Fake (zero LLM) — pipeline validation
 *   node --import tsx internal/research/revocation-gap/run.ts
 *
 *   # Real LLM batch: 10 seeds × 2 conditions
 *   node --import tsx internal/research/revocation-gap/run.ts --real-llm
 *
 *   # Optional stretch: record illicit presence without changing enforcement
 *   node --import tsx internal/research/revocation-gap/run.ts --revocation-monitor
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeSceneAgent } from '../../../packages/engine/src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../../../packages/engine/src/adapters/local/clock.ts';
import { LocalEconomy } from '../../../packages/engine/src/adapters/local/local-economy.ts';
import { LocalRecall } from '../../../packages/engine/src/adapters/local/local-recall.ts';
import { auditSeasonEconomy } from '../../../packages/engine/src/core/season-economy.ts';
import { runTick } from '../../../packages/engine/src/tick.ts';
import type { ArchivePort, SceneAgentPort } from '../../../packages/engine/src/ports.ts';
import type { WorldState } from '../../../packages/engine/src/world-state.ts';

import { cloneCheckpoint, ensureDir, restoreCheckpoint } from './checkpoint.ts';
import {
  createInstrumentState,
  instrumentAgent,
  observeWorldTick,
  patchGrantAccess,
  resetTickFlags,
} from './instrument.ts';
import {
  formatCell,
  meanStd,
  summarizeTicks,
  type ConditionMetrics,
  type TickObservation,
} from './metrics.ts';
import { DEFAULT_SEEDS, MEASURE_TICKS, WARMUP_TICKS, type ConditionId } from './ids.ts';
import { applyCondition } from './revoke.ts';
import { buildScenarioWorld } from './scenario.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const nullArchive: ArchivePort = { commit: async () => {} };

interface CliArgs {
  realLlm: boolean;
  monitor: boolean;
  seeds: number[];
  warmup: number;
  measure: number;
  out: string;
  conditions: ConditionId[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    realLlm: false,
    monitor: false,
    seeds: [...DEFAULT_SEEDS],
    warmup: WARMUP_TICKS,
    measure: MEASURE_TICKS,
    out: path.join(HERE, 'runs'),
    conditions: ['C0', 'C7'],
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--real-llm') args.realLlm = true;
    else if (k === '--revocation-monitor') args.monitor = true;
    else if (k === '--warmup') args.warmup = Math.max(0, Number(argv[++i]) || WARMUP_TICKS);
    else if (k === '--measure') args.measure = Math.max(0, Number(argv[++i]) || MEASURE_TICKS);
    else if (k === '--out') args.out = path.resolve(argv[++i]);
    else if (k === '--seeds') {
      const raw = argv[++i] ?? '';
      args.seeds = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    } else if (k === '--conditions') {
      const raw = (argv[++i] ?? 'C0,C7').split(',').map((s) => s.trim()) as ConditionId[];
      args.conditions = raw.filter((c) => c === 'C0' || c === 'C7');
    } else if (k === '--fake') args.realLlm = false;
  }
  if (!args.seeds.length) args.seeds = [1];
  return args;
}

async function makeAgent(realLlm: boolean, sessionDir: string): Promise<{
  agent: SceneAgentPort;
  provider: string;
  model: string;
}> {
  if (!realLlm) {
    return { agent: new FakeSceneAgent(), provider: 'deterministic', model: 'FakeSceneAgent' };
  }
  const { loadLLMConfig, resolveTextProvider } = await import(
    '../../../packages/llm/src/config.ts'
  );
  const llmConfig = loadLLMConfig();
  const provider = resolveTextProvider(llmConfig);
  if (!provider) {
    throw new Error('--real-llm requires a configured text provider (POE/OpenAI/Anthropic/ZAI)');
  }
  const model =
    provider === 'poe'
      ? llmConfig.poeModelPrimary
      : provider === 'zai'
        ? llmConfig.zaiModelPrimary
        : llmConfig.anthropicModelPrimary;
  const { RunnerSceneAgent } = await import(
    '../../../packages/engine/src/adapters/runner-scene-agent.ts'
  );
  return {
    agent: new RunnerSceneAgent({ sessionDir }),
    provider,
    model: model ?? 'unknown',
  };
}

async function runTicks(
  world: WorldState,
  recall: LocalRecall,
  agent: SceneAgentPort,
  n: number,
  opts: {
    snapshotDir: string;
    logLines: string[];
    instrument?: boolean;
    monitor?: boolean;
  },
): Promise<TickObservation[]> {
  const clock = new LocalClock();
  const economy = new LocalEconomy();
  const observations: TickObservation[] = [];
  const state = createInstrumentState();
  const liveAgent = opts.instrument ? instrumentAgent(agent, state) : agent;
  const unpatch = opts.instrument ? patchGrantAccess(world, state) : () => {};

  try {
    for (let i = 0; i < n; i++) {
      resetTickFlags(state);
      const report = await runTick(
        world,
        { agent: liveAgent, recall, archive: nullArchive, clock, economy },
        {
          snapshotDir: opts.snapshotDir,
          log: (line) => opts.logLines.push(line),
        },
      );
      const leaks = auditSeasonEconomy(world);
      if (leaks.length) {
        throw new Error(`[revocation-gap] economy leak at tick ${report.tick}: ${leaks.join('; ')}`);
      }
      if (opts.instrument) {
        observations.push(observeWorldTick(world, state, i, opts.monitor === true));
      }
    }
  } finally {
    unpatch();
  }
  return observations;
}

interface SeedRunResult {
  seed: number;
  warmupCheckpoint: string;
  conditions: Record<string, ConditionMetrics & { revoke: unknown; manifest: string }>;
}

async function runSeed(seed: number, args: CliArgs, batchManifest: Record<string, unknown>): Promise<SeedRunResult> {
  const seedDir = path.join(args.out, `seed-${seed}`);
  const warmupDir = path.join(seedDir, 'warmup');
  ensureDir(warmupDir);

  // Shared warm-up: one history for both conditions.
  const world = buildScenarioWorld();
  // Pin a deterministic wantSeq / saga so Fake stays stable across seeds;
  // seed number is recorded in the manifest for LLM stochastic runs.
  world.data.sagaId = `revocation-gap-pilot-s${seed}`;
  const recall = new LocalRecall(warmupDir, { embeddings: 'deterministic' });
  const { agent, provider, model } = await makeAgent(args.realLlm, path.join(warmupDir, 'sessions'));
  const warmupLog: string[] = [];

  await runTicks(world, recall, agent, args.warmup, {
    snapshotDir: warmupDir,
    logLines: warmupLog,
  });
  world.snapshot(warmupDir);
  fs.writeFileSync(path.join(warmupDir, 'warmup-log.txt'), warmupLog.join('\n'));

  const warmupManifest = {
    ...batchManifest,
    seed,
    phase: 'warmup',
    ticks: args.warmup,
    provider,
    model,
    checkpointFiles: ['world.json', 'recall.json'],
  };
  fs.writeFileSync(path.join(warmupDir, 'manifest.json'), JSON.stringify(warmupManifest, null, 2));

  const conditions: SeedRunResult['conditions'] = {};

  for (const condition of args.conditions) {
    const condDir = path.join(seedDir, condition);
    ensureDir(condDir);
    cloneCheckpoint(warmupDir, condDir);

    const restored = restoreCheckpoint(condDir, 'deterministic');
    const { agent: condAgent, provider: p2, model: m2 } = await makeAgent(
      args.realLlm,
      path.join(condDir, 'sessions'),
    );

    // Assert shared warm-up: home + key + lease present before condition ops.
    if (restored.world.data.homeByChar.T !== 'S') {
      throw new Error(`[revocation-gap] seed ${seed}: warm-up checkpoint lost homeByChar[T]`);
    }
    if (!restored.world.canEnter('T', 'S')) {
      throw new Error(`[revocation-gap] seed ${seed}: warm-up checkpoint must admit T before revoke`);
    }

    const revoke = await applyCondition(restored.world, condition, restored.recall);
    restored.world.snapshot(condDir);

    const measureLog: string[] = [];
    const observations = await runTicks(restored.world, restored.recall, condAgent, args.measure, {
      snapshotDir: condDir,
      logLines: measureLog,
      instrument: true,
      monitor: args.monitor,
    });

    const metrics = summarizeTicks(condition, seed, observations);
    const manifestPath = path.join(condDir, 'manifest.json');
    const condManifest = {
      ...batchManifest,
      seed,
      condition,
      phase: 'measure',
      ticks: args.measure,
      provider: p2,
      model: m2,
      revoke,
      metrics,
      revocationMonitor: args.monitor,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(condManifest, null, 2));
    fs.writeFileSync(path.join(condDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    fs.writeFileSync(path.join(condDir, 'observations.json'), JSON.stringify(observations, null, 2));
    fs.writeFileSync(path.join(condDir, 'measure-log.txt'), measureLog.join('\n'));

    conditions[condition] = { ...metrics, revoke, manifest: manifestPath };
  }

  return { seed, warmupCheckpoint: warmupDir, conditions };
}

function printReport(results: SeedRunResult[], args: CliArgs): string {
  const lines: string[] = [];
  lines.push('# Revocation-gap pilot — run summary');
  lines.push('');
  lines.push(`mode: ${args.realLlm ? 'real-llm' : 'fake'} · warmup=${args.warmup} · measure=${args.measure} · seeds=${args.seeds.join(',')}`);
  lines.push('');

  const byCond = (cond: ConditionId) =>
    results.map((r) => r.conditions[cond]).filter(Boolean) as ConditionMetrics[];

  lines.push('| condition | attemptRate | thirdPartyAdmission (count) | selfReferenceRate | homeByCharRate | wantHomeRate | timeToFirstEvent |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const cond of args.conditions) {
    const rows = byCond(cond);
    const attempt = meanStd(rows.map((r) => r.attemptRate));
    const adm = meanStd(rows.map((r) => r.thirdPartyAdmission));
    const self = meanStd(rows.map((r) => r.selfReferenceRate));
    const home = meanStd(rows.map((r) => r.homeByCharRate));
    const want = meanStd(rows.map((r) => r.wantHomeRate));
    const ttfVals = rows.map((r) => r.timeToFirstEvent).filter((x): x is number => x != null);
    const ttf = meanStd(ttfVals);
    const never = rows.filter((r) => r.timeToFirstEvent == null).length;
    lines.push(
      `| ${cond} | ${formatCell(attempt, true)} | ${formatCell(adm)} | ${formatCell(self, true)} | ${formatCell(home, true)} | ${formatCell(want, true)} | ${ttf.n ? formatCell(ttf) : '∅'} (never=${never}/${rows.length}) |`,
    );
  }
  lines.push('');
  lines.push('## Per-seed appendix');
  lines.push('');
  lines.push('| seed | cond | attemptRate | thirdPartyAdmission | selfReferenceRate | homeByCharRate | wantHomeRate | timeToFirstEvent |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    for (const cond of args.conditions) {
      const m = r.conditions[cond];
      if (!m) continue;
      lines.push(
        `| ${r.seed} | ${cond} | ${m.attemptRate.toFixed(3)} | ${m.thirdPartyAdmission} | ${m.selfReferenceRate.toFixed(3)} | ${m.homeByCharRate.toFixed(3)} | ${m.wantHomeRate.toFixed(3)} | ${m.timeToFirstEvent ?? '∅'} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(args.out);

  const batchManifest = {
    version: 1,
    experiment: 'revocation-gap-pilot',
    preset: 'revocation-gap-minimal',
    strictStructured: true,
    bFlags: false,
    cFlags: false,
    warmupTicks: args.warmup,
    measureTicks: args.measure,
    realLlm: args.realLlm,
    revocationMonitor: args.monitor,
    createdAt: new Date().toISOString(),
    node: process.version,
  };
  fs.writeFileSync(path.join(args.out, 'batch-manifest.json'), JSON.stringify(batchManifest, null, 2));

  console.log('═'.repeat(64));
  console.log(`REVOCATION-GAP PILOT · ${args.realLlm ? 'real-llm' : 'fake'} · seeds=${args.seeds.length}`);
  console.log(`  warmup=${args.warmup} measure=${args.measure} out=${args.out}`);
  console.log('═'.repeat(64));

  const results: SeedRunResult[] = [];
  for (const seed of args.seeds) {
    console.log(`\n── seed ${seed} ──`);
    const r = await runSeed(seed, args, batchManifest);
    results.push(r);
    for (const cond of args.conditions) {
      const m = r.conditions[cond];
      console.log(
        `  ${cond}: attempt=${m.attemptRate.toFixed(3)} admission=${m.thirdPartyAdmission} selfRef=${m.selfReferenceRate.toFixed(3)} ttf=${m.timeToFirstEvent ?? '∅'}`,
      );
    }
  }

  const summary = printReport(results, args);
  fs.writeFileSync(path.join(args.out, 'SUMMARY.md'), summary);
  fs.writeFileSync(path.join(args.out, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n' + summary);
  console.log(`wrote ${path.join(args.out, 'SUMMARY.md')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
