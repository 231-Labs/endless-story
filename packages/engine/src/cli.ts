#!/usr/bin/env -S npx tsx
/**
 * Engine CLI — run the narrative loop for N ticks against a preset, local-first.
 *
 *   pnpm --filter @endless-story/engine engine -- \
 *     run --preset spring-snow --ticks 8 --out ./run [--real-llm]
 *
 * Default = FakeSceneAgent + deterministic recall (no creds). `--real-llm`
 * swaps in RunnerSceneAgent (needs a text-provider key) + real OpenAI embeddings
 * (if OPENAI_API_KEY is set). A run is resumable: if `<out>/state/world.json`
 * exists it is restored and continued; otherwise a fresh world is seeded.
 */

import * as path from 'node:path';
import { FakeSceneAgent, FileArchive, LocalClock, LocalRecall } from './adapters/local/index.ts';
import { createWorldFromPreset } from './preset.ts';
import { runTick } from './tick.ts';
import { WorldState } from './world-state.ts';
import type { SceneAgentPort } from './ports.ts';

interface Args {
    preset: string;
    ticks: number;
    out: string;
    realLlm: boolean;
}

function parseArgs(argv: string[]): Args {
    const a: Args = { preset: 'spring-snow', ticks: 8, out: './engine-run', realLlm: false };
    const rest = argv[0] === 'run' ? argv.slice(1) : argv;
    for (let i = 0; i < rest.length; i++) {
        const k = rest[i];
        if (k === '--preset') a.preset = rest[++i];
        else if (k === '--ticks') a.ticks = Math.max(1, Number(rest[++i]) || 8);
        else if (k === '--out') a.out = rest[++i];
        else if (k === '--real-llm') a.realLlm = true;
    }
    return a;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const stateDir = path.join(args.out, 'state');
    const recall = new LocalRecall(path.join(args.out, 'memory'));
    const archive = new FileArchive(path.join(args.out, 'archive'));
    const clock = new LocalClock();

    let agent: SceneAgentPort;
    if (args.realLlm) {
        const { RunnerSceneAgent } = await import('./adapters/runner-scene-agent.ts');
        agent = new RunnerSceneAgent({
            sessionDir: path.join(args.out, 'sessions'),
            sessionKey: process.env.CHARACTER_SESSION_KEY,
        });
    } else {
        agent = new FakeSceneAgent();
    }

    console.log('═'.repeat(64));
    console.log(`ENDLESS STORY ENGINE · preset=${args.preset} ticks=${args.ticks} out=${args.out}`);
    console.log(`  agent      : ${args.realLlm ? 'RunnerSceneAgent (real LLM)' : 'FakeSceneAgent (deterministic)'}`);
    console.log(`  embeddings : ${process.env.OPENAI_API_KEY ? 'real OpenAI' : 'deterministic hash (mechanism only)'}`);
    console.log('═'.repeat(64));

    let world: WorldState;
    if (WorldState.exists(stateDir)) {
        world = WorldState.restore(stateDir);
        console.log(`restored world from ${stateDir} (day ${world.data.clock.day}, tick ${world.data.clock.currentTick})`);
    } else {
        const { world: w, seeded } = await createWorldFromPreset(args.preset, recall);
        world = w;
        world.snapshot(stateDir);
        console.log(`seeded fresh world · ${world.data.cast.length} cast · ${world.data.scenes.length} scenes · ${seeded} genesis memories`);
    }

    for (let i = 0; i < args.ticks; i++) {
        await runTick(world, { agent, recall, archive, clock }, { snapshotDir: stateDir });
    }

    const live = world.data.wants.filter((x) => !x.retired).length;
    console.log('═'.repeat(64));
    console.log(`DONE · day ${world.data.clock.day} · ${world.data.wants.length} wants (${live} live) · artifacts in ${path.join(args.out, 'archive')}`);
}

main().catch((e) => {
    console.error('[engine] fatal:', e);
    process.exit(1);
});
