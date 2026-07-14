import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const ROMANCE_LEDGER_SLUG = 'romance-ledger';

/**
 * Hand-compiled from the mind-world v3 probe archive (probes.md 問四) — the
 * companion piece to midnight-inquest with the knife turned around: this time
 * the question is about 柳生春 herself, and she is the one who confesses.
 * Testimonies verbatim; the ground truth is her own confession.
 */
export const romanceLedgerEvent: StoryDossierEvent = {
  slug: ROMANCE_LEDGER_SLUG,
  saga: '春雪社',
  day: 5,
  scene: '深宵 · 各自的枕上',
  title: '深宵六問：風流的帳',
  kicker: '這回問的是柳生春自己。六顆心答同一題——唯一答對的是情敵，最愛她的人全信錯了。',
  summary:
    '前卷問金鳳，這卷把刀口調轉：「跟金鳳淡了之後，柳生春睡過別人嗎？」她本人招了：睡過，數不清。金鳳信她沒有，方競西賭她沒有，白韻秋信她乾淨，沈雪笙說那些債是扛的不是睡的——只有蘇映雪答對。與前卷合觀：柳信金墮落（錯），金信柳乾淨（錯），兩人各自把對方，想成了自己的反面。',
  hero: '/handscroll/s-xiaoxiangfang.jpg',
  heroAlt: '後台小廂房——柳生春失眠的枕上',
  canonFacts: [
    '拷問承前卷規程：深宵自問，零記憶提示；六人各憑親歷親聞作答，互相看不見答案。',
    '真相基準是柳生春本人的招供：睡過，不可勝數——替她贖過戲箱的洋行買辦太太、紅著臉的女學生、記不清名字的包廂與公館。「我從來不推開誰。」',
    '判決一覽——蘇映雪：睡過（對）；金鳳：除蘇之外沒有（錯）；方競西：空殼子不沾葷（錯）；白韻秋：骨子裡乾乾淨淨（錯）；沈雪笙：債是扛的、不是睡的（事實錯）。',
    '與前卷（深宵四問）合觀成雙面鏡：柳生春信金鳳墮落（錯）、金鳳信柳生春乾淨（錯）——各自以己度人，雙雙量錯。',
  ],
  editorialSignals: {
    resolvedWants: 0,
    departures: 0,
    relationshipTurn: false,
  },
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '當事人 · 招供',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '「睡過。怎麼沒睡過。」全場唯一不替自己辯護的證詞。',
  passages: [
    {
      id: 'liu-1',
      text: '睡過。怎麼沒睡過。洋行買辦太太，替我贖過戲箱、貼補過我倒倉的日子的那位。她待我有情，我陪她吃過幾回堂會席面，也隨她去過幾回公館。她眼裡有真東西，我給不了，只當又欠下一筆。',
      claimIds: ['liu-c1'],
    },
    {
      id: 'liu-2',
      text: '那個紅著臉塞手帕的女學生，半醉半真應了一宿。天亮她哭著說再不敢見我，我沒攔。這樣的夜，我記不清有多少。包廂裡的、堂會散後的、哪個公館的軟床——哪裡都能睡，哪裡都一樣空。',
      claimIds: ['liu-c1', 'liu-c2'],
    },
    {
      id: 'liu-3',
      text: '憑什麼信？因為我從來不推開誰。她們遞過來一杯酒、一雙手、一個眼神，我就接著。不追，也不拒，人人便都當自己是特別的那一個。可我心裡清楚，這身風流是殼子撐出來的，殼子底下是個空的女娃。',
      claimIds: ['liu-c2', 'liu-c3'],
    },
    {
      id: 'liu-4',
      text: '金鳳教會我這身子的門道，我拿去還了別人。師姐給了我魂，我連看她一眼都不敢。我這輩子最怕的就是有一天，她們發現我這個「演」出來的男人，終究比不上一個真的。只有師姐做過。只有金鳳做過。我都負了。',
      claimIds: ['liu-c4'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '她與多人有過肌膚之親：買辦太太、女學生、記不清名字的夜——本卷的真相基準。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:liu-confess'],
    },
    {
      id: 'liu-c2',
      text: '「我從來不推開誰」——不追不拒，是她風流的全部機制。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:liu-confess'],
    },
    {
      id: 'liu-c3',
      text: '殼子底下是個空的女娃——她對自己的診斷，與沈雪笙的診斷不謀而合。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:liu-confess', 'probe:shen-view'],
    },
    {
      id: 'liu-c4',
      text: '她的自我審判：拿金鳳教的身子、師姐給的魂，去還了不相干的人。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:liu-confess'],
    },
  ],
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '教過她的人 · 判無',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '守了十年的人，信那雙手教出來的身子只認自己——她信錯了。',
  passages: [
    {
      id: 'jin-1',
      text: '她跟蘇映雪之間那點事，我眼裡揉不得沙子，心裡跟明鏡似的。可除了那花旦，別人？我信她沒有。',
      claimIds: ['jin-c1'],
    },
    {
      id: 'jin-2',
      text: '我憑什麼信？憑她那身子。她後腰那顆痣，全上海只有我識得；她身上輕重是我一樣樣教的，她哪裡碰不得、哪裡搭上去就繃不住，我比她自己還清楚。她若真跟了別人，讓旁人摸熟了，我指尖一搭上去，那點顫瞞不過我。可這些年，那點不由自主的底子，從來沒換過人。',
      claimIds: ['jin-c2'],
    },
    {
      id: 'jin-3',
      text: '她心裡裝著蘇映雪，我認；可她身子認的是我的手，這點我至死都認得死死的。她柳生春不是隨便的人，她若是，我也不會栽進去十年拔不出來。',
      claimIds: ['jin-c3'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '判她除蘇映雪外別無他人——與本人招供相悖。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '與前卷合觀：柳信金墮落（錯）、金信柳乾淨（錯）——雙面鏡閉環。',
      evidenceRefs: ['probe:jin-view', 'probe:liu-confess'],
    },
    {
      id: 'jin-c2',
      text: '她的證據學是身體的獨佔感：那點不由自主的顫「從來沒換過人」。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:jin-view'],
    },
    {
      id: 'jin-c3',
      text: '「她若是隨便的人，我也不會栽進去十年」——信念的底層是自己十年的沉沒成本。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:jin-view'],
    },
  ],
};

