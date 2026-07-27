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
 *
 * 宏觀節奏 flags + subcommands (see README 「宏觀節奏」):
 *
 *   run  --deck spring-snow          attach the event deck (外力層)
 *        --track 柳安春,方競西          only these characters get POV prose + 日記
 *   patron --out ./run --channel flower --amount 2 --target 連翹
 *                                    觀眾注資: money enters through a world channel
 *   pov-backfill --out ./run --character 連翹 [--day 2]
 *                                    write an untracked character's POV after the fact
 *   deck-check --deck spring-snow    validate a deck without running anything
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FakeSceneAgent, FileArchive, LocalClock, LocalEconomy, LocalRecall } from './adapters/local/index.ts';
import { auditSeasonEconomy } from './core/season-economy.ts';
import { injectPatronage, type PatronageChannel } from './core/patronage.ts';
import { applySeasonFrame, attachEventDeck, createWorldFromPreset, loadEventDeck, loadSeasonFrame, reconcileSeasonObjects, seedRelationshipViews } from './preset.ts';
import { seedAcquaintance } from './core/acquaintance.ts';
import { activeDeckId, activePresetId, activeSeasonId, defaultLabRunDir } from './workspace-paths.ts';
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
    /** Research arm: structured fields are the sole mechanism authority. */
    strictStructured: boolean;
    /** 事件牌組 id (外力層). Absent ⇒ no deck, no director, no forced deadlines. */
    deck?: string;
    /** 追蹤中的角色 (names or ids). Empty ⇒ everybody, as before the switch. */
    track: string[];
}

function parseArgs(argv: string[]): Args {
    const a: Args = {
        preset: activePresetId() ?? 'spring-snow',
        ticks: 8,
        out: defaultLabRunDir(),
        season: activeSeasonId(),
        realLlm: false,
        realEmbeddings: false,
        relationshipFallback: false,
        strictStructured: false,
        deck: activeDeckId(),
        track: [],
    };
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
        else if (k === '--strict-structured') a.strictStructured = true;
        else if (k === '--deck') a.deck = rest[++i];
        else if (k === '--no-deck') a.deck = undefined;
        else if (k === '--track') a.track = splitList(rest[++i]);
    }
    return a;
}

/** `--track 柳安春,方競西` / `--track 柳安春 --track 方競西` both work. */
function splitList(raw: string | undefined): string[] {
    return (raw ?? '')
        .split(/[,，\s]+/)
        .map((part) => part.trim())
        .filter(Boolean);
}

/** Resolve authored NAMES or ids to cast ids, refusing loudly on a typo — a
 *  silently-dropped tracking name would quietly stop producing that character's
 *  POV and diary, and the operator would only find out from the bill. */
