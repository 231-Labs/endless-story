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
    {
        label: 'recording:首張唱片灌錄權', capacity: 1, holder: null,
        display: '春雪社第一張唱片的灌錄權', framing: '誰的腔灌進春雪社第一張唱片',
        means: '誰的腔被刻進春雪社第一張碟、活得比戲台久',
        // 行使即退場：灌錄權被結算 2 次（授權→真正進棚灌定）後，碟已刻死，此爭結束；
        // 不讓同一場錄音被反覆重爭重寫（log 第3回≈第6回的根因），改長出下游的銷路/風評之爭。
        exercisable: true, retireAfterResolves: 2, exerciseNote: '碟已灌定，第一張唱片就此刻死',
        successor: {
            label: 'reputation:首張唱片的銷路風評',
            display: '春雪社第一張唱片的銷路與風評',
            framing: '春雪社頭一張碟，是紅遍上海還是砸在手裡',
            means: '這張已灌定的碟，被捧成名片還是寫成笑話——誰說了算',
            seekers: ['fang'], includeHolder: true, // 記者掌風評 + 腔在碟上的贏家
        },
    },
    // 被爭的是「蘇映雪的小生搭檔位」：柳生春現居此位，江聞鶴(乾生)來搶。蘇映雪是locus非競爭者。
    { label: 'partnership:蘇映雪', capacity: 1, holder: 'liu', display: '蘇映雪台上對戲的固定小生搭檔位', framing: '誰當蘇映雪台上對戲的固定小生搭檔', means: '誰當蘇映雪台上對戲的固定小生搭檔（柳生春現居此位、江聞鶴來搶）' },
    { label: 'spotlight:春雪社頭牌名額', capacity: 1, holder: null, display: '春雪社頭牌的名分', framing: '上海這季把誰捧成春雪社的頭牌', means: '上海這季把哪個名字捧成春雪社的頭牌' },
];

