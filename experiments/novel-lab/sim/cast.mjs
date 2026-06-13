/**
 * Seed world — real spring-snow founding_cast (subset) + drama resources + scenes.
 * `secret` mirrors the chain `candidate.secret` → genesis privateBackstory.
 * `privateMemories` mimic what genesis-memory would distil from that secret
 * (the targeted-recall fix surfaces ONE of these at a dramatic beat).
 */

export const scenes = [
    { id: 'sc_yunjin', name: '雲錦台' }, // 戲院後台 + 台上
    { id: 'sc_balcony', name: '二樓包廂' }, // 班主地界
    { id: 'sc_simalu', name: '四馬路' }, // 報館
];

// capacity-1 scarce slots (drama resources). holder = who currently owns it.
export const resources = [
    { label: 'recording:首張唱片灌錄權', capacity: 1, holder: null, means: '誰的腔被刻進春雪社第一張碟、活得比戲台久' },
    { label: 'partnership:柳生春', capacity: 1, holder: null, means: '誰是柳生春台上對戲的固定搭檔' },
    { label: 'spotlight:春雪社頭牌名額', capacity: 1, holder: null, means: '上海這季把哪個名字捧成春雪社的頭牌' },
];

export const cast = [
    {
        id: 'liu', name: '柳生春', role: '坤生', gender: '女', age: 24, sceneId: 'sc_yunjin',
        appearance: 86, constitution: 66, acuity: 80, disposition: 72,
        physical: '風流俊秀，台上濁世佳公子；倒過倉傷過嗓，久站需扶桌沿掩微喘',
        secret: '只想一輩子跟師姐蘇映雪搭檔下去，不讓任何人插足；唯有戴上男裝、做那個護著師姐的男兒時，才覺得那是真正的自己。',
        privateMemories: [
            '進科那年我嗓子倒了倉，是師姐每日替我吊。她說「你這條嗓我等得起」，我就把這條命許給了她的戲。',
            '只有勒上頭、著上男裝、站在師姐半步前頭的時候，我才不慌——那一刻我是誰，我自己最清楚。',
        ],
        desires: ['partnership:柳生春', 'recording:首張唱片灌錄權'],
        plan: '[長期] 一輩子跟師姐搭檔 [眼下] 守住與師姐對戲的位置 [未竟] 別讓生人插進我跟師姐之間',
    },
    {
        id: 'su', name: '蘇映雪', role: '花旦', gender: '女', age: 28, sceneId: 'sc_yunjin',
        appearance: 88, constitution: 62, acuity: 74, disposition: 80,
        physical: '台柱花旦工青衣，端莊沉熟，談唱片契約時眼睛比鏡子亮；私下只對師妹柳生春露嬌',
        secret: '真正怕的不是老去，是有一天柳生春不再跟她搭戲、這戲台就空了；暗暗較勁到連柳生春高音比自己亮半分都整夜不睡。',
        privateMemories: [
            '我半夜醒著，數的不是包銀，是生春的高音比我亮了幾分。我恨那半分，又離不開那半分。',
            '台上水音浮得起來，是因為底下有生春的腔托著。沒人接的台，我一刻都待不住。',
        ],
        desires: ['recording:首張唱片灌錄權', 'partnership:柳生春'],
        plan: '[長期] 把春雪社的招牌唱穩 [眼下] 把第一張碟對付過去 [未竟] 別讓生春離了我的戲',
    },
    {
        id: 'jiang', name: '江聞鶴', role: '乾生', gender: '男', age: 27, sceneId: 'sc_yunjin',
        appearance: 86, constitution: 66, acuity: 80, disposition: 60,
        physical: '紹興男班北上，台步老辣、嗓子穩；傲、惜藝、嘴硬心軟',
        secret: '其實是在舊班被新角擠下、灰頭土臉走的，北上賭一口氣；夜裡偶爾摸著嗓子，怕這條好嗓也撐不了幾年了。',
        privateMemories: [
            '舊班把我換下那天，新角在台上唱，我在台下站著。我發誓再不站到台下去。',
            '夜裡我摸著喉嚨，那條一向響堂的嗓，近來起高腔時會發緊。我不敢告訴任何人。',
        ],
        desires: ['recording:首張唱片灌錄權', 'spotlight:春雪社頭牌名額'],
        plan: '[長期] 證明這位子是我掙的不是撿的 [眼下] 把要灌的〈遊湖〉對到能進錄音間 [未竟] 別讓人看出我嗓子的破綻',
    },
    {
        id: 'shen', name: '沈雪笙', role: '班主', gender: '女', age: 42, sceneId: 'sc_balcony',
        appearance: 70, constitution: 64, acuity: 84, disposition: 82,
        physical: '前坤生名角，封箱多年，二樓包廂夾雪茄審報；身子單薄偶爾掩唇輕咳',
        secret: '當年與搭檔白蘭情同連理，白蘭被逼遠嫁南洋那年她在二樓窗邊看花轎經過，從此封箱、再不唱《情探》；留著一只那天沒能遞出去、後來就停了的懷錶。',
        privateMemories: [
            '白蘭的花轎從後門過時，我攥著那只錶，想下樓，腳卻沒動。從那天起我封了箱。',
            '我這輩子最恨的，是眼睜睜看一個唱戲的被身不由己推下台，連掙都沒掙過。',
        ],
        desires: [],
        plan: '[長期] 守住春雪社這幾十口人的飯碗 [眼下] 別讓一場意外毀了碟的賣相與班裡座次 [未竟] —',
    },
    {
        id: 'fang', name: '方競西', role: '記者', gender: '男', age: 32, sceneId: 'sc_simalu',
        appearance: 62, constitution: 56, acuity: 86, disposition: 72,
        physical: '四馬路小報副刊寫手兼唱片掮客，半舊西裝袖口墨跡，筆桿藏刀；肺病偶爾咳血',
        secret: '年輕為搏版面把恩師余先生醉後私語寫成嘲諷稿，毀了恩師也鋸斷自己寫真話的膽；如今肺病犯了，下不了手寫壞一個新角時心裡竟有一絲僥倖。',
        privateMemories: [
            '余先生看了那篇嘲稿，從此沒再開過嗓。我這支筆鋸斷過幾條嗓子，我數得出。',
            '近來咳血，夜裡躺著就想：這回若再毀一個新角，我大概也撐不到看他翻不翻得了身。',
        ],
        desires: [],
        plan: '[長期] 讓我這版多賣三成 [眼下] 抓春雪社的料寫頭條 [未竟] 別再寫出第二個余先生',
    },
    {
        id: 'hexi', name: '何阿喜', role: '丑', gender: '男', age: 30, sceneId: 'sc_yunjin',
        appearance: 58, constitution: 66, acuity: 84, disposition: 74,
        physical: '藝名小豆子，救冷場、逗包廂，能在最熱鬧處忽然說一句真話',
        secret: '與四馬路方競西是早年大世界討生活的老相識，後台緋聞料有一半是他遞的；為人圓滑，心裡一本帳清楚得很。',
        privateMemories: ['後台沒有我不知道的事；只是哪句該遞給競西、哪句該爛在肚裡，我分得清。'],
        desires: [],
        plan: '[長期] 在這班裡誰都不得罪 [眼下] 把值錢的料遞給對的人 [未竟] —',
    },
];

// what a character has to GAIN if they win a given resource — for stakes framing.
export const resourceMeans = Object.fromEntries(resources.map((r) => [r.label, r.means]));