function resolveCastIds(world: WorldState, tokens: string[], label: string): string[] {
    const ids: string[] = [];
    for (const token of tokens) {
        const id = world.castById(token) ? token : world.idByName(token);
        if (!id) throw new Error(`${label}: 班中無此人「${token}」（可用：${world.data.cast.map((m) => m.name).join('、')}）`);
        if (!ids.includes(id)) ids.push(id);
    }
    return ids;
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
    const seasonFrame = args.season ? loadSeasonFrame(args.season) : undefined;
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
    if (args.strictStructured) console.log('  structured : STRICT (prose is rendering only)');
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
        ...(args.strictStructured ? { strictStructured: true as const } : {}),
        ...(args.deck ? { deck: args.deck } : {}),
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
        if ((previous.strictStructured ?? false) !== args.strictStructured) {
            throw new Error(
                `run provenance mismatch for strictStructured: ${String(previous.strictStructured ?? false)} != ${String(args.strictStructured)}`,
            );
        }
    } else {
        fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    }

    // 事件牌組 — validated at LOAD time (a malformed card must never be discovered
    // halfway through a run). Absent ⇒ the deck phase is inert.
    const deck = args.deck ? loadEventDeck(args.deck) : undefined;
    if (deck) console.log(`  deck       : ${deck.title ?? deck.id} (${deck.cards.length} 張牌)`);

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
        const { world: w, raw, seeded } = await createWorldFromPreset(
            args.preset,
            recall,
            { strictStructured: args.strictStructured },
        );
        world = w;
        if (seasonFrame) applySeasonFrame(world, seasonFrame);
        if (args.relationshipFallback) {
            world.data.relationshipFallback = true;
            const seededViews = seedRelationshipViews(world, raw.relationship_views ?? []);
            console.log(`  relationship fallback: ON · ${seededViews} seeded canon view(s)`);
        }
        // 相識分寸: a season may declare subjective naming; seed the acquaintance map
        // AFTER cast/edges/views so co-workers/edge-holders start named. Post-build,
        // mirroring the relationship-fallback flag above.
        if (seasonFrame?.subjectiveNaming) {
            world.data.subjectiveNaming = true;
            seedAcquaintance(world);
            console.log('  subjective naming: ON · seeded 相識分寸 acquaintance map');
        }
        freshWorld = true;
        console.log(`seeded fresh world · ${world.data.cast.length} cast · ${world.data.scenes.length} scenes · ${seeded} genesis memories`);
    }
    if (seasonFrame) {
        fs.mkdirSync(args.out, { recursive: true });
        fs.writeFileSync(path.join(args.out, 'season-frame.json'), `${JSON.stringify(seasonFrame, null, 2)}\n`);
    }
    if (deck) {
        const armed = attachEventDeck(world, deck);
        if (armed) console.log(`  secrets    : ${armed} 樁上了膛（持有者／覬覦者／洩漏條件）`);
    }
    // 追蹤開關 — resolved against the LIVE cast so a typo fails loudly here rather
    // than silently halving the run's POV output. An empty list keeps the old
    // behaviour (everybody tracked).
    if (args.track.length) {
        world.data.trackedCharacterIds = resolveCastIds(world, args.track, '--track');
        console.log(`  tracked    : ${world.data.trackedCharacterIds.map((id) => world.nameById(id)).join('、')}（POV 散文與日記只為這些人生成）`);
    } else if (world.data.trackedCharacterIds?.length) {
        console.log(`  tracked    : ${world.data.trackedCharacterIds.map((id) => world.nameById(id)).join('、')}（沿用此卷既有設定）`);
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
            report = await runTick(world, { agent, recall, archive, clock, economy, ...(deck ? { deck } : {}) }, { snapshotDir: stateDir });
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

// ── 觀眾注資 (patronage) ──────────────────────────────────────────────────────
//
// The operator-facing half of the money loop. An operator never edits a balance:
// they fire a CHANNEL, and the world gets a real ledger row plus a percept the
// cast will perceive next tick. 誰的花多誰的花少 is written into world state, which
// is where the deck (and the jealousy it stirs) reads it from.
async function patronCommand(argv: string[]): Promise<void> {
    let out = defaultLabRunDir();
    let channel: PatronageChannel = 'ticket';
    let amountYuan = 0;
    let target: string | undefined;
    let patronName: string | undefined;
    let note: string | undefined;
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--out') out = argv[++i];
        else if (k === '--channel') channel = argv[++i] as PatronageChannel;
        else if (k === '--amount') amountYuan = Number(argv[++i]);
        else if (k === '--target') target = argv[++i];
        else if (k === '--patron') patronName = argv[++i];
        else if (k === '--note') note = argv[++i];
    }
    if (!['ticket', 'flower', 'tip'].includes(channel)) {
        throw new Error(`--channel 只能是 ticket（買票）／flower（買花）／tip（打賞），收到：${channel}`);
    }
    if (!(amountYuan > 0)) throw new Error('--amount 須為正數（圓）');
    const stateDir = path.join(out, 'state');
    if (!WorldState.exists(stateDir)) throw new Error(`此處沒有走過的卷：${stateDir}`);
    const world = WorldState.restore(stateDir);
    const outcome = injectPatronage(world, {
        channel,
        amountYuan,
        ...(target ? { target } : {}),
        ...(patronName ? { patronName } : {}),
        ...(note ? { note } : {}),
        day: world.data.clock.day,
        tick: world.data.clock.currentTick,
    });
    if (!outcome.ok) throw new Error(`注資未成：${outcome.reason}`);
    world.snapshot(stateDir);
    console.log(outcome.line);
    for (const want of outcome.spawnedWants) {
        console.log(`  [妒] ${world.nameById(want.characterId)}「${want.desc}」`);
    }
    const audit = auditSeasonEconomy(world);
    for (const line of audit) console.error(`  [economy-audit] ${line}`);
    console.log('（已落帳並排入下一拍的世界事件；下一拍走起時全班都會知道。）');
}

