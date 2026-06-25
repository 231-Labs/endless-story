/**
 * DECOUPLED FULL-TICK harness — SETUP. Import this FIRST, before anything that
 * transitively imports the tick loop / sdk client, so the env + factory seam is in
 * place before module-init reads them.
 *
 * What it does:
 *   1. Sets ES_HARNESS=1 (gates the four faked factories: sui client, text + image
 *      LLM, walrus putBlob).
 *   2. Ensures the MemWal / OpenAI creds are UNSET so `isMemoryConfigured()` is false
 *      → recall returns [], remember returns false (no relayer, no SEAL, no network).
 *   3. Provides a throwaway admin keypair via SUI_ADMIN_PRIVATE_KEY (the keypair is
 *      loaded by getAdminContext but never used for real crypto — our fake client
 *      ignores the signature).
 *   4. Builds the FullFakeChain singleton, installs the client factory, seeds the
 *      world/saga/scenes/characters, and PATCHES ENDLESS_STORY_DEPLOYMENT so the
 *      tick's deployment ids point at the seeded fake objects.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { __setHarnessClientFactory } from '@endless-story/sdk';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/shared/contract-ids';
import { fakeId } from '../settlement-harness/fake-chain.js';
import {
    FullFakeChain,
    makeFullFakeSuiClient,
    setWorldIdForCharacters,
    type FakeCharacter,
    type FakeMode,
    type FakeModeConfig,
    type FakeResource,
    type FakeScene,
} from './full-tick-fake-chain.js';

/* ── env: turn the harness on, turn the network deps off ───────────────────── */

process.env.ES_HARNESS = '1';
// Memory OFF (any one missing factor disables it; clear all the optional ones).
delete process.env.MEMWAL_PRIVATE_KEY;
delete process.env.MEMWAL_ACCOUNT_ID;
delete process.env.MEMWAL_SERVER_URL;
delete process.env.OPENAI_API_KEY;
// Quiet provider keys so nothing tries a real call even if a gate slips.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ZAI_API_KEY;
delete process.env.POE_API_KEY;
// A throwaway admin key (never used for real signing — fake client ignores it).
if (!process.env.SUI_ADMIN_PRIVATE_KEY) {
    process.env.SUI_ADMIN_PRIVATE_KEY = Ed25519Keypair.generate().getSecretKey();
}
// Default the spine tick window small so events age + resolve within a few ticks.
process.env.ES_SPINE_TICK_WINDOW_MS = process.env.ES_SPINE_TICK_WINDOW_MS ?? '1';
// Keep job timeouts short so a (hypothetical) wedge shows up fast in the report.
process.env.ES_CUT_JOB_TIMEOUT_MS = process.env.ES_CUT_JOB_TIMEOUT_MS ?? '20000';
process.env.ES_MOMENT_JOB_TIMEOUT_MS = process.env.ES_MOMENT_JOB_TIMEOUT_MS ?? '20000';

/* ── the singleton chain ───────────────────────────────────────────────────── */

const PKG = ENDLESS_STORY_DEPLOYMENT.packageId;

export const harnessChain = new FullFakeChain(PKG, { mode: 'ideal' });

__setHarnessClientFactory(() => makeFullFakeSuiClient(harnessChain) as never);

/* ── deployment patch — point the tick at the seeded fake objects ──────────── */

const WORLD = fakeId('h-world');
const SAGA = fakeId('h-saga');
const ADMIN_CAP = fakeId('h-admin-cap');
const CAP = fakeId('h-storyteller-cap');
const SCENE_A = fakeId('h-scene-rehearsal');
const SCENE_B = fakeId('h-scene-greenroom');

function patchDeployment(): void {
    const d = ENDLESS_STORY_DEPLOYMENT as {
        worldId: string;
        sagaId: string;
        adminCapId: string;
        storytellerCapId: string;
        sceneIds: string[];
    };
    d.worldId = WORLD;
    d.sagaId = SAGA;
    d.adminCapId = ADMIN_CAP;
    d.storytellerCapId = CAP;
    d.sceneIds = [SCENE_A, SCENE_B];
}

/* ── seed ──────────────────────────────────────────────────────────────────── */

