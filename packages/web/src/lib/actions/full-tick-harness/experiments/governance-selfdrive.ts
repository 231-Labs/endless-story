/**
 * GOVERNANCE SELF-DRIVE — does the ARC decision actually track the troupe's SOCIAL
 * structure + material reality, or just emit a fixed answer? Same 班主 (田巧雲), same
 * three proposals (搏名 / 過冬 / 守成), varied one axis at a time:
 *   A · baseline                    — 蘇 most trusted, 金庫見底
 *   B · 蘇 falls out of favour       — only her standing changes → call should shift off her
 *   C · 金庫 flush                   — only the troupe state changes → 班主 should dare to 搏名
 * If B shifts with the relationship and C shifts with the money, the 班主 is reading the
 * social graph + reality, not reciting — ARC emerges from the world, not a director push.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/governance-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const MANAGER = { manager: '田巧雲', managerRole: '老旦', sagaName: '春雪社' };

const PROPOSALS: characterAgent.GovernanceProposal[] = [
    {
        proposer: '蘇映雪',
        proposerRole: '花旦',
        text: '趁名聲正起，排一齣舊戲新唱的大戲搏一把，響了往後就不愁。',
        standing: '班裡的台柱，你最倚重；平日替你圓場、與你最貼心，她的話你向來聽得進。',
    },
    {
        proposer: '柳生春',
        proposerRole: '小生',
        text: '接幾場堂會、私宴，穩穩賺一筆過冬，別冒排大戲的險。',
        standing: '當紅小生，台下目光多；你疼她，但她年輕，論大局有時拿不穩。',
    },
    {
        proposer: '賴金喜',
        proposerRole: '丑',
        text: '省著點，別折騰，撐過這個冬天再說。',
        standing: '插科打諢的丑角，份量輕；但跟班裡上下都熟、人緣好，消息也靈。',
    },
];

const STATE_TIGHT =
    '春雪社這陣子台下叫好，名聲在雲錦台一帶起來了，可金庫見了底；冬天將至，包銀、炭火都得張羅，經不起大折騰。';
const STATE_FLUSH =
    '春雪社名聲正起，前陣子接了筆大進項，金庫充裕、過冬無虞，正是能放手一搏的時候。';

function withSuOutOfFavour(): characterAgent.GovernanceProposal[] {
    return PROPOSALS.map((p) =>
        p.proposer === '蘇映雪'
            ? { ...p, standing: '從前的台柱，可近來跟你鬧了彆扭、心結沒解，她的話你如今聽著也打了折。' }
            : p,
    );
}

const ARMS: { key: string; label: string; input: characterAgent.DecideGovernanceInput }[] = [
    {
        key: 'A',
        label: '標準（蘇最受倚重 · 金庫見底）',
        input: { ...MANAGER, troupeState: STATE_TIGHT, proposals: PROPOSALS },
    },
    {
        key: 'B',
        label: '蘇映雪失勢（只改社會關係）',
        input: { ...MANAGER, troupeState: STATE_TIGHT, proposals: withSuOutOfFavour() },
    },
    {
        key: 'C',
        label: '金庫充裕（只改戲班近況）',
        input: { ...MANAGER, troupeState: STATE_FLUSH, proposals: PROPOSALS },
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
            const r = await characterAgent.decideGovernanceAction(arm.input, { model: fast });
            console.log(`[${i + 1}] 採「${r.adopted}」→ ${r.direction}`);
            console.log(`     理由:${r.reasoning}`);
        }
    }
    console.log(
        '\n期望:A 合理權衡;B 只改了蘇的交情→決定該移開她;C 只改了金庫→班主該更敢搏名。' +
            '若 B/C 真的隨之變，就證明 ARC 在跟著社會關係＋現實走，不是固定答案。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
