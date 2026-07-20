/**
 * Character-SKILL framework — the style-imparting capability layer. Deterministic
 * PLUMBING tests (no LLM):
 *   1. skillStyleHint gathers only matching-kind skills, orders by level desc,
 *      caps at 3, joins with the expected format, and returns undefined when
 *      nothing matches / skills is undefined;
 *   2. beat threading — a SceneLoopCastMember's styleHint reaches the ActBeatInput
 *      built by runSceneLoop, and the tick's skill→hint wiring lands in a real beat;
 *   3. backward-compat — a cast member with no skills crashes nothing, threads no
 *      styleHint, and leaves the beat prompt exactly as before;
 *   4. preset carry-through — buildWorldState carries authored founding_cast skills
 *      onto the CastMember (and the spring-snow canon carries them).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CONDUCT_KINDS, STAGE_KINDS, isStageScene, skillStyleHint } from '../src/core/skills.ts';
import { runSceneLoop, type SceneAgent, type SceneLoopCastMember } from '../src/core/scene-loop.ts';
import { buildWorldState, loadPresetFile, type RawPreset } from '../src/preset.ts';
import { WorldState, type Skill, type WorldStateData } from '../src/world-state.ts';
import { runTick } from '../src/tick.ts';
import { FakeSceneAgent } from '../src/adapters/local/fake-scene-agent.ts';
import { LocalClock } from '../src/adapters/local/clock.ts';
import { LocalRecall } from '../src/adapters/local/local-recall.ts';
import { makeClock } from '../src/adapters/local/clock.ts';
import { buildBeatSystemPrompt } from '@endless-story/runner/services/character-agent/beat-prompt';
import type { ArchivePort } from '../src/ports.ts';
import type { characterAgent as CharacterAgentNs } from '@endless-story/runner';

// ── 1) the pure gather fn ────────────────────────────────────────────────────

test('1) skillStyleHint gathers matching kinds, orders by level desc, caps at 3, formats', () => {
    const skills: Skill[] = [
        { name: 'A', kind: '談', style: 'a', level: 2 },
        { name: 'B', kind: '風', style: 'b', level: 5 },
        { name: 'C', kind: '談', style: 'c', level: 4 },
        { name: 'D', kind: '風', style: 'd', level: 3 },
        { name: 'E', kind: '唱', style: 'e', level: 5 }, // non-conduct: excluded
    ];
    // matched B(5) C(4) D(3) A(2); cap 3 keeps B/C/D; E filtered out.
    assert.equal(
        skillStyleHint(skills, [...CONDUCT_KINDS]),
        '〔技藝〕B·b；C·c；D·d',
        'only conduct kinds, level desc, capped at 3, name·style joined by ；with the 〔技藝〕prefix',
    );

    // A leveled skill outranks an unleveled one (missing level = 0); ties keep
    // authored order (stable).
    const mixed: Skill[] = [
        { name: '無級', kind: '談', style: 'x' },
        { name: '有級', kind: '風', style: 'y', level: 1 },
        { name: '同級甲', kind: '談', style: 'p', level: 3 },
        { name: '同級乙', kind: '風', style: 'q', level: 3 },
    ];
    assert.equal(
        skillStyleHint(mixed, [...CONDUCT_KINDS]),
        '〔技藝〕同級甲·p；同級乙·q；有級·y',
        'level desc with stable tie-break (authored order), unleveled sinks last',
    );

    // returns undefined when nothing matches / skills is undefined / empty.
    assert.equal(skillStyleHint([{ name: 'E', kind: '唱', style: 'e', level: 5 }], [...CONDUCT_KINDS]), undefined, 'no conduct-kind match ⇒ undefined');
    assert.equal(skillStyleHint(undefined, [...CONDUCT_KINDS]), undefined, 'undefined skills ⇒ undefined');
    assert.equal(skillStyleHint([], [...CONDUCT_KINDS]), undefined, 'empty skills ⇒ undefined');

    // a single conduct skill renders without a separator.
    assert.equal(
        skillStyleHint([{ name: '圓場話', kind: '談', style: '能把僵局說軟', level: 4 }], [...CONDUCT_KINDS]),
        '〔技藝〕圓場話·能把僵局說軟',
    );
});

// ── 2) beat threading (scene-loop + tick wiring) ─────────────────────────────

/** A minimal SceneAgent that captures every ActBeatInput and closes each beat. */
function captureLoopAgent(): { agent: SceneAgent; inputs: CharacterAgentNs.ActBeatInput[] } {
    const inputs: CharacterAgentNs.ActBeatInput[] = [];
    const agent: SceneAgent = {
        actBeat: async (input) => {
            inputs.push(input);
            return { beat: '（略）', inner: '' };
        },
        judgeWantResolved: async () => ({ resolved: false }),
    };
    return { agent, inputs };
}

