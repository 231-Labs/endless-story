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
import { setHomeScenes } from '@/lib/chain/spatial-routing';
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

export interface CanonCastMember {
    name: string;
    gender: string;
    description: string;
    role?: string;
    ageYears?: number;
}

export interface SeedOptions {
    /** Named cast with personas (e.g. 柳蘇 canon); overrides the anonymous shells. */
    canonCast?: CanonCastMember[];
    /** number of fake characters (default 6). */
    cast?: number;
    /** seed one contested resource so the drama/spine path has something to settle. */
    withResource?: boolean;
    /** Give each character a private home scene (privacyLevel 4) + register it as
     *  their night home, so the night router can pull a pair into a private room
     *  (H3). Without this the harness has only public scenes and every night
     *  sleeps — the resolution venue never forms. */
    privateHomes?: boolean;
}

const CAST_NAMES = ['文', '孟', '姚', '柳', '蕭', '霍', '秦', '雲'];

export function seedWorld(opts: SeedOptions = {}): void {
    patchDeployment();
    setWorldIdForCharacters(WORLD);

    harnessChain.world = { id: WORLD, currentTick: 0, daysPerTickBp: 1670 };
    harnessChain.saga = {
        id: SAGA,
        worldId: WORLD,
        name: '春雪戲班',
        description: '一個關於戲班的故事。',
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

    const castN = Math.max(2, opts.canonCast?.length ?? opts.cast ?? 6);
    const cast: FakeCharacter[] = [];
    for (let i = 0; i < castN; i++) {
        const id = fakeId('h-char-' + i);
        // Spread the cast across the two scenes but cluster ≥2 in SCENE_A so a
        // storylet can quorum (event needs ≥2 co-present desirers on one axis).
        const sceneId = i < Math.ceil(castN / 2) ? SCENE_A : SCENE_B;
        const canon = opts.canonCast?.[i];
        cast.push({
            id,
            description: canon?.description,
            role: canon?.role,
            ageYears: canon?.ageYears,
            name: canon?.name ?? CAST_NAMES[i % CAST_NAMES.length] + (i >= CAST_NAMES.length ? String(i) : ''),
            sagaId: SAGA,
            sceneId,
            ownerCapId: fakeId('h-ownercap-' + i),
            controlCapId: fakeId('h-controlcap-' + i),
            owner: fakeId('h-owner-' + i),
            attrs: {
                appearance: 60 + ((i * 7) % 35),
                constitution: 60 + ((i * 11) % 35),
                acuity: 60 + ((i * 13) % 35),
                disposition: 55 + ((i * 5) % 35),
            },
            gender: canon?.gender ?? (i % 2 === 0 ? '女' : '男'),
            species: '人',
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
        name: '排練廳',
        characterIds: cast.filter((c) => c.sceneId === SCENE_A).map((c) => c.id),
    };
    const sceneB: FakeScene = {
        id: SCENE_B,
        worldId: WORLD,
        sagaId: SAGA,
        locationId: fakeId('h-loc-1'),
        name: '後台',
        characterIds: cast.filter((c) => c.sceneId === SCENE_B).map((c) => c.id),
    };
    harnessChain.scenes.set(sceneA.id, sceneA);
    harnessChain.scenes.set(sceneB.id, sceneB);

    // H3: one private home per character + register it as their night home, so
    // the night router has a private room to pull a ripe pair into. Added to the
    // saga's anchor list so the tick's scene read (anchor_scene_ids) sees them.
    if (opts.privateHomes) {
        const homeEntries: Array<readonly [string, string]> = [];
        for (const c of cast) {
            const homeId = fakeId('h-home-' + c.id.slice(-8));
            harnessChain.scenes.set(homeId, {
                id: homeId,
                worldId: WORLD,
                sagaId: SAGA,
                locationId: fakeId('h-loc-home'),
                name: `${c.name}的住處`,
                characterIds: [],
                privacyLevel: 4,
            });
            homeEntries.push([c.id, homeId] as const);
        }
        harnessChain.saga.anchorSceneIds = [SCENE_A, SCENE_B, ...homeEntries.map(([, s]) => s)];
        setHomeScenes(homeEntries);
    }

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
        const resId = fakeId('h-res-affection');
        const tableId = fakeId('h-res-affection-table');
        const res: FakeResource = {
            id: resId,
            sagaId: SAGA,
            archetype: 'capacity-1-slot',
            label: 'affection:' + cast[0].name,
            capacity: 1n,
            tableId,
            allocations: new Map(),
        };
        harnessChain.resources.set(resId, res);
    }

    harnessChain.events.clear();
    harnessChain.relationships.length = 0;
}

export function setHarnessMode(mode: FakeMode, extra: Partial<FakeModeConfig> = {}): void {
    harnessChain.setMode({ mode, ...extra });
}
