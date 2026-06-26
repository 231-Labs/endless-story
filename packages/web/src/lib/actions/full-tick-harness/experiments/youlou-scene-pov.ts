/**
 * 洋樓一場戲 · 真實 POV — five validated mechanisms woven into ONE real generated scene, to see
 * the prose (not a synopsis). 柳生春 is at 白韻秋's 洋樓 to 作陪 (went for the 班's patronage, heart
 * with 師姐). Generates THREE blobs through the REAL characterWorker POV path:
 *   ① 屬地客觀章回 — by the place (洋樓), observable only, no one's interior  (§2.14)
 *   ② 柳生春 屬人 POV — outwardly 風流 to 白韻秋, inwardly 累 + 想師姐 (洋點心 vs 暖湯)  (§2.17 人前人後,
 *       §2.18 二維移情, §2.19 state colouring — fatigue high + mood low injected)
 *   ③ 白韻秋 屬人 POV — enchanted by the 風流 mask, oblivious to the real 柳生春  (§2.18 mask-love irony)
 * Same room, two POVs seeing completely different things = the engine's emergent texture, real.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/youlou-scene-pov.ts
 */

import { hasTextProviderKey } from '../narrative-setup';
import { text as llmText } from '@endless-story/llm';
import { characterWorker } from '@endless-story/runner';

const CHUNXUE_SOUL: characterWorker.SagaSoul = {
    toneRegister: '梨園後台的質地：身段、調門、妝面、台下目光、行頭冷暖；含蓄、戲味。',
    emotionalStance: 'tender',
};
const XIAFEI_QIANJIN_SOUL: characterWorker.SagaSoul = {
    toneRegister:
        '霞飛路洋場閨閣的質地：洋樓、綢緞、西洋座鐘、留聲機、香片與點心；嬌養、天真、帶點被寵壞的任性與藏不住的傾慕。不是後台油彩，是金絲籠裡的綺念。',
    emotionalStance: 'tender',
};

const LIU: characterWorker.CharacterSnapshot = {
    id: '0xliu-sheng-chun',
    name: '柳生春',
    role: '小生',
    gender: '女',
    ageYears: 24,
    sagaName: '春雪社',
    sceneName: '白公館洋樓',
    physicalFacts:
        '春雪社當紅小生（坤生）。瘦條條偏高、比尋常花旦高；一張臉帥得俊又美得很，台上風流不羈的少年郎，一下戲卻滿是女兒家嬌軟。纖瘦，女小生最怕胖。',
    attributes: { appearance: 88, constitution: 70, acuity: 82, disposition: 76 },
};
// 柳生春 此刻身心：趕場本就累，洋樓應酬更乏，心情堵著想回師姐身邊（§2.19 state）
const LIU_STATE: characterWorker.CharacterState = {
    hunger: 0.3,
    fatigue: 0.75,
    mood: -0.55,
    note: '被班主勸著來給白家作陪，撐著台上那副風流應酬，心裡一徑惦記著後台的師姐蘇映雪。',
};

const BAI: characterWorker.CharacterSnapshot = {
    id: '0xbai-yunqiu',
    name: '白韻秋',
    role: '—',
    gender: '女',
    ageYears: 19,
    sagaName: '霞飛路',
    sceneName: '白公館洋樓',
    physicalFacts:
        '霞飛路綢緞大莊的獨養千金，嬌養大的小姐，識得幾個洋文、迷戲尤迷小生；嬌憨任性，眼裡藏不住傾慕。',
    attributes: { appearance: 78, constitution: 64, acuity: 66, disposition: 58 },
};

const REL_LIU = ['對蘇映雪：你最親、最肯卸下防備的師姐，此刻你最想回去的是她身邊。'];
const REL_BAI = ['對柳生春：你心心念念、捧場捧到請進家門的當紅小生，你只想離她再近些。'];

