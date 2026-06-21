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

    const castN = Math.max(2, opts.cast ?? 6);
    const cast: FakeCharacter[] = [];
    for (let i = 0; i < castN; i++) {
        const id = fakeId('h-char-' + i);
        // Spread the cast across the two scenes but cluster ≥2 in SCENE_A so a
        // storylet can quorum (event needs ≥2 co-present desirers on one axis).
        const sceneId = i < Math.ceil(castN / 2) ? SCENE_A : SCENE_B;
        cast.push({
            id,
            name: CAST_NAMES[i % CAST_NAMES.length] + (i >= CAST_NAMES.length ? String(i) : ''),
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
            gender: i % 2 === 0 ? '女' : '男',
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

    harnessChain.resources.clear();
    if (opts.withResource ?? true) {
        // One capacity-1 "partnership" slot the cast contests — the lever a resolved
        // event transfers. Start it held by the first character so a reallocate is
        // possible (more interesting than acquire-from-free).
        const resId = fakeId('h-res-partnership');
        const tableId = fakeId('h-res-partnership-table');
        const res: FakeResource = {
            id: resId,
            sagaId: SAGA,
            archetype: 'capacity-1-slot',
            label: 'partnership:' + cast[0].name,
            capacity: 1n,
            tableId,
            allocations: new Map([[cast[0].id, 1n]]),
        };
        harnessChain.resources.set(resId, res);
    }

    harnessChain.events.clear();
}

export function setHarnessMode(mode: FakeMode, extra: Partial<FakeModeConfig> = {}): void {
    harnessChain.setMode({ mode, ...extra });
}