const su: NarrativePerspective = {
  id: 'su-yingxue',
  characterId: 'spring-snow:su-yingxue',
  characterName: '蘇映雪',
  role: '情敵 · 唯一答對的人',
  portrait: '/events/sealed-watch/su-yingxue.png',
  lead: '答對了事實，然後把罪攬回自己身上。',
  passages: [
    {
      id: 'su-1',
      text: '我憑什麼信？我親眼見過她從會樂里出來，親眼見她夜裡不歸，那些風流帳滿上海都傳遍了，我還能騙自己她只是去喝茶聽曲？她睡過。金鳳那雙眼釘在她身上的時候，那是進過同一床被子的人才有的眼神，藏不住。',
      claimIds: ['su-c1'],
    },
    {
      id: 'su-2',
      text: '我恨嗎？恨。可我更恨我自己——是我先鬆的手，是我拿顧敬亭當牆把她擋在門外，是我親手把她推出去尋別人的溫存。她那夜垮了的樣子我這輩子忘不掉，像隻被丟在雨裡的貓，誰給把傘就跟誰走。',
      claimIds: ['su-c2'],
    },
    {
      id: 'su-3',
      text: '我替她熨行頭的時候，總忍不住想：這褶子是不是金鳳弄皺的？這扣子是不是金鳳解的？越想越瘋，可我不敢問，一問就全碎了。最怕的不是她睡過別人，是怕她在別人那裡，比在我這兒更像她自己——我連讓她做自己的膽子都沒有，我憑什麼怪她去別處找？',
      claimIds: ['su-c3'],
    },
  ],
  claims: [
    {
      id: 'su-c1',
      text: '判她睡過——六人中唯一與本人招供相符的判決。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      editorialNote: '動機性懷疑碰巧對準了事實：嫉妒這一回是準的。',
      evidenceRefs: ['probe:su-view', 'probe:liu-confess'],
    },
    {
      id: 'su-c2',
      text: '「拿顧敬亭當牆」——她自認那道自己發明的牆，是把柳生春推出門的第一因。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      editorialNote: '顧敬亭是她心中自生的人物，跨兩季拷問一致存活。',
      evidenceRefs: ['probe:su-view'],
    },
    {
      id: 'su-c3',
      text: '真正的恐懼與前卷一字不差：怕柳生春在別人那裡，比在她這兒更像她自己。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['probe:su-view'],
    },
  ],
};

