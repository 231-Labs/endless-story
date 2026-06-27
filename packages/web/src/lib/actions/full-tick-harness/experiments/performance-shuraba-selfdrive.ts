/**
 * 戲假情真 · 台上的修羅場 — after months of 白韻秋 gradually courting 柳生春 (霞飛路 strolls, 洋片,
 * 兜風) and a recent「我養您」(柳 said 再想想), 蘇映雪 must tonight play 杜麗娘 longing for 柳生春's
 * 柳夢梅 in 《驚夢》. The 隱晦修羅場 is INSIDE the performance: the suppressed real feeling (months of
 * watching 柳 drift, the fear of losing her) bleeds into the staged romance — the audience sees a
 * transcendent 杜麗娘, she is pouring out what she can never say. Three POVs of the same duet night:
 *   蘇映雪 — does her turmoil bleed into how she plays opposite 柳生春?
 *   柳生春 — does she FEEL 師姐's real feeling through the duet? (答「會體現在作柳生春上嗎」)
 *   白韻秋 — the audience: watching her beloved make (staged) love to someone she can never displace.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/performance-shuraba-selfdrive.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

const SOUL: characterWorker.SagaSoul = { toneRegister: '梨園後台與台上的質地：身段、調門、水袖、台下目光、戲假情真；含蓄、戲味。', emotionalStance: 'restrained' };

type P = { snap: characterWorker.CharacterSnapshot; st: characterWorker.CharacterState; rel: string[]; mem: string[]; trig: string };
const POVS: P[] = [
    {
        snap: { id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '雲錦台·台上', physicalFacts: '台柱花旦，端莊明麗；和柳生春搭了七八年生旦，今晚扮杜麗娘。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 } },
        st: { hunger: 0.3, fatigue: 0.4, mood: -0.5, note: '這幾個月看著生春一步步往白家那邊去，今晚你又要演杜麗娘對柳夢梅的思慕——那把沒出鞘的刀，今晚怕是要藏進這齣戲裡了。' },
        rel: ['對柳生春：搭了七八年的生旦，那份你不肯叫名字的牽絆；這幾個月眼看她被白家千金一點點引去。', '對白韻秋：那個用安穩把生春引走的、你恨不起來的好人。'],
        mem: ['這幾個月柳生春總跟白家千金出去——霞飛路逛街、看洋片、坐汽車兜風；每回回來，她身上總帶著點你沒給過的鬆快。', '上回白韻秋當面說了「我養您」，生春沒應也沒拒，只說再想想；你讓開了道，可你夜裡睡不著。', '你跟生春搭了七八年生旦，台上演過千百回杜麗娘與柳夢梅。', '師父說過：戲假情真，真到極處，台下人也分不清那是戲還是心。'],
        trig: '今晚雲錦台，你扮杜麗娘，與柳生春的柳夢梅演《牡丹亭·驚夢》。演到「則為你如花美眷、似水流年」那一折，你望著她。台下，白家千金也在座。',
    },
    {
        snap: { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '雲錦台·台上', physicalFacts: '當紅女小生（坤生），瘦高帥美，台上風流；今晚扮柳夢梅。痴戲、暗想頭牌、怕老。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } },
        st: { hunger: 0.3, fatigue: 0.5, mood: 0, note: '這幾個月跟白韻秋出去了好幾回，那日子真鬆快，她那句「我養您」你還沒拿主意；可今晚在台上對著師姐的杜麗娘，那眼神裡的東西叫你心裡發顫。' },
        rel: ['對蘇映雪：搭了七八年的生旦，那牽絆說不清；今晚她望你的眼神不大對。', '對白韻秋：這幾個月待你真好、說了「我養您」、你說再想想的人，今晚也在台下。'],
        mem: ['這幾個月你跟白韻秋出去了好幾回，霞飛路逛街、看洋片，她待你真好，那日子真鬆快。', '白韻秋說了「我養您」，你說再想想，還沒拿主意。', '你跟師姐搭了七八年生旦，台上演過千百回杜麗娘與柳夢梅，那份牽絆你也說不清。'],
        trig: '今晚你扮柳夢梅，與師姐蘇映雪的杜麗娘演《驚夢》。演到那一折，師姐望過來的眼神，你說不清是戲、是七八年的搭檔、還是別的。台下，白韻秋也在座。',
    },
    {
        snap: { id: '0xbai', name: '白韻秋', role: '—', gender: '女', ageYears: 20, sagaName: '霞飛路', sceneName: '雲錦台·池座', physicalFacts: '綢緞莊獨養千金，嬌憨心細、體面不仗勢；這幾個月慢慢追著柳生春，真心疼她。', attributes: { appearance: 78, constitution: 64, acuity: 70, disposition: 70 } },
        st: { hunger: 0.2, fatigue: 0.2, mood: -0.4, note: '你約了她幾個月、說了「我養您」，她說再想想；可今晚你坐在台下，看她跟蘇映雪演《驚夢》——演那對你演不出來、也擠不進去的情。' },
        rel: ['對柳生春：你約了幾個月、放在心尖上、說了「我養您」的人；此刻她在台上跟別人演情。', '對蘇映雪：那個跟她搭了七八年、你怎麼也擠不進去的師姐。'],
        mem: ['這幾個月你約了柳生春出去好幾回，霞飛路逛街、看洋片，她漸漸肯對你笑了。', '你終於說了「我養您」，她說再想想。', '今晚你坐在池座裡，看她跟蘇映雪演《驚夢》，那是一對你怎麼也演不出來、擠不進去的情。'],
        trig: '今晚你坐在雲錦台的池座裡，看柳生春與蘇映雪演《驚夢》——看她跟搭了七八年的師姐，演那對你怎麼也演不出來、也擠不進去的情。',
    },
];

async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) { try { return await client.chat(req); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 3000 * (t + 1))); } }
    throw last;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) { console.error('no text provider key'); process.exit(2); }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 戲假情真 · 《驚夢》台上的修羅場（三 POV）\n`);
    for (const p of POVS) {
        const sys = characterWorker.buildPovSystemPrompt(SOUL, 'pov');
        const user = characterWorker.buildPovUserPrompt({ character: p.snap, triggerNarrative: p.trig, recentMemorySnippets: p.mem, relationshipHints: p.rel, state: p.st });
        const r = await chatRetry(client, { model, system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1300, temperature: 0.86 });
        console.log(`━━━━ ${p.snap.name} POV ━━━━\n${r.text.trim()}\n`);
    }
    console.log('看:① 蘇映雪台下的醋與懼,是否漏進她演杜麗娘望柳夢梅的那場戲裡(戲假情真);② 柳生春在對手戲裡感不感得到師姐的真、被攪動;③ 白韻秋坐台下,看她演那對自己擠不進去的情,是什麼滋味。');
}

main().catch((e) => { console.error(e); process.exit(1); });
