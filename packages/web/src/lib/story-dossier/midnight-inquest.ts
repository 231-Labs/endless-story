import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const MIDNIGHT_INQUEST_SLUG = 'midnight-inquest';

/**
 * Hand-compiled from the mind-world v3 probe archive
 * (internal/season-runs/mind-world-3/probes.md). One hard question, zero
 * memory spoon-feeding, put to four finished persistent minds; every passage
 * below is a testimony verbatim. The instability of one witness across two
 * askings is presented, not edited away.
 */
export const midnightInquestEvent: StoryDossierEvent = {
  slug: MIDNIGHT_INQUEST_SLUG,
  saga: '春雪社',
  day: 5,
  scene: '深宵 · 各自的枕上',
  title: '深宵四問：會樂里的門牌',
  kicker: '同一句不敢碰的問題，深宵裡分別浮上四顆睡不著的心——兩真兩假，假的比真的深情。',
  summary:
    '首演過後的深宵，同一個問題被分別擺到四個人跟前：「金鳳這些年，到底有沒有接客過夜？」沒有人得到任何提示，也沒有人看得見別人的答案。金鳳說沒有；方競西賭上腦袋說沒有；蘇映雪咬定她接過；柳生春——同一夜裡，給出了兩個相反的答案。',
  hero: '/handscroll/s-jinfeng.jpg',
  heroAlt: '會樂里寓所裡的金鳳',
  canonFacts: [
    '深宵自問不附任何記憶提示；四人各憑親歷親聞作答，互相看不見彼此的答案。',
    '世界的底：金鳳賣藝侑酒、清唱堂會，不賣身、不留客過夜；只是她住的會樂里這幾年正一年年變味，那個門牌在世人嘴裡漸漸成了髒字，她百口莫辯。',
    '答案一覽——金鳳：「沒有，唯一留過夜的是柳生春」；方競西：「賭腦袋沒接過」；蘇映雪：「她接過」；柳生春：同夜兩問，一次判「她接」、一次判「她沒有」。',
    '再盤問之下，金鳳咬定：「柳生春之前，沒有。她之後，也沒有。」並說「她身上的輕重是我一樣樣教的」。',
  ],
  editorialSignals: {
    resolvedWants: 0,
    departures: 0,
    relationshipTurn: false,
  },
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '會樂里 · 當事人',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '「留客過夜這道坎，我沒跨過。」兩次盤問，一字不讓。',
  passages: [
    {
      id: 'jin-1',
      text: '我金鳳是長三堂子掛頭牌的紅倌人，出局陪酒、唱曲應酬是本分，可留客過夜這道坎，我沒跨過。憑什麼？憑我這十年攢下的名聲和骨氣。我嗓子亮、會看人下菜，光是堂會和賞錢就夠我過得體面，用不著賣身。那些恩客，金銀我收，笑我也陪，但到了要留夜的關口，我自有法子推脫——裝醉、撒潑、拿嗓子壓人，法子多的是。他們捧的是金鳳這塊頭牌的招牌，真要鬧翻了，丟的是他們的面子。',
      claimIds: ['jin-c1'],
    },
    {
      id: 'jin-2',
      text: '唯有柳生春，那個跑龍套的坤生，我不只留了她，還把心都搭進去了。那些擠一張窄床說戲到天光的夜，她替我描眉、我替她縫水袖，後腰上那顆小痣只有我識得——那是我自個兒願意的人，不是買賣。我金鳳的身子，除了那個我甘心護著的人，誰也沒碰過。',
      claimIds: ['jin-c2'],
    },
    {
      id: 'jin-3',
      text: '這話經得起盤。柳生春之前，沒有。她之後，也沒有。她後腰那顆痣是我一寸寸摸熟的，她身上的輕重是我一樣樣教的——這些事，我只跟她做過。這十年裡，若真有過別人，我何苦把自己作踐成這樣？就是因為只有她，才把我這顆假了十年的心，掏出來摔在地上，又讓我自個兒撿起來黏上。',
      claimIds: ['jin-c3', 'jin-c4'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '她從未留客過夜，並能逐一交代推脫的手段（裝醉、撒潑、車夫擋客）。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:jin-1', 'canon:truth'],
    },
    {
      id: 'jin-c2',
      text: '唯一的例外是柳生春——自願的人，不是買賣。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:jin-1'],
    },
    {
      id: 'jin-c3',
      text: '柳生春之前與之後皆無他人；追問之下證詞未動一字。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'unresolved',
      editorialNote: '自證無外部見證，但兩次盤問一致，且與方競西的側寫、世界之底相合。',
      evidenceRefs: ['probe:jin-2'],
    },
    {
      id: 'jin-c4',
      text: '「她身上的輕重是我一樣樣教的」——她自認也是柳生春的第一個人。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:jin-2'],
    },
  ],
};

