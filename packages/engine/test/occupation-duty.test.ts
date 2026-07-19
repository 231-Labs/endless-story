/**
 * 行當專屬節律 (occupation-specific DUTY rhythm) — plumbing tests. Deterministic,
 * no LLM: they pin (1) the pure duty-aware rendering (dutyRhythm), (2) seed-time
 * resolution of a role's per-part duty into each character's `duties`, (3) the
 * tick swapping the on-post duty line into the move rhythm hint, and (4) graceful
 * seeding of an unknown scene + full backward compatibility when no frame (or a
 * frame with no occupationDuties) is applied. Whether a character actually stays
 * on-post is a behavioural property measured on a real LLM run, not here — this
 * only guarantees the hint the move prompt receives is correct.
 *
 * 歌女入夜唱堂會、記者深宵發稿、班主坐鎮後台妝閣.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock, makeClock } from '../src/adapters/local/clock.ts';
import { LocalEconomy } from '../src/adapters/local/local-economy.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { buildAnchunAcceptanceFrame } from './fixtures/anchun-acceptance-frame.ts';
import { applySeasonFrame, buildWorldState, loadPresetFile } from '../src/preset.ts';
import { dutyRhythm, livelihoodRhythm } from '../src/core/livelihood-rhythm.ts';
import { runTick } from '../src/tick.ts';
import { PARTS_OF_DAY } from '../src/ports.ts';
import type { ArchivePort, MoveDecideInput, MoveDecideResult } from '../src/ports.ts';
import type { WorldState } from '../src/world-state.ts';

const nullArchive: ArchivePort = { commit: async () => {} };

function deps(agent: FakeSceneAgent) {
    return { agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock(), economy: new LocalEconomy() };
}

function seasonWorld(): WorldState {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    applySeasonFrame(world, buildAnchunAcceptanceFrame());
    return world;
}

/** Captures the MoveDecideInput handed to each mover; never moves anyone. */
class MoveCapturingAgent extends FakeSceneAgent {
    moves: MoveDecideInput[] = [];
    override async decideMove(input: MoveDecideInput): Promise<MoveDecideResult> {
        this.moves.push(input);
        return { move: false, reason: 'capture: stay' };
    }
    hintFor(name: string): string | undefined {
        return this.moves.find((m) => m.name === name)?.rhythmHint;
    }
}

// ── 1) pure dutyRhythm ──────────────────────────────────────────────────────

test('dutyRhythm with a duty names the venue + note, framed as on-post 當值 (not a want)', () => {
    const line = dutyRhythm('入夜', { sceneName: '長三堂子花廳', note: '唱堂會、接局' }, '長三堂子花廳', '金鳳寓所');
    assert.ok(line, 'a duty yields a line');
    assert.ok(line!.includes('長三堂子花廳'), 'the line names the duty venue');
    assert.ok(line!.includes('唱堂會、接局'), 'the duty note rides along');
    assert.ok(line!.includes('當值') || line!.includes('當差'), 'framed as being on-post');
    assert.ok(line!.includes('不是想不想去'), 'framed as binding livelihood, not a want');
    assert.ok(line!.includes('入夜'), 'the line is anchored to the part-of-day');
    // it is NOT the generic night line (which would send her home instead)
    assert.notEqual(line, livelihoodRhythm('入夜', '長三堂子花廳', '金鳳寓所'));
});

test('a day duty and a night duty read differently', () => {
    const nightDuty = dutyRhythm('深宵', { sceneName: '報館茶室', note: '趕稿' }, '報館茶室', '報館閣樓')!;
    const dayDuty = dutyRhythm('日午', { sceneName: '後台妝閣', note: '坐鎮' }, '後台妝閣', '沈宅小樓')!;
    assert.notEqual(nightDuty, dayDuty, 'day vs night duty framing differ');
    assert.ok(nightDuty.includes('報館茶室') && nightDuty.includes('趕稿'));
    assert.ok(dayDuty.includes('後台妝閣') && dayDuty.includes('坐鎮'));
});

test('dutyRhythm without a duty is identical to livelihoodRhythm', () => {
    for (const part of PARTS_OF_DAY) {
        assert.equal(
            dutyRhythm(part, undefined, '練功房', '會樂里寓所'),
            livelihoodRhythm(part, '練功房', '會樂里寓所'),
            `${part} with no duty delegates unchanged`,
        );
    }
    // and with no anchors either
    assert.equal(dutyRhythm('深宵', undefined), livelihoodRhythm('深宵'));
    assert.equal(dutyRhythm('子夜', undefined, '練功房'), undefined, 'unknown label still returns undefined');
});

// ── 2) seed-time resolution ─────────────────────────────────────────────────

