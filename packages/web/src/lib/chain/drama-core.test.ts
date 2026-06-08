// Unit tests for the pure drama DEMAND core (no chain, no I/O).
//
// Runs under `node --test` via native TS type-stripping. IMPORTANT: keep this
// file's import graph node-clean — it may import ONLY `./drama-core.ts` (which
// imports only `@endless-story/drama`). Do not pull in web modules that use
// `.js` specifiers or Next types; node --test can't resolve those.
//
//   pnpm --filter @endless-story/web test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, tension, type WorldState } from '@endless-story/drama';
import {
    buildBeat,
    buildWorld,
    defaultDesiresForCast,
    deriveBeat,
    dramaHintForAgent,
    extractSatisfaction,
    verifyBeat,
    type AgentSpec,
    type ResourceSnapshot,
} from './drama-core.ts';

const LIU = '0xliu';
const BAI = '0xbai';
const WEN = '0xwen';
const R1 = '0xr1';

function slot(allocations: Record<string, bigint>): ResourceSnapshot {
    return {
        id: R1,
        archetype: 'capacity-1-slot',
        label: 'partnership:溫照棠',
        capacity: 1n,
        allocations,
    };
}

function castWorld(holder: string | null, prior = new Map<string, bigint>()): WorldState {
    const resources = [slot(holder ? { [holder]: 1n } : {})];
    const desires = defaultDesiresForCast(resources, 2);
    const agents: AgentSpec[] = [
        { id: LIU, desires },
        { id: BAI, desires },
    ];
    return buildWorld(resources, agents, prior, 0n);
}

const tensionOf = (w: WorldState, agentId: string): bigint =>
    tension(w.agents.find((a) => a.id === agentId)!.desires[0]);

test('default desires: a capacity-1 slot among 2 cast members is contested → 1 unit-want desire', () => {
    const specs = defaultDesiresForCast([slot({})], 2);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].claims.length, 1);
    assert.equal(specs[0].claims[0].ref, R1);
    assert.equal(specs[0].claims[0].claim, 1n);
    // statement is narrative-derived from the partnership label
    assert.match(specs[0].statement, /溫照棠/);
});

test('default desires: a resource everyone fits in (capacity ≥ cast) is NOT contested', () => {
    const roomy: ResourceSnapshot = { ...slot({}), capacity: 5n };
    assert.equal(defaultDesiresForCast([roomy], 2).length, 0);
});

test('default desires: a named partnership target does NOT desire their own slot', () => {
    assert.equal(
        defaultDesiresForCast([slot({})], 3, {
            agentName: '溫照棠',
            agentTags: ['role:花旦'],
        }).length,
        0,
    );
    assert.equal(
        defaultDesiresForCast([slot({})], 3, {
            agentName: '陸明漪',
            agentTags: ['role:小生'],
        }).length,
        1,
    );
});

test('default desires: tagged partnership eligibility is 小生-side only', () => {
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:小生'] }).length, 1);
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:武小生'] }).length, 1);
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:花旦'] }).length, 0);
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['status:二太太'] }).length, 0);
});

test('derive: the holder ends LESS tense than the contender (scarcity bites)', () => {
    const world = castWorld(LIU); // Liu holds the slot, Bai does not
    const { next } = deriveBeat(world);
    const liuT = tensionOf(next, LIU);
    const baiT = tensionOf(next, BAI);
    assert.ok(baiT > liuT, `contender 白 (${baiT}) must out-tense holder 柳 (${liuT})`);
    // bounded without clamp
    assert.ok(liuT >= 0n && liuT <= SCALE && baiT >= 0n && baiT <= SCALE);
});

test('derive: conservation — the off-chain relax never moves supply', () => {
    const world = castWorld(LIU);
    const { next } = deriveBeat(world);
    const alloc = next.resources[R1].allocations;
    const total = Object.values(alloc).reduce((s, v) => s + v, 0n);
    assert.equal(total, 1n, 'still exactly one unit of the slot in play');
    assert.equal(alloc[LIU] ?? 0n, 1n, '柳 still holds it (demo side never reallocates)');
});

test('continuity: prior satisfaction carries forward (the slot-holder keeps relaxing upward)', () => {
    const first = deriveBeat(castWorld(LIU));
    const carried = extractSatisfaction(first.next);
    const secondWorld = castWorld(LIU, carried);
    const second = deriveBeat(secondWorld);
    // Liu keeps holding → its satisfaction should be ≥ after the first beat (monotone toward SCALE)
    const s1 = first.next.agents.find((a) => a.id === LIU)!.desires[0].satisfaction;
    const s2 = second.next.agents.find((a) => a.id === LIU)!.desires[0].satisfaction;
    assert.ok(s2 >= s1, `held-slot satisfaction should not regress: ${s1} → ${s2}`);
});

test('determinism: same input → byte-identical derived world (re-run guarantee)', () => {
    const a = deriveBeat(castWorld(LIU));
    const b = deriveBeat(castWorld(LIU));
    const ser = (w: WorldState) => JSON.stringify(w, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    assert.equal(ser(a.next), ser(b.next));
});

test('verifyBeat: a committed beat re-runs to the same output (and tampering is caught)', () => {
    const world = castWorld(LIU);
    const derived = deriveBeat(world);
    const beat = buildBeat('0xsaga', world, derived, null);
    assert.equal(verifyBeat(beat), true, 'honest beat must verify');

    // tamper the recorded output → verification must fail
    const tampered = structuredClone(beat);
    const firstAgent = tampered.output.world.agents[0];
    firstAgent.desires[0].satisfaction = (BigInt(firstAgent.desires[0].satisfaction) + 1n).toString();
    assert.equal(verifyBeat(tampered), false, 'tampered output must NOT verify');
});

test('hint: dominant unmet desire renders a non-empty Chinese line', () => {
    const { next } = deriveBeat(castWorld(LIU));
    const baiHint = dramaHintForAgent(next, BAI);
    assert.ok(baiHint && baiHint.includes('張力'), `contender should get a tension hint, got: ${baiHint}`);
    // an agent with no desires gets no hint
    assert.equal(dramaHintForAgent(next, '0xnobody'), null);
    assert.equal(dramaHintForAgent(next, WEN), null);
});
