/**
 * 願生不息 — the nightly regenerateWant wiring (tick.ts §7.75). Structural guard
 * against livelihood machinery crowding out feeling: a fresh want can be BORN each
 * night for EVERY character, so nobody flatlines once their personal arc resolves.
 *
 * Deterministic plumbing tests, no LLM. The FakeSceneAgent's regenerateWant is
 * deterministic (successor when something resolved today, ambient when wantless,
 * else null — NO artificial floor), so the wiring is fully exercisable offline.
 *
 * Tests 1–4 park the clock at a day-end (night) tick — where genesis is skipped —
 * and use an INERT agent (nothing resolves / no aftermath / no scene-rewrite) so the
 * only thing that can touch the want ledger this tick is the regeneration block, and
 * the target character's live/justResolved state is exactly what the test sets.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { auditSeasonEconomy } from '../src/core/season-economy.ts';
import { newWant, type Want } from '../src/core/want-core.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { runTick } from '../src/tick.ts';
import { WorldState } from '../src/world-state.ts';
import type { ArchivePort, GenesisWant } from '../src/ports.ts';
import type { RewriteReply } from '../src/core/want-rewrite.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

const nullArchive: ArchivePort = { commit: async () => {} };

/** No-economy world (buildWorldState never seeds economy — only applySeasonFrame
 *  does), so tests 1–4 exercise pure want regeneration with no ledger side effects. */
function narrativeWorld(): WorldState {
    return buildWorldState(loadPresetFile('spring-snow'));
}

function deps(agent: FakeSceneAgent) {
    return { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() };
}

/** FakeSceneAgent with the day made want-INERT: nothing resolves, no aftermath, no
 *  scene-scoped rewrite. regenerateWant stays the real deterministic fake — the unit
 *  under test. So the target's live wants + justResolved at regen time are exactly
 *  what the test seeds. */
class InertDayAgent extends FakeSceneAgent {
    override async judgeWantResolved(): Promise<CharacterAgentNs.ResolveVerdict> {
        return { resolved: false };
    }
    override async deriveAftermathWant(): Promise<GenesisWant | null> {
        return null;
    }
    override async rewriteWantLedger(): Promise<RewriteReply> {
        return { decisions: [] };
    }
}

/** A live narrative want owned by `charId`. */
function liveWant(charId: string, desc: string, tick = 0): Want {
    return newWant({ characterId: charId, layer: '志向', desc, weight: 0.5, sat: 0.3, resistance: 4, kind: 'narrative', source: 'owner', bornTick: tick });
}

/** A want `charId` RESOLVED today (retired + resolvedTick within the current day). */
function resolvedTodayWant(charId: string, desc: string, resolvedTick: number): Want {
    const w = liveWant(charId, desc, 0);
    w.retired = true;
    w.resolvedTick = resolvedTick;
    return w;
}

const DAY_END_TICK = 5; // makeClock(6, 5) → day 1, tickOfDay 5 = day-end (and night)

/** Park the world at the day-end tick and hand it a controlled ledger. */
function atDayEnd(world: WorldState, flag: boolean, wants: Want[]): void {
    world.data.relationshipFallback = flag;
    world.data.clock = makeClock(6, DAY_END_TICK);
    world.data.wants = wants;
}

test('1) a want resolved today spawns a successor — and the ≤4-live budget still caps it', async () => {
    const world = narrativeWorld();
    const hero = world.idByName('柳安春')!;
    const capped = world.idByName('金鳳')!;

    atDayEnd(world, true, [
        // hero: 2 live + 1 resolved-today → successor expected (2 < 4)
        liveWant(hero, '想把新戲的生角撐起來'),
        liveWant(hero, '想與師姐把那段對唱走順'),
        resolvedTodayWant(hero, '想把那樁舊怨當面了結', DAY_END_TICK),
        // capped: already at the 4-live budget + 1 resolved-today → NO successor
        liveWant(capped, '想在堂子裡站穩腳'),
        liveWant(capped, '想把舊帳收回來'),
        liveWant(capped, '想替自己攢一筆傍身錢'),
        liveWant(capped, '想尋個能託付的人'),
        resolvedTodayWant(capped, '想把今晚的堂會唱圓滿', DAY_END_TICK),
    ]);

    const heroBefore = world.liveWantsOf(hero).length;
    const cappedBefore = world.liveWantsOf(capped).length;
    await runTick(world, deps(new InertDayAgent()), { log: () => {} });

    const heroAfter = world.liveWantsOf(hero);
    assert.equal(heroAfter.length, heroBefore + 1, 'a successor want is born for the resolver');
    assert.ok(
        heroAfter.some((wnt) => wnt.desc.startsWith('了了「') && wnt.source === 'owner' && wnt.kind === 'narrative'),
        `the successor carries the fake\'s milestone→successor desc; got: ${heroAfter.map((wnt) => wnt.desc).join(' / ')}`,
    );
    assert.equal(world.liveWantsOf(capped).length, cappedBefore, 'a character already at 4 live wants gets none (budget cap)');
});