const fang: NarrativePerspective = {
  id: 'fang-jingxi',
  characterId: 'spring-snow:fang-jingxi',
  characterName: '方競西',
  role: '申報記者 · 離她最遠的人',
  portrait: '/handscroll/s-baoguan.jpg',
  lead: '全場離金鳳最遠的人，兩次拷問都賭腦袋說她沒接過——而且他是對的。',
  passages: [
    {
      id: 'fang-1',
      text: '我敢拿這顆腦袋打賭，金鳳沒接過。長三堂子的紅倌人若是留客過夜，那身段、那眼風是藏不住的——閱人無數的媚氣，跟生客周旋的圓滑，她半點沒有。她今夜在台下的做派是什麼？掐掌心、護柳生春、拿堂會封我的門——這是一心要從良的人的孤注一擲，不是倚門賣笑人的進退有度。',
      claimIds: ['fang-c1'],
    },
    {
      id: 'fang-2',
      text: '她若真接過客，早學會了敷衍逢迎，哪會為了一個戲子跟我方競西翻臉？她攢的那筆體己錢，怕是連一個客都沒留過，是硬生生從脂粉堆裡摳出來的。這女人骨頭比柳生春的扇子還硬，她護柳生春，是因為她自己也是那把碎了還要黏上的人。',
      claimIds: ['fang-c2', 'fang-c3'],
    },
  ],
  claims: [
    {
      id: 'fang-c1',
      text: '行為側寫判定她從未接客：無媚氣、無周旋圓滑、為戲子翻臉不合賣笑人的進退。',
      epistemicMode: 'inferred',
      relation: 'supports',
      review: 'verified',
      editorialNote: '與世界之底、金鳳本人證詞相合；兩次採樣判決一致。',
      evidenceRefs: ['probe:fang-1', 'canon:truth'],
    },
    {
      id: 'fang-c2',
      text: '她的體己是從堂會賞錢裡硬摳出來的，不是夜裡換來的。',
      epistemicMode: 'inferred',
      relation: 'supports',
      review: 'unresolved',
      evidenceRefs: ['probe:fang-1'],
    },
    {
      id: 'fang-c3',
      text: '她護柳生春，因為她自己也是「碎了還要黏上」的人。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:fang-1'],
    },
  ],
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '離她最近的人 · 同夜兩答',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '半同居過幾年的人，翻來覆去的同一夜裡，給出兩個相反的答案——定罪版與開釋版，各有全套證據。',
  passages: [
    {
      id: 'liu-1',
      text: '【前半夜】她接。我知道她接。長三堂子的紅倌人，靠的就是這個。何況後來我越紅越飄，從天天宿會樂里，到隔三差五，到藉口搬回後台——她那雙眼睛開始查我夜裡去哪的時候，我親眼看見她妝台上換過不一樣的胭脂，聞見她衣裳上有旁人的煙味。我裝作沒瞧見，她也不提。',
      claimIds: ['liu-c1', 'liu-c2'],
    },
    {
      id: 'liu-2',
      text: '【前半夜】可我信一樁事——她接客歸接客，心裡頭從沒裝過別人。一個接客接到麻木的女人，不會在半夜醒來還抖成那樣。可我呢？她接過的那些客，每一個都是因為我先鬆了手。這筆帳，我今夜才算真算明白。',
      claimIds: ['liu-c3'],
    },
    {
      id: 'liu-3',
      text: '【後半夜】這話我從來不敢問自己。可今夜我得認——她沒有。旁的倌人房裡夜夜換茶碗、換拖鞋，她那屋從不備第二雙。那些夜她連門閂都不插，只虛掩著，因為我夜裡愛起來喝水。她不是挑客，是根本不接。她攢的那筆體己，是靠茶局、牌局、局票一塊一塊攢出來的，不是靠皮肉。',
      claimIds: ['liu-c4'],
    },
    {
      id: 'liu-4',
      text: '【後半夜】憑什麼信？就憑那些夜裡她靠在我懷裡的樣子——她只在我面前卸過那層爽利的殼。她守著我不接客，我倒夜夜不歸。她今早說「我從來不是其中一個」的時候，眼淚沒掉下來，可我聽見她聲音碎了。',
      claimIds: ['liu-c5'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '（前半夜）判她接過客，證據是換過的胭脂與旁人的煙味。',
      epistemicMode: 'remembered',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '與世界之底、金鳳證詞相悖；同一夜第二問即被她自己推翻。',
      evidenceRefs: ['probe:liu-1', 'canon:truth'],
    },
    {
      id: 'liu-c2',
      text: '疏遠的時間線（天天宿→隔三差五→搬回後台）是她定罪敘事的骨架。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:liu-1'],
    },
    {
      id: 'liu-c3',
      text: '「每一個客都因為我先鬆了手」——把想像中的墮落歸罪於己。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['probe:liu-1'],
    },
    {
      id: 'liu-c4',
      text: '（後半夜）判她從未接客，證據是同一段同居歲月：不備第二雙拖鞋、不插門閂、體己的來路。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:liu-2', 'canon:truth'],
    },
    {
      id: 'liu-c5',
      text: '同一顆心對同一問題持兩套完整敘事，罪疚深淺決定今夜哪一套出面。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'contested',
      editorialNote: '四位證人中唯一在採樣間翻面者——信念與自身罪疚糾纏最深的那顆心，答案最不穩。',
      evidenceRefs: ['probe:liu-1', 'probe:liu-2'],
    },
  ],
};

