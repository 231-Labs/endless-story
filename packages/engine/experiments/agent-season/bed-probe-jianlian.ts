/**
 * AGENT-SEASON · 江連 BED-SCENE REPLAY (decoupled, ceiling version).
 * ============================================================================
 * The original W5 scene negotiated its register MID-scene and got cut at the
 * old 5-beat private default (permission without time — since fixed: a
 * mid-scene accept now opens the cap to the ceiling). This probe replays the
 * same night under the fix: same pair, same 大通鋪, the 白蠟桿 challenge as
 * the situation — the advance/accept is NOT scripted (they renegotiate), and
 * the ENDING is theirs (close beat), up to the 16-beat ceiling.
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local \
 *     experiments/agent-season/bed-probe-jianlian.ts
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
    const cast = buildCast(['江聞鶴', '連翹']);
    const statePath = path.join(RESTORE, 'cast-state.json');
    if (fs.existsSync(statePath)) {
        restoreCast(cast, JSON.parse(fs.readFileSync(statePath, 'utf-8')) as CastSnapshot);
    }
    const [jiang, lian] = cast;
    // Faithful reconstruction of their W5 day-2 night state: the two 練功房
    // bouts that actually preceded the original scene go in as memories, and
    // their W5-regenerated wants replace the W4 ledger. The overture is still
    // NOT scripted — only what had already happened.
    jiang.thickMemories.push(
        { text: '練功房裡她腳尖一挑把白蠟桿挑入掌中，桿尖直指我胸前三寸。我逼她收勢迴旋，她咬牙迸一句「不往死裡戳，怎麼站得穩」。', importance: 0.9, tag: '真勁·連' },
        { text: '頭一日我搭她的腕走生旦對陣的位，她七步半到台心步子穩得沒一絲晃。我說她煞氣太直，少了個迴旋，我幫她補。', importance: 0.85, tag: '對陣·連' },
    );
    lian.thickMemories.push(
        { text: '練功房裡江老闆亮起勢問我敢不敢實打實接他幾手真勁，說借我的直步砸他老骨血的火候。桿尾反撩他腰側那下，他眼裡是認的。', importance: 0.9, tag: '真勁·江' },
        { text: '他說我煞氣太直缺個迴旋，他幫我補。這班子裡頭一個拿真勁跟我說話的人。', importance: 0.85, tag: '迴旋·江' },
    );
    const { newWant } = await import('../../src/core/want-core.ts');
    jiang.wants = [
        newWant({ id: 'w5-jiang', characterId: jiang.id, layer: '身體', desc: '這蠻勁砸穿了，就怕日子不等人再砸一回。', target: lian.name, weight: 0.85, sat: 0.1, resistance: 0.45, kind: 'narrative', source: 'aftermath', bornTick: 8 }),
    ];
    lian.wants = [
        newWant({ id: 'w5-lian', characterId: lian.id, layer: '志向', desc: '碾響空板不夠，我還要這滿場替我這身硬骨頭叫好。', weight: 0.85, sat: 0.1, resistance: 0.45, kind: 'narrative', source: 'aftermath', bornTick: 8 }),
    ];
    const stake =
        '入夜，大通鋪只剩你們二人——旁人都歇往別處了。今日練功房那幾手真勁還沒過完癮，那根白蠟桿就擱在鋪邊。';

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    console.log('── 江聞鶴×連翹 @ 戲班大通鋪（私・重放・天花板版）──\n');
    const loop = await runSceneLoop({
        sceneId: 'bed-replay-jianlian',
        sceneName: '戲班大通鋪',
        sceneHint: venueByName.get('戲班大通鋪')?.hint,
        isPrivate: true,
        clock: '第2日·深宵',
        stake,
        etiquette: WORLD_PREMISE,
        cast: [member(jiang, lian), member(lian, jiang)],
        wants: [...jiang.wants, ...lian.wants],
        tick: 11,
        agent,
    });
    for (const b of loop.beats) console.log(`> ${b.name}：${b.text}\n`);
    console.log(
        `（共 ${loop.beats.length} 拍 · 遞意接意=${loop.intimacyAccepted ? '成' : '未成'} · register ${loop.intimacyGateOpened ? '開' : '未開'}）`,
    );
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
