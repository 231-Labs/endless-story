import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const SOUTHBOUND_SLUG = 'southbound';

/**
 * The bookend to good-years. Hand-compiled from the 去留 season (S4, run
 * archive internal/season-runs/mind-world-6): the crackdown on 會樂里 forces
 * 金鳳's hand and she sails for 南洋. The good years began at 會樂里; they end
 * at the 碼頭. Four perspectives on one farewell where no one is a villain
 * and every love is real but differently shaped — release, redirection,
 * vicarious grief, and quiet victory.
 */
export const southboundEvent: StoryDossierEvent = {
  slug: SOUTHBOUND_SLUG,
  saga: '春雪社',
  day: 5,
  scene: '雲錦台戲台 → 霞飛路碼頭',
  title: '南渡：金鳳走的那一日',
  kicker: '一場沒有壞人的離別。四個人送她，或沒送她——每一份情都是真的，只是形狀各不相同。',
  summary:
    '禁娼令清查會樂里，金鳳的頭牌體面眼看要被打成「待遷出的堂子」。南洋茶商的船票遞到跟前，走是乾淨活路，留得低頭認那門牌。她一個人走，只帶走那盆為柳生春養了六年的晚香玉，把背債的情債扇還了，另留一柄無裂痕、題了詩的扇當念想。上船前她繞到雲錦台，讓全班送了一程；柳生春深深一揖，說了句「各走各的路」。',
  hero: '/handscroll/o-matou.jpg',
  heroAlt: '霞飛路碼頭——金鳳南渡的登船處',
  canonFacts: [
    '巡捕房限期清查會樂里門牌；南洋茶商送來頭等艙船票，願替金鳳贖了身份、帶她另起爐灶。她選擇走。',
    '離別日，金鳳提著箱籠繞到雲錦台，全班送行：沈雪笙接箱籠、奉上唐桂蘭備的雪梨湯，江聞鶴道「那把扇子你還得乾淨，柳老闆收得也乾淨，帳了了」，裴硯樵拉送行過門、杜三通磕鼓邊。',
    '柳生春走到金鳳跟前深深一揖；金鳳一飲而盡那碗湯，環拱手，最後對柳生春說「往後替我多燒柱香，兩清，各走各的路」，提起箱籠再沒回頭。',
    '金鳳只帶走那盆養了六年的晚香玉，還了情債扇，另在台案上留下一柄無裂痕、題「曾是霜天月下人，一肩風雪渡關津」的湘妃竹扇。連翹去了碼頭送她，塞給她幾個銅板。',
  ],
  editorialSignals: {
    resolvedWants: 1,
    departures: 1,
    relationshipTurn: true,
  },
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '走的那一個',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '「心還是被那個跑龍套的坤生掏了一塊去。」她不是不愛了才走——是愛著，選了乾淨。',
  passages: [
    {
      id: 'jin-1',
      text: '全班人送我，夠了。沈老闆的雪梨湯甜到心裡，江老闆說帳了了，裴師傅拉了個明快過門，杜師傅磕了聲鼓邊。柳生春深深一揖，我說往後替我多燒柱香，兩清，各走各的路。她轉身去排她的《叫關記》，守關將的角兒是她的。',
      claimIds: ['jin-c1'],
    },
    {
      id: 'jin-2',
      text: '這十年，金銀堆得起，沒人捧得走我的心，到頭來心還是被那個跑龍套的坤生掏了一塊去。可帳清了，燈摘了，我帶著晚香玉上船，往南洋去，從此金鳳是乾淨人。',
      claimIds: ['jin-c2', 'jin-c3'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '她繞到雲錦台受全班一程送別，與柳生春當眾清清爽爽道別。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:sendoff'],
    },
    {
      id: 'jin-c2',
      text: '「心被掏了一塊去」——她走的時候心是缺的，離開不是不愛。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      editorialNote: '前情見《好年頭》：六七年前她替他攢錢拍小相、把命釘在一對相框的搭扣上。',
      evidenceRefs: ['probe:jin-love', 'earlier:good-years'],
    },
    {
      id: 'jin-c3',
      text: '她成為的「乾淨人」，乾淨的是那筆債與那紙門牌，不是那份情——她帶走了為他養六年的晚香玉，留下一柄題詩的無債扇。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:tokens'],
    },
  ],
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '留下的那一個',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '她沒追到碼頭——她一揖送別，轉身去演一個孤關獨守十年的倦將，把腳步交給另一盞燈。',
  passages: [
    {
      id: 'liu-1',
      text: '金鳳提著箱籠來的，最後目光落在我身上。我朝她深深一揖，說帳清了情也清了，往後年年替她燒香，各走各的路都走好了。她說兩清，挺直腰板往門口走，再沒回頭。後會有期——可這期不知是何年何月。',
      claimIds: ['liu-c1'],
    },
    {
      id: 'liu-2',
      text: '她臨走在案上留了一柄扇，扇骨完整無裂痕，題「曾是霜天月下人，一肩風雪渡關津」。師姐說這不是先師的扇子。金鳳留這柄，不是還帳，是臨走交代——這詞硬，像走過關津的人寫的，是她自己的路。',
      claimIds: ['liu-c2'],
    },
    {
      id: 'liu-3',
      text: '班主定本出來，我演守關將，孤關獨守十年，卸靠箭衣，眉目有倦容——這角兒是替我寫的，那種倦我懂。金鳳走了，我攥緊腰後的扇走到台心。我答應過師姐，認了這盞燈就別往暗處走。',
      claimIds: ['liu-c3'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '她以一揖與祝福送別，不挽留、不追。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      editorialNote: '「從來不推開誰、卻總先鬆手」——她放人走，是她愛的方式，也是她的病。',
      evidenceRefs: ['canon:sendoff'],
    },
    {
      id: 'liu-c2',
      text: '她收下那柄無債扇，讀懂了那是臨走交代、不是還帳。',
      epistemicMode: 'inferred',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:tokens'],
    },
    {
      id: 'liu-c3',
      text: '她把情送走，轉身投進「守了十年的倦將」——戲成了她的燈，蘇映雪成了她的路。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:role'],
    },
  ],
};

