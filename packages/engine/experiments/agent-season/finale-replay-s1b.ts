/**
 * AGENT-SEASON · S1b FINALE REPLAY — the 大會串 that died at 1 beat.
 * ============================================================================
 * Root cause fixed (a wantless actor now acts on presence); this replays the
 * premiere with the season-end restored state: 蘇映雪 carries her evolved
 * secret (the 連翹 pact, the re-routed third sleeve), 柳安春 carries hers.
 * 10 beats, full house. Watch whether the sleeve betrays anything on stage.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/finale-replay-s1b.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { buildCast, venueByName, WORLD_PREMISE, type Char } from './world.ts';
import { restoreCast, type CastSnapshot } from './persistence.ts';

const RESTORE = '/Users/harperdelaviga/endless-story-new/internal/season-runs/real-s1b';

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
    const cast = buildCast(['柳安春', '蘇映雪']);
    const snap = JSON.parse(fs.readFileSync(path.join(RESTORE, 'cast-state.json'), 'utf-8')) as CastSnapshot;
    restoreCast(cast, snap);
    const [liu, su] = cast;

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    console.log('── 大會串重放：《牡丹亭·驚夢》柳安春×蘇映雪 @ 雲錦台戲台（滿座）──\n');
    const loop = await runSceneLoop({
        sceneId: 'finale-replay-s1b',
        sceneName: '雲錦台戲台',
        sceneHint: venueByName.get('雲錦台戲台')?.hint,
        isPrivate: false,
        clock: '第7日·入夜',
        stake:
            '年底大會串開鑼——春雪社重啟戲箱後的頭一齣《牡丹亭·驚夢》，柳安春的柳夢梅對蘇映雪的杜麗娘。台下滿座，報館的、同行的、恩客們都來了，一季的積怨與情分全坐在台下看著。這一場定春雪社的名。',
        etiquette: WORLD_PREMISE,
        cast: [member(liu, su), member(su, liu)],
        wants: [...liu.wants, ...su.wants],
        tick: 41,
        maxTurns: 10,
        agent,
    });
    for (const b of loop.beats) console.log(`> ${b.name}：${b.text}\n〔心〕${b.inner}\n`);
    console.log(`（共 ${loop.beats.length} 拍 · ${loop.endReason === 'close' ? `${loop.closedBy} 收的場` : loop.endReason}）`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
