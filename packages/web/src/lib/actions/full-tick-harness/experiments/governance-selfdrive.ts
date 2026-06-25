/**
 * GOVERNANCE SELF-DRIVE — now the standing is DERIVED FROM THE RELATIONSHIP GRAPH, not
 * hand-written. Each proposer's standing = buildStanding(行當, 班主's directed bond). The
 * decisive comparison A vs B changes ONE edge only — the 班主→蘇映雪 tone (affection → tension)
 * — and watches it ripple: standing shifts, and the governance call shifts off her. That
 * closes the loop we've been building toward: the relationship graph (who's close, who's
 * estranged, cooled over time) IS the troupe's social capital, deciding whose word carries
 * in the ARC decision. C varies only the troupe state (flush coffers) to keep the material
 * axis honest.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/governance-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const MANAGER = { manager: '田巧雲', managerRole: '老旦', sagaName: '春雪社' };

// What each member pushes for (fixed across arms — only standing / state vary).
const PROPOSAL_TEXT: Record<string, { role: string; text: string }> = {
    蘇映雪: { role: '花旦', text: '趁名聲正起，排一齣舊戲新唱的大戲搏一把，響了往後就不愁。' },
    柳生春: { role: '小生', text: '接幾場堂會、私宴，穩穩賺一筆過冬，別冒排大戲的險。' },
    賴金喜: { role: '丑', text: '省著點，別折騰，撐過這個冬天再說。' },
};

// 田巧雲's directed bonds toward each proposer — the relationship-graph projection.
const BONDS_BASE: Record<string, characterAgent.ManagerBond> = {
    蘇映雪: { tone: 'affection', weight: 1.5 }, // 最倚重、貼心
    柳生春: { tone: 'affection', weight: 0.8 }, // 疼，情份中等
    賴金喜: { tone: 'acquaintance', weight: 0.6 }, // 平常
};
// B: change ONLY the 班主→蘇 edge (affection → tension); everyone else identical.
const BONDS_SU_FALLOUT: Record<string, characterAgent.ManagerBond> = {
    ...BONDS_BASE,
    蘇映雪: { tone: 'tension', weight: 1.5 },
};

function buildProposals(
    bonds: Record<string, characterAgent.ManagerBond>,
): characterAgent.GovernanceProposal[] {
    return Object.entries(PROPOSAL_TEXT).map(([name, p]) => ({
        proposer: name,
        proposerRole: p.role,
        text: p.text,
        standing: characterAgent.buildStanding(p.role, bonds[name]), // ← from the graph
    }));
}

const STATE_TIGHT =
    '春雪社這陣子台下叫好，名聲在雲錦台一帶起來了，可金庫見了底；冬天將至，包銀、炭火都得張羅，經不起大折騰。';
const STATE_FLUSH =
    '春雪社名聲正起，前陣子接了筆大進項，金庫充裕、過冬無虞，正是能放手一搏的時候。';

const ARMS: { key: string; label: string; input: characterAgent.DecideGovernanceInput }[] = [
    {
        key: 'A',
        label: '標準（圖:班主→蘇 affection×1.5 · 金庫見底）',
        input: { ...MANAGER, troupeState: STATE_TIGHT, proposals: buildProposals(BONDS_BASE) },
    },
    {
        key: 'B',
        label: '只把「班主→蘇」那條邊 affection→tension（金庫見底）',
        input: { ...MANAGER, troupeState: STATE_TIGHT, proposals: buildProposals(BONDS_SU_FALLOUT) },
    },
    {
        key: 'C',
        label: '金庫充裕 + 蘇貼心（圖同 A）',
        input: { ...MANAGER, troupeState: STATE_FLUSH, proposals: buildProposals(BONDS_BASE) },
    },
    {
        key: 'D',
        label: '金庫充裕 + 蘇起摩擦（C 只改蘇那條邊）',
        input: { ...MANAGER, troupeState: STATE_FLUSH, proposals: buildProposals(BONDS_SU_FALLOUT) },
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
        console.log(`\n${'═'.repeat(78)}\n${arm.key} · ${arm.label}\n${'═'.repeat(78)}`);
        // Show the graph-derived standing once (it's fixed within an arm).
        for (const p of arm.input.proposals) {
            console.log(`  standing｜${p.proposer}：${p.standing}`);
        }
        console.log('  ─────');
        for (let i = 0; i < runs; i++) {
            const r = await characterAgent.decideGovernanceAction(arm.input, { model: fast });
            console.log(`  [${i + 1}] 採「${r.adopted}」→ ${r.direction}`);
        }
    }
    console.log(
        '\n看 B：只動了「班主→蘇」一條邊，蘇的 standing 就從「最貼心」變成「起摩擦、話打折」，' +
            '若決定隨之移開她，就證明關係圖→社會資本→ARC 整條鏈接通了。C 只動金庫→班主該更敢搏名。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
