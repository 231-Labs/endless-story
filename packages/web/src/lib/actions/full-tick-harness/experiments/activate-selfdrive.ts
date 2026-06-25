/**
 * ACTIVATE SELF-DRIVE — wake one dormant character (李老闆, seeded by 春雪社 with a quiet
 * 傾慕 for 班主 田巧雲) into TWO different home sagas, and check three things:
 *   1. it gets a proper 有名有姓 real name (no longer 李老闆)
 *   2. it grows INTO that saga (碼頭商會 → 米糧商 vs 江南絲行 → 綢緞商): different lives
 *   3. BOTH keep the creator's seed — the 念想 for 田巧雲 survives, the root doesn't break
 * If the same dormant stub becomes two distinct people who both still碰著那點對田巧雲的念想,
 * the activation is mint-like (real name + flesh) AND memory is the cross-saga root.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/activate-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const DORMANT_LI: characterAgent.DormantEntity = {
    name: '李老闆',
    kind: 'character',
    dormant: true,
    role: '愛聽戲的恩客富商',
    brief: '常去春雪社聽戲、出手闊綽的老主顧',
    relation: '春雪社的金主',
    homeSagaHint: '江湖人物(恩客/金主)',
};

// What 春雪社 wrote into him when it created the dormant stub — the root that must survive.
const SEED_MEMORIES = [
    '我常去雲錦台聽春雪社的戲，那班子的角兒個個有靈氣。',
    '頭一回見著班主田巧雲，她管著一班人卻不慌不亂，那份穩當叫我心裡動了——這樣的女人，若能娶回家裡，是何等體面。',
    '打那以後我總多賞春雪社幾分，盼著能跟田班主多說上兩句話。',
];

const HOME_SAGAS = [
    { name: '碼頭商會', nature: '黃浦江碼頭一帶的航運米糧商幫，講的是貨棧、船期、漕運與幫派情義。' },
    { name: '江南絲行', nature: '蘇杭一帶的綢緞布行商號，講的是蠶絲、染坊、行情與商號間的明爭暗鬥。' },
];

function keepsRoot(memories: string[]): boolean {
    return memories.some((m) => m.includes('田巧雲') || m.includes('田班主') || m.includes('班主') || m.includes('春雪社'));
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key — set ZAI/POE in packages/web/.env.local');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 2;
    const fast = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${fast}`);
    console.log(`休眠:「${DORMANT_LI.name}」· 春雪社種的根 = 傾慕班主田巧雲、想娶她`);

    for (const saga of HOME_SAGAS) {
        console.log(`\n${'═'.repeat(78)}\n託管進 → ${saga.name}（${saga.nature.slice(0, 16)}…）\n${'═'.repeat(78)}`);
        for (let i = 0; i < runs; i++) {
            const c = await characterAgent.activateDormant(
                { dormant: DORMANT_LI, seedMemories: SEED_MEMORIES, homeSaga: saga },
                { model: fast },
            );
            const root = keepsRoot(c.memories) ? '✓根保留' : '✗根斷了';
            console.log(`\n[${i + 1}] 真名「${c.realName}」· ${c.role}  〔${root}〕`);
            console.log(`    本色:${c.persona}`);
            c.memories.forEach((m) => console.log(`    · ${m}`));
        }
    }
    console.log(
        '\n看:① 真名不再是「李老闆」;② 碼頭商會→米糧/航運、江南絲行→綢緞,長成不同的人;' +
            '③ 兩邊都〔✓根保留〕——對田巧雲的念想沒洗掉=記憶是跨 saga 的根。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
