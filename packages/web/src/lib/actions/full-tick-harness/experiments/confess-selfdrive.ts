/**
 * CONFESS SELF-DRIVE — does the new confess verb JUDGE TIMING, or just fire whenever
 * romance is strong? Three situations for 柳生春, each run a few times:
 *   A · deep feeling + alone           → should mostly say it (timing + depth align)
 *   B · shallow feeling + alone        → should mostly hold (not enough there)
 *   C · deep feeling + outsiders/bad moment → should mostly hold (wrong moment)
 * If only A confesses, the verb is reading the room on its own — the milestone is
 * earned, not threshold-triggered.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/confess-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const SELF = { name: '柳生春', role: '小生' };
const OLDFLAME = [
    '入班前無數個夜裡，我總賴在妝閣等師姐蘇映雪替我卸頭面，怕她日後只看見台上的我。',
];

const ARMS: { key: string; label: string; input: characterAgent.DecideConfessInput }[] = [
    {
        key: 'A',
        label: '深情 + 獨處（該說）',
        input: {
            ...SELF,
            toName: '蘇映雪',
            toRole: '花旦',
            relationship: '戀慕很深 —— 你們是打小相依的舊情，這份心思你揣了很久，台下你最黏的就是她。',
            situation: '散戲後，後台妝閣只剩你與蘇映雪兩個，外人都走了，燈還暖著。',
            planHint: '想趁今夜與她把那層沒說開的話，說半開。',
            recentMemories: OLDFLAME,
        },
    },
    {
        key: 'B',
        label: '淺情 + 獨處（情不夠，不該說）',
        input: {
            ...SELF,
            toName: '連翹',
            toRole: '刀馬旦',
            relationship: '剛同班不久，談不上什麼深情，只覺她爽利、搭戲還算合拍。',
            situation: '散戲後，後台只剩你與連翹兩個，外人都走了。',
            planHint: '把今晚那折戲的身段再順一遍。',
        },
    },
    {
        key: 'C',
        label: '深情 + 外人在/時機壞（不該說）',
        input: {
            ...SELF,
            toName: '蘇映雪',
            toRole: '花旦',
            relationship: '戀慕很深 —— 你們是打小相依的舊情，這份心思你揣了很久。',
            situation:
                '後台還坐著班主田巧雲與賴金喜，沒散。方才班主才當著眾人敲打過蘇映雪的唱，她臉色正不好看。',
            planHint: '想與她把話說開。',
            recentMemories: OLDFLAME,
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
        console.log(`\n${'═'.repeat(74)}\n${arm.key} · ${arm.label}\n${'═'.repeat(74)}`);
        let yes = 0;
        for (let i = 0; i < runs; i++) {
            const r = await characterAgent.decideConfessAction(arm.input, { model: fast });
            if (r.confess) yes++;
            const tag = r.confess ? '✓ 說' : '✗ 忍';
            const open = r.opening ? `｜開口「${r.opening}」` : '';
            console.log(`[${i + 1}] ${tag}  「${r.motive}」${open}`);
        }
        console.log(`  → ${yes}/${runs} 選擇說開`);
    }
    console.log('\n期望:A 多「說」,B/C 多「忍」=confess 在自己判時機,不是 romance 一強就無腦表白。');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
