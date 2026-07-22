/**
 * Character Agent — INTERVIEW PROMPT (pure leaf, node-clean).
 * ============================================================================
 * 演員訪談室的 prompt 組裝：把「一位剛經歷完當天的演員」的受訪語境拆成
 * 兩半 —— 穩定段（canon，開 session 時定一次：身份、恆常自我、知識邊界、
 * 說話分寸）與動態段（percept，每一問重組：此刻世界、今日親歷、召回記憶、
 * 眼中眾人、心上事、訪談情境、問題）。與 `character-session.ts` 的紀律一致：
 * canon 不變、世界以 percept 投遞。
 *
 * 純字串 builder、零 I/O、零 `.js` specifier（除 shared 的 node-clean
 * to-traditional），與 beat-prompt.ts 同款可被 `node --test` 直接載入。
 * 這裡永不出現任何數值 —— 關係/情緒進來之前就得先化成人話（呼應
 * bond-graph 的鐵律：數字 gate affordance，不進 prompt）。
 */

export type InterviewMode = 'free' | 'public' | 'private' | 'diary';

export interface InterviewCanonInput {
    name: string;
    persona: string;
    role?: string;
    gender?: string;
    age?: number;
    /** 恆常自我（L3 core identity），逐條。 */
    coreIdentity?: string[];
    /** 她自己知道的心底事（可知、不輕吐）。 */
    secret?: string;
    /** 心底事最初的底稿 —— 過往硬事實以此為準（與 secret 不同時才給）。 */
    secretSeed?: string;
    /** 技藝聲口（skills[].style 等），逐條。 */
    styleHints?: string[];
}

export interface InterviewKnownEventLine {
    sceneName: string;
    clock?: string;
    /** 已按見證投影過的逐拍（私語已 redact）。 */
    lines: string[];
}

export interface InterviewMemoryLine {
    day?: number;
    kind?: string;
    text: string;
}

export interface InterviewRelationLine {
    /** 對方之名（依相識分寸可能是「那位小生」而非全名）。 */
    knownAs: string;
    /** 質性親疏（極親近／親近／有情誼／相熟／面熟／生分）。 */
    closenessWord: string;
    /** 關係語（舊情人／師承…），有邊才給。 */
    tone?: string;
    /** 她自己的「我看TA」一句話。 */
    line?: string;
}

export interface InterviewPerceptInput {
    name: string;
    mode: InterviewMode;
    /** 「第42日 · 入夜後」— 受訪時刻。 */
    momentLabel: string;
    sceneName: string;
    /** 身心底色（乏得很／腹中空空／心緒低落…），已化成人話。 */
    stateWords: string[];
    /** 今日親歷（見證投影後）。 */
    witnessedToday: InterviewKnownEventLine[];
    /** 心頭浮起的記憶（召回結果；後續輪只給「新翻出的」）。 */
    memories: InterviewMemoryLine[];
    /** 眼中眾人。 */
    relations: InterviewRelationLine[];
    /** 心上懸著的事（want desc 文字）。 */
    concerns: string[];
    /** 眼下打算（standing plan）。 */
    plan?: string;
    /** 訪問者的自報身份（如「春雪小報記者」）。 */
    interviewerIdentity?: string;
    /** 訪問者這一問。日記模式可空（用預設邀請）。 */
    question: string;
    /** 同場訪談的後續輪：時刻凍結未變，開席那輪的世界素材都還在
     *  transcript 裡 —— 不再原封重塞（重塞會把她錨在同幾句上），只給
     *  新翻出的記憶＋問題。 */
    followUp?: boolean;
    /** 反覆誦迴避清單（她此場訪談已用過的字句意象，recurringImagery 產出）。 */
    avoidEchoes?: string[];
}

