/**
 * CONFESSION SCENE — focused repro for the 當眾表白 payoff (H3d).
 *
 * The full 10-tick observatory stalls the 柳蘇 love want at 'edge' (3-person scenes
 * keep the privacy discount off, and the 壓軸 rivalry want out-drives the love want,
 * so it never crosses breaking). This harness proves the ENGINE writes the confession
 * when the love want IS the driver and IS past breaking: it seeds 柳生春's love want
 * over the breaking line and runs ONE public scene (柳, 蘇, + 田巧雲 as the witnessing
 * eyes that make it 當眾) through the REAL scene-loop + REAL beat agent (Poe). No
 * OpenAI needed (text is Poe; no recall, no images).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx> \
 *     src/lib/actions/full-tick-harness/confession-scene.harness.ts
 */

import './narrative-setup'; // side effects: load .env.local, ES_NARRATIVE_REAL_LLM=1
import { runSceneLoop, type SceneLoopCastMember } from '@endless-story/engine/core/scene-loop';
import type { Want } from '@endless-story/engine/core/want-core';

const LIU = 'liu-shengchun';
const SU = 'su-yingxue';
const TIAN = 'tian-qiaoyun';

const cast: SceneLoopCastMember[] = [
    {
        characterId: LIU,
        name: '柳生春',
        role: '小生',
        persona:
            '春雪社當紅小生（坤生，女兒身扮小生），台上風流少年郎，台下愛撒嬌、最黏師姐蘇映雪的暖姑娘。' +
            '戲痴，七歲坐科，師父臨終留一句「戲比天大」與一把摺扇。與師姐是雙向暗戀，七八年生旦搭到今日，' +
            '誰也不敢說破——飯碗、生旦本分、那年代。怕老，怕被後浪蓋過，更怕有一天師姐也只看得見台上的她。',
        ties: { [SU]: '你對蘇映雪：師姐，暗戀七八年沒說破', [TIAN]: '你對田巧雲：班主，長輩，管你吃穿冷暖' },
        stateLine: '今日這口氣再壓不住了。',
    },
    {
        characterId: SU,
        name: '蘇映雪',
        role: '花旦',
        persona:
            '春雪社台柱花旦，台上端莊，台下極懂分寸、總替全班圓場。和柳生春搭了七八年生旦，演過千百回杜麗娘與柳夢梅。' +
            '對師妹也真動了心，卻更不敢說破——她是師姐，該穩；那點心思只在替師妹理鬢角、留最好的點心、把茶先溫好裡露一線。',
        ties: { [LIU]: '你對柳生春：師妹，暗戀她卻自認該穩住', [TIAN]: '你對田巧雲：班主，長輩' },
    },
    {
        characterId: TIAN,
        name: '田巧雲',
        role: '老旦',
        persona:
            '春雪社班主，唱了一輩子老旦，管著一班人的吃穿冷暖。嘴上規矩嚴，心裡把戲班當一家子。' +
            '年輕時也有一個沒能說出口的人，遠嫁去了南洋；看著柳蘇兩個孩子，有時心軟，有時心驚。',
        ties: { [LIU]: '你對柳生春：看著長大的孩子', [SU]: '你對蘇映雪：看著長大的孩子' },
    },
];

// 柳's love want, seeded PAST breaking: forcingPressure = heat+frust = 6+4 = 10,
// resistance 4 → 10 ≥ 4 + breakingMargin(3) = 7 → 'breaking'. This is the driver.
const wants: Want[] = [
    {
        id: 'w-liu-love',
        characterId: LIU,
        layer: '愛',
        desc: '想把藏了七八年的那句話對蘇映雪說明白——不只台上做柳夢梅，台下也要她',
        target: '蘇映雪',
        weight: 0.96,
        sat: 0.08,
        sat0: 0.08,
        resistance: 4,
        heat: 6,
        frust: 4,
        recent: 0,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    },
    {
        id: 'w-su-love',
        characterId: SU,
        layer: '愛',
        desc: '想告訴柳生春，這麼多年替她溫的茶、理的鬢角，都是同一樁沒說出口的心事',
        target: '柳生春',
        weight: 0.9,
        sat: 0.12,
        sat0: 0.12,
        resistance: 4,
        heat: 5,
        frust: 3,
        recent: 0,
        kind: 'narrative',
        source: 'genesis',
        bornTick: 0,
    },
];

async function main(): Promise<void> {
    console.log('CONFESSION SCENE — 當眾（公開，田巧雲在場）·真 scene-loop + 真 beat agent\n');
    const res = await runSceneLoop({
        sceneId: 's-backstage',
        sceneName: '後台',
        isPrivate: false, // 當眾 — the witness (田巧雲) is present
        clock: 'Day 1 · 入夜',
        stake: '外頭鑼鼓已歇，明日的戲單就要定下生旦的名位。',
        tone: '梨園班底，人情做戲難分。筆致含蓄克制，說一半、留一半。',
        etiquette: '同班以師姐/師妹/班主相稱。',
        emotionalStance: 'consummate',
        cast,
        wants,
        tick: 1,
        maxTurns: 6,
    });

    console.log('── BEATS ──');
    for (const b of res.beats) {
        console.log(`\n【${b.name}】${b.addressed ? ` →${b.addressed}` : ''}`);
        console.log(`  ${b.text}`);
        if (b.inner) console.log(`  （心底：${b.inner}）`);
    }
    console.log('\n── RESOLVE ──');
    if (res.resolved.length) {
        for (const r of res.resolved) console.log(`⚖ 了結：${r.want.desc}\n   註：${r.note ?? ''}`);
    } else {
        console.log('（本場沒有 want 被判定了結）');
    }
    console.log(`\nintimacyGateOpened=${res.intimacyGateOpened}  moves=${res.moves.length}`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[confession-scene] fatal:', e);
        process.exit(1);
    });