export interface SeedOptions {
    /** number of fake characters (default 6). */
    cast?: number;
    /** seed one contested resource so the drama/spine path has something to settle. */
    withResource?: boolean;
    /**
     * Override the single seeded stake. The label becomes `<kind>:<targetName>`, which
     * drives `desireStatementFor` → `framingForStatement` (so kind=partnership reads as
     * 「與<target>搭戲」, kind=affection as 「傾心於<target>」). Used by the experiment
     * framework to switch the dramatic SOIL without forking this seeder. When omitted,
     * the default `affection:<cast[0]>` capacity-1 stake is seeded (legacy behaviour).
     */
    stake?: {
        kind: string;
        /** index into the cast naming the focus of the stake (被傾心/被搭/被爭). */
        targetIndex: number;
        capacity?: number;
    };
    /**
     * Extra contested resources beyond the main `stake`. Each seeds another
     * `<kind>:<targetName>` slot; `selectContention` then ROTATES across them tick to
     * tick (it already avoids re-picking a recent template), so the incident — and thus
     * the POVs — stop repeating a single theme. Empty/omitted = legacy single-stake.
     */
    extraStakes?: Array<{ kind: string; targetIndex: number; capacity?: number }>;
    /**
     * Optional concrete story. When `story.cast` is given, each `StorySpec` seeds one
     * fake character WITH a 行當 (→ public `role:` tag) + 小傳 (→ `profile.description`),
     * so the POV has an anchored persona instead of the anonymous CAST_NAMES shells.
     * `story.saga` / `story.scenes` override the default saga premise / scene names.
     * When omitted, the legacy anonymous cast is seeded — default behaviour unchanged.
     */
    story?: {
        saga?: { name: string; description: string };
        scenes?: { name: string }[];
        cast?: StorySpec[];
    };
}

/**
 * The subset of the web 創世班底 `FoundingCharSpec` the harness consumes (name / 行當 /
 * 小傳 / gender / optional attribute floors). Declared locally so the seeder needn't
 * import the 'use server' create-founding-cast module's chain/runner deps.
 */
export interface StorySpec {
    name: string;
    /** '男' | '女' | '中性' | … */
    gender: string;
    /** 行當 — becomes the public `role:<role>` tag. */
    role: string;
    /** 小傳 — becomes the chain `profile.description` (roster brief + role fallback). */
    description: string;
    /** Per-axis attribute floors; absent axes fall back to the default deterministic roll. */
    minAttributes?: Partial<Record<'appearance' | 'constitution' | 'acuity' | 'disposition', number>>;
}

const CAST_NAMES = ['文', '孟', '姚', '柳', '蕭', '霍', '秦', '雲'];