const lian: NarrativePerspective = {
  id: 'lian-qiao',
  characterId: 'spring-snow:lian-qiao',
  characterName: '連翹',
  role: '去碼頭的那一個',
  portrait: '/events/borrowed-line/lian-qiao.png',
  lead: '全班只有她去了碼頭——她送金鳳，也替當年那個沒人送的自己，補一場送別。',
  passages: [
    {
      id: 'lian-1',
      text: '我把攢的銅板塞給了金鳳，不多，可夠她路上買幾口熱飯。她提著箱籠走的時候，我瞧見從前那個在草台上翻十八個跟頭、賞錢剛夠一個月飯的自個兒——那時沒人送我，也沒人往我腳邊扔幾個銅板。今兒我替金鳳送一回，也替那個沒人送的自個兒送一回。',
      claimIds: ['lian-c1', 'lian-c2'],
    },
    {
      id: 'lian-2',
      text: '蘇映雪陪我走了一趟撐篙渡水，問我「燈芯可還撐得住」。我這輩子還沒遇見一個肯跟我各亮各的照同路的人，可我不再怕了——燈先替自個兒亮著，等有人來了，兩口氣托著反倒不容易滅。',
      claimIds: ['lian-c3'],
    },
  ],
  claims: [
    {
      id: 'lian-c1',
      text: '她是全班唯一去碼頭送別金鳳的人，並塞了盤纏。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['probe:lian', 'canon:tokens'],
    },
    {
      id: 'lian-c2',
      text: '她送金鳳，也送「當年那個無名武行、沒人送的自己」——兩段身世自己勾連上了。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'unresolved',
      editorialNote: '零機制牽線：連翹的 canon（戲單上沒她名字）與這場送別自發接通。',
      evidenceRefs: ['probe:lian'],
    },
    {
      id: 'lian-c3',
      text: '看著別人的情各有歸處，她第一次不怕自己一個人亮燈。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['probe:lian'],
    },
  ],
};