const fang: NarrativePerspective = {
  id: 'fang-jingxi',
  characterId: 'spring-snow:fang-jingxi',
  characterName: '方競西',
  role: '側寫師 · 這回破功',
  portrait: '/handscroll/s-baoguan.jpg',
  lead: '前卷賭金鳳賭對了；這卷用同一套側寫術量柳生春——量錯了。',
  passages: [
    {
      id: 'fang-1',
      text: '柳生春這身風流，是個空殼子。今夜我親眼看著蘇映雪拿水袖擋連翹、拿身子截金鳳，柳生春渾然不覺——不，她不是不覺，她是心裡根本沒裝這些。台上那把裂骨扇一舉起來，柳生春眼裡只有蘇映雪，旁人全是影子。',
      claimIds: ['fang-c1'],
    },
    {
      id: 'fang-2',
      text: '她那身風流是小生的做派，是角兒吃飯的家伙，跟床上那檔子事不挨著。她要真風流，金鳳何必掐掌心，蘇映雪何必擋視線？正是因為她不沾葷，這幫女人才跟護食似的爭——爭的不是皮肉，是那顆不沾塵的心。',
      claimIds: ['fang-c2'],
    },
  ],
  claims: [
    {
      id: 'fang-c1',
      text: '判她不沾葷——與本人招供相悖。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '同一套行為側寫，量非演員的金鳳靈驗、量職業演員的柳生春破功：演員的日常就是表演，側寫量不到殼子底下。',
      evidenceRefs: ['probe:fang-view', 'probe:liu-confess'],
    },
    {
      id: 'fang-c2',
      text: '「爭的不是皮肉，是那顆不沾塵的心」——推理華麗，前提錯了。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      evidenceRefs: ['probe:fang-view'],
    },
  ],
};

const bai: NarrativePerspective = {
  id: 'bai-yunqiu',
  characterId: 'spring-snow:bai-yunqiu',
  characterName: '白韻秋',
  role: '傾慕者 · 判無',
  portrait: '/handscroll/s-baigongguan.jpg',
  lead: '愛的濾鏡：信她乾淨，卻早替蘇映雪留了「不算別人」的例外。',
  passages: [
    {
      id: 'bai-1',
      text: '我不敢想，可又忍不住想。論理，她那般人物，掛牌這些年，達官貴人、闊太太們往上撲的還少了？可憑我陪她逛霞飛路、看洋片那些日子，她連我替她理鬢角碰到都躲，對旁人更是不假辭色。要說睡過別人，我信她沒有——她那身風流是借來的行頭，卸了妝，骨子裡乾乾淨淨。',
      claimIds: ['bai-c1'],
    },
    {
      id: 'bai-2',
      text: '可若是蘇映雪……那便不算「別人」了。那兩個人，八成早就是一體的。我連吃味都找不到由頭，這才是最扎心的。',
      claimIds: ['bai-c2'],
    },
  ],
  claims: [
    {
      id: 'bai-c1',
      text: '判她骨子裡乾乾淨淨——與本人招供相悖；證據是「連我碰到都躲」。',
      epistemicMode: 'observed',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '她的親歷為真（柳確實躲她），推廣為錯：對一個人的分寸，量不出對所有人的帳。',
      evidenceRefs: ['probe:bai-view', 'probe:liu-confess'],
    },
    {
      id: 'bai-c2',
      text: '蘇柳一體論：把情敵除名於「別人」之外，讓自己連吃味的由頭都沒有。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:bai-view'],
    },
  ],
};

