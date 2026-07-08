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
    desiresFromWants,
    dramaHintForAgent,
    extractSatisfaction,
    roleResourceAmbition,
    verifyBeat,
    type AgentSpec,
    type ResourceSnapshot,
    type WantDemand,
} from './drama-core.ts';

test('ROLE_AMBITION niches: each 行當 burns for its lane, NON-contender elsewhere (the rebalance)', () => {
    const HOT = 0.6;
    const COLD = 0.15; // AMBITION_MIN — below = pruned out of the desire set
    // 花旦 → 頭牌 + 唱片; cold on 武戲 / 堂會
    assert.ok(roleResourceAmbition('花旦', 'spotlight') >= 0.8 && roleResourceAmbition('花旦', 'recording') >= 0.8);
    assert.ok(roleResourceAmbition('花旦', 'martial') < COLD && roleResourceAmbition('花旦', 'patronage') < COLD);
    // 班主 → 堂會包銀（生意）; does NOT contest the leads' 頭牌 / 唱片 → frees co-presence for warmth
    assert.ok(roleResourceAmbition('班主', 'patronage') >= HOT);
    assert.ok(roleResourceAmbition('班主', 'spotlight') < COLD && roleResourceAmbition('班主', 'recording') < COLD);
    // 刀馬旦 → 武戲; cold on 唱片
    assert.ok(roleResourceAmbition('刀馬旦', 'martial') >= 0.9 && roleResourceAmbition('刀馬旦', 'recording') < COLD);
    // unknown 行當 still participates (moderate fallback)
    assert.ok(roleResourceAmbition('某新行當', 'spotlight') >= 0.3);
});

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

test('default desires: 搭檔 desired by 小生-side young leads; NOT 花旦/二太太/武小生(武戲 niche)', () => {
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:小生'] }).length, 1);
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:乾生'] }).length, 1);
    // 武小生 is eligible by role but its lane is 武戲 (specialized) → not a 搭檔 contender now.
    assert.equal(defaultDesiresForCast([slot({})], 5, { agentTags: ['role:武小生'] }).length, 0);
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

function res(label: string): ResourceSnapshot {
    return { id: '0xr2', archetype: 'capacity-1-slot', label, capacity: 1n, allocations: {} };
}

test('行當 niche: 花旦 desires 唱片; 武旦 is a NON-contender for it (specialized 2026-06-16)', () => {
    const hua = defaultDesiresForCast([res('recording:首張唱片灌錄權')], 5, { agentTags: ['role:花旦'] });
    const wu = defaultDesiresForCast([res('recording:首張唱片灌錄權')], 5, { agentTags: ['role:刀馬旦'] });
    assert.equal(hua.length, 1, '花旦 burns for 唱片');
    assert.equal(wu.length, 0, '武旦 does not contest 唱片 — its lane is 武戲');
});

test('行當 niche: 武旦 desires 武戲; 花旦 is a NON-contender for it', () => {
    const wu = defaultDesiresForCast([res('martial:壓軸武戲台口')], 5, { agentTags: ['role:刀馬旦'] });
    const hua = defaultDesiresForCast([res('martial:壓軸武戲台口')], 5, { agentTags: ['role:花旦'] });
    assert.equal(wu.length, 1, '武旦 burns for 武戲');
    assert.equal(hua.length, 0, '花旦 does not contest 武戲');
});

test('行當 niche: a 行當 desires its home resource but NOT an off-行當 one', () => {
    const huaRecording = defaultDesiresForCast([res('recording:唱片')], 5, { agentTags: ['role:花旦'] });
    const huaMartial = defaultDesiresForCast([res('martial:武戲')], 5, { agentTags: ['role:花旦'] });
    assert.equal(huaRecording.length, 1, '花旦 wants 唱片 (home lane)');
    assert.equal(huaMartial.length, 0, '花旦 is a non-contender for 武戲 (off lane)');
});

test('backstage role (記者/衣箱) does not compete for a performer resource', () => {
    assert.equal(defaultDesiresForCast([res('recording:唱片')], 5, { agentTags: ['role:記者'] }).length, 0);
    assert.equal(defaultDesiresForCast([res('naming:四方小報頭條')], 5, { agentTags: ['role:衣箱'] }).length, 0);
});

test('hint: dominant unmet desire renders a non-empty Chinese line', () => {
    const { next } = deriveBeat(castWorld(LIU));
    const baiHint = dramaHintForAgent(next, BAI);
    assert.ok(baiHint && baiHint.includes('張力'), `contender should get a tension hint, got: ${baiHint}`);
    // an agent with no desires gets no hint
    assert.equal(dramaHintForAgent(next, '0xnobody'), null);
    assert.equal(dramaHintForAgent(next, WEN), null);
});

test('resourceIntents targets a director stake to named 行當 (FU1)', () => {
    const feud = res('feud:碼頭的賬'); // fresh kind → no ROLE_AMBITION row (flat 0.5 by default)
    // wantedBy matches role by substring (like ROLE_AMBITION) — '刀馬' hits 刀馬旦, not 花旦.
    const intents = { 'feud:碼頭的賬': { wantedBy: ['刀馬', '老生'] } };
    const wu = defaultDesiresForCast([feud], 5, { agentTags: ['role:刀馬旦'], resourceIntents: intents });
    const hua = defaultDesiresForCast([feud], 5, { agentTags: ['role:花旦'], resourceIntents: intents });
    assert.equal(wu.length, 1, 'a named 行當 (刀馬) burns for the bespoke stake');
    assert.equal(hua.length, 0, 'an unnamed 行當 stands down — not a flat 0.5 scramble');
    // without the intent, the fresh kind falls back to the flat default → 花旦 contends too
    const huaNoIntent = defaultDesiresForCast([feud], 5, { agentTags: ['role:花旦'] });
    assert.equal(huaNoIntent.length, 1, 'no intent → fresh kind is a flat scramble (everyone moderately wants it)');
});

// ─── G1 single demand source: wants → desires ───

function wd(over: Partial<WantDemand>): WantDemand {
    return { resource: 'partnership:溫照棠', weight: 0.9, sat: 0.2, ...over };
}

test('desiresFromWants: only a want carrying the exact stake label contests it', () => {
    const specs = desiresFromWants([slot({})], [wd({})]);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].claims[0].ref, R1);
    // A patron with wants but none tied to the stake contests nothing (白韻秋 case).
    assert.equal(desiresFromWants([slot({})], [wd({ resource: null })]).length, 0);
    assert.equal(desiresFromWants([slot({})], [wd({ resource: undefined })]).length, 0);
    // Similar-but-different label never matches (歌廳頭牌 ≠ 春雪社頭牌名額).
    assert.equal(desiresFromWants([slot({})], [wd({ resource: 'partnership:溫' })]).length, 0);
});

test('desiresFromWants: retired or satisfied wants stop contesting', () => {
    assert.equal(desiresFromWants([slot({})], [wd({ retired: true })]).length, 0);
    assert.equal(desiresFromWants([slot({})], [wd({ sat: 0.97 })]).length, 0);
});

test('desiresFromWants: desire weight tracks the hottest matching want', () => {
    const hot = desiresFromWants([slot({})], [wd({ weight: 0.9, sat: 0.1 })])[0];
    const cool = desiresFromWants([slot({})], [wd({ weight: 0.5, sat: 0.5 })])[0];
    assert.ok(hot.weight > cool.weight);
});

