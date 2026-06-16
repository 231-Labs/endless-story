/**
 * DECOUPLED settlement harness — drives the REAL resolve→settle path 1:1 with a
 * FAKE chain (in-memory DramaResource + BudgetEvent lifecycle), and asserts whether a
 * contested resource ACTUALLY TRANSFERS when an event resolves.
 *
 * Why this is faithful (not a re-implementation): the test runs the REAL
 * `reconcileOpenFromChain` → REAL `spineResolveAndWeave` → REAL `settleEvent` →
 * REAL `readResourceLedger` / pure pickers / `endlessTx.*` tx builders /
 * `settleResolvedTransfers`. The ONLY substitutions are the SuiClient RPC surface
 * (fake-chain.ts serves BCS bytes encoded with the SAME generated structs the real
 * decoder reads, and interprets the REAL built Transaction with the SAME type +
 * conservation discipline the Move VM enforces) and an opaque signer (never used for
 * crypto on this path). No LLM, no MemWal — the settle path needs neither.
 *
 * RUN:
 *   node --import tsx --test src/lib/actions/settlement-harness/settlement.harness.test.ts
 *   (alias seam: `@/…` imports require the tsx loader; raw `node --test` can't resolve them.)
 *
 * RESULT (2026-06-16): the REAL settle path does NOT transfer — `settleEvent` builds the
 * resolve tx from `resource.acquire`/`reallocate` (which produce `resource::Transfer`) and
 * feeds it to `outcomes_with_resource_transfers`, which requires `vector<event::ResourceTransferOp>`.
 * That type mismatch aborts the resolve tx on chain → fallback to `plainResolve`
 * (empty_outcomes) → resource stays 懸而未決 (0/1 held). The CONTROL test builds the resolve
 * tx the CORRECT way (`event.newResourceTransferOp`) and DOES move the slot — proving the
 * fake is faithful and the failure is the production bug, not an over-strict harness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transaction } from '@mysten/sui/transactions';
import { ENDLESS_STORY_DEPLOYMENT, tx as endlessTx } from '@endless-story/sdk';
import { settleResolvedTransfers } from '@/lib/chain/drama';
import {
    spineResolveAndWeave,
    reconcileOpenFromChain,
    spineClockTick,
    type SpineCtx,
} from '@/lib/actions/event-spine';
import type { SpineStep, TensionView, SceneOccupant } from '@/lib/chain/spine-core';
import type { WorldAttrs } from '@/lib/chain/saga-skills-core';
import { FakeChain, makeFakeSuiClient, fakeId, type FakeResource, type FakeEvent } from './fake-chain';

/* ── scenario fixtures ──────────────────────────────────────────────────── */

const PKG = ENDLESS_STORY_DEPLOYMENT.packageId;
const SAGA = fakeId('saga-spring-snow');
const CAP = fakeId('storyteller-cap');
const SCENE = fakeId('scene-rehearsal-hall');
const RES = fakeId('resource-partnership-wen');
const TABLE = fakeId('table-partnership-wen');
const EVENT = fakeId('event-partnership-fight');

const WEN = fakeId('char-wen');
const MENG = fakeId('char-meng');
const YAO = fakeId('char-yao');

const NAMES = new Map([
    [WEN, '文'],
    [MENG, '孟'],
    [YAO, '姚'],
]);
const ROLES = new Map([
    [WEN, '花旦'],
    [MENG, '小生'],
    [YAO, '武旦'],
]);

// Drama tensions toward the partnership slot; Wen aches the most → should win.
const TENSIONS: TensionView[] = [
    { characterId: WEN, statement: '想要「partnership:文」的搭檔位', tension: 0.92 },
    { characterId: MENG, statement: '想爭 partnership:文 的搭檔', tension: 0.61 },
    { characterId: YAO, statement: '也惦記 partnership:文', tension: 0.3 },
];

const ATTRS = new Map<string, WorldAttrs>([
    [WEN, { appearance: 88, constitution: 70, acuity: 75, disposition: 64 }],
    [MENG, { appearance: 72, constitution: 66, acuity: 70, disposition: 60 }],
    [YAO, { appearance: 60, constitution: 90, acuity: 64, disposition: 55 }],
]);

const OCCUPANCY: SceneOccupant[] = [
    { characterId: WEN, sceneId: SCENE },
    { characterId: MENG, sceneId: SCENE },
    { characterId: YAO, sceneId: SCENE },
];

/** Fresh chain each test: capacity-1 slot held by nobody + an OPEN, aged event. */
function buildChain(): FakeChain {
    const chain = new FakeChain(PKG);
    const resource: FakeResource = {
        id: RES,
        sagaId: SAGA,
        archetype: 'capacity-1-slot',
        label: 'partnership:文',
        capacity: 1n,
        tableId: TABLE,
        allocations: new Map(), // 0/1 held — the 懸而未決 starting state
    };
    chain.addResource(resource);

    const windowMs = Math.max(1000, Number(process.env.ES_SPINE_TICK_WINDOW_MS) || 120_000);
    const event: FakeEvent = {
        id: EVENT,
        sagaId: SAGA,
        sceneId: SCENE,
        title: '搭檔之爭',
        status: 0, // OPEN
        createdAtMs: Date.now() - windowMs * 3, // age ≈ 3 spine-ticks (> minTicks 2)
        participants: [WEN, MENG, YAO],
        resourceTransfers: [],
    };
    chain.addEvent(event);
    return chain;
}