async function soloStyleHint(styleHint: string | undefined): Promise<CharacterAgentNs.ActBeatInput> {
    const { agent, inputs } = captureLoopAgent();
    const cast: SceneLoopCastMember[] = [{ characterId: 'c0', name: '柳安春', persona: '小生', styleHint }];
    await runSceneLoop({ sceneId: 's0', sceneName: '妝閣', isPrivate: true, clock: '入夜', cast, wants: [], tick: 0, agent });
    assert.equal(inputs.length, 1, 'a solo scene runs exactly one beat');
    return inputs[0];
}

test('2a) runSceneLoop threads a member styleHint onto the ActBeatInput (and undefined stays undefined)', async () => {
    const hint = skillStyleHint(
        [
            { name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 }, // role-craft, excluded
            { name: '清冷自持', kind: '風', style: '不追誰也不推開誰', level: 4 },
        ],
        [...CONDUCT_KINDS],
    );
    assert.ok(hint && hint.includes('清冷自持') && !hint.includes('悲工'), 'the conduct hint carries only the 風 skill');
    const withHint = await soloStyleHint(hint);
    assert.equal(withHint.styleHint, hint, 'the ActBeatInput carries the member styleHint verbatim');

    // A member whose only skills are role-craft (no conduct kind) ⇒ no hint.
    const noConduct = skillStyleHint([{ name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 }], [...CONDUCT_KINDS]);
    const without = await soloStyleHint(noConduct);
    assert.equal(without.styleHint, undefined, 'no conduct skill ⇒ ActBeatInput.styleHint undefined');
});

const nullArchive: ArchivePort = { commit: async () => {} };
const deps = (agent: FakeSceneAgent) => ({ agent, recall: new LocalRecall(), archive: nullArchive, clock: new LocalClock() });

/** Captures every actBeat input, closing each scene after one beat (fast). */
class RecordingAgent extends FakeSceneAgent {
    beatInputs: CharacterAgentNs.ActBeatInput[] = [];
    override async actBeat(input: CharacterAgentNs.ActBeatInput): Promise<CharacterAgentNs.BeatResult> {
        this.beatInputs.push(input);
        const r = await super.actBeat(input);
        return { ...r, close: true };
    }
}

/** Two co-located cast members in a private room at night; c0 "arrived" this tick
 *  (deliberate encounter) so the scene plays. `skills` shapes each member. */
function nightWorld(c0Skills?: Skill[], c1Skills?: Skill[]): WorldState {
    const data: WorldStateData = {
        sagaId: 'skills',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '甲', persona: '甲', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...(c0Skills ? { skills: c0Skills } : {}) },
            { id: 'c1', name: '乙', persona: '乙', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, ...(c1Skills ? { skills: c1Skills } : {}) },
        ],
        scenes: [
            { id: 's0', name: '前台', privacyLevel: 1 },
            { id: 's1', name: '小樓', privacyLevel: 3 },
        ],
        roster: { c0: 's1', c1: 's1' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        lastMovedTickByChar: { c0: 4 }, // arrived this tick ⇒ deliberate encounter
        wants: [],
        edges: {},
        clock: makeClock(6, 4), // 入夜
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState(data);
}