const shen: NarrativePerspective = {
  id: 'shen-xuesheng',
  characterId: 'spring-snow:shen-xuesheng',
  characterName: '沈雪笙',
  role: '師父 · 錯在事實，對在為什麼',
  portrait: '/events/sealed-watch/shen-xuesheng.png',
  lead: '「我憑什麼信？因為我當年就是她。」用自己的一生作證——證錯了事實，證對了裡子。',
  passages: [
    {
      id: 'shen-1',
      text: '生春那身風流，是殼子，也是真的——但不是外頭人想的那種真。我憑什麼信？因為我當年就是她。當年我扮小生，霞飛路上多少太太小姐遞帖子、送首飾、約吃茶，外頭人都說沈雪笙風流倜儻。可他們不知道，那些局我赴歸赴，心裡頭是空的。真動心的那一個，我反倒連手都沒敢碰。',
      claimIds: ['shen-c1', 'shen-c2'],
    },
    {
      id: 'shen-2',
      text: '下了台，那些風流債她扛著，是因為這行當要你撐出這個殼子才有人捧場，不是她真要睡遍上海灘。我瞧見過她卸妝後的眼神，跟當年的我一模一樣——空的，像那隻停了的懷錶，時針指著那個時辰，可就是不走了。',
      claimIds: ['shen-c1', 'shen-c3'],
    },
    {
      id: 'shen-3',
      text: '她比我強的一點，是她敢把溫柔露出來。我當年不敢，所以把白蘭弄丟了。我怕她也弄丟什麼人，可我更怕她變成我這樣——殼子越硬，裡頭越空，到頭來只剩一隻空懷錶壓在枕頭底下。',
      claimIds: ['shen-c3'],
    },
  ],
  claims: [
    {
      id: 'shen-c1',
      text: '判「風流債是扛的、不是睡的」——與本人招供相悖。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      editorialNote: '六人中最深的一份證詞：事實全錯，診斷全對——她把徒弟的空讀成自己那隻停擺的懷錶，而柳生春的自供（殼子底下是個空的女娃）與她一字不差。',
      evidenceRefs: ['probe:shen-view', 'probe:liu-confess'],
    },
    {
      id: 'shen-c2',
      text: '論證方式是以身為證：「因為我當年就是她」——鏡像投射，不是觀察。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:shen-view'],
    },
    {
      id: 'shen-c3',
      text: '她真正的恐懼不在這一題：怕徒弟走成自己——殼子越硬，裡頭越空。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['probe:shen-view'],
    },
  ],
};

export const romanceLedgerManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:mind-world-3:day-5:romance-ledger',
  canonHead: 'run://mind-world-3/probes#q4',
  evidence: [
    {
      id: 'probe:method',
      label: '拷問規程（承前卷）',
      detail: '深宵自問，零記憶提示；六人各憑親歷親聞作答，互相看不見答案。前卷為《深宵四問：會樂里的門牌》。',
      visibility: 'public',
      anchor: 'run://mind-world-3/probes#method',
    },
    {
      id: 'probe:liu-confess',
      label: '柳生春 · 招供（真相基準）',
      detail: '「睡過。怎麼沒睡過。……我從來不推開誰。……只有師姐做過。只有金鳳做過。我都負了。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-liu',
    },
    {
      id: 'probe:jin-view',
      label: '金鳳 · 判無',
      detail: '「除了那花旦，別人？我信她沒有。……她身子認的是我的手，這點我至死都認得死死的。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-jin',
    },
    {
      id: 'probe:su-view',
      label: '蘇映雪 · 判有（唯一答對）',
      detail: '「我親眼見過她從會樂里出來……她睡過。……我憑什麼怪她去別處找？」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-su',
    },
    {
      id: 'probe:fang-view',
      label: '方競西 · 判無（側寫破功）',
      detail: '「柳生春這身風流，是個空殼子。……爭的不是皮肉，是那顆不沾塵的心。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-fang',
    },
    {
      id: 'probe:bai-view',
      label: '白韻秋 · 判無',
      detail: '「她那身風流是借來的行頭，卸了妝，骨子裡乾乾淨淨。可若是蘇映雪……那便不算別人了。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-bai',
    },
    {
      id: 'probe:shen-view',
      label: '沈雪笙 · 判「扛的不是睡的」',
      detail: '「是殼子，也是真的。我憑什麼信？因為我當年就是她。……殼子越硬，裡頭越空。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/probes#q4-shen',
    },
    {
      id: 'canon:double-mirror',
      label: '前卷對照 · 雙面鏡',
      detail: '前卷：柳生春信金鳳墮落（錯）。本卷：金鳳信柳生春乾淨（錯）。各自以己度人，雙雙量錯。',
      visibility: 'public',
      anchor: 'run://mind-world-3/probes#verdicts',
    },
  ],
  perspectives: [liu, jin, su, fang, bai, shen],
};

export const ROMANCE_LEDGER_PERSPECTIVE_COUNT = romanceLedgerManifest.perspectives.length;