function buildCtx(): SpineCtx {
    return {
        sagaId: SAGA,
        capId: CAP,
        contention: { templateId: 'contention:partnership', label: '搭檔之爭' },
        occupancy: OCCUPANCY,
        sceneNameById: new Map([[SCENE, '排練廳']]),
        nameById: NAMES,
        roleById: ROLES,
        tensions: TENSIONS,
        attrsById: ATTRS,
        minTicks: 2,
        maxTicks: 4,
        minCast: 2,
    };
}

const allocs = (m: Map<string, bigint>): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const [k, v] of m) o[k.slice(0, 8) + '…'] = v.toString();
    return o;
};

/* ── MAIN: drive the REAL resolve+settle, assert the economy moved ──────── */

test('REAL settle path transfers a capacity-1 contested resource to the winner', async () => {
    const chain = buildChain();
    const client = makeFakeSuiClient(chain) as never;
    const admin = { client, signer: { __fake_signer: true } as never };
    const ctx = buildCtx();

    const res0 = chain.resources.get(RES)!;
    const heldBefore = chain.totalAllocated(res0);
    console.log(`BEFORE: ${res0.label} held ${heldBefore}/${res0.capacity}`,
        `allocations=${JSON.stringify(allocs(res0.allocations))}`);

    // REAL reconcile: adopt the OPEN event from chain (exercises the orphan-adoption path).
    const open = await reconcileOpenFromChain(client, SAGA);
    assert.equal(open.length, 1, 'expected exactly one adopted open event');

    const nowTick = spineClockTick();
    const age = nowTick - open[0].openedAtTick;
    console.log(`reconciled 1 event, age=${age} (minTicks=${ctx.minTicks})`);
    assert.ok(age >= (ctx.minTicks ?? 2), 'event should be old enough to resolve');

    const step: SpineStep = { action: 'resolve', eventId: open[0].eventId, reason: 'settled' };

    // REAL resolve + settle.
    const outcome = await spineResolveAndWeave(admin, ctx, step, 1);
    console.log('spineResolveAndWeave:', JSON.stringify(outcome));
    console.log('move calls emitted by the real settle code:',
        chain.callLog.map((c) => `${c.module}::${c.fn}`).join(' → '));

    const after = chain.resources.get(RES)!;
    const heldAfter = chain.totalAllocated(after);
    console.log(`AFTER:  ${after.label} held ${heldAfter}/${after.capacity}`,
        `allocations=${JSON.stringify(allocs(after.allocations))}`);

    // THE ASSERTION: a contested resource must actually change hands. If the real settle
    // code is buggy (per the audit), this FAILS — exposing it. We do NOT soften it.
    assert.ok(
        heldAfter > heldBefore,
        'EXPECTED a resource transfer (someone holds the capacity-1 slot) but NONE landed — ' +
            'the real settle path fell back to plainResolve / never applied transfers. ' +
            `settled=${outcome.settled}`,
    );
    const winner = [...after.allocations.entries()].find(([, v]) => v > 0n)?.[0];
    console.log(`TRANSFER OBSERVED — winner=${NAMES.get(winner ?? '') ?? winner}`);
});

/* ── CONTROL: prove the fake applies a REAL transfer for a WELL-TYPED tx ──── */

test('CONTROL: a well-typed resolve tx (the FIX shape) moves the slot', async () => {
    const chain = buildChain();
    const client = makeFakeSuiClient(chain) as never;
    const signer = { __fake_signer: true } as never;
    const heldBefore = chain.totalAllocated(chain.resources.get(RES)!);

    // Build resolve_event with the CORRECT op constructor (result type IS event::ResourceTransferOp).
    const tx = new Transaction();
    const op = tx.add(
        endlessTx.event.newResourceTransferOp({ resourceId: RES, from: null, to: WEN, amount: 1n }),
    );
    const vec = tx.makeMoveVec({ type: `${PKG}::event::ResourceTransferOp`, elements: [op] });
    const outcomes = tx.add(endlessTx.event.outcomesWithResourceTransfers({ resourceTransfers: vec }));
    tx.add(
        endlessTx.event.resolveEvent({ cap: CAP, saga: SAGA, budgetEvent: EVENT, scene: SCENE, outcomes }),
    );
    const resolveRes = await (client as never as {
        signAndExecuteTransaction(a: { transaction: Transaction; signer: never; options: unknown }): Promise<{
            effects?: { status?: { status?: string; error?: string } };
        }>;
    }).signAndExecuteTransaction({ transaction: tx, signer, options: { showEffects: true } });
    assert.equal(resolveRes.effects?.status?.status, 'success',
        `well-typed resolve should succeed: ${resolveRes.effects?.status?.error ?? ''}`);

    // REAL disposal half.
    const applied = await settleResolvedTransfers({
        sagaId: SAGA, capId: CAP, eventId: EVENT, resourceIds: [RES], signer, client,
    });
    assert.ok(applied.ok, `settleResolvedTransfers should succeed: ${applied.error ?? ''}`);

    const heldAfter = chain.totalAllocated(chain.resources.get(RES)!);
    console.log(`CONTROL held ${heldBefore} → ${heldAfter}`,
        `allocations=${JSON.stringify(allocs(chain.resources.get(RES)!.allocations))}`);
    assert.ok(heldAfter > heldBefore,
        'CONTROL: a well-typed resolve+apply MUST move the slot — if not, the fake is broken');
});