test('2b) the tick folds a member’s conduct skills into the styleHint that reaches the beat', async () => {
    const skills: Skill[] = [
        { name: '調度', kind: '談', style: '三言兩語排定去留戲碼', level: 5 },
        { name: '鎮得住場', kind: '風', style: '不動聲色便壓得住滿堂', level: 5 },
        { name: '舊日小生', kind: '唱', style: '一開口仍是當年那口英氣', level: 3 }, // craft, excluded
    ];
    const world = nightWorld(skills);
    const agent = new RecordingAgent();
    await runTick(world, deps(agent), { log: () => {} });

    const opener = agent.beatInputs.find((i) => i.characterId === 'c0');
    assert.ok(opener, 'the skilled member acted');
    const expected = skillStyleHint(skills, [...CONDUCT_KINDS]);
    assert.equal(opener!.styleHint, expected, 'the beat input carries the tick-computed conduct styleHint');
    assert.ok(opener!.styleHint?.includes('調度') && opener!.styleHint?.includes('鎮得住場'), 'both conduct skills present');
    assert.ok(!opener!.styleHint?.includes('舊日小生'), 'the 唱 role-craft skill is excluded from conduct');
});

// ── 2c) hang point #2 — stage craft colours on-stage beats ───────────────────

test('isStageScene detects the boards and nothing else', () => {
    for (const n of ['雲錦台戲台', '雲錦台戲臺', '舞台', '舞臺', '台上', '登台開鑼']) {
        assert.ok(isStageScene(n), `${n} reads as a stage`);
    }
    for (const n of ['小樓', '金鳳寓所', '戲園前街', '後台妝閣', '會樂里觀音堂', undefined]) {
        assert.ok(!isStageScene(n), `${n} is off-stage`);
    }
});

test('skillStyleHint with the stage kind-set folds in the 唱/身 craft that conduct excludes', () => {
    const skills: Skill[] = [
        { name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 },
        { name: '文戲', kind: '身', style: '身段清儒俊雅', level: 5 },
        { name: '清冷自持', kind: '風', style: '笑得像什麼都不往心裡去', level: 4 },
    ];
    // conduct only ⇒ just the 風 bearing skill.
    assert.equal(skillStyleHint(skills, [...CONDUCT_KINDS]), '〔技藝〕清冷自持·笑得像什麼都不往心裡去');
    // on the boards ⇒ the two level-5 craft skills lead, bearing trails (cap 3).
    const onStage = skillStyleHint(skills, [...CONDUCT_KINDS, ...STAGE_KINDS]);
    assert.ok(onStage?.includes('悲工') && onStage?.includes('文戲'), 'stage craft (唱/身) present on the boards');
});

/** Two performers on a public stage by day — the scene plays without night rules. */
function stageWorld(c0Skills: Skill[]): WorldState {
    const data: WorldStateData = {
        sagaId: 'skills-stage',
        sagaPremise: '一個戲班',
        cast: [
            { id: 'c0', name: '柳安春', persona: '小生', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {}, skills: c0Skills },
            { id: 'c1', name: '蘇映雪', persona: '花旦', state: { fatigue: 0, hunger: 0, mood: 0 }, coreIdentity: [], relationshipView: {} },
        ],
        scenes: [
            { id: 's0', name: '雲錦台戲台', privacyLevel: 0 },
            { id: 's1', name: '小樓', privacyLevel: 3 },
        ],
        roster: { c0: 's0', c1: 's0' },
        homeByChar: { c0: 's1', c1: 's1' },
        workByChar: { c0: 's0', c1: 's0' },
        wants: [],
        edges: {},
        clock: makeClock(6, 2), // 日午 — a daytime performance scene plays
        dayAccum: { lines: [], actorIds: [], sceneIds: [], povByName: {} },
        contestedResources: [],
        objects: [],
    };
    return new WorldState(data);
}