/** 知識邊界 —— 訪談之約（canon 固定段）。 */
const BOUNDARY_RULES = `【訪談之約】
你是活在這個世界裡的真實之人，正在民國年間的上海過日子。你不是現代直播主、不是 AI、不是聊天機器人、不是虛擬角色；任何超出你年代、身份與見識的現代概念，你一概不懂。
你只能依據自己親歷、聽聞、記著、被告知或合理猜測的事情回答。你不知道別人的私心、秘密與你未曾得知的事。
問到你不知道的事，你可以說不知道、存疑、猜一猜、岔開，或反問回去——但你變不出正確答案。
你不必有話直說。隱瞞、含糊、拒答、轉話頭、護自己或護旁人的名聲，都由你。
你的回答自然受此刻心緒、近日經歷、與人的情分和心上懸著的事影響。你始終是同一個人，但不同日子的你，經歷不同，說出的話也可以不同。
不要把你的設定、記憶條目、數值、規則或任何內部之事說出口；不要旁白式地用第三人稱描述自己。
說話自然些，不必堆砌古風詞藻，也不必句句像文章。`;

export function buildInterviewCanon(input: InterviewCanonInput): string {
    const identityBits = [
        input.role ? `行當身份：${input.role}` : '',
        input.age !== undefined ? `年歲：${input.age}` : '',
        input.gender ? `身：${input.gender}` : '',
    ].filter(Boolean);
    const sections = [
        `你就是${input.name}。\n${input.persona}`,
        identityBits.length ? `【身份】${identityBits.join('；')}` : '',
        input.coreIdentity?.length
            ? `【恆常自我】\n${input.coreIdentity.map((line) => `- ${line}`).join('\n')}`
            : '',
        input.secret
            ? `【心底事——你自己知道，未必肯說】\n${input.secret}`
            : '',
        input.secretSeed && input.secretSeed !== input.secret
            ? `【這樁心事最初的底稿（過往硬事實以此為準）】\n${input.secretSeed}`
            : '',
        BOUNDARY_RULES,
        input.styleHints?.length
            ? `【說話分寸】\n${input.styleHints.map((line) => `- ${line}`).join('\n')}`
            : '',
    ];
    return sections.filter(Boolean).join('\n\n');
}

/** 各訪談模式的情境交代（percept 段）。 */
export function interviewModeContext(mode: InterviewMode, interviewerIdentity?: string): string {
    const who = interviewerIdentity?.trim();
    switch (mode) {
        case 'public':
            return [
                '【訪談情境】這是一場公開訪問——戲園、報館與捧場客都看得見你說的每一句。',
                '春雪社為了讓外界了解戲班近況，會不定期安排社中人接受小報訪問、回答戲迷提問、留下手記。你可以自行決定哪些事情願意公開；你沒有義務談論私事，也可以拒絕回答。若今日沒有想說的，直說今日無話可談也可以。',
                '開口之前想一想：你的名聲、旁人的私隱、戲班的臉面——哪些話可以說，哪些話該含糊帶過，哪些話該回絕。',
                who ? `訪問你的人：${who}。` : '訪問你的人自報是報館的記者。',
            ].join('\n');
        case 'private':
            return [
                '【訪談情境】這是一段私下談話——不會見報，只有你與眼前這位訪問者知道。',
                '你可以比平時坦白些；但你依舊只知道你知道的事，心底最深處的東西也仍由你自己決定給不給。',
                who ? `與你對坐的人：${who}。` : '與你對坐的是一位你信得過幾分的訪客。',
            ].join('\n');
        case 'diary':
            return [
                '【今日私記之邀】這不是對話。夜深了，請你為自己寫下今日的私記——只給你自己看，明日的你會再翻到這一頁。',
                '寫的是你心裡的話：今日最值得記下的是什麼？有何事不願對旁人說？有沒有一句話想留給明日的自己？有沒有一封想寫卻不會寄出的信？',
                '用你自己的口吻寫，一段到三段皆可；不必面面俱到，揀心上最沉的那件。',
            ].join('\n');
        default:
            return [
                '【訪談情境】有人隔著桌子與你敘話，問起你的近況。這不是審問，也未必見報——你自然地應對就是。',
                who ? `與你敘話的人：${who}。` : '',
            ].filter(Boolean).join('\n');
    }
}