test('applySeasonFrame resolves each role\'s per-part duty onto its characters', () => {
    const world = seasonWorld();
    const scene = (name: string) => world.data.scenes.find((s) => s.name === name)!.id;

    const jinfeng = world.castById(world.idByName('金鳳')!)!; // 歌女
    assert.deepEqual(jinfeng.duties, [
        { part: '入夜', sceneId: scene('長三堂子花廳'), duty: true, note: '唱堂會、接局' },
    ]);

    const fang = world.castById(world.idByName('方競西')!)!; // 記者
    assert.deepEqual(fang.duties, [
        { part: '深宵', sceneId: scene('報館茶室'), duty: true, note: '趕稿、盯付梓' },
    ]);

    const shen = world.castById(world.idByName('沈雪笙')!)!; // 班主
    assert.equal(shen.duties?.length, 2, '班主 has a two-part duty schedule');
    assert.deepEqual(shen.duties?.map((d) => d.part), ['日午', '晡時']);
    assert.ok(shen.duties?.every((d) => d.sceneId === scene('後台妝閣') && d.duty), 'both at 後台妝閣, on duty');
    assert.equal(shen.duties?.[0].note, '坐鎮、理事、發落排戲');
    assert.equal(shen.duties?.[1].note, undefined, 'the 晡時 entry keeps its bare (note-less) shape');

    const su = world.castById(world.idByName('蘇映雪')!)!; // 花旦 — no duty schedule
    assert.equal(su.duties, undefined, 'a troupe actor keeps the generic work/home rhythm');
});

// ── 3) tick feeds the duty into the move rhythm hint ────────────────────────

test('runTick at 入夜 hands 金鳳 an on-post duty rhythm naming 長三堂子花廳', async () => {
    const world = seasonWorld();
    world.data.clock = makeClock(6, 4); // 入夜
    const agent = new MoveCapturingAgent();
    await runTick(world, deps(agent), { log: () => {} });

    const hint = agent.hintFor('金鳳');
    assert.ok(hint, '金鳳 received a rhythm hint this tick');
    assert.ok(hint!.includes('長三堂子花廳'), 'her 入夜 hint names her duty venue, not her home');
    assert.ok(hint!.includes('當值') || hint!.includes('當差'), 'on-post framing');
    assert.ok(hint!.includes('唱堂會、接局'), 'the duty note is carried into the prompt');
    assert.notEqual(hint, livelihoodRhythm('入夜', '長三堂子花廳', '金鳳寓所'), 'not the generic night line');
});

test('runTick at 日午 leaves a duty-less troupe actor on the generic work rhythm', async () => {
    const world = seasonWorld();
    world.data.clock = makeClock(6, 1); // 日午
    const agent = new MoveCapturingAgent();
    await runTick(world, deps(agent), { log: () => {} });

    const hint = agent.hintFor('蘇映雪');
    assert.equal(
        hint,
        livelihoodRhythm('日午', '雲錦台戲台', '二樓書寓'),
        '蘇映雪 (no duty) gets the unchanged generic 做活處 line at 日午',
    );
});

// ── 4) unknown scene seeds gracefully ───────────────────────────────────────

test('an unknown-scene duty entry seeds gracefully (no throw), simply absent from duties', () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    const frame = buildAnchunAcceptanceFrame();
    frame.occupationDuties = {
        '歌女': [
            { part: '入夜', sceneName: '長三堂子花廳', duty: true, note: '唱堂會' },
            { part: '深宵', sceneName: '子虛烏有的場子', duty: true, note: '這場不存在' },
        ],
    };
    assert.doesNotThrow(() => applySeasonFrame(world, frame));

    const jin = world.castById(world.idByName('金鳳')!)!;
    assert.equal(jin.duties?.length, 1, 'only the resolvable entry survives');
    assert.equal(jin.duties?.[0].part, '入夜');
    assert.ok(!jin.duties?.some((d) => d.part === '深宵'), 'the unknown-scene entry is dropped');
});

// ── 5) backward compatibility ───────────────────────────────────────────────

test('backward compat: no frame ⇒ no duties, and rhythm identical to before', () => {
    const world = buildWorldState(loadPresetFile('spring-snow'));
    for (const m of world.data.cast) {
        assert.equal(m.duties, undefined, `${m.name} has no duties before any frame`);
    }

    // a frame that carries no occupationDuties leaves every member's duties unset
    const frame = buildAnchunAcceptanceFrame();
    delete (frame as { occupationDuties?: unknown }).occupationDuties;
    applySeasonFrame(world, frame);
    for (const m of world.data.cast) {
        assert.equal(m.duties, undefined, `${m.name} still has no duties without occupationDuties`);
    }

    // and a no-duty member's rhythm is exactly the pre-change livelihoodRhythm
    const jin = world.castById(world.idByName('金鳳')!)!;
    const work = world.sceneNameById(world.data.workByChar[jin.id]);
    const home = world.sceneNameById(world.data.homeByChar[jin.id]);
    for (const part of PARTS_OF_DAY) {
        assert.equal(dutyRhythm(part, undefined, work, home), livelihoodRhythm(part, work, home));
    }
});
