#!/usr/bin/env -S npx tsx
/**
 * Engine CLI — run the narrative loop for N ticks against a preset, local-first.
 *
 *   pnpm --filter @endless-story/engine engine -- \
 *     run --preset spring-snow --ticks 8 --out ./run [--real-llm]
 *
 * Default = FakeSceneAgent + deterministic recall (no creds). `--real-llm`
 * swaps in RunnerSceneAgent (needs a text-provider key). Embeddings remain local
 * unless `--real-embeddings` is explicitly passed, even if an OpenAI key happens
 * to be present. A run is resumable: if `<out>/state/world.json`
 * exists it is restored and continued; otherwise a fresh world is seeded.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FakeSceneAgent, FileArchive, LocalClock, LocalEconomy, LocalRecall } from './adapters/local/index.ts';
import { auditSeasonEconomy } from './core/season-economy.ts';
import { applySeasonFrame, createWorldFromPreset, loadSeasonFrameFile, reconcileSeasonObjects, seedRelationshipViews } from './preset.ts';
import { seedSeasonOpening } from './season-opening.ts';
import { runTick } from './tick.ts';
import { writeTickDossiers } from './dossier-artifact.ts';
import { refreshSeasonEditorial, type AnthologyComposer } from './editorial-artifact.ts';
import { WorldState } from './world-state.ts';
import { TickFilesystemTransaction } from './tick-transaction.ts';
import type { SceneAgentPort } from './ports.ts';
import { loadLLMConfig, resolveTextProvider } from '@endless-story/llm';

interface Args {
    preset: string;
    ticks: number;
    out: string;
    season?: string;
    realLlm: boolean;
    realEmbeddings: boolean;
    /** structural relationship fallback (seeded canon views + nightly self-model). */
    relationshipFallback: boolean;
}

function parseArgs(argv: string[]): Args {
    const a: Args = { preset: 'spring-snow', ticks: 8, out: './engine-run', realLlm: false, realEmbeddings: false, relationshipFallback: false };
    const rest = argv[0] === 'run' ? argv.slice(1) : argv;
    for (let i = 0; i < rest.length; i++) {
        const k = rest[i];
        if (k === '--preset') a.preset = rest[++i];
        else if (k === '--season') a.season = rest[++i];
        else if (k === '--ticks') {
            const parsed = Number(rest[++i]);
            a.ticks = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 8;
        }
        else if (k === '--out') a.out = rest[++i];
        else if (k === '--real-llm') a.realLlm = true;
        else if (k === '--real-embeddings') a.realEmbeddings = true;
        else if (k === '--relationship-fallback') a.relationshipFallback = true;
    }
    return a;
}

