// Decoupled unit tests for the resource-contest model + skill derivation.
//
// Node-clean import graph: only ./contest.ts (→ ./saga-skills-core.ts), both pure
// (no SDK/chain/I-O), so this runs under `node --test --experimental-strip-types`
// with zero workspace deps.
//
//   node --test --experimental-strip-types packages/web/src/lib/chain/contest.test.ts
//   (or) pnpm --filter @endless-story/web test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSagaSkills } from './saga-skills-core.ts';
import {
    chooseContestWinner,
    computeAbility,
    resolveContestSpec,
    toContender,
    DEFAULT_CONTEST_SPECS,
    type Contender,
} from './contest.ts';

type Attrs = { appearance: number; constitution: number; acuity: number; disposition: number };
const ATTRS: Record<string, Attrs> = {
    蘇映雪: { appearance: 88, constitution: 62, acuity: 74, disposition: 80 },
    連翹: { appearance: 82, constitution: 86, acuity: 74, disposition: 76 },
    方競西: { appearance: 62, constitution: 56, acuity: 86, disposition: 72 },
};
const ROLE = { 蘇映雪: '花旦', 連翹: '刀馬旦', 方競西: '記者' } as const;

test('deriveSagaSkills: 行當 drives the 本工 (武旦 martial, 花旦 vocal/presence)', () => {
    const wu = deriveSagaSkills('刀馬旦', ATTRS.連翹);
    assert.ok(wu.martial >= 85 && wu.movement >= 85, `武旦 should be 武場/身段 high: ${JSON.stringify(wu)}`);
    assert.ok(wu.vocal < wu.martial, '武旦 vocal below martial');
    const hua = deriveSagaSkills('花旦', ATTRS.蘇映雪);
    assert.ok(hua.vocal >= 80 && hua.stage_presence >= 85, `花旦 should be 唱腔/台緣 high: ${JSON.stringify(hua)}`);
    assert.ok(hua.martial < 50, '花旦 martial low');
});

test('deriveSagaSkills: unknown 行當 → balanced, never skill-less', () => {
    const s = deriveSagaSkills('賬房先生', {});
    for (const k of Object.keys(s)) assert.ok(s[k as keyof typeof s] > 0, `${k} should be > 0`);
});

test('computeAbility: weighted 0..1, dominated by the spec axes', () => {
    const spec = DEFAULT_CONTEST_SPECS.recording; // vocal-heavy
    const su = computeAbility(ATTRS.蘇映雪, deriveSagaSkills(ROLE.蘇映雪, ATTRS.蘇映雪), spec);
    const wu = computeAbility(ATTRS.連翹, deriveSagaSkills(ROLE.連翹, ATTRS.連翹), spec);
    assert.ok(su > 0 && su <= 1 && wu > 0 && wu <= 1, 'bounded 0..1');
    assert.ok(su > wu, `花旦 out-sings 武旦 on recording: ${su} vs ${wu}`);
});

test('resolveContestSpec: default by kind, override wins field-wise, unknown → fallback', () => {
    assert.equal(resolveContestSpec('martial').skill.martial, 1.0);
    const ov = resolveContestSpec('recording', { abilityGate: 1.1 });
    assert.equal(ov.abilityGate, 1.1);
    assert.deepEqual(ov.skill, DEFAULT_CONTEST_SPECS.recording.skill, 'unspecified fields keep the default');
    const unknown = resolveContestSpec('zzz-未知');
    assert.ok(unknown.abilityGate > 0, 'unknown kind still yields a usable spec');
});

test('chooseContestWinner: low ability cannot win even at max intent — 想搶但搶不起', () => {
    // 方競西 (記者, can't sing) wants the recording badly; 蘇映雪 only mildly.
    // Genuinely low ability is a wall → 蘇映雪 wins despite far less desire.
    const spec = DEFAULT_CONTEST_SPECS.recording;
    const contenders: Contender[] = [
        toContender('方競西', 0.9, ROLE.方競西, ATTRS.方競西, spec),
        toContender('蘇映雪', 0.4, ROLE.蘇映雪, ATTRS.蘇映雪, spec),
    ];
    assert.equal(chooseContestWinner(contenders, spec.abilityGate), '蘇映雪');
});

test('chooseContestWinner: desire can overcome a MODERATE ability gap (能力夠但不想搶→可能旁落)', () => {
    // 連翹 is a competent (not best) singer but wants it far more than 蘇映雪 → she
    // can take it. The "best" doesn't win if they barely care — intended drama.
    const spec = DEFAULT_CONTEST_SPECS.recording;
    const contenders: Contender[] = [
        toContender('連翹', 0.9, ROLE.連翹, ATTRS.連翹, spec),
        toContender('蘇映雪', 0.3, ROLE.蘇映雪, ATTRS.蘇映雪, spec),
    ];
    assert.equal(chooseContestWinner(contenders, spec.abilityGate), '連翹');
});

test('chooseContestWinner: 臨危受命 — when NO ONE wants it, the ablest is thrust in', () => {
    const spec = DEFAULT_CONTEST_SPECS.recording;
    // both unwilling (intent 0) → the FLOOR lets the ablest (蘇映雪) be pressed in.
    const contenders: Contender[] = [
        toContender('蘇映雪', 0, ROLE.蘇映雪, ATTRS.蘇映雪, spec),
        toContender('方競西', 0, ROLE.方競西, ATTRS.方競西, spec),
    ];
    assert.equal(chooseContestWinner(contenders, spec.abilityGate), '蘇映雪');
});

test('chooseContestWinner: deterministic + tie-break by id; empty/zero → null', () => {
    const a: Contender[] = [
        { id: '0xb', intent: 0.5, ability: 0.5 },
        { id: '0xa', intent: 0.5, ability: 0.5 },
    ];
    assert.equal(chooseContestWinner(a, 2), '0xa'); // identical score → lexicographically-first id
    assert.equal(chooseContestWinner(a, 2), chooseContestWinner(a, 2)); // deterministic
    assert.equal(chooseContestWinner([{ id: 'x', intent: 0, ability: 0 }], 2), null); // no score → nothing moves
});

test('full pipeline: the right 行當 wins the right resource', () => {
    const cast: { id: string; role: string; attrs: typeof ATTRS.蘇映雪 }[] = [
        { id: '蘇映雪', role: '花旦', attrs: ATTRS.蘇映雪 },
        { id: '連翹', role: '刀馬旦', attrs: ATTRS.連翹 },
        { id: '方競西', role: '記者', attrs: ATTRS.方競西 },
    ];
    const winnerOf = (kind: string) => {
        const spec = resolveContestSpec(kind);
        const cs = cast.map((c) => toContender(c.id, 0.5, c.role, c.attrs, spec)); // equal intent → ability decides
        return chooseContestWinner(cs, spec.abilityGate);
    };
    assert.equal(winnerOf('recording'), '蘇映雪', '唱片 → 花旦');
    assert.equal(winnerOf('martial'), '連翹', '武戲 → 武旦');
    assert.equal(winnerOf('naming'), '方競西', '報紙 → 記者(文墨/交際)');
});