export function seedWorld(opts: SeedOptions = {}): void {
    patchDeployment();
    setWorldIdForCharacters(WORLD);

    harnessChain.world = { id: WORLD, currentTick: 0, daysPerTickBp: 1670 };
    harnessChain.saga = {
        id: SAGA,
        worldId: WORLD,
        name: opts.story?.saga?.name ?? '春雪戲班',
        description: opts.story?.saga?.description ?? '一個關於戲班的故事。',
        characterCount: 0,
        anchorSceneIds: [SCENE_A, SCENE_B],
        operator: fakeId('h-operator'),
    };

    // owned caps the admin tx lock guards.
    harnessChain.registerOwned(CAP);
    harnessChain.registerOwned(ADMIN_CAP);
    harnessChain.gasCoins = [
        { id: fakeId('h-gas-0'), version: 1 },
        { id: fakeId('h-gas-1'), version: 1 },
        { id: fakeId('h-gas-2'), version: 1 },
    ];

    // When a concrete story cast is given, it drives BOTH the count and each member's
    // persona; otherwise fall back to the anonymous `opts.cast` count of CAST_NAMES shells.
    const storyCast = opts.story?.cast;
    const castN = storyCast?.length
        ? Math.max(2, storyCast.length)
        : Math.max(2, opts.cast ?? 6);
    const cast: FakeCharacter[] = [];
    for (let i = 0; i < castN; i++) {
        const id = fakeId('h-char-' + i);
        const spec = storyCast?.[i];
        // Spread the cast across the two scenes but cluster ≥2 in SCENE_A so a
        // storylet can quorum (event needs ≥2 co-present desirers on one axis).
        const sceneId = i < Math.ceil(castN / 2) ? SCENE_A : SCENE_B;
        // Default deterministic roll (legacy shells + any axis a spec leaves un-floored).
        const rolled = {
            appearance: 60 + ((i * 7) % 35),
            constitution: 60 + ((i * 11) % 35),
            acuity: 60 + ((i * 13) % 35),
            disposition: 55 + ((i * 5) % 35),
        };
        const floors = spec?.minAttributes;
        const attrs = floors
            ? {
                  appearance: Math.max(rolled.appearance, floors.appearance ?? 0),
                  constitution: Math.max(rolled.constitution, floors.constitution ?? 0),
                  acuity: Math.max(rolled.acuity, floors.acuity ?? 0),
                  disposition: Math.max(rolled.disposition, floors.disposition ?? 0),
              }
            : rolled;
        cast.push({
            id,
            name: spec?.name ?? CAST_NAMES[i % CAST_NAMES.length] + (i >= CAST_NAMES.length ? String(i) : ''),
            sagaId: SAGA,
            sceneId,
            ownerCapId: fakeId('h-ownercap-' + i),
            controlCapId: fakeId('h-controlcap-' + i),
            owner: fakeId('h-owner-' + i),
            attrs,
            gender: spec?.gender ?? (i % 2 === 0 ? '女' : '男'),
            species: '人',
            // Persona anchors (empty for legacy shells → POV improvises as before).
            description: spec?.description ?? '',
            role: spec?.role,
        });
    }
    harnessChain.characters.clear();
    for (const c of cast) harnessChain.characters.set(c.id, c);
    harnessChain.saga.characterCount = cast.length;

    harnessChain.scenes.clear();
    const sceneA: FakeScene = {
        id: SCENE_A,
        worldId: WORLD,
        sagaId: SAGA,
        locationId: fakeId('h-loc-0'),
        name: opts.story?.scenes?.[0]?.name ?? '排練廳',
        characterIds: cast.filter((c) => c.sceneId === SCENE_A).map((c) => c.id),
    };
    const sceneB: FakeScene = {
        id: SCENE_B,
        worldId: WORLD,
        sagaId: SAGA,
        locationId: fakeId('h-loc-1'),
        name: opts.story?.scenes?.[1]?.name ?? '後台',
        characterIds: cast.filter((c) => c.sceneId === SCENE_B).map((c) => c.id),
    };
    harnessChain.scenes.set(sceneA.id, sceneA);
    harnessChain.scenes.set(sceneB.id, sceneB);

    harnessChain.resources.clear();
    if (opts.withResource ?? true) {
        // EMERGENT-RELATIONSHIPS EXPERIMENT (v2 — 感情土壤). The seeded event is an
        // AFFECTION triangle (多人暗自傾心 文), used PURELY as a POV-soil generator — NOT
        // as a winner-takes-all settlement.
        //
        // The earlier mistakes, and what this fixes:
        //   · affection-as-contested-resource → settled one "winner" who 獨佔 文's heart.
        //     Wrong: feeling is a relationship, never a thing someone seizes.
        //   · partnership(搭戲) driver → POVs were about FIGHTING FOR A SPOT, so evolve
        //     only ever inferred rivalry, and 文 wasn't even a POV participant → no
        //     romance had any source.
        //
        // affection framing puts everyone's gaze ON 文 (傾心/吃醋/試探) with 文 ON STAGE,
        // so romance/rivalry/tension all have a source. The ACTUAL settlement is
        // relationship-evolve.ts reading those charged POVs and writing back DIRECTED
        // tones (孟→文 戀慕, 姚→孟 競爭, 文→孟 緊張…). The contested-winner settle still
        // runs but is IGNORED — we read the evolve graph, not who 'won' 文.
        //
        // LLM-facing chain: desireStatementFor(affection:文) → 「傾心於文」 → framingForStatement
        // → contention:affection, label「誰能贏得文的情意，成了眾人心照不宣的暗中角力」.
        //
        // The experiment framework patches `opts.stake` to swap this SOIL (kind +
        // target + capacity); when absent we seed the legacy affection:<cast[0]> stake.
        // Main stake (default affection:<cast[0]>) + any extra stakes, all seeded as
        // contested resources. With more than one, selectContention rotates across them
        // tick to tick, so the incident stops repeating a single theme.
        const allStakes = [
            {
                kind: opts.stake?.kind ?? 'affection',
                targetIndex: opts.stake?.targetIndex ?? 0,
                capacity: opts.stake?.capacity ?? 1,
            },
            ...(opts.extraStakes ?? []),
        ];
        allStakes.forEach((s, i) => {
            const tIdx = Math.min(Math.max(0, s.targetIndex), cast.length - 1);
            const capacity = BigInt(Math.max(1, s.capacity ?? 1));
            const suffix = i === 0 ? 'stake' : `stake-x${i}`;
            const resId = fakeId(`h-res-${suffix}`);
            harnessChain.resources.set(resId, {
                id: resId,
                sagaId: SAGA,
                archetype: capacity === 1n ? 'capacity-1-slot' : `capacity-${capacity}-slot`,
                label: `${s.kind}:${cast[tIdx].name}`,
                capacity,
                tableId: fakeId(`h-res-${suffix}-table`),
                allocations: new Map(),
            });
        });
    }

    harnessChain.events.clear();
    harnessChain.relationships.length = 0;
}

export function setHarnessMode(mode: FakeMode, extra: Partial<FakeModeConfig> = {}): void {
    harnessChain.setMode({ mode, ...extra });
}