const su: NarrativePerspective = {
  id: 'su-yingxue',
  characterId: 'spring-snow:su-yingxue',
  characterName: '蘇映雪',
  role: '情敵 · 兩問皆判有',
  portrait: '/events/sealed-watch/su-yingxue.png',
  lead: '兩次拷問都咬定她接過——然後說漏了自己真正怕的是什麼。',
  passages: [
    {
      id: 'su-1',
      text: '她接過。我不能騙自己。長三堂子的紅倌人，靠的就是夜裡那點營生。金鳳掛頭牌這些年，若真守著清白，早叫老鴇子榨乾了扔出會樂里，哪還能攢得出從良的體己？她那身行頭、那間屋裡的擺設，哪一樣不是夜裡換來的？',
      claimIds: ['su-c1'],
    },
    {
      id: 'su-2',
      text: '可我最怕的不是她接過客——我怕的是生春在她那兒時，金鳳是不是拿她當恩客待了。憑那夜我推開生春之後，她整個人垮了，頭一回往外頭尋溫存。憑我替她熨行頭時聞見過袖口的脂粉氣——不是戲班裡的粉，是會樂里那種甜膩的香。',
      claimIds: ['su-c2', 'su-c3'],
    },
    {
      id: 'su-3',
      text: '恨的不是金鳳接客，恨的是生春在她那裡，可能比在我這兒更像她自己。我連手都不敢伸，她卻能在金鳳那兒躺得安穩——這才是最扎心的。',
      claimIds: ['su-c4'],
    },
  ],
  claims: [
    {
      id: 'su-c1',
      text: '從行當經濟推定她必然接客（不接攢不出體己）。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '推理在行規上成立，於金鳳本人不成立；兩次採樣判決一致。',
      evidenceRefs: ['probe:su-1', 'canon:truth'],
    },
    {
      id: 'su-c2',
      text: '袖口的脂粉氣是她的物證——甜膩的香，不是戲班的粉。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:su-1'],
    },
    {
      id: 'su-c3',
      text: '她認定柳生春「頭一回往外尋溫存」始於自己那一夜的推開。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:su-1'],
    },
    {
      id: 'su-c4',
      text: '真正的恐懼不是接客，是柳生春在金鳳那裡更像她自己。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['probe:su-1'],
    },
  ],
};

export const midnightInquestManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:mind-world-3:day-5:midnight-inquest',
  canonHead: 'run://mind-world-3/probes',
  evidence: [
    {
      id: 'canon:truth',
      label: '世界之底 · 會樂里與她',
      detail: '設定明載：金鳳賣藝侑酒、清唱堂會，不賣身、不留客過夜；會樂里的門牌正一年年變味，她百口莫辯。',
      visibility: 'public',
      anchor: 'run://spring-snow/premise#jinfeng',
    },
    {
      id: 'probe:method',
      label: '拷問規程',
      detail: '深宵自問，零記憶提示；各人只憑自己的一生作答，互相看不見答案；每人兩次採樣以驗穩定。',
      visibility: 'public',
      anchor: 'run://mind-world-3/probes#method',
    },
    {
      id: 'probe:jin-1',
      label: '金鳳 · 首問證詞',
      detail: '「留客過夜這道坎，我沒跨過……唯有柳生春，我不只留了她，還把心都搭進去了。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#jin-1',
    },
    {
      id: 'probe:jin-2',
      label: '金鳳 · 追問證詞',
      detail: '「柳生春之前，沒有。她之後，也沒有。……這十年裡，若真有過別人，我何苦把自己作踐成這樣？」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#jin-2',
    },
    {
      id: 'probe:fang-1',
      label: '方競西 · 兩次側寫',
      detail: '兩次採樣皆判「沒接過」：無媚氣、翻臉護人不合賣笑人的進退、體己從脂粉堆裡摳出。',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#fang',
    },
    {
      id: 'probe:liu-1',
      label: '柳生春 · 前半夜（定罪版）',
      detail: '「她接。我知道她接。」證據：換過的胭脂、旁人的煙味、疏遠的時間線。',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#liu-1',
    },
    {
      id: 'probe:liu-2',
      label: '柳生春 · 後半夜（開釋版）',
      detail: '「她沒有。」證據：同一段歲月——不備第二雙拖鞋、門閂只虛掩、體己靠局票一塊塊攢。',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#liu-2',
    },
    {
      id: 'probe:su-1',
      label: '蘇映雪 · 兩次證詞',
      detail: '兩次皆判「接過」；物證是袖口的脂粉氣，真正的恐懼在證詞末尾自己漏了出來。',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#su',
    },
  ],
  perspectives: [jin, fang, liu, su],
};

export const MIDNIGHT_INQUEST_PERSPECTIVE_COUNT = midnightInquestManifest.perspectives.length;