// ── POV 補寫 (backfill) ───────────────────────────────────────────────────────
//
// The tracking switch is only safe BECAUSE of this command: the structural layer
// (台詞＋心下＋事件) runs for the whole cast every tick and is archived in full, so
// an untracked character's first-person prose is not lost — it is merely not
// written yet. This walks the archived 手卷 for one character and writes their POV
// after the fact, at whatever moment an operator decides they became interesting.
async function povBackfillCommand(argv: string[]): Promise<void> {
    let out = defaultLabRunDir();
    let character: string | undefined;
    let day: number | undefined;
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--out') out = argv[++i];
        else if (k === '--character') character = argv[++i];
        else if (k === '--day') day = Number(argv[++i]);
    }
    if (!character) throw new Error('--character 是必須的（姓名或 id）');
    const stateDir = path.join(out, 'state');
    if (!WorldState.exists(stateDir)) throw new Error(`此處沒有走過的卷：${stateDir}`);
    const world = WorldState.restore(stateDir);
    const [characterId] = resolveCastIds(world, [character], '--character');
    const member = world.castById(characterId)!;

    // Source material: the archived 手卷 (every scene's committed beats), filtered
    // to this character's own lines. This is the same evidence the diary audit
    // uses, read back off disk instead of out of the live tick.
    const archiveDir = path.join(out, 'archive');
    if (!fs.existsSync(archiveDir)) throw new Error(`此卷沒有 archive/：${archiveDir}`);
    const files = fs.readdirSync(archiveDir).filter((name) => name.includes('shoujuan') && name.endsWith('.md')).sort();
    const lines: string[] = [];
    for (const name of files) {
        if (day !== undefined && !name.includes(`d${day}-`) && !name.includes(`day${day}`)) continue;
        const body = fs.readFileSync(path.join(archiveDir, name), 'utf8');
        for (const line of body.split('\n')) {
            if (line.startsWith(`${member.name}：`)) lines.push(`〔${name.replace(/\.md$/, '')}〕${line}`);
        }
    }
    if (!lines.length) {
        console.log(`${member.name}${day !== undefined ? `在第 ${day} 日` : ''}沒有留下可補寫的手卷行。`);
        return;
    }
    const llmConfig = loadLLMConfig();
    const provider = resolveTextProvider(llmConfig);
    if (!provider) throw new Error('補寫 POV 需要一個文字模型 provider（見 .env）');
    const { RunnerSceneAgent } = await import('./adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent({ sessionDir: path.join(out, 'sessions'), sessionKey: process.env.CHARACTER_SESSION_KEY });
    const prose = await agent.povReflect({
        name: member.name,
        persona: member.persona,
        day: day ?? world.data.clock.day,
        todayText: lines.join('\n').slice(-4000),
        wants: world.liveWantsOf(characterId).map((want) => ({ layer: want.layer, desc: want.desc })),
    });
    if (!prose) {
        console.log('補寫未成（模型沒有回話）。');
        return;
    }
    const dir = path.join(out, 'archive');
    const file = path.join(dir, `pov-backfill-${characterId}${day !== undefined ? `-d${day}` : ''}.md`);
    fs.writeFileSync(file, `${prose}\n`, { encoding: 'utf8', mode: 0o600 });
    console.log(`補寫完成 → ${file}`);
}

/** Validate a deck without touching a world — the cheapest way to catch an
 *  authoring mistake before it costs a run. */
function deckCheckCommand(argv: string[]): void {
    let deckId = activeDeckId();
    for (let i = 0; i < argv.length; i++) if (argv[i] === '--deck') deckId = argv[++i];
    if (!deckId) throw new Error('--deck 是必須的（或設 ES_ACTIVE_DECK）');
    const deck = loadEventDeck(deckId); // throws with every problem listed
    console.log(`牌組 ${deck.title ?? deck.id} 合格：${deck.cards.length} 張牌、${(deck.secrets ?? []).length} 樁秘密、${(deck.newcomers ?? []).length} 位候補人選`);
    for (const card of deck.cards) {
        const when = card.trigger.onDays?.length
            ? `第 ${card.trigger.onDays.join('／')} 日`
            : card.trigger.everyDays
              ? `每 ${card.trigger.everyDays} 日（自第 ${card.trigger.anchorDay ?? 1} 日起）`
              : '不限日';
        console.log(`  ${card.mustLand ? '【死線】' : card.tier === 'seasonal' ? '【季級】' : '　　　　'} ${card.id}｜${card.label}｜${when}`);
    }
}

const SUBCOMMAND = process.argv[2];
const RUNNER =
    SUBCOMMAND === 'patron'
        ? () => patronCommand(process.argv.slice(3))
        : SUBCOMMAND === 'pov-backfill'
          ? () => povBackfillCommand(process.argv.slice(3))
          : SUBCOMMAND === 'deck-check'
            ? async () => deckCheckCommand(process.argv.slice(3))
            : main;

RUNNER().catch((e) => {
    console.error('[engine] fatal:', e);
    process.exit(1);
});
