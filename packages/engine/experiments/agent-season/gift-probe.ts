/**
 * AGENT-SEASON · GIFT-AND-SEE PROBE (行頭/隨身物, decoupled, two scenes).
 * ============================================================================
 * The dress-up mechanic under the non-control axiom: an owner GIFTS an item;
 * it enters the character's 隨身 (carried, with provenance); whether/when it
 * ever comes out in a scene is the CHARACTER's choice. This probe validates
 * the whole chain before any gifting mechanism is wired:
 *
 *   Scene A (resonant): 白韻秋×柳安春 at 包廂茶座 — the GIVER is present and
 *     her want aims at 柳. Does the fan surface organically (acknowledged,
 *     used, or pointedly kept sleeved — all are wins; a win is the item
 *     MATTERING, not appearing)?
 *   Scene B (control): 江聞鶴×柳安春 練功房對戲 — a rivalry scene where the
 *     fan is off-topic. It must NOT be forced in every beat (「不對景就讓它
 *     待在袖底」 discipline); a natural prop use is fine.
 *
 * Mechanical counters: fan mentions per scene (want A ≥ 1; B sparse), zero
 * invented gifts, anti-teleport intact. Qualitative: does HER choice about the
 * fan read as characterization (the gift-and-see product moment)?
 *
 *   AI_PROVIDER=poe POE_MODEL_PRIMARY=GLM-5.1-FW \
 *   pnpm exec tsx --env-file-if-exists=../web/.env.local experiments/agent-season/gift-probe.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runSceneLoop, type SceneLoopCastMember } from '../../src/index.ts';
import { buildCast, venueByName, WORLD_PREMISE, type Char } from './world.ts';

const FAN = '白韻秋所贈的湘妃竹摺扇（扇骨上刻著一枝白梅，是頂講究的東西）';

function member(c: Char, others: Char[]): SceneLoopCastMember {
    const ties: Record<string, string> = {};
    for (const o of others) {
        const v = c.relationshipViews.get(o.id);
        if (v) ties[o.id] = v;
    }
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
    const [liu, bai, jiang, shen] = buildCast(['柳安春', '白韻秋', '江聞鶴', '沈雪笙']);
    // The gift happened yesterday: it sits in 柳's 隨身 + she remembers receiving it.
    liu.carried.push({ desc: FAN, from: '白韻秋' });
    liu.thickMemories.push({
        tag: '贈禮',
        importance: 6,
        text: '昨日白韻秋差人送來一柄湘妃竹摺扇，扇骨刻著白梅。這樣的東西收是收了，怎麼用、用不用，我還沒想好。',
    });

    const { RunnerSceneAgent } = await import('../../src/adapters/runner-scene-agent.ts');
    const agent = new RunnerSceneAgent();
    const md: string[] = ['# Gift-and-see probe — 一柄贈扇，兩場戲', '', `> 隨身物：${FAN}`, ''];

    const scenes: Array<{ label: string; venue: string; cast: [Char, Char]; stake: string; clock: string }> = [
        {
            label: 'A（共振場）：贈扇人在場',
            venue: '包廂茶座',
            cast: [bai, liu],
            stake: '白韻秋在包廂茶座設了茶，請柳安春散了工過來坐坐。',
            clock: '第3日·黃昏',
        },
        {
            label: 'C（強對照場）：對帳事務戲，扇全然無關',
            venue: '後台妝閣',
            cast: [shen, liu],
            stake: '沈雪笙把柳安春喚到妝閣，對這個月的戲份帳，順道問問她嗓子近來吃不吃得消。',
            clock: '第5日·晡時',
        },
        {
            label: 'B（對照場）：較勁戲，扇不對景',
            venue: '練功房',
            cast: [jiang, liu],
            stake: '江聞鶴在練功房攔下柳安春，要跟她把那折對手戲當場走一遍，誰也別讓誰。',
            clock: '第4日·日午',
        },
    ];

    for (const sc of scenes) {
        console.log(`\n── ${sc.label} @ ${sc.venue} ──\n`);
        const [x, y] = sc.cast;
        const loop = await runSceneLoop({
            sceneId: `gift-${sc.venue}`,
            sceneName: sc.venue,
            sceneHint: venueByName.get(sc.venue)?.hint,
            isPrivate: false,
            clock: sc.clock,
            stake: sc.stake,
            etiquette: WORLD_PREMISE,
            cast: [member(x, [y]), member(y, [x])],
            wants: [...x.wants, ...y.wants],
            tick: 0,
            maxTurns: 6,
            agent,
        });
        md.push(`## ${sc.label} @ ${sc.venue}`, '');
        let fanMentions = 0;
        for (const b of loop.beats) {
            const line = `> **${b.name}**：${b.text}`;
            console.log(line + '\n');
            md.push(line);
            if (/扇/.test(b.text)) fanMentions += 1;
        }
        md.push('', `- 扇出現拍數：${fanMentions}/${loop.beats.length}`, '');
        console.log(`（${sc.label}：扇出現 ${fanMentions}/${loop.beats.length} 拍）`);
    }

    const outPath = path.join(import.meta.dirname, 'gift-probe-report.md');
    fs.writeFileSync(outPath, md.join('\n'));
    console.log(`\nreport: ${outPath}`);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