async function chatRetry(
    client: ReturnType<typeof llmText.createTextClient>,
    req: Parameters<ReturnType<typeof llmText.createTextClient>['chat']>[0],
    tries = 4,
): Promise<{ text: string }> {
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

async function pov(
    client: ReturnType<typeof llmText.createTextClient>,
    model: string,
    soul: characterWorker.SagaSoul,
    character: characterWorker.CharacterSnapshot,
    trigger: string,
    relationshipHints: string[],
    state?: characterWorker.CharacterState,
): Promise<string> {
    const system = characterWorker.buildPovSystemPrompt(soul, 'pov');
    const user = characterWorker.buildPovUserPrompt({
        character,
        triggerNarrative: trigger,
        recentMemorySnippets: [],
        relationshipHints,
        state,
    });
    const r = await chatRetry(client, {
        model,
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: 1400,
        temperature: 0.82,
    });
    return r.text.trim();
}

const EVENT =
    '入夜，霞飛路白公館的洋樓。綢緞大莊的千金白韻秋設下小宴，請了春雪社的當紅小生柳生春來作陪——說戲、聽曲、陪她解悶。柳生春應約而來，一身利落小生打扮，台上那股風流瀟灑半分不減；白韻秋執意要她近前說話，眼裡藏不住傾慕。';

async function main(): Promise<void> {
    if (!hasTextProviderKey()) {
        console.error('no text provider key');
        process.exit(2);
    }
    const client = llmText.createTextClient({ kind: 'primary' });
    const model = client.defaultModel;
    console.log(`model: ${model} · 洋樓一場戲 · 屬地客觀 + 柳生春 POV(帶狀態) + 白韻秋 POV\n`);

    const objective = await chatRetry(client, {
        model,
        system:
            '你是這個世界的場記。把剛發生的一樁事，用客觀第三人稱寫成一小段「發生了什麼」——只寫看得見、聽得見的：誰來了、做了什麼、說了什麼、神色如何。**絕不寫任何人的內心、動機、感受**（那是各人 POV 的事）。200–300 字，舊白話，直接進正文。',
        messages: [{ role: 'user', content: `# 事件\n${EVENT}\n\n寫這樁事的客觀記錄。` }],
        maxTokens: 800,
        temperature: 0.6,
    });
    console.log(`━━━━ ① 屬地·客觀章回（白公館洋樓·事發地，無人之內心）━━━━\n${objective.text.trim()}\n`);

    const liuPov = await pov(
        client,
        model,
        CHUNXUE_SOUL,
        LIU,
        '你被班主勸著、為了白家這門闊靠山，來到霞飛路白公館的洋樓給千金白韻秋作陪。你端出台上那副風流瀟灑應對她的傾慕，言笑周旋滴水不漏；可你今晚趕場本就累了，這會兒應酬更乏，心裡頭一徑惦記著後台的師姐蘇映雪——那碗踏實的暖，比這洋樓裡的洋點心受用。',
        REL_LIU,
        LIU_STATE,
    );
    console.log(`━━━━ ② 屬人·柳生春 POV（人前風流／人後想師姐＋累堵狀態）━━━━\n${liuPov}\n`);

    const baiPov = await pov(
        client,
        model,
        XIAFEI_QIANJIN_SOUL,
        BAI,
        '你（白韻秋）終於把心心念念的柳生春請進了自家洋樓。她一進門，那股台上的風流瀟灑就攫住了你的眼——摺扇、眉眼、說戲時的神采，比你看過的任何戲都好看。你只想離她再近些，把這風流少年郎的每一分都看進眼裡。',
        REL_BAI,
    );
    console.log(`━━━━ ③ 屬人·白韻秋 POV（只看見台上的風流面具·§2.18 反諷）━━━━\n${baiPov}\n`);

    console.log(
        '看:① 客觀章回無人內心;② 柳生春 POV 是累堵+人前風流人後想師姐(洋點心 vs 暖湯);' +
            '③ 白韻秋 POV 一心迷那個風流少年郎、渾然不知對面那個是個累壞了、只想回師姐身邊的女兒身。同一個房間，兩種完全不同的看見。',
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