export const cast = [
    {
        id: 'liu', name: '柳生春', role: '坤生', craft: '小生', line: '文小生', crossDress: true, gender: '女', age: 24, sceneId: 'sc_yunjin',
        appearance: 86, constitution: 66, acuity: 80, disposition: 72,
        physical: '風流俊秀，台上濁世佳公子；倒過倉傷過嗓，久站需扶桌沿掩微喘',
        secret: '她待師姐蘇映雪的情，早不只是搭檔、也不只是師姐妹。唯有勒上頭、著男裝、做那個能名正言順護在師姐身邊的人時，她才敢把那份說不出口的愛，藏進一個眼神、一次托手裡。她只盼這樣相伴下去，哪怕一輩子不點破。',
        privateMemories: [
            '進科那年我嗓子倒了倉，是師姐日日替我吊。她說「你這條嗓我等得起」——那一刻我就懂了，我等的也不只是這條嗓。',
            '台上她做白娘子，我做許仙；只有在戲裡，我才能光明正大地牽她的手、望進她眼裡，把那句不能說的話，都唱進腔裡。',
            '我怕的不是她嫌我，是怕哪天這層情分被人說破了，連這樣安安靜靜守著她，都守不成了。',
        ],
        desires: ['recording:首張唱片灌錄權', 'partnership:蘇映雪'],
        plan: '[長期] 一輩子跟師姐相伴在台上 [眼下] 守住師姐搭檔位、別讓江聞鶴插進來 [未竟] 那句說不出口的話，藏好，別讓人看破',
    },
    {
        id: 'su', name: '蘇映雪', role: '花旦', gender: '女', age: 28, sceneId: 'sc_yunjin',
        appearance: 88, constitution: 62, acuity: 74, disposition: 80,
        physical: '台柱花旦工青衣，端莊沉熟，談唱片契約時眼睛比鏡子亮；私下只對師妹柳生春露嬌',
        secret: '她與柳生春自幼同科、台上生旦相得，台下那份情早過了師姐妹該守的分寸——只是這層心思，兩人誰也不敢先說破。她真正怕的不是老去，是有一天生春不在身邊，這戲、這日子都空了。',
        privateMemories: [
            '台上我的水音浮得起來，全因底下有生春的腔穩穩托著。我漸漸分不清，離不開的是那條腔，還是那個人。',
            '她替我繫水袖、正鬢髮，指尖總是涼的；我每回都想多留她半息，話到嘴邊又咽了——有些情分，一說破就再回不去了。',
            '我不在意誰當頭牌。我只怕哪天她要走，或哪天這層心思藏不住，連這樣安安靜靜唱在一處，都成了奢望。',
        ],
        desires: ['recording:首張唱片灌錄權'],
        plan: '[長期] 跟生春一直唱在一處 [眼下] 把第一張碟對付過去，最好是跟生春一起灌 [未竟] 那份說不出口的情，守住分寸，別連這點相伴都丟了',
    },
    {
        id: 'jiang', name: '江聞鶴', role: '乾生', craft: '小生', line: '文武小生', gender: '男', age: 27, sceneId: 'sc_yunjin',
        appearance: 86, constitution: 66, acuity: 80, disposition: 60,
        physical: '紹興男班北上，台步老辣、嗓子穩；傲、惜藝、嘴硬心軟',
        secret: '其實是在舊班被新角擠下、灰頭土臉走的，北上賭一口氣；夜裡偶爾摸著嗓子，怕這條好嗓也撐不了幾年了。',
        privateMemories: [
            '舊班把我換下那天，新角在台上唱，我在台下站著。我發誓再不站到台下去。',
            '夜裡我摸著喉嚨，那條一向響堂的嗓，近來起高腔時會發緊。我不敢告訴任何人。',
        ],
        desires: ['recording:首張唱片灌錄權', 'partnership:蘇映雪', 'spotlight:春雪社頭牌名額'],
        plan: '[長期] 證明這位子是我掙的不是撿的 [眼下] 搶下蘇映雪的搭檔位、把〈遊湖〉對到能進錄音間 [未竟] 別讓人看出我嗓子的破綻',
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
    {
        id: 'tang', name: '唐桂蘭', role: '衣箱', gender: '女', age: 44, sceneId: 'sc_yunjin',
        appearance: 54, constitution: 58, acuity: 78, disposition: 70,
        physical: '春雪社最老的衣箱師傅，管水袖、靠旗、頭面、尺寸——和秘密；能從一件戲衣看出誰瘦了、誰快撐不住',
        secret: '她隱約知道班主當年為何突然不唱了——收箱時翻到過一件本不該還在的旦角戲衣。她從沒問、也從沒對任何人說；她疼班主，這份疼裡有共過的患難。',
        privateMemories: [
            '沈班主封箱那年，那幾箱再沒人動的戲服，是我默默收的。有件旦角戲衣不該在裡頭，我收進了最底層，沒問。',
            '我替誰繫過袖、收過箱，就看得出誰心裡擱著事。柳生春替蘇映雪繫水袖的手法，跟旁人不一樣——我看在眼裡，沒說。',
        ],
        desires: [],
        plan: '[長期] 把這班人的戲服與體面都養好 [眼下] 照看著台上台下誰撐不住 [未竟] 班主的舊事，爛在肚裡',
    },
    {
        id: 'lian', name: '連翹', role: '刀馬旦', gender: '女', age: 24, sceneId: 'sc_yunjin',
        appearance: 82, constitution: 86, acuity: 74, disposition: 76,
        physical: '京班武場、雜技場轉來的刀馬旦，能穿靠、使槍、翻身亮相，把身體當成自己的證詞',
        secret: '多年前她還是翻跟斗的小武行，曾與正紅、唱坤生的沈雪笙同台一季，頭一次曉得人站在台心可以那麼亮。她是衝著沈雪笙投的春雪社——沈雪笙正是這班如今的班主，封箱多年、坐鎮二樓不再開嗓；連翹想就近看看，當年那道光，如今成了什麼模樣。',
        privateMemories: [
            '我頭一回看沈雪笙唱坤生，台心那道光，我記了十幾年。我來春雪社，一半是為了戲，一半是為了她。',
            '我這身功夫是摔出來的，不靠人捧。可看見她如今坐在二樓不再開嗓，我心裡說不出的不是滋味。',
        ],
        desires: ['spotlight:春雪社頭牌名額'],
        plan: '[長期] 用這身武戲在春雪社掙個亮相的地界 [眼下] 找機會讓班主看見我的靠把功 [未竟] 弄明白當年那位名角，為何就此封了箱',
    },
];

// what a character has to GAIN if they win a given resource — for stakes framing.
export const resourceMeans = Object.fromEntries(resources.map((r) => [r.label, r.means]));
