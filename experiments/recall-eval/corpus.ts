// Recall eval corpus — a single character's memory namespace (葉庭芳 / char_ye_tingfang).
//
// Built to answer one question: does writing an ENTIRE multi-topic POV chapter as one
// memory (current behavior) hurt three-factor recall vs. pre-processing it (summary
// embedText / chunking) before write?
//
// Evaluation unit = FACT (資訊點), not memory id. Each source memory is a list of
// segments, each segment tagged with the facts it carries. A "raw" memory joins all
// segments into one blob (one embedding for many facts → dilution); a "chunk" memory
// emits one record per segment (one embedding per fact). Queries declare which facts
// SHOULD surface (ground truth), so chunk-vs-raw is scored on the same fact basis.
//
// Text is hand-written in the voice/world of packages/web/src/mocks/chapters.ts
// (《白蛇傳》· 春雪社) so the corpus matches what the live pipeline actually produces.

export type Kind =
    | 'dream'
    | 'reflection'
    | 'chapter'
    | 'observation'
    | 'relationship'
    | 'genesis'
    | 'plan';

// Mirror of DEFAULT_IMPORTANCE in packages/web/src/lib/chain/memory-tags.ts (kept in
// sync by hand; this package is import-isolated from web's @endless-story/shared chain).
export const DEFAULT_IMPORTANCE: Record<Kind, number> = {
    dream: 9,
    relationship: 8,
    plan: 8,
    reflection: 7,
    genesis: 7,
    chapter: 5,
    observation: 4,
};

export interface Segment {
    text: string;
    /** Fact ids this segment carries (ground-truth unit). */
    facts: string[];
}

export interface SourceMemory {
    id: string;
    kind: Kind;
    /** Narrative day written (recency). */
    day: number;
    /** Override DEFAULT_IMPORTANCE[kind] if set. */
    importance?: number;
    /** Sleep-consolidated anchor (pinned past relevance floor). */
    anchored?: boolean;
    /** One blob if raw-joined; one record per segment if chunked. */
    segments: Segment[];
}

// ---- Facts (資訊點) — the things a query might want to recall -------------------------
export const FACTS: Record<string, string> = {
    F_self: '葉庭芳的出身與性子（旦角、寡言、入春雪社）',
    F_bangbo: '第一日蕭班主貼榜，九人爭唯一的許仙',
    F_gramophone: '晚飯時杜聽瀾放留聲機，漏出一段舊《貴妃醉酒》',
    F_shen_past: '沈班主聽出是補錄版本、起身離席；她二十年前掛樑，如今不肯讓人聽見當年的嗓子',
    F_fishsoup: '葉庭芳替沒上桌的梁照水端魚湯擱在門檻、沒敲門',
    F_shuixiu: '夜半葉庭芳替程蘅玉重繫綁錯的水袖；繫了就是讓了',
    F_cheng_feel: '葉庭芳對程蘅玉的情感：在乎她繫水袖時有沒有抬頭看自己',
    F_plan_xuxian: '葉庭芳的當日目標：拿下許仙這個位置',
    F_liang_solo: '梁照水獨自練銀槍，把自己練成戲樓的骨',
    F_morning_avoid: '第四日晨課，葉庭芳看見梁照水卻繞到另一邊吊嗓、沒打招呼',
    F_meng: '第二日試戲，孟雲屏唱斷橋走了調、硬轉成哭腔',
    F_dream: '（戲主注入的夢）一條河、一把油紙傘、有人在橋上等',
};

