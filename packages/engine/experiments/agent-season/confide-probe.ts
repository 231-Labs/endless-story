/**
 * AGENT-SEASON · CONFIDE PROBE (傾吐心事 as an information medium) — decoupled.
 * ============================================================================
 * Mechanism under test: a character CHOOSES to unburden to another — a normal
 * multi-beat scene, but afterwards three things happen mechanically:
 *   ① TRANSFER: the listener remembers what was actually SAID ALOUD (beat text,
 *      the objective layer) — never the confider's inner/secret. Half-truths and
 *      deflections transfer as said. Anti-omniscience by construction.
 *   ② 自省: saying it out loud is a LANDING event — the confider's secret may
 *      move to its own next step (evolveSecret, same-heart rule).
 *   ③ PROPAGATION: the stored confidence lives in the listener's recall and
 *      surfaces in her later scenes like any memory (the gossip graph IS the
 *      memory system).
 *
 * PASS (mechanical): ≥4 beats with both speaking · stored text ⊆ said-aloud
 * content (no inner leak) · listener recall surfaces it on a related query ·
 * confider's secret evolves (non-null, differs from seed).
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/confide-probe.ts
 */

import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { LocalRecall } from '../../src/adapters/local/local-recall.ts';
import { buildCast, venueByName, WORLD_PREMISE, type Char } from './world.ts';

function member(c: Char, other: Char): SceneLoopCastMember {
    const ties: Record<string, string> = {};
    const v = c.relationshipViews.get(other.id);
    if (v) ties[other.id] = v;
    return {
        characterId: c.id,
        name: c.name,
        persona: c.persona,
        memories: c.thickMemories.slice().sort((a, b) => b.importance - a.importance).slice(0, 5).map((m) => m.text),
        innerSecret: c.secret,
        role: c.role,
        bodyFact: c.bodyFact,
        ties,
    };
}

async function main(): Promise<void> {
    const cast = buildCast(['蘇映雪', '連翹']);
    const [su, lian] = cast;
    const recall = new LocalRecall();

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    // The CHOICE is simulated (the probe tests the interaction + the plumbing,
    // not the chooser): 蘇 sought 連翹 out at night with something pressing.
    // World facts only — how much she actually says is hers.
    const stake =
        '入夜，後台妝閣只你們二人。蘇映雪是自己尋過來的——她心裡壓著一樁多年的事，今晚想對人說一說。說多少、怎麼說、說不說得出口，都由她。';

    console.log('── 傾吐探針：蘇映雪 → 連翹 @ 後台妝閣（私）──\n');
    const loop = await runSceneLoop({
        sceneId: 'confide-probe',
        sceneName: '後台妝閣',
        sceneHint: venueByName.get('後台妝閣')?.hint,
        isPrivate: true,
        clock: '第3日·入夜',
        stake,
        etiquette: WORLD_PREMISE,
        cast: [member(su, lian), member(lian, su)],
        wants: [...su.wants, ...lian.wants],
        tick: 16,
        agent,
    });
    for (const b of loop.beats) console.log(`> ${b.name}：${b.text}\n`);

    // ① TRANSFER — only what 蘇 actually said aloud (beat text, objective layer).
    const saidAloud = loop.beats.filter((b) => b.characterId === su.id).map((b) => b.text);
    const confidence = `第3日入夜，蘇映雪在後台妝閣找我說了心裡話：${saidAloud.join(' ')}`.slice(0, 600);
    await recall.remember(lian.id, confidence, { kind: 'observation', importance: 7, day: 3 });

    // ② 自省 — saying it out loud is a landing event for the CONFIDER.
    const evolved = await agent.evolveSecret({
        name: su.name,
        persona: su.persona,
        secret: su.secret,
        landed: [`今夜我把心裡的事對連翹說出了口——我親口說的是：${saidAloud.join(' ').slice(0, 400)}`],
        day: 3,
    });

    // ③ PROPAGATION — the listener's later scenes surface it like any memory.
    const surfaced = await recall.recall(lian.id, '蘇映雪 柳生春 心事 師姐', 3, 4);

    // ── mechanical verdicts ──
    const bothSpoke = new Set(loop.beats.map((b) => b.characterId)).size === 2;
    const innerLeak = loop.beats
        .filter((b) => b.characterId === su.id)
        .map((b) => b.inner)
        .filter(Boolean)
        .some((inner) => confidence.includes(inner!));
    console.log('── 驗收 ──');
    console.log(`拍數 ≥4 且雙方都說話: ${loop.beats.length >= 4 && bothSpoke ? 'PASS' : 'FAIL'} (${loop.beats.length} 拍)`);
    console.log(`傳遞只含說出口的（inner 不外洩）: ${innerLeak ? 'FAIL' : 'PASS'}`);
    console.log(`聽者召回浮出: ${surfaced.some((m) => m.text.includes('蘇映雪')) ? 'PASS' : 'FAIL'}`);
    console.log(`傾吐者心事自改: ${evolved && evolved !== su.secret ? 'PASS' : 'FAIL'}`);
    console.log(`\n【存進連翹記憶的】\n${confidence}`);
    console.log(`\n【蘇映雪的心事·原】\n${su.secret}`);
    console.log(`\n【蘇映雪的心事·說出口之後】\n${evolved ?? '（未變）'}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
