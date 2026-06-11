// Gravity simulation — macro dynamical-systems verification over many seeds.
// Proves the attraction rule (1) ATTRACTS scattered contenders into one scene so
// events form, (2) SETTLES them, and (3) DISPERSES afterwards — never a permanent
// glue. The model has two relief terms (a post-resolution lock + losers' demand
// cooling after a loss); the final test turns them OFF to show a ≥3-way rivalry
// then glues, i.e. that relief is the required design ingredient.
// Runs under `node --test`; prints a verification report.
//
//   pnpm --filter @endless-story/web test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    defaultConfig,
    run,
    firstResolveTick,
    totalResolutions,
    longestClusterRun,
    dispersedFraction,
    clusterEpisodes,
    type SimConfig,
} from './gravity-sim.ts';

const SEEDS = 200;
const HORIZON = 150;

interface Agg {
    formedEvery: boolean;
    maxFirstResolve: number;
    minResolutions: number;
    maxClusterRun: number;
    minDispersed: number;
    maxEpisodes: number;
    minEpisodes: number;
}

function sweep(make: (seed: number) => SimConfig, horizon = HORIZON, seeds = SEEDS): Agg {
    const agg: Agg = {
        formedEvery: true,
        maxFirstResolve: 0,
        minResolutions: Infinity,
        maxClusterRun: 0,
        minDispersed: Infinity,
        maxEpisodes: 0,
        minEpisodes: Infinity,
    };
    for (let s = 0; s < seeds; s++) {
        const st = run(make(s), horizon);
        const fr = firstResolveTick(st);
        if (fr < 0) agg.formedEvery = false;
        else agg.maxFirstResolve = Math.max(agg.maxFirstResolve, fr);
        agg.minResolutions = Math.min(agg.minResolutions, totalResolutions(st));
        agg.maxClusterRun = Math.max(agg.maxClusterRun, longestClusterRun(st));
        agg.minDispersed = Math.min(agg.minDispersed, dispersedFraction(st));
        agg.maxEpisodes = Math.max(agg.maxEpisodes, clusterEpisodes(st));
        agg.minEpisodes = Math.min(agg.minEpisodes, clusterEpisodes(st));
    }
    return agg;
}

test('(A) two-way contests: attract, settle once, then fully disperse — no glue', () => {
    // 2 contenders / capacity-1 → a one-shot contest (after a holder is set, only
    // one non-holder remains, so it can never re-quorum). The clean dispersal case.
    const a = sweep((seed) => defaultConfig({ seed }));
    console.log('\n  ── (A) two-way contests (200 seeds × 150 ticks) ──');
    console.log(`  attraction  every seed formed an event:   ${a.formedEvery}`);
    console.log(`  attraction  slowest first resolve:        ${a.maxFirstResolve} ticks`);
    console.log(`  settlement  fewest resolutions:           ${a.minResolutions}`);
    console.log(`  dispersal   least time dispersed:         ${(a.minDispersed * 100).toFixed(0)}%`);
    console.log(`  transience  longest cluster run:          ${a.maxClusterRun} ticks  (horizon ${HORIZON})\n`);

    assert.ok(a.formedEvery, 'every seed must form an event');
    assert.ok(a.maxFirstResolve <= 10, `attraction too slow: ${a.maxFirstResolve}`);
    assert.ok(a.minResolutions >= 2, `contests must settle: ${a.minResolutions}`);
    assert.ok(a.minDispersed >= 0.6, `must disperse after settling: ${a.minDispersed}`);
    assert.ok(a.maxClusterRun <= 8, `cluster must be transient, ran ${a.maxClusterRun}`);
});

const wide = (over: Partial<SimConfig>) =>
    defaultConfig({
        agentIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
        sceneIds: ['s0', 's1', 's2', 's3', 's4', 's5'],
        resources: [
            { id: 'spotlight', contenders: ['a', 'b', 'c'] }, // 3-way → re-seizable
            { id: 'recording', contenders: ['d', 'e', 'f'] },
            { id: 'partnership', contenders: ['g', 'h'] },
        ],
        ...over,
    });

test('(B) multi-way contests CYCLE: form → settle → disperse → re-form (a limit cycle)', () => {
    const b = sweep((seed) => wide({ seed }));
    console.log('  ── (B) three-way contests, with relief ──');
    console.log(`  attraction  every seed formed an event:   ${b.formedEvery}`);
    console.log(`  cycle       cluster episodes (min..max):   ${b.minEpisodes}..${b.maxEpisodes}`);
    console.log(`  dispersal   least time dispersed:         ${(b.minDispersed * 100).toFixed(0)}%`);
    console.log(`  transience  longest cluster run:          ${b.maxClusterRun} ticks  (horizon ${HORIZON})\n`);

    assert.ok(b.formedEvery, 'every seed forms an event even spread across 6 scenes');
    // a re-seizable 3-way slot recurs → many distinct episodes, never one frozen clump.
    assert.ok(b.minEpisodes >= 3, `expected a recurring cycle, got ${b.minEpisodes}`);
    assert.ok(b.maxClusterRun <= 14, `cluster must stay transient: ${b.maxClusterRun}`);
    assert.ok(b.minDispersed >= 0.2, `must disperse between contests: ${b.minDispersed}`);
});

test('(C) SENSITIVITY: remove the relief and a 3-way rivalry glues permanently', () => {
    // No lock + no demand-cooling → losers stay tense and are pulled straight back
    // onto the slot, re-seizing it forever: a permanent contention cluster. This
    // is the control proving (a) the dispersal above is caused by the relief
    // terms, and (b) the live system MUST have them (a settled resource must stop
    // pulling — cooldown / anti-repeat — and a loser's demand must move on).
    const glued = sweep((seed) => wide({ seed, lockTicks: 0, loseCool: 0 }));
    const healthy = sweep((seed) => wide({ seed }));
    console.log('  ── (C) relief sensitivity (3-way) ──');
    console.log(`  no relief   longest cluster run: ${glued.maxClusterRun}/${HORIZON}   dispersed: ${(glued.minDispersed * 100).toFixed(0)}%`);
    console.log(`  with relief longest cluster run: ${healthy.maxClusterRun}/${HORIZON}   dispersed: ${(healthy.minDispersed * 100).toFixed(0)}%\n`);

    assert.ok(glued.maxClusterRun >= HORIZON * 0.6, `expected permanent glue without relief, got ${glued.maxClusterRun}`);
    assert.ok(glued.minDispersed <= 0.1, `glued world should rarely disperse, got ${glued.minDispersed}`);
    assert.ok(healthy.maxClusterRun <= 14, `relief should keep clusters transient: ${healthy.maxClusterRun}`);
});