// ---- Source memories ------------------------------------------------------------------
// M3 / M7 are the long multi-topic POV chapters (the thing under test): one write that
// fuses 3-5 facts. Everything else is naturally short (observation/relationship/plan)
// or a pin (genesis/plan/dream/anchored reflection) — competition + distractors so the
// namespace has realistic scale.
export const SOURCE_MEMORIES: SourceMemory[] = [
    {
        id: 'M1_genesis',
        kind: 'genesis',
        day: 0,
        segments: [
            {
                text: '我是葉庭芳，唱旦的。十四歲被賣進戲班，輾轉到春雪社時已經能挑大樑。我話少，戲裡的悲歡夠了，台下不必再說一遍。蕭班主收我那天只問一句：「你怕不怕站台口看別人唱完？」我說不怕。',
                facts: ['F_self'],
            },
        ],
    },
    {
        id: 'M2_day1_bangbo',
        kind: 'chapter',
        day: 1,
        segments: [
            {
                text: '清晨蕭班主把戲碼貼上後台板。九個名字、九個位置，只有一個許仙。後台一時靜得連胡琴試弦都顯尖。我沒看完榜便進了廂房——位置是搶來的，不是看來的。',
                facts: ['F_bangbo'],
            },
        ],
    },
    {
        id: 'M9_day2_meng',
        kind: 'observation',
        day: 2,
        segments: [
            {
                text: '今天試許仙，孟雲屏唱到斷橋那一段忽然走了調。杜聽瀾的胡琴沒停，她也沒停，硬把那個錯音轉成了哭腔。蕭班主只說了三個字：「再來。」',
                facts: ['F_meng'],
            },
        ],
    },
    {
        // THE multi-topic long POV chapter (day 3 night), rewritten to the REAL spec the
        // runner asks for: 700–1100 字, 4–7 段 (character-worker/prompt.ts:154). 7 segments,
        // ~1030 字, two of them pure atmosphere (facts:[]) — exactly the filler prose that
        // dilutes a whole-chapter embedding without carrying any recallable fact.
        id: 'M3_day3_night',
        kind: 'chapter',
        day: 3,
        segments: [
            {
                text: '暮色四合，散了戲，蕭班主把全社聚到後堂用飯。八仙桌兩張，南北擺開，燈芯撥得很亮。唐桂蘭從蘇州河碼頭採辦回來，鯽魚兩條、青菜一把，灶上熱氣把窗紙都熏軟了。我揀了個靠門的位子坐下，這樣誰進誰出，我都看得見。',
                facts: [],
            },
            {
                text: '杜聽瀾從青灰短褂的胸口摸出一個漆木針盤，輕輕擱在桌角，蓋上唱針。一段不知哪一年灌的《貴妃醉酒》從那台洋人的留聲機裡漏出來，沙啞得像隔著二十年的塵。滿桌的人都靜了，蕭班主的筷子停在半空，沒有落下。蘇小宛還想問什麼，被唐桂蘭按住了手。',
                facts: ['F_gramophone'],
            },
            {
                text: '「這張不是當年灌的版本。」蕭班主終於開口，聲音很輕，「後段有人補錄。」她把筷子擱下，起身，慢慢往內院走去，背影在燈影裡顯得比平日矮。我望著她的背影，忽然就懂了：沈班主這條嗓子不是唱壞了，是她不肯讓人聽見當年那個自己、如今再也唱不出來的音。她從此不再登台，原來是為了這個。',
                facts: ['F_shen_past'],
            },
            {
                text: '梁照水自始至終沒上桌。她在院子裡練槍，練到月亮都斜了，那桿銀槍來來回回掃了三十六圈，槍尖挑起的風隔著門都覺得涼。我盛了一碗還溫著的魚湯，端過去擱在她練槍的院門門檻上，沒敲門，也沒喚她，擱下就回頭。有些事你替一個人做了，是不能讓她看見你做的。',
                facts: ['F_fishsoup'],
            },
            {
                text: '回身的時候，我看見程蘅玉站在廊下的陰影裡，不知站了多久。兩個人的目光在半空裡撞上，誰都沒有先開口，誰也沒有先走開。風從天井灌進來，吹得廊下那盞燈晃了晃。後堂的燈那一夜一直亮到亥時，沒有人提議散。',
                facts: ['F_cheng_feel'],
            },
            {
                text: '夜半三更，廂房外頭還有人在練。是程蘅玉，低聲背著遊湖的詞，背到第三遍仍不順。我本來只是路過，要去櫃子最底層找半條去年改窄的水袖。可我看見她的水袖綁得太緊，那樣甩出去，准會卡在肘彎。我沒敲門，蹲下身，把那條水袖一寸一寸放鬆，替她重新繫了一遍。繫好的那一刻她低頭看我。我們都知道，明天蕭班主就要把許仙定下，無論誰拿到那個位置，另一個都會回到台口側幕，靜靜把對方那齣戲看完。這一袖綁的，從來不只是水袖。',
                facts: ['F_shuixiu', 'F_cheng_feel'],
            },
            {
                text: '我回到自己的廂房時，天還沒亮。窗外那株老梅落了一地，掃也掃不淨。我把油燈撥小，躺下卻睡不著。明日一早，榜上那個唯一的許仙就要有主，這半社人爭了三天的東西，到天亮就見分曉。那重量壓在胸口，像一床濕透的棉被。我吹了燈，聽見自己的心跳，比胡琴的板還慢。',
                facts: [],
            },
        ],
    },
    {
        id: 'M4_day3_rel_cheng',
        kind: 'relationship',
        day: 3,
        segments: [
            {
                text: '程蘅玉。我替她繫水袖的時候，在意的從來不是那個位置，是她有沒有抬頭看我。她沒抬。但她讓我繫了——讓我繫了就是讓了。',
                facts: ['F_cheng_feel', 'F_shuixiu'],
            },
        ],
    },
    {
        id: 'M5_day3_obs_fishsoup',
        kind: 'observation',
        day: 3,
        segments: [
            {
                text: '我在後堂替梁照水留了一碗魚湯，擱在她練槍的院門門檻上，沒敲門。',
                facts: ['F_fishsoup'],
            },
        ],
    },
    {
        id: 'M6_day3_plan',
        kind: 'plan',
        day: 3,
        segments: [
            {
                text: '我的目標：明日拿下許仙。此刻想做的事——把遊湖那段身段再過三遍，別讓任何人有理由點別人。未竟之事：跟程蘅玉之間那句沒說出口的話，先擱著，戲贏了再說。',
                facts: ['F_plan_xuxian', 'F_bangbo'],
            },
        ],
    },
    {
        id: 'M10_day3_dream',
        kind: 'dream',
        day: 3,
        segments: [
            {
                text: '（夢）一條河，一把油紙傘。有人在斷橋上等我，可是我看不清臉。水漲上來的時候，傘是借的，橋是真的。',
                facts: ['F_dream'],
            },
        ],
    },
    {
        // Second long POV chapter (day 4 morning), real spec: 5 段 ~730 字, two atmosphere.
        id: 'M7_day4_morning',
        kind: 'chapter',
        day: 4,
        segments: [
            {
                text: '第四日的天還是灰的，霜結在院子的青磚上沒化。梁照水比誰都早，銀槍已經掃了七圈，槍纓上沾的霜化成水，順著槍桿往她腕子上淌，她也不擦。蕭班主說過，她是這座戲樓的骨。骨頭不會喊痛，骨頭只負責把整座樓撐住。',
                facts: ['F_liang_solo'],
            },
            {
                text: '我出來吊嗓的時候看見了她。腳步頓了一下，到底沒有過去，也沒有招呼，繞到院子另一頭，背過身去開嗓。昨夜後堂裡那些沒說出口的事，此刻還堵在喉嚨口，我不知道該用哪個調門對她開口，索性就不開口。嗓子先放出去，人就能躲在聲音後面。',
                facts: ['F_morning_avoid'],
            },
            {
                text: '晨霧還沒散，後堂飄出煮粥的氣味。唐桂蘭在井邊絞水，繩子吱呀吱呀地響。蘇小宛抱著一摞戲服打廂房門口過，邊走邊打哈欠，差點絆在門檻上。這座院子每天都是這樣醒過來的，不管夜裡發生過什麼，天一亮，水照打，嗓照吊，粥照煮。',
                facts: [],
            },
            {
                text: '程蘅玉沒有出現。她昨夜大約一宿沒睡。我一邊吊著嗓，一邊想起那條水袖，想起我替她繫好的時候，她低著頭，到底沒有抬眼看我。可是繫得比我自己那條還要整齊的，是我的手。這念頭一冒出來，嗓子就走了半個音，我趕緊收住，怕被人聽出來。',
                facts: ['F_cheng_feel', 'F_shuixiu'],
            },
            {
                text: '日頭慢慢爬上院牆，把霜曬出一層薄薄的亮。我把遊湖的調子又過了一遍，這一遍沒有錯。台口側幕的位置我站過很多回，今天我不想再站那裡。蕭班主的毛筆懸在許仙二字上頭三天了，我聽說，今早就要落下。',
                facts: [],
            },
        ],
    },
    {
        id: 'M8_day4_reflection',
        kind: 'reflection',
        day: 4,
        anchored: true,
        segments: [
            {
                text: '這幾日我才認清：我爭許仙是真的，可我替程蘅玉繫那一袖、替梁照水留那碗湯，也是真的。我不是只會站台口看別人唱完的人，我只是把想說的都繫進了別人的水袖裡。',
                facts: ['F_shuixiu', 'F_cheng_feel'],
            },
        ],
    },
    // ---- distractors (keep namespace competitive; carry NO query-relevant facts) -----
    // Deliberately near the queries in vocabulary (水袖/留聲機/許仙/魚湯/程蘅玉…) so they
    // exert real false-positive pressure on top-K, the way hundreds of real memories would.
    ...makeDistractors(),
];

