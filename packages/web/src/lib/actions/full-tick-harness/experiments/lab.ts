/**
 * DRAMA-EFFECT ENGINE — CLI entry.
 *
 * Reads a preset by name, runs it, and writes a self-contained HTML report to
 * /tmp/es-lab-<name>.html.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json \
 *     <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/lab.ts <presetName> [ticksOverride]
 *
 * presetName ∈ { affection-yearning, partnership-rivalry } (see presets/index.ts).
 * Without provider keys it runs a FAKE-LLM smoke: the tick loop + evolve + render path
 * all execute end to end and the HTML is produced (relationship edges will be sparse/
 * empty under the fake LLM — the point of the smoke is that the PIPELINE is wired and
 * the SVG renders). With ZAI/POE/ANTHROPIC + OPENAI keys in packages/web/.env.local it
 * runs REAL prose and the relationship graph grows from the cast's POVs.
 *
 * IMPORTANT: importing run-experiment first installs the env + fake-client seam (it
 * imports narrative-setup transitively) before the tick loop's sdk client is touched.
 */

// run-experiment pulls in narrative-setup (env seam) before the tick loop — keep it first.
import { runExperiment } from './run-experiment';
import { renderReport } from './render-report';
import { presetByName, presetNames } from './presets/index';
import { writeFileSync } from 'node:fs';
import { hasTextProviderKey } from '../narrative-setup';

async function main(): Promise<void> {
    const name = process.argv[2];
    const ticksOverride = process.argv[3] ? Number(process.argv[3]) : undefined;

    if (!name) {
        console.error(`usage: lab.ts <presetName> [ticks]\n  presets: ${presetNames().join(', ')}`);
        process.exit(2);
    }
    const preset = presetByName(name);
    if (!preset) {
        console.error(`unknown preset "${name}". known: ${presetNames().join(', ')}`);
        process.exit(2);
    }

    const config = ticksOverride && Number.isFinite(ticksOverride)
        ? { ...preset, ticks: Math.max(1, Math.floor(ticksOverride)) }
        : preset;

    console.log(`── drama-effect lab ─────────────────────────────────────`);
    console.log(`  preset : ${config.name}`);
    console.log(`  stake  : ${config.stake.kind} → cast[${config.stake.targetIndex}] (cap ${config.stake.capacity ?? 1})`);
    console.log(`  ticks  : ${config.ticks}   settle: ${config.settle}`);
    console.log(`  LLM    : ${hasTextProviderKey() ? 'REAL (provider key present)' : 'FAKE smoke (no key → relationships sparse; pipeline only)'}`);
    console.log(``);

    const result = await runExperiment(config, {
        onTick: (tick, total, note) => {
            console.log(`  tick ${tick}/${total}  ${note}`);
        },
    });

    const html = renderReport(result);
    const out = `/tmp/es-lab-${config.name}.html`;
    writeFileSync(out, html, 'utf8');

    const edges = result.finalGraph.edges.length;
    console.log(``);
    console.log(`  final graph: ${result.finalGraph.nodes.length} nodes · ${edges} directed edge(s)`);
    console.log(`  report → ${out}`);
    if (!result.usedRealLLM) {
        console.log(`  (fake-LLM smoke: open the report to confirm the SVG + layout render;`);
        console.log(`   fill ZAI/POE/ANTHROPIC + OPENAI keys in packages/web/.env.local for real relationships.)`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[lab] fatal:', e);
        process.exit(1);
    });
