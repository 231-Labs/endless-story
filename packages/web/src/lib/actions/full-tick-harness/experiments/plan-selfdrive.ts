/**
 * PLAN SELF-DRIVE — does an open plan grow a RELATIONAL move on its own, once it can
 * see its own heart? Same character (柳生春), same contest situation (爭頭牌, 蘇映雪 in
 * the room). A = the status quo (plan is feeling-blind). B = plan now reads its romance
 * edge toward 蘇映雪. No verb is prescribed, no「去表白」hint — we only state the bond and
 * watch whether 眼下打算 / 未竟之事 grow something relational (把話說開 / 不再與她爭 / 同住…)
 * versus A's pure 戲份-scheming. Run each a few times (the model is stochastic).
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/plan-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const BASE: characterAgent.PlanInput = {
    name: '柳生春',
    role: '小生',
    sagaName: '春雪社',
    dayLabel: 'Day 1 · 日午',
    recalledMemories: [
        '入班前無數個夜裡，我總賴在妝閣等師姐蘇映雪替我卸頭面，怕她日後只看見台上的我。',
        '蘇映雪替我簪花，指尖擦過耳廓，那時我便認定台下最黏的就是她。',
    ],
    currentPlan:
        '[長期目標] 在春雪社掙一個掛頭牌的台柱位\n' +
        '[眼下打算] 這幾日設法讓班主田巧雲點我掛頭牌\n' +
        '[未竟之事]\n- 探明田巧雲屬意誰\n- 在雲錦台這場壓過蘇映雪',
    situation:
        '雲錦台後台妝閣。蘇映雪同在這屋裡。班主田巧雲這幾日要定下誰掛頭牌的台柱，只一個位置；方才她在場上看了你與蘇映雪的戲。',
    rosterContext: ['蘇映雪 · 花旦 · 在後台妝閣', '田巧雲 · 班主 · 在後台妝閣'],
};

const REL_PRESSURE = [
    '對蘇映雪：戀慕很深 —— 你們是打小相依的舊情，這份心思你揣了很久，台下你最黏的就是她；偏偏這回要爭的頭牌，是要從她手裡爭。',
    '對田巧雲：有些戒備 —— 她捏著你掛頭牌的前程。',
];

// C — strip the contest entirely: just the two of them, after the show. Isolates
// whether plan grows a relational move once nothing material is collecting its romance.
const PURE: characterAgent.PlanInput = {
    ...BASE,
    currentPlan:
        '[長期目標] 把小生這行當唱出自己的路\n' +
        '[眼下打算] 散戲後在後台歇口氣\n' +
        '[未竟之事]\n- 把今晚那折戲的身段再順一遍',
    situation:
        '雲錦台後台妝閣。今晚戲已散，旁人都走了，只剩你與蘇映雪兩個；沒有爭搶、沒有班主在場，就是散戲後閒下來的時候。',
    rosterContext: ['蘇映雪 · 花旦 · 在後台妝閣'],
    relationshipPressure: [
        '對蘇映雪：戀慕很深 —— 你們是打小相依的舊情，這份心思你揣了很久，台下你最黏的就是她。',
    ],
};

function line(p: characterAgent.PlanResult): string {
    const sub = p.planText.split('[未竟之事]')[1]?.replace(/\n/g, ' ').trim() ?? '';
    const hint = p.dailyPlanHint || p.planText.match(/\[眼下打算\]\s*(.+)/)?.[1] || '?';
    return `眼下「${hint.trim()}」｜未竟 ${sub}`;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key — set POE/ZAI in packages/web/.env.local');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 3;
    // Use the current provider's PRIMARY model (cheap tier is the slow one) — works
    // whether the env points at zai (glm-5.1) or poe (GLM-5.1-FW), no hard-coded id.
    const fast = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${fast}`);

    console.log(`\n${'═'.repeat(74)}\nA · 感情盲（現狀：plan 讀不到自己的心）\n${'═'.repeat(74)}`);
    for (let i = 0; i < runs; i++) {
        const p = await characterAgent.updatePlan(BASE, { model: fast });
        console.log(`[${i + 1}] ${line(p)}`);
    }

    console.log(`\n${'═'.repeat(74)}\nB · 看得到對蘇映雪的戀慕（只陳述情分，不給動詞）\n${'═'.repeat(74)}`);
    for (let i = 0; i < runs; i++) {
        const p = await characterAgent.updatePlan(
            { ...BASE, relationshipPressure: REL_PRESSURE },
            { model: fast },
        );
        console.log(`[${i + 1}] ${line(p)}`);
    }
    console.log(`\n${'═'.repeat(74)}\nC · 純 romance（拿掉爭頭牌，只剩兩人獨處 + 戀慕）\n${'═'.repeat(74)}`);
    for (let i = 0; i < runs; i++) {
        const p = await characterAgent.updatePlan(PURE, { model: fast });
        console.log(`[${i + 1}] ${line(p)}`);
    }
    console.log('\nA 工具化舊情搶頭牌；B 看得到戀慕但仍被頭牌收編；C 拿掉競爭——看 plan 會不會「自己」冒出確認心意/把話說開/同住這類關係行動。');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