function obs(id: string, day: number, text: string, kind: Kind = 'observation'): SourceMemory {
    return { id, kind, day, segments: [{ text, facts: [] }] };
}

function makeDistractors(): SourceMemory[] {
    return [
        // near 水袖 / 戲服 / 程蘅玉
        obs('D01', 1, '唐桂蘭把九套戲服的水袖逐一量過，程蘅玉那件袖口去年磨破，得換新緞子。'),
        obs('D02', 2, '頭面匣子裡少了一支點翠，蘇小宛翻了半天，最後在杜聽瀾的胡琴盒底找到。'),
        obs('D03', 3, '程蘅玉午後在天井曬嗓，唱的是別齣戲的西皮，跟遊湖無關。'),
        obs('D04', 2, '戲服房潮氣重，葉庭芳把幾件水袖拿出來晾，順手替蘇小宛把綁帶也理了。'),
        obs('D05', 4, '裁縫來量新人的行頭，程蘅玉站在一旁看，沒說話也沒走。'),
        // near 留聲機 / 樂器 / 沈班主
        obs('D06', 1, '杜聽瀾的胡琴換了新弦，試了三遍音都偏高，她說是天氣的緣故。'),
        obs('D07', 3, '洋人的留聲機要上發條才轉，蘇小宛上得太緊，差點把簧片崩了。'),
        obs('D08', 2, '蕭班主把後堂的座次重排了一遍，八仙桌兩張，南北擺開。'),
        obs('D09', 4, '沈班主吩咐把霞飛路那張海報的字再描粗一點，洋人看不懂小字。'),
        obs('D10', 3, '杜聽瀾右肩舊傷又犯，煮飯時鍋鏟使得比平日慢。'),
        // near 許仙 / 試戲 / 排練
        obs('D11', 1, '《白蛇傳》的戲碼貼出來那天，後台連掃地的都在數九個位置。', 'chapter'),
        obs('D12', 2, '孟雲屏把斷橋那段又走了一遍，這回沒走調，蕭班主仍只說「再來」。'),
        obs('D13', 3, '梁照水問能不能也報小青，蕭班主沒答，只讓她先把槍練齊。'),
        obs('D14', 4, '排練排到亥時，蘇小宛困得在側幕睡著，被唐桂蘭挪到廂房去。'),
        obs('D15', 2, '蕭班主把毛筆擱下又拿起，許仙二字始終沒落到任何名字上。'),
        // near 魚湯 / 飲食 / 梁照水
        obs('D16', 1, '唐桂蘭採辦回來的青菜擱久了發蔫，晚飯改炒了別的。'),
        obs('D17', 3, '梁照水練槍從不吃宵夜，說飽了使不動腰。'),
        obs('D18', 4, '後堂的灶台漏煙，唐桂蘭蹲了一早上才通好。'),
        // neutral 票房 / 天氣 / 雜務
        obs('D19', 2, '霞飛路口的票房預售只賣出三成，洋大人的包廂仍空著兩個。'),
        obs('D20', 3, '入夜起了霧，院牆外的黃包車鈴響了一整宿。'),
        obs('D21', 1, '春雪社的招牌掉了漆，蕭班主說等這齣戲掛起來再修。'),
        obs('D22', 4, '帳房先生來對數，戲箱房的鎖換了一把新的。'),
    ];
}

