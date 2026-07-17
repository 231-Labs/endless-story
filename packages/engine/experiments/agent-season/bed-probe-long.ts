/**
 * BED-PROBE (long, parametric) — one 床戲 with the cap lifted, printed as raw beats +
 * woven 章回. Compare pairings (memory/personality) and models.
 *   BED_A=柳安春 BED_B=金鳳 BED_CAP=24 [BED_FORCE=1] POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   AI_PROVIDER=poe POE_API_KEY=… OPENAI_API_KEY=… \
 *   ./node_modules/.bin/tsx experiments/agent-season/bed-probe-long.ts
 * BED_FORCE=1 forces the consummate register even for a NON-established pair (so a
 * forbidden pairing like 柳×蘇 can be probed — in production it would stay restrained).
 */
import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { buildCast, WORLD_PREMISE, areEstablishedLovers, type Char } from './world.ts';

const CAP = Number(process.env.BED_CAP ?? '24');
const A_ID = process.env.BED_A ?? '柳安春';
const B_ID = process.env.BED_B ?? '金鳳';
const FORCE = process.env.BED_FORCE === '1';

async function main() {
    const cast = buildCast([A_ID, B_ID]);
    const a = cast.find((c) => c.id === A_ID)!;
    const b = cast.find((c) => c.id === B_ID)!;
    const established = areEstablishedLovers(a, b);
    const consummate = established || FORCE;
    const venue = '後台小廂房';

    const member = (c: Char, other: Char): SceneLoopCastMember => ({
        characterId: c.id, name: c.name, persona: c.persona,
        memories: c.thickMemories.slice().sort((x, y) => y.importance - x.importance).slice(0, 5).map((m) => m.text),
        innerSecret: c.secret, role: c.role, bodyFact: c.bodyFact,
        ties: { [other.id]: c.relationshipViews.get(other.id) ?? '' },
    });

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();

    console.log(`── ${a.name} × ${b.name} · 上限 ${CAP} 拍 · model=${process.env.POE_MODEL_PRIMARY} · established=${established}${FORCE ? ' (FORCED consummate)' : ''} ──\n`);
    const loop = await runSceneLoop({
        sceneId: 'bed-long',
        sceneName: venue,
        isPrivate: true,
        clock: '第1日·深宵',
        stake: `深宵，${b.name}到了${a.name}歇著的地方，只他二人。`,
        etiquette: WORLD_PREMISE,
        emotionalStance: consummate ? 'consummate' : undefined,
        cast: [member(a, b), member(b, a)],
        wants: [...a.wants, ...b.wants],
        tick: 5,
        maxTurns: CAP,
        agent,
    });

    console.log(`【raw beats】共 ${loop.beats.length} 拍：\n`);
    loop.beats.forEach((bt, i) => {
        console.log(`${String(i + 1).padStart(2)}. ${bt.name}：${bt.text}`);
        if (bt.inner) console.log(`    〔心〕${bt.inner}`);
    });

    let reviewed = loop.beats;
    try {
        const r = await agent.reviewScene({
            worldPremise: WORLD_PREMISE,
            participants: [
                { name: a.name, bodyFact: a.bodyFact, role: a.role, relationship: a.relationshipViews.get(b.id) },
                { name: b.name, bodyFact: b.bodyFact, role: b.role, relationship: b.relationshipViews.get(a.id) },
            ],
            beats: loop.beats.map((bt) => ({ name: bt.name, text: bt.text, inner: bt.inner })),
        });
        if (r && Array.isArray(r.beats) && r.beats.length === loop.beats.length) reviewed = r.beats as typeof loop.beats;
    } catch (e) {
        console.log('\n[reviewScene skipped]', String(e).slice(0, 120));
    }

    const lines = reviewed.map((bt) => `[${venue}] ${bt.name}：${bt.text}`);
    const chapter = await agent.weaveTickChapter({ clock: '第1日·深宵', lines });
    console.log(`\n\n════════ 織成一章(說書人版) ════════\n`);
    console.log(chapter ?? '（織回失敗）');
}

main().catch((e) => { console.error(e); process.exit(1); });