test('2c) on a stage scene the tick folds the performer’s 唱/身 craft into the styleHint', async () => {
    const skills: Skill[] = [
        { name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 },
        { name: '文戲', kind: '身', style: '身段清儒俊雅', level: 5 },
        { name: '清冷自持', kind: '風', style: '笑得像什麼都不往心裡去', level: 4 },
    ];
    const world = stageWorld(skills);
    const agent = new RecordingAgent();
    await runTick(world, deps(agent), { log: () => {} });

    const liu = agent.beatInputs.find((i) => i.characterId === 'c0');
    assert.ok(liu, 'the performer acted on the boards');
    assert.ok(liu!.styleHint?.includes('悲工') && liu!.styleHint?.includes('文戲'), 'stage craft reaches the on-stage beat');
});

// ── 3) backward-compat ───────────────────────────────────────────────────────

test('3) a cast member with no skills threads no styleHint and leaves the beat prompt unchanged', async () => {
    const world = nightWorld(undefined, undefined); // neither member carries skills
    const agent = new RecordingAgent();
    await runTick(world, deps(agent), { log: () => {} });
    assert.ok(agent.beatInputs.length > 0, 'the scene still played (no crash)');
    assert.ok(agent.beatInputs.every((i) => i.styleHint === undefined), 'every beat input has an undefined styleHint');

    // The prompt builder omits the 技藝 block without a styleHint, and adds exactly
    // one block with it — the injection is purely additive.
    const base: CharacterAgentNs.ActBeatInput = {
        name: '甲', persona: '一個人', clock: '入夜', sceneName: '妝閣', isPrivate: true,
        others: [], want: { desc: '把這場走完' }, forcing: 'idle', privateAlone: false, sceneLog: '',
    };
    assert.doesNotMatch(buildBeatSystemPrompt(base), /看家本事/, 'no styleHint ⇒ no 技藝 block');
    const withHint = buildBeatSystemPrompt({ ...base, styleHint: '〔技藝〕圓場話·能把僵局說軟' });
    assert.match(withHint, /看家本事/, 'a styleHint injects the 技藝 block');
    assert.match(withHint, /〔技藝〕圓場話·能把僵局說軟/, 'the block renders the hint verbatim');
    assert.match(withHint, /別報菜名|不要照唸/, 'the block stays advisory (colour, not a menu to recite)');
});

// ── 4) preset carry-through ──────────────────────────────────────────────────

test('4) buildWorldState carries authored founding_cast skills onto the CastMember', () => {
    const raw: RawPreset = {
        id: 'skills-test',
        scenes: [{ name: '台' }],
        founding_cast: [
            { name: '甲', description: '甲', work_scene: '台', home_scene: '台', skills: [{ name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 }] },
            { name: '乙', description: '乙', work_scene: '台', home_scene: '台' }, // no skills
        ],
    };
    const world = buildWorldState(raw);
    assert.deepEqual(
        world.castById('c0')!.skills,
        [{ name: '悲工', kind: '唱', style: '悲切以情帶聲', level: 5 }],
        'authored skills carried verbatim onto the CastMember',
    );
    assert.equal(world.castById('c1')!.skills, undefined, 'a skill-less member carries no skills field (backward-compat)');
});

test('4b) the spring-snow canon carries conduct skills — every founding cast member has one', () => {
    const raw = loadPresetFile('spring-snow');
    const world = buildWorldState(raw);
    // 柳安春 carries her authored 悲工 (a 唱 craft) + a conduct 風.
    const anchun = world.castById(world.idByName('柳安春')!)!;
    assert.ok(anchun.skills?.some((s) => s.name === '悲工' && s.kind === '唱'), '柳安春 carries 唱·悲工');
    assert.ok(skillStyleHint(anchun.skills, [...CONDUCT_KINDS]), '柳安春 has a conduct skill ⇒ a beat styleHint');
    // Every founding cast member has at least one conduct skill so beats visibly differ.
    for (const member of world.data.cast) {
        assert.ok(member.skills && member.skills.length >= 2, `${member.name} carries authored skills`);
        assert.ok(skillStyleHint(member.skills, [...CONDUCT_KINDS]), `${member.name} has a conduct/風 skill`);
    }
});