// ---- Queries + ground truth -----------------------------------------------------------
// query text = what a character agent actually issues at PLAN/POV/recall time.
export interface EvalQuery {
    id: string;
    text: string;
    /** Facts that SHOULD surface in top-K (ground truth). */
    relevantFacts: string[];
}

export const QUERIES: EvalQuery[] = [
    {
        id: 'Q1_shuixiu',
        text: '我和程蘅玉之間，那條水袖後來怎麼了',
        relevantFacts: ['F_shuixiu', 'F_cheng_feel'],
    },
    {
        id: 'Q2_shen',
        text: '沈班主為什麼不再唱戲，那張留聲機的事',
        relevantFacts: ['F_shen_past', 'F_gramophone'],
    },
    {
        id: 'Q3_plan',
        text: '我今天的目標，許仙這個位置',
        relevantFacts: ['F_plan_xuxian', 'F_bangbo'],
    },
    {
        id: 'Q4_liang',
        text: '梁照水，還有那碗魚湯',
        relevantFacts: ['F_fishsoup', 'F_liang_solo'],
    },
    {
        id: 'Q5_pretrial',
        text: '明天試戲前，我該記得的事',
        relevantFacts: ['F_plan_xuxian', 'F_shuixiu', 'F_cheng_feel'],
    },
];