function recordPostprocessFailure(outDir: string, stage: string, tick: number, error: unknown): void {
    const dir = path.join(outDir, 'postprocess-failures');
    fs.mkdirSync(dir, { recursive: true });
    const message = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(
        path.join(dir, `tick-${tick}-${stage}.json`),
        `${JSON.stringify({ stage, tick, message }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
    );
    console.error(`  ${stage} failed after world snapshot; recorded and continuing: ${message}`);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const stateDir = path.join(args.out, 'state');
    const seasonFrame = args.season ? loadSeasonFrameFile(args.season) : undefined;
    const transaction = new TickFilesystemTransaction(args.out);
    const recoveredTick = transaction.recoverInterrupted();
    if (recoveredTick != null) {
        console.log(`recovered interrupted tick ${recoveredTick}; all partial world/session/recall/archive writes rolled back`);
    }
    if (args.realEmbeddings && !process.env.OPENAI_API_KEY) {
        throw new Error('--real-embeddings requires OPENAI_API_KEY');
    }
    const recall = new LocalRecall(path.join(args.out, 'memory'), {
        embeddings: args.realEmbeddings ? 'auto' : 'deterministic',
    });
    const archive = new FileArchive(path.join(args.out, 'archive'));
    const clock = new LocalClock();
    const economy = new LocalEconomy();

    let agent: SceneAgentPort;
    let composeAnthology: AnthologyComposer | undefined;
    let provider: string | undefined;
    let model: string | undefined;
    if (args.realLlm) {
        const llmConfig = loadLLMConfig();
        provider = resolveTextProvider(llmConfig) ?? undefined;
        if (!provider) throw new Error('--real-llm requires a configured text provider');
        model = provider === 'poe'
            ? llmConfig.poeModelPrimary
            : provider === 'zai'
                ? llmConfig.zaiModelPrimary
                : llmConfig.anthropicModelPrimary;
        const { RunnerSceneAgent } = await import('./adapters/runner-scene-agent.ts');
        const { SeasonEditorAgent } = await import('@endless-story/runner/services/storyteller-chapter');
        const editor = new SeasonEditorAgent();
        agent = new RunnerSceneAgent({
            sessionDir: path.join(args.out, 'sessions'),
            sessionKey: process.env.CHARACTER_SESSION_KEY,
        });
        composeAnthology = (plan, bundles) => editor.compose(plan, bundles);
    } else {
        agent = new FakeSceneAgent();
    }

    console.log('═'.repeat(64));
    console.log(`ENDLESS STORY ENGINE · preset=${args.preset} ticks=${args.ticks} out=${args.out}`);
    if (seasonFrame) console.log(`  season     : ${seasonFrame.title} (${seasonFrame.id})`);
    console.log(`  agent      : ${args.realLlm ? 'RunnerSceneAgent (real LLM)' : 'FakeSceneAgent (deterministic)'}`);
    if (provider) console.log(`  provider   : ${provider} / ${model}`);
    console.log(`  embeddings : ${args.realEmbeddings ? 'real OpenAI (explicit opt-in)' : 'deterministic hash (local only)'}`);
    console.log('═'.repeat(64));

    fs.mkdirSync(args.out, { recursive: true });
    const manifestFile = path.join(args.out, 'run-manifest.json');
    const manifest = {
        version: 1,
        preset: args.preset,
        season: seasonFrame?.id,
        realLlm: args.realLlm,
        provider: provider ?? 'deterministic',
        model: model ?? 'fake',
        relationshipFallback: args.relationshipFallback,
    };
    if (fs.existsSync(manifestFile)) {
        const previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as typeof manifest;
        for (const key of ['preset', 'season', 'realLlm', 'provider', 'model', 'relationshipFallback'] as const) {
            // manifests predating the flag treat a missing boolean as off
            const prior = key === 'relationshipFallback' ? (previous[key] ?? false) : previous[key];
            if (prior !== manifest[key]) {
                throw new Error(`run provenance mismatch for ${key}: ${String(prior)} != ${String(manifest[key])}`);
            }
        }
    } else {
        fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    }

    let world: WorldState;
    let freshWorld = false;
    if (WorldState.exists(stateDir)) {
        world = WorldState.restore(stateDir);
        if (seasonFrame && !world.data.sagaPremise.includes(`【本季：${seasonFrame.title}】`)) {
            throw new Error(`restored world was not seeded with season ${seasonFrame.id}`);
        }
        const reconciledObjects = seasonFrame ? reconcileSeasonObjects(world, seasonFrame) : 0;
        if (reconciledObjects > 0) {
            world.snapshot(stateDir);
            console.log(`  reconciled : ${reconciledObjects} missing canonical object(s) from season frame`);
        }
        console.log(`restored world from ${stateDir} (day ${world.data.clock.day}, tick ${world.data.clock.currentTick})`);
    } else {
        const { world: w, raw, seeded } = await createWorldFromPreset(args.preset, recall);
        world = w;
        if (seasonFrame) applySeasonFrame(world, seasonFrame);
        if (args.relationshipFallback) {
            world.data.relationshipFallback = true;
            const seededViews = seedRelationshipViews(world, raw.relationship_views ?? []);
            console.log(`  relationship fallback: ON · ${seededViews} seeded canon view(s)`);
        }
        freshWorld = true;
        console.log(`seeded fresh world · ${world.data.cast.length} cast · ${world.data.scenes.length} scenes · ${seeded} genesis memories`);
    }
    if (seasonFrame) {
        fs.mkdirSync(args.out, { recursive: true });
        fs.writeFileSync(path.join(args.out, 'season-frame.json'), `${JSON.stringify(seasonFrame, null, 2)}\n`);
    }
    if (seasonFrame && freshWorld) {
        const opening = await seedSeasonOpening(world, seasonFrame, { agent, recall, archive });
        world.snapshot(stateDir);
        console.log(`  opening    : ${opening.id} delivered to ${opening.witnessIds.length} character sessions`);
    } else if (freshWorld) {
        world.snapshot(stateDir);
    }

    let activeTransaction = false;
    const rollbackOnSignal = () => {
        if (activeTransaction) transaction.rollback();
        process.exit(130);
    };
    process.once('SIGINT', rollbackOnSignal);
    process.once('SIGTERM', rollbackOnSignal);

    for (let i = 0; i < args.ticks; i++) {
        const tick = world.data.clock.currentTick;
        transaction.begin(tick);
        activeTransaction = true;
        let report: Awaited<ReturnType<typeof runTick>>;
        try {
            report = await runTick(world, { agent, recall, archive, clock, economy }, { snapshotDir: stateDir });
            transaction.commit();
            activeTransaction = false;
        } catch (error) {
            transaction.rollback();
            activeTransaction = false;
            throw error;
        }
        try {
            const dossiers = await writeTickDossiers(args.out, report, world.data.cast, args.realLlm ? agent : undefined);
            for (const dossier of dossiers) console.log(`  dossier: ${dossier.eventId} → ${dossier.filename}`);
        } catch (error) {
            recordPostprocessFailure(args.out, 'dossier', report.tick, error);
        }
        try {
            const audit = auditSeasonEconomy(world);
            for (const line of audit) console.error(`  [economy-audit] ${line}`);
            const editorial = await refreshSeasonEditorial(args.out, composeAnthology, audit);
            if (editorial.selectionChanged) {
                console.log(`  season editor: ${editorial.plan.reason}`);
            }
            if (editorial.anthologyWritten) console.log('  anthology: editorial/season-anthology.md');
        } catch (error) {
            recordPostprocessFailure(args.out, 'season-editorial', report.tick, error);
        }
    }

    // A zero-tick invocation is a valid pure post-process pass. It also lets a
    // completed run adopt newer deterministic editorial signals without ever
    // replaying character choices or mutating world canon.
    try {
        const editorial = await refreshSeasonEditorial(args.out, composeAnthology, auditSeasonEconomy(world));
        if (editorial.selectionChanged) console.log(`  season editor: ${editorial.plan.reason}`);
        if (editorial.anthologyWritten) console.log('  anthology: editorial/season-anthology.md');
    } catch (error) {
        recordPostprocessFailure(args.out, 'season-editorial', world.data.clock.currentTick, error);
    }

    const live = world.data.wants.filter((x) => !x.retired).length;
    console.log('═'.repeat(64));
    console.log(`DONE · day ${world.data.clock.day} · ${world.data.wants.length} wants (${live} live) · artifacts in ${path.join(args.out, 'archive')}`);
}

main().catch((e) => {
    console.error('[engine] fatal:', e);
    process.exit(1);
});
