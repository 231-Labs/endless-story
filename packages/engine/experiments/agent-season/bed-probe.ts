/**
 * AGENT-SEASON · BED-SCENE PROBE (decoupled, one scene only).
 * ============================================================================
 * Renders JUST the 深宵 established-lover 床戲 between 柳生春 × 金鳳, on the exact
 * post-reckoning setup the season produced: their 情-layer wants ALREADY SETTLED
 * (retired), the two of them alone in 柳's private room at night, emotionalStance
 * 'consummate'. Proves the intimacy-register fix (open the adult register + more
 * beats for an established-lover 床 even when the love-want is spent) end to end.
 *
 *   POE_API_KEY=… AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-4.6 \
 *   ./node_modules/.bin/tsx experiments/agent-season/bed-probe.ts
 */

import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { buildCast } from './world.ts';
import { WORLD_PREMISE } from './world.ts';

async function main() {
    const [liu, jin] = buildCast(['柳生春', '金鳳']);
    if (!liu || !jin) throw new Error('cast build failed');

    // Simulate the arc: the reckoning earlier that day SETTLED both 情 wants.
    for (const c of [liu, jin]) for (const w of c.wants) if (w.layer === '情') w.retired = true;

    const member = (c: typeof liu, other: typeof jin): SceneLoopCastMember => {
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
            ties,
        };
    };

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    console.log('── 深宵 · 後台小廂房（私）〔床〕 · 金鳳×柳生春（情帳已了，純餘身之情）──\n');
    const loop = await runSceneLoop({
        sceneId: 'bed-probe',
        sceneName: '後台小廂房',
        isPrivate: true,
        clock: '第2日·深宵',
        stake: '金鳳散了場沒回會樂里，偏來守在柳生春門口，這夜深了。',
        etiquette: WORLD_PREMISE,
        emotionalStance: 'consummate',
        cast: [member(jin, liu), member(liu, jin)],
        wants: [...jin.wants, ...liu.wants],
        tick: 11,
        agent,
    });

    for (const b of loop.beats) console.log(`> ${b.name}：${b.text}\n`);
    console.log(`\n（共 ${loop.beats.length} 拍 · 親密register ${loop.intimacyGateOpened ? '已開' : '未開'}）`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