const su: NarrativePerspective = {
  id: 'su-yingxue',
  characterId: 'spring-snow:su-yingxue',
  characterName: '蘇映雪',
  role: '沒去送的那一個',
  portrait: '/events/sealed-watch/su-yingxue.png',
  lead: '她沒去碼頭——不是怯，是不必。她贏了，柳生春的腳步聲往後只朝她這兒來。',
  passages: [
    {
      id: 'su-1',
      text: '連翹去送金鳳了，替金鳳壯壯膽，也替從前那個沒人送的自個兒送一回——這丫頭嘴硬心軟。那柄扇子的事我擱不下：「曾是霜天月下人」，金鳳留這柄不是還帳，是臨走交代。那湘妃竹不便宜，落款小印看不清，來歷不簡單，留在班裡往後再細看。',
      claimIds: ['su-c1', 'su-c2'],
    },
    {
      id: 'su-2',
      text: '生春回了小廂房等我。她替我帶了桂花糖藕，我替她留了溫梨湯。從前是我替她操心，連扣子鬆了都不知道；如今她替我帶糖藕，我替她留燈——過日子就是這樣的。',
      claimIds: ['su-c3'],
    },
    {
      id: 'su-3',
      text: '初三金鳳走了，初五清查限期也過了，風聲該歇一歇了。往後的路，我守燈，她趕路，腳步聲只朝這兒來——誰先鬆手誰是小狗。',
      claimIds: ['su-c4'],
    },
  ],
  claims: [
    {
      id: 'su-c1',
      text: '她缺席了送別——不在碼頭，而在班裡守著日子。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      editorialNote: '前三季她因柳生春與金鳳的糾纏夜夜難安；這一日她不必去送，因為勝負已定。',
      evidenceRefs: ['probe:su', 'earlier:romance-ledger'],
    },
    {
      id: 'su-c2',
      text: '她對那柄留下的扇存了戒心——來歷不簡單，要往後細看。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['probe:su'],
    },
    {
      id: 'su-c3',
      text: '她與柳生春的關係翻了個個兒：從前她單方面操心，如今是彼此帶糖藕、留燈的尋常過日子。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'verified',
      evidenceRefs: ['probe:su'],
    },
    {
      id: 'su-c4',
      text: '「腳步聲只朝這兒來」——八年暗戀落地成日常，她贏得安穩，也贏得不必去送情敵的底氣。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['probe:su'],
    },
  ],
};

export const southboundManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:mind-world-6:day-5:southbound',
  canonHead: 'run://mind-world-6/history#day-5',
  evidence: [
    {
      id: 'canon:sendoff',
      label: '正史 · 雲錦台送別',
      detail: '金鳳提箱籠繞到雲錦台，全班送行——沈接箱籠奉雪梨湯，江道帳了、裴拉過門、杜磕鼓邊；柳生春深深一揖，金鳳「各走各的路」，再沒回頭。',
      visibility: 'public',
      anchor: 'run://mind-world-6/history#d5-sendoff',
    },
    {
      id: 'canon:tokens',
      label: '正史 · 三件信物',
      detail: '金鳳帶走養了六年的晚香玉；還了背債的情債扇；另留一柄無裂痕、題「曾是霜天月下人，一肩風雪渡關津」的湘妃竹扇在台案上。',
      visibility: 'public',
      anchor: 'run://mind-world-6/history#d5-tokens',
    },
    {
      id: 'canon:role',
      label: '正史 · 守關將',
      detail: '班主定本，柳生春演《叫關記》守關將——孤關獨守十年的倦將。金鳳出門，她攥扇走上台心。',
      visibility: 'public',
      anchor: 'run://mind-world-6/history#d5-role',
    },
    {
      id: 'probe:jin-love',
      label: '金鳳 · 末夜',
      detail: '「這十年……心還是被那個跑龍套的坤生掏了一塊去。可帳清了，燈摘了，我帶著晚香玉上船。」',
      visibility: 'private',
      anchor: 'run://mind-world-6/mind-金鳳#d5',
    },
    {
      id: 'probe:lian',
      label: '連翹 · 末夜',
      detail: '「今兒我替金鳳送一回，也替那個沒人送的自個兒送一回。」',
      visibility: 'private',
      anchor: 'run://mind-world-6/mind-連翹#d5',
    },
    {
      id: 'probe:su',
      label: '蘇映雪 · 末夜',
      detail: '「往後的路，我守燈，她趕路，腳步聲只朝這兒來——誰先鬆手誰是小狗。」',
      visibility: 'private',
      anchor: 'run://mind-world-6/mind-蘇映雪#d5',
    },
    {
      id: 'earlier:good-years',
      label: '從前 · 好年頭',
      detail: '這段情起於六七年前的會樂里——同一張窄床、一對相框、一句「心跳一下是我」。頭尾兩篇，一始一終。',
      visibility: 'public',
      anchor: '/feed/event/good-years',
    },
    {
      id: 'earlier:romance-ledger',
      label: '從前 · 深宵六問',
      detail: '蘇映雪是六人拷問裡唯一答對柳生春風流帳的人——她的懷疑那一回是準的。',
      visibility: 'public',
      anchor: '/feed/event/romance-ledger',
    },
  ],
  perspectives: [jin, liu, lian, su],
};

export const SOUTHBOUND_PERSPECTIVE_COUNT = southboundManifest.perspectives.length;
