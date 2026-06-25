/**
 * MATERIALIZE SELF-DRIVE — does the world grow plausibly from a mention? Feeds names that
 * proposal/governance ACTUALLY conjured (張老爺 / 城東李府 / 李員外) plus one from the
 * 霞飛路 vision (the dumpling-shop 老闆娘), and checks the inferred dormant entity:
 *   - character vs scene judged right
 *   - 身份 / 小傳 / 關係 grounded in the mention's context
 *   - homeSagaHint routes correctly: 恩客金主 → 江湖, 老闆娘 → 霞飛路商街, 李府 → a scene
 * If a mention becomes a sensible sleeping entity (not a hole, not a hallucination), the
 * "world grows from what gets mentioned" seed is real — and these dormant cross-saga
 * people are exactly the precondition for 屬地/屬人 routing.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/materialize-selfdrive.ts [runs]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterAgent } from '@endless-story/runner';

const MENTIONS: characterAgent.MaterializeInput[] = [
    {
        mention: '張老爺',
        context: '春雪社班主田巧雲盤算:金庫見底，想拿賬本去尋前門大街的張老爺，憑戲班名聲叫他先下個定錢，預支過冬的炭火包銀。',
    },
    {
        mention: '城東李府',
        context: '班主田巧雲盤算:接下城東李府那檔壽宴堂會，雖戲份折腰，可定銀豐厚，能解眼前的炭火包銀。',
        kindHint: 'scene',
    },
    {
        mention: '李員外',
        context: '班主田巧雲盤算:憑這張老臉和幾分舊日情面，去尋李員外先支一筆定銀回來，好添炭火、發包銀。',
    },
    {
        mention: '霞飛路口那家湯包店的老闆娘',
        context: '柳生春提起:霞飛路口那家湯包店的老闆娘總愛看她的戲，常多送她兩籠熱包子。',
    },
];

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key — set ZAI/POE in packages/web/.env.local');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 2;
    const fast = llmText.createTextClient({ kind: 'primary' }).defaultModel;
    console.log(`model: ${fast}`);

    for (const m of MENTIONS) {
        console.log(`\n${'═'.repeat(78)}\n提及:「${m.mention}」\n${'═'.repeat(78)}`);
        for (let i = 0; i < runs; i++) {
            const e = await characterAgent.materializeMention(m, { model: fast });
            const head = e.kind === 'scene' ? `[scene · ${e.sceneType ?? '?'}]` : `[人 · ${e.role ?? '?'}]`;
            console.log(`[${i + 1}] ${e.name} ${head}`);
            if (e.brief) console.log(`     小傳:${e.brief}`);
            if (e.relation) console.log(`     關係:${e.relation}`);
            if (e.homeSagaHint) console.log(`     歸屬:${e.homeSagaHint}`);
        }
    }
    console.log(
        '\n看:① 人/地點判對;② 身份+小傳貼著被提到的上下文;③ 歸屬推對' +
            '(張老爺/李員外→江湖金主、老闆娘→霞飛路商街、李府→宅邸 scene)。對 = 世界能從提及裡長出來。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
