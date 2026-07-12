/**
 * AGENT-SEASON · 金柳 16-BEAT REPLAY under the uncapped register (backstop 32).
 * ============================================================================
 * The original W5 day-4 後台小廂房 scene was a full-clothed 16-beat psychological
 * duel that hit the old cap mid-thread (「認我心裡有人？」 was the wall, not their
 * curtain). Replay: same pair, same room, same world facts (the 描眉 that day is
 * stated inside the original beats) — seed-established lovers, register open from
 * the first beat, close is the only exit. See where THEY drop the curtain.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/bed-probe-jinliu-replay.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { buildCast, venueByName, WORLD_PREMISE, type Char } from './world.ts';
import { restoreCast, type CastSnapshot } from './persistence.ts';

const RESTORE = '/Users/harperdelaviga/endless-story-new/internal/season-runs/real-28d-w4';

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
        carried: c.carried.length ? c.carried : undefined,
        ties,
    };
}

async function main(): Promise<void> {
    const cast = buildCast(['柳生春', '金鳳']);
    const statePath = path.join(RESTORE, 'cast-state.json');
    if (fs.existsSync(statePath)) {
        restoreCast(cast, JSON.parse(fs.readFileSync(statePath, 'utf-8')) as CastSnapshot);
    }
    const [liu, jin] = cast;
    const stake = '深宵，後台小廂房只剩你們二人，燈影半明。白日裡柳生春又替蘇映雪描了眉，這事金鳳知道。';

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    console.log('── 柳生春×金鳳 @ 後台小廂房（私・重放・無上限版）──\n');
    const loop = await runSceneLoop({
        sceneId: 'bed-replay-jinliu',
        sceneName: '後台小廂房',
        sceneHint: venueByName.get('後台小廂房')?.hint,
        isPrivate: true,
        emotionalStance: 'consummate',
        clock: '第4日·深宵',
        stake,
        etiquette: WORLD_PREMISE,
        cast: [member(liu, jin), member(jin, liu)],
        wants: [...liu.wants, ...jin.wants],
        tick: 23,
        agent,
    });
    for (const b of loop.beats) console.log(`> ${b.name}：${b.text}\n`);
    console.log(`（共 ${loop.beats.length} 拍 · 保險絲 32 · ${loop.beats.length < 32 ? '自選收場' : '撞保險絲'}）`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