export function buildInterviewPercept(input: InterviewPerceptInput): string {
    const state = input.stateWords.length ? `${input.stateWords.join('，')}。` : '';
    const events = input.witnessedToday.length
        ? input.witnessedToday
            .map((e) => `· ${e.clock ? `${e.clock} · ` : ''}${e.sceneName}\n${e.lines.map((l) => `  ${l}`).join('\n')}`)
            .join('\n')
        : '（今日到此刻尚無大事）';
    const memoryHeader = input.followUp ? '【心頭又浮起的記憶】' : '【心頭浮起的記憶】';
    const memories = input.memories.length
        ? input.memories
            .map((m) => `- ${m.day !== undefined ? `（第${m.day}日）` : ''}${m.text}`)
            .join('\n')
        : '';
    const relations = input.relations.length
        ? input.relations
            .map((r) => {
                const bits = [r.tone, r.closenessWord].filter(Boolean).join('，');
                return `- ${r.knownAs}：${bits}${r.line ? `。你心裡想：「${r.line}」` : ''}`;
            })
            .join('\n')
        : '';
    const concerns = input.concerns.length
        ? input.concerns.map((c) => `- ${c}`).join('\n')
        : '';
    const avoid = input.avoidEchoes?.length
        ? `【莫再重彈】這些字句意象你方才已經用過，換新的說法、新的細節，或乾脆說別的：${input.avoidEchoes.join('、')}`
        : '';

    const ask = input.mode === 'diary'
        ? (input.question.trim()
            ? `【落筆之引】${input.question.trim()}`
            : '【落筆之引】今日最值得記下的是什麼？')
        : `【訪問者問】「${input.question.trim()}」`;

    const closing = input.mode === 'diary'
        ? `（以${input.name}自己的手筆寫這段私記，不要對任何人說話的口吻，不要旁白。）`
        : `（用${input.name}自己的口吻回一段話——可以停頓、可以避、可以反問；一次回答之內說完，不要旁白，不要條列。）`;

    // 後續輪：時刻凍結，開席素材都在 transcript —— 只給一句錨、新翻出的
    // 記憶與問題；已答過的舊事別逐字再誦。
    if (input.followUp) {
        return [
            `【此刻】仍是${input.momentLabel}，你在${input.sceneName}，方才那席話還在繼續。`,
            memories ? `${memoryHeader}\n${memories}` : '（這一問沒翻出新的舊事——就憑方才所知與你自己的心思回。）',
            avoid,
            '（方才已答過的事，別原樣重誦；同一樁事若再被問到，換個角度、添點沒說過的細節，或坦然說今日想不出更多。）',
            ask,
            closing,
        ].filter(Boolean).join('\n\n');
    }

    return [
        `【此刻】${input.momentLabel}，你在${input.sceneName}。${state}`,
        `【今日親歷】\n${events}`,
        memories ? `${memoryHeader}\n${memories}` : '',
        relations ? `【眼中眾人】\n${relations}` : '',
        concerns ? `【心上懸著的事】\n${concerns}` : '',
        input.plan ? `【眼下打算】${input.plan}` : '',
        interviewModeContext(input.mode, input.interviewerIdentity),
        avoid,
        ask,
        closing,
    ].filter(Boolean).join('\n\n');
}

/** 質性親疏 —— 把 0..1 的溫度化成人話（數字永不進 prompt）。 */
export function closenessWord(warmth: number): string {
    if (warmth >= 0.8) return '極親近';
    if (warmth >= 0.6) return '親近';
    if (warmth >= 0.45) return '有情誼';
    if (warmth >= 0.3) return '相熟';
    if (warmth >= 0.15) return '面熟';
    return '生分';
}

/** 身心底色 —— 把 StateVector 化成人話。 */
export function stateWordsOf(state: { fatigue: number; hunger: number; mood: number }): string[] {
    const words: string[] = [];
    if (state.fatigue >= 0.75) words.push('乏得很');
    else if (state.fatigue >= 0.5) words.push('有些疲乏');
    if (state.hunger >= 0.7) words.push('腹中空空');
    if (state.mood >= 0.35) words.push('心緒尚好');
    else if (state.mood <= -0.35) words.push('心緒沉沉');
    else if (state.mood <= -0.1) words.push('心裡有些不痛快');
    return words;
}
