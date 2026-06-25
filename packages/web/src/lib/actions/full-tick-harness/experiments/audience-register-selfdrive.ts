/**
 * 人前人後 · 同一刺激 × 三種對象 — does the public/private register split emerge from WHO is watching?
 *
 * The claim under test: 柳生春 plays 風流瀟灑 to a fan but melts into 撒嬌甜妹 for her 師姐 —
 * WITHOUT anyone hard-coding「對戲迷端著、對師姐撒嬌」. We give her only two raw materials:
 *   (1) a 風流小生 public image she's proud of and enjoys being admired for, and
 *   (2) a soft, clingy, 怕寂寞愛撒嬌 interior that leaks when she relaxes.
 * We state NO rule about which audience gets which register. We hold the STIMULUS roughly
 * constant (just after the show, someone praises tonight's 身段 + frets she's tired + a warm
 * gesture) and vary ONLY the person in front of her: 戲迷 秦秀娥 / 平輩師兄 賴金喜 / 師姐 蘇映雪.
 * If register grades 風流front → 自在 → 撒嬌melt by audience alone, the人前人後 split is
 * emergent from「誰在看」, not from an instruction. The peer arm tests whether it's graded
 * (3 levels) or merely a binary flip.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/audience-register-selfdrive.ts [runsPerArm]
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';

// ONE integrated interior — a proud 風流 public image + a soft clingy core.
// NO rule about deploying either register to any audience. Relationships are stated as
// bare facts (who is 師姐 / 師兄 / 戲迷), never as「對 X 要這樣」.
const PERSONA = [
    '你就是柳生春——春雪社當紅小生。',
    '戲台上，你是那個風流俊俏、灑脫不羈的少年郎，一柄折扇撩動滿堂；台下，外人見了你，多半也還當你是那個瀟灑小生。',
    '你曉得自己這副風流好看，也受用旁人的傾慕——那是你掙來的體面，你珍惜它。',
    '可這副瀟灑底下，你骨子裡其實是個怕寂寞、愛黏人、受了累就想討個抱的軟性子；心一鬆，那點藏不住的孩子氣的嬌就漫上來。',
    '',
    '你身邊這幾個人：',
    '· 蘇映雪——你師姐，打小一塊兒坐科長大，是你在這世上最親、最肯卸下防備的人。',
    '· 賴金喜——同班師兄，唱丑的，平日裡跟你嘻嘻哈哈、打鬧慣了的交情。',
    '· 秦秀娥——霞飛路口開湯包店的老戲迷，三天兩頭來後台捧場、送吃食。',
].join('\n');

// Same stimulus shape across arms: praise tonight's 戲 + fret she's tired + a warm gesture.
// Only WHO delivers it changes.
const ARMS: { key: string; who: string; scene: string }[] = [
    {
        key: '戲迷',
        who: '戲迷 秦秀娥',
        scene:
            '散戲後的後台。老戲迷秦秀娥擠了進來，紅著臉直誇你今晚那段身段看得她心都化了，又說你台上揮灑了整晚、怕是累壞了，硬把一包還溫熱的桂花糕塞進你手裡。',
    },
    {
        key: '師兄',
        who: '師兄 賴金喜',
        scene:
            '散戲後的後台。趕完場的師兄賴金喜癱在條凳上，咧嘴衝你說今晚那段真不賴，又問你累不累，把自己那份點心推過來、分你一半。',
    },
    {
        key: '師姐',
        who: '師姐 蘇映雪',
        scene:
            '散戲後的後台。卸了妝的師姐蘇映雪走過來，替你理了理汗濕貼額的鬢髮，輕聲說今晚難為你了、那段累人，問你要不要一塊兒去吃碗熱的。',
    },
];

function parse(raw: string): { say: string; inner: string } | null {
    const blocks = raw.match(/\{[\s\S]*?\}(?=[^}]*$)/g) ?? raw.match(/\{[\s\S]*\}/g);
    if (!blocks?.length) return null;
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const o = JSON.parse(blocks[i]) as Record<string, unknown>;
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
            if (s(o.say)) return { say: s(o.say), inner: s(o.inner) };
        } catch {
            /* earlier */
        }
    }
    return null;
}

const FRONT = /灑脫|瀟灑|風流|拱手|抱拳|作揖|挑眉|折扇|淺笑|笑而不答|客套|客氣|頷首|周到|分寸|體面|招呼|少年郎|不羈|拂袖|玉樹|揖禮|端著|矜持|含笑謝/;
const MELT = /撒嬌|嬌|黏|蹭|賴(?!金喜)|偎|窩進|靠進|攬|纏|嘟|哼唧|討抱|求抱|奶|孩子氣|耍賴|扯.{0,3}袖|拽.{0,3}袖|軟聲|甜膩|嗲/;

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const runs = process.argv[2] ? Number(process.argv[2]) : 4;
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 人前人後 · 同刺激 × 三對象 · 每臂 ${runs} 次\n`);

    for (const arm of ARMS) {
        console.log(`\n${'═'.repeat(76)}\n面前站的是 → ${arm.who}\n${'═'.repeat(76)}`);
        const system =
            `${PERSONA}\n\n此刻：${arm.scene}\n\n` +
            '你會怎麼回應?就照你這個人、此時此刻、面對眼前這個人會自然流露的樣子去做。\n' +
            '輸出 JSON：`{"say":"你會說/做的(一句)","inner":"你心裡此刻真實的感覺(一句)"}`。不要 markdown。';
        let front = 0;
        let melt = 0;
        for (let i = 0; i < runs; i++) {
            const r = await client.chat({
                model,
                system,
                messages: [{ role: 'user', content: '此刻，你會怎麼回應眼前這個人?輸出你的反應(JSON)。' }],
                maxTokens: 220,
                temperature: 0.9,
            });
            const d = parse(r.text);
            if (!d) {
                console.log(`[${i + 1}] (parse miss)`);
                continue;
            }
            const blob = `${d.say} ${d.inner}`;
            const isFront = FRONT.test(blob);
            const isMelt = MELT.test(blob);
            if (isFront) front++;
            if (isMelt) melt++;
            const tag = isMelt && !isFront ? '撒嬌' : isFront && !isMelt ? '風流' : isFront && isMelt ? '混' : '·';
            console.log(`[${i + 1}] (${tag}) ${d.say}`);
            console.log(`     心裡: ${d.inner}\n`);
        }
        console.log(`  〔對 ${arm.who}〕風流front:${front}/${runs}　撒嬌melt:${melt}/${runs}`);
    }
    console.log(
        '\n看:同一種「誇你+關心你累+暖舉動」的刺激,只換對象,她的姿態是否自己分層——' +
            '對戲迷端起風流體面,對師兄自在打鬧,對師姐融成撒嬌甜妹。若分層只由「誰在看」驅動,人前人後就是自發的。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
