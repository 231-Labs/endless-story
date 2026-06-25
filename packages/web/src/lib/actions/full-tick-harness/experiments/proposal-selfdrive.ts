/**
 * PROPOSAL SELF-DRIVE — is the proposal GENERAL (any kind, scope tracks the situation),
 * or does it collapse to "排戲"? Three characters in three different spots:
 *   A · 柳生春 in love (romance toward 蘇)          → expect a pair-scoped wish (出遊 / 同住 / 說開)
 *   B · 班主 田巧雲 facing a money crunch            → expect a troupe-scoped wish (排戲 / 接活)
 *   C · 賴金喜 worn out                              → expect a self-scoped wish (歇著) or a pair drink
 * If the proposals aren't all about 戲, and the scope follows the situation, the mechanism
 * is general — 出遊/同住 fall out for free as pair/troupe-scoped proposals.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/proposal-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const ARMS: { key: string; label: string; input: characterAgent.DecideProposalInput }[] = [
    {
        key: 'A',
        label: '柳生春 · 戀愛中（對蘇映雪 romance）',
        input: {
            name: '柳生春',
            role: '小生',
            sagaName: '春雪社',
            planHint: '台下我最想守著的就是師姐蘇映雪，想多與她在戲外待著。',
            relationshipPressure: ['對蘇映雪：戀慕很深，打小相依的舊情，台下最黏她。'],
            situation: '連日同台唱《白蛇》，今夜散了戲，後台只剩你與她。',
            recentMemories: ['入班前無數個夜裡，我總賴在妝閣等師姐替我卸頭面。'],
        },
    },
    {
        key: 'B',
        label: '田巧雲（班主）· 金庫見底',
        input: {
            name: '田巧雲',
            role: '老旦',
            sagaName: '春雪社',
            planHint: '我是班主，得為這一班人的吃穿過冬張羅。',
            troupeState: '春雪社名聲剛起，可金庫見了底；冬天將至，炭火、包銀都得張羅，經不起大折騰。',
            situation: '後台清點賬目，看著見底的金庫。',
        },
    },
    {
        key: 'C',
        label: '賴金喜（丑）· 累壞了',
        input: {
            name: '賴金喜',
            role: '丑',
            sagaName: '春雪社',
            planHint: '連趕了好幾場，只想喘口氣。',
            situation: '連日趕場插科打諢，嗓子啞了、腿也乏了，癱在後台條凳上。',
            recentMemories: ['揣著炒栗子滿後台轉，誰繃著臉就湊過去逗一句。'],
        },
    },
];

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key — set ZAI/POE in packages/web/.env.local');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 3;
    const fast = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${fast}`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(76)}\n${arm.key} · ${arm.label}\n${'═'.repeat(76)}`);
        for (let i = 0; i < runs; i++) {
            const r = await characterAgent.decideProposalAction(arm.input, { model: fast });
            if (!r.hasProposal) {
                console.log(`[${i + 1}] （此刻無提議）`);
                continue;
            }
            const tgt = r.targets && r.targets.length ? `〔${r.targets.join('、')}〕` : '';
            console.log(`[${i + 1}] ${r.scope}${tgt} ${r.proposal}`);
            console.log(`     └ ${r.motive}`);
        }
    }
    console.log(
        '\n看:提議是否不限在「戲」(出遊/同住/歇著/賠不是…都該冒得出來),且 scope 跟著處境走' +
            '(戀愛→pair、戲班危機→troupe、累→self)。若是,這套提議機制就是通用的。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