test('2) a character left with NO live wants gets an ambient want — never flatlines', async () => {
    const world = narrativeWorld();
    const empty = world.idByName('柳安春')!;
    atDayEnd(world, true, []); // nobody carries a live want

    assert.equal(world.liveWantsOf(empty).length, 0, 'precondition: wantless');
    await runTick(world, deps(new InertDayAgent()), { log: () => {} });

    const after = world.liveWantsOf(empty);
    assert.equal(after.length, 1, 'a wantless character is handed exactly one ambient want');
    assert.ok(after[0].kind === 'narrative' && after[0].desc.includes('時候不等人'), `ambient want born; got: ${after[0].desc}`);
});

test('3) live wants and nothing resolved → NO spawn (no artificial floor)', async () => {
    const world = narrativeWorld();
    const settled = world.idByName('柳安春')!;
    atDayEnd(world, true, [
        liveWant(settled, '想把這一季的戲唱到底'),
        liveWant(settled, '想守著眼下這點安穩'),
    ]);

    const before = world.liveWantsOf(settled).length;
    await runTick(world, deps(new InertDayAgent()), { log: () => {} });
    assert.equal(world.liveWantsOf(settled).length, before, 'no pressure, nothing resolved → no want is forced');
});

test('4) relationshipFallback OFF → regeneration never runs (zero new wants)', async () => {
    const world = narrativeWorld();
    const hero = world.idByName('柳安春')!;
    atDayEnd(world, false, [
        liveWant(hero, '想把新戲的生角撐起來'),
        resolvedTodayWant(hero, '想把那樁舊怨當面了結', DAY_END_TICK), // would seed a successor if the block ran
    ]);

    const before = world.liveWantsOf(hero).length;
    await runTick(world, deps(new InertDayAgent()), { log: () => {} });
    const after = world.liveWantsOf(hero);
    assert.equal(after.length, before, 'the block is gated off → no successor is born');
    assert.ok(!after.some((wnt) => wnt.desc.startsWith('了了「')), 'no regeneration successor appears with the flag off');
});

test('5) backward-compat: regeneration adds only narrative wants; the economy frame still balances', async () => {
    // A day where every judged want resolves — guarantees the night regeneration fires
    // (a resolver with room gets a successor). It touches no money, so both runs still
    // settle identically; used for BOTH the flag-on and flag-off world so the economy
    // comparison stays apples-to-apples.
    class ResolveEverythingAgent extends FakeSceneAgent {
        override async judgeWantResolved(input: CharacterAgentNs.JudgeResolveInput): Promise<CharacterAgentNs.ResolveVerdict> {
            return { resolved: true, note: `${input.name}把「${input.wantDesc}」了結了` };
        }
    }
    function seasonWorld(flag: boolean): WorldState {
        const world = buildWorldState(loadPresetFile('spring-snow'));
        applySeasonFrame(world, buildAnchunAcceptanceFrame());
        world.data.relationshipFallback = flag;
        return world;
    }
    function balances(world: WorldState): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [id, acct] of Object.entries(world.data.economy!.state.accounts)) {
            out[world.castById(id)?.name ?? acct.label] = acct.available;
        }
        return out;
    }
    async function runDay(world: WorldState): Promise<void> {
        const runDeps = { agent: new ResolveEverythingAgent(), recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
        for (let i = 0; i < 6; i++) await runTick(world, runDeps, { log: () => {} }); // one full day incl. the night regen
    }

    const on = seasonWorld(true);
    const off = seasonWorld(false);
    await runDay(on);
    await runDay(off);

    // regeneration NEVER perturbs money: flag-on and flag-off worlds hold identical balances,
    assert.deepEqual(balances(on), balances(off), 'regeneration leaves the season ledger untouched');
    // and both audit clean.
    assert.deepEqual(auditSeasonEconomy(on), []);
    assert.deepEqual(auditSeasonEconomy(off), []);

    // the regeneration block DID run under the flag (owner-source wants appear only from it —
    // FakeSceneAgent's scene-rewrite never spawns), and every want it added is NARRATIVE.
    const regen = on.data.wants.filter((wnt) => wnt.source === 'owner');
    assert.ok(regen.length > 0, 'at least one nightly-regenerated want was born under the flag');
    assert.ok(regen.every((wnt) => wnt.kind === 'narrative'), 'regeneration only ever adds narrative wants, never economic ones');
    assert.equal(off.data.wants.filter((wnt) => wnt.source === 'owner').length, 0, 'flag off → no regenerated wants at all');
});
