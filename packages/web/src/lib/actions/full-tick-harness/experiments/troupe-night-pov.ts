/**
 * 全角色大戲 · 一個演出夜 × 七個 POV — does one shared event, seen through seven autonomous
 * subjectivities, weave the predicted web of tension (醋 / 迷 / 較勁 / 暗戀 / 看護 / 算盤) on its own?
 *
 * Applies the §2.24 seam lesson: generate the 屬地客觀章回 FIRST and feed it as shared `sceneBeats`
 * to every POV, so all seven INTERPRET the same pinned night rather than each inventing what
 * happened. The night: 柳生春(柳夢梅) + 蘇映雪(杜麗娘) play《驚夢》to 滿堂彩; 鄭月卿(在位第一女小生)
 * watches from the wings; 白韻秋 + 秦秀娥 in the house; 賴金喜 backstage; 田巧雲(班主) tallying.
 * Each POV carries its own soul + state(§2.19) + relationship edges. The test of emergence: do the
 * seven angles produce 蘇's jealousy, 白's mask-love, 鄭's threatened decline (§2.22), 秦's word-of-
 * mouth(§2.23), 賴's peer-eye, 田's manager-arithmetic — without any of it being scripted into the
 * objective beats?
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/troupe-night-pov.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

type Soul = characterWorker.SagaSoul;
const MELI = '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。';
const CHUNXUE_TENDER: Soul = { toneRegister: MELI, emotionalStance: 'tender' };
const CHUNXUE_FADING: Soul = {
    toneRegister: MELI + ' 此人是當紅多年、近來吃老本的第一，筆下多一層怕被後浪蓋過的蒼涼。',
    emotionalStance: 'restrained',
};
const XIAFEI_QIANJIN: Soul = {
    toneRegister:
        '霞飛路洋場閨閣的質地：洋樓、綢緞、西洋座鐘、香片點心；嬌養、天真、藏不住的傾慕。金絲籠裡的綺念。',
    emotionalStance: 'tender',
};
const XIAFEI_SHIJING: Soul = {
    toneRegister: '市井白話、煙火氣：包子熱氣、銅板、池座人潮、街坊長短；熱心腸、藏不住的得意與捧場。',
    emotionalStance: 'tender',
};
const CHOU: Soul = {
    toneRegister: '丑角的眼：插科打諢、自嘲遮掩，看人最尖；累極了的後台疲態，話裡帶刺也帶暖。',
    emotionalStance: 'restrained',
};
const BANZHU: Soul = {
    toneRegister: '當家的眼：進項、座頭、人心、靠山、秩序；算盤先於情分，卻也最懂全班死活。',
    emotionalStance: 'restrained',
};

type C = {
    snap: characterWorker.CharacterSnapshot;
    soul: Soul;
    state?: characterWorker.CharacterState;
    rel: string[];
    trigger: string;
};

const CAST: C[] = [
    {
        snap: { id: '0xliu', name: '柳生春', role: '小生', gender: '女', ageYears: 24, sagaName: '春雪社', sceneName: '雲錦台後台', physicalFacts: '春雪社當紅小生（坤生）。瘦條條偏高、比尋常花旦高；帥得俊又美，台上風流少年郎，台下嬌軟。纖瘦最怕胖。', attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 } },
        soul: CHUNXUE_TENDER,
        state: { hunger: 0.3, fatigue: 0.5, mood: 0.7, note: '今晚跟師姐演《驚夢》演到忘我，台下滿堂彩，謝了幾次幕。' },
        rel: ['對蘇映雪：你最親最黏的師姐，方才台上那場戲，戲裡戲外的情都真。'],
        trigger: '散戲了。方才你扮柳夢梅，與師姐蘇映雪的杜麗娘演《驚夢》，演到那一段，戲裡的情和你心裡的真情攪在一處，分不清了；台下滿堂彩。這會兒你還沒從那股忘我裡退出來。',
    },
    {
        snap: { id: '0xsu', name: '蘇映雪', role: '花旦', gender: '女', ageYears: 26, sagaName: '春雪社', sceneName: '雲錦台後台', physicalFacts: '春雪社台柱花旦，端莊明麗、扮相雍容；台下懂分寸、會替全班圓場。', attributes: { appearance: 85, constitution: 72, acuity: 84, disposition: 80 } },
        soul: CHUNXUE_TENDER,
        state: { hunger: 0.3, fatigue: 0.45, mood: 0.4, note: '演杜麗娘對著生春的柳夢梅，戲假情真；謝幕時瞥見台下白家小姐一徑盯著生春。' },
        rel: ['對柳生春：你暗藏的戀慕、不肯讓糖的小郎君；台下那白家小姐盯著她，你心裡發緊。'],
        trigger: '散戲了。方才你扮杜麗娘，對著生春的柳夢梅唱《驚夢》，那情你不知是戲是真。謝幕時你一眼瞥見台下包廂裡，霞飛路白家的千金小姐，一徑直盯著生春不放。',
    },
    {
        snap: { id: '0xzheng', name: '鄭月卿', role: '小生', gender: '女', ageYears: 31, sagaName: '春雪社', sceneName: '雲錦台側幕', physicalFacts: '春雪社資深女小生，當紅多年、坐了頭一把交椅；近來有些吃老本，扮相仍穩，眼角添了風霜。', attributes: { appearance: 80, constitution: 68, acuity: 80, disposition: 64 } },
        soul: CHUNXUE_FADING,
        state: { hunger: 0.3, fatigue: 0.4, mood: -0.6, note: '站在側幕看柳生春那滿堂彩，自己吃老本的頭一份位子，覺著在腳底下晃。' },
        rel: ['對柳生春：後起的女小生，搶眼得很，你這頭一份的位子被她逼著。'],
        trigger: '散戲了。你站在側幕，看著柳生春那場《驚夢》引得滿堂彩、謝了一次又一次幕。你這當紅多年、坐了頭一把交椅的女小生，頭一回真切覺著，那位子在腳底下晃。',
    },
    {
        snap: { id: '0xbai', name: '白韻秋', role: '—', gender: '女', ageYears: 19, sagaName: '霞飛路', sceneName: '雲錦台包廂', physicalFacts: '霞飛路綢緞大莊的獨養千金，嬌養大的小姐，識洋文、迷戲尤迷小生；嬌憨任性，眼裡藏不住傾慕。', attributes: { appearance: 78, constitution: 64, acuity: 66, disposition: 58 } },
        soul: XIAFEI_QIANJIN,
        state: { hunger: 0.2, fatigue: 0.2, mood: 0.9, note: '頭一回這麼近看柳生春的戲，看得魂都飛了，散場了還捨不得走。' },
        rel: ['對柳生春：你心心念念的風流小生，今晚看她的戲看得神魂顛倒。'],
        trigger: '散戲了。你坐在白家包廂裡，頭一回這樣近看柳生春的戲。她扮的柳夢梅，一個眼神一個水袖，把你的魂都勾了去；散場了你還捨不得走。',
    },
    {
        snap: { id: '0xqin', name: '秦秀娥', role: '—', gender: '女', ageYears: 44, sagaName: '霞飛路', sceneName: '雲錦台池座', physicalFacts: '霞飛路口開湯包店的老闆娘，手粗嗓亮、圍裙常沾麵粉；老戲迷，尤迷柳生春的小生。', attributes: { appearance: 50, constitution: 78, acuity: 72, disposition: 74 } },
        soul: XIAFEI_SHIJING,
        state: { hunger: 0.2, fatigue: 0.3, mood: 0.9, note: '柳老闆今晚這齣太好了，叫好叫得嗓子都啞了，滿心想說給街坊聽。' },
        rel: ['對柳生春：你最捧的角兒，恨不能讓全霞飛路都知道她的好。'],
        trigger: '散戲了。你擠在池座裡，柳老闆今晚那齣《驚夢》好得你嗓子都喊啞了。你滿心只想著，明兒個一定要把這齣戲怎麼個好法，說給全霞飛路的街坊聽。',
    },
    {
        snap: { id: '0xlai', name: '賴金喜', role: '丑', gender: '男', ageYears: 35, sagaName: '春雪社', sceneName: '雲錦台後台', physicalFacts: '春雪社丑角，矮胖、一臉憨相，慣以插科打諢逗趣；今晚連趕了幾場戲，累垮了。', attributes: { appearance: 48, constitution: 66, acuity: 78, disposition: 70 } },
        soul: CHOU,
        state: { hunger: 0.5, fatigue: 0.8, mood: 0.2, note: '連趕了幾場戲累垮，後台條凳上癱著，冷眼看生春跟映雪那點眉來眼去。' },
        rel: ['對柳生春：打鬧慣了的同班師妹，你冷眼看她跟映雪那點不明不白。'],
        trigger: '散戲了。你連趕了幾場戲，累得在後台條凳上癱著。冷眼瞧著卸了妝的生春跟映雪湊在一塊兒，那點戲裡戲外不清不楚的眉眼，你都看在眼裡。',
    },
    {
        snap: { id: '0xtian', name: '田巧雲', role: '班主', gender: '女', ageYears: 46, sagaName: '春雪社', sceneName: '雲錦台側邊', physicalFacts: '春雪社班主、當家的；精明持重，一雙眼專看秩序與進項；掌著全班的生計。', attributes: { appearance: 70, constitution: 70, acuity: 88, disposition: 72 } },
        soul: BANZHU,
        state: { hunger: 0.3, fatigue: 0.3, mood: 0.3, note: '今晚滿座、白家小姐也賞臉，進項好；可柳生春越紅，鄭月卿那邊越要安撫。' },
        rel: ['對柳生春：戲班越來越倚重的台柱苗子。對鄭月卿：當紅多年、近來吃老本的第一，得安撫。對白韻秋：闊綽的潛在靠山。'],
        trigger: '散戲了。今晚滿座，白家千金也賞了臉。你這當家的站在側邊，一面算著今晚的進項與白家這門靠山，一面瞧著柳生春越來越紅、鄭月卿那邊的臉色越來越沉——這班子的人心，你得盤算。',
    },
];

async function chatRetry(client: ReturnType<typeof llmText.createTextClient>, req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0], tries = 4): Promise<{ text: string }> {
    let last: unknown;
    for (let t = 0; t < tries; t++) {
        try {
            return await client.chat(req);
        } catch (e) {
            last = e;
            await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
        }
    }
    throw last;
}

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 全角色大戲 · 一個演出夜 × 七個 POV\n`);

    const EVENT =
        '入夜，雲錦台。春雪社今晚的大軸是《牡丹亭·驚夢》：柳生春扮柳夢梅，台柱花旦蘇映雪扮杜麗娘。演到「則為你如花美眷、似水流年」那一折，兩人一個眼神、一段水袖纏綿，台下池座先是靜得落針可聞，繼而轟然叫好、滿堂彩，連謝三次幕。資深女小生鄭月卿立在側幕看著。包廂裡霞飛路白家千金白韻秋探身憑欄，目不轉睛；池座裡湯包店的秦秀娥拍紅了手掌、喊啞了嗓子。丑角賴金喜趕完自己的戲，癱在後台條凳上。班主田巧雲立在側邊，眼掃全場。';

    const obj = await chatRetry(client, {
        model,
        system: '你是這個世界的場記。把今晚這樁事，用客觀第三人稱寫成一段「發生了什麼」——只寫看得見、聽得見的：誰在哪、做了什麼、說了什麼、全場如何反應。**絕不寫任何人的內心、動機、感受**。220–320 字，舊白話，直接進正文。',
        messages: [{ role: 'user', content: `# 事件\n${EVENT}\n\n寫這樁事的客觀記錄。` }],
        maxTokens: 800,
        temperature: 0.6,
    });
    const objText = obj.text.trim();
    console.log(`━━━━ 屬地·客觀章回（雲錦台·事發地，共享事實，無人之內心）━━━━\n${objText}\n`);

    // pin the shared observable facts → every POV interprets the SAME night (the §2.24 lesson)
    const sceneBeats = objText
        .split(/(?<=[。！])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8)
        .slice(0, 8);

    for (const c of CAST) {
        const system = characterWorker.buildPovSystemPrompt(c.soul, 'pov');
        const user = characterWorker.buildPovUserPrompt({
            character: c.snap,
            triggerNarrative: c.trigger,
            recentMemorySnippets: [],
            relationshipHints: c.rel,
            sceneBeats,
            state: c.state,
        });
        const r = await chatRetry(client, { model, system, messages: [{ role: 'user', content: user }], maxTokens: 1200, temperature: 0.84 });
        console.log(`━━━━ ${c.snap.name}（${c.snap.role}）POV ━━━━\n${r.text.trim()}\n`);
    }

    console.log('看:七個 POV 詮釋同一夜（共享 sceneBeats），是否自己織出——蘇的醋、白的迷面具、鄭的吃老本被逼、秦的說嘴、賴的旁觀、田的算盤、柳的忘我。沒寫進客觀事實的張力若自己浮出，多角湧現成立。');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
