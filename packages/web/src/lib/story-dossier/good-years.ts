import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const GOOD_YEARS_SLUG = 'good-years';

/**
 * A HARMONY dossier — the inverse of the inquests. Hand-compiled from the
 * 憶季 (interlude) run at 會樂里 (internal/season-runs/interlude-huileli): the
 * two minds relived their honeymoon years and each distilled the same nights.
 * The two accounts do NOT contradict — they agree, tenderly, in detail. The
 * whole charge is dramatic irony: a reader who has read 碎扇還帳 and the two
 * 深宵拷問 knows these two, who remember the good years in perfect unison,
 * will spend the present misreading each other into ruin (the double mirror).
 */
export const goodYearsEvent: StoryDossierEvent = {
  slug: GOOD_YEARS_SLUG,
  saga: '春雪社',
  day: 0,
  scene: '六七年前 · 會樂里寓所',
  title: '好年頭：會樂里的一張小相',
  kicker: '這一回兩個人記得的一模一樣。難的不是他們記岔了，是你已經知道往後的事。',
  summary:
    '六七年前，柳生春還在雲錦台跑龍套，夜裡宿在金鳳會樂里的寓所——那是她們最好的年頭。一場雨把柳生春從戲園後門送進了那間屋，一張窄床、一碗偷學來的蔥花餛飩、一趟霞飛路的照相館、一對搭扣一塊按死的銀質相框。多年以後，兩個人各自回望，記下的竟是同一批夜晚，同樣的溫柔，一個字都不差。',
  hero: '/handscroll/s-jinfeng.jpg',
  heroAlt: '會樂里寓所——金鳳的屋子，那些好年頭住在這裡',
  canonFacts: [
    '六七年前柳生春在雲錦台跑龍套，戲單上沒有名字；一個雨夜她失魂落魄，被金鳳從戲園後門拽進了會樂里的寓所。',
    '那些日子她們同擠一張窄床，說戲到天光；金鳳替她描眉，她替金鳳縫水袖；柳生春偷跟弄口餛飩攤的阿婆學了金鳳愛吃的蔥花配法。',
    '她們同去霞飛路照相館拍了一張兩人的小相，又買下一對銀質花葉紋相框——搭扣是兩人一塊按死的。',
    '她們把手按在彼此左胸口起過誓：「這心跳一下是我，我也得跳一下是你。」柳生春要說「死」字時，金鳳捂住她的嘴。',
  ],
  editorialSignals: {
    resolvedWants: 0,
    departures: 0,
    relationshipTurn: true,
  },
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '那年還在跑龍套的她',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '「像把命重新活了一回。」她這輩子頭一回被人這樣疼。',
  passages: [
    {
      id: 'liu-1',
      text: '她從被窩裡撩開一角，說「這熱乎勁兒除了你誰也沒福氣消受」，那條腿大大方方橫上我的腰。那時我還在戲園扛槍旗蹭飯吃，見人還會臉紅，可在她跟前，甜話渾話沒出息的傻話，我一籮筐往外倒。',
      claimIds: ['liu-c1'],
    },
    {
      id: 'liu-2',
      text: '弄口阿婆教的蔥花配法，我頭一回端給她。她說「往後姑奶奶的嘴可被你養刁了，家裡飯食全歸你」——這話聽著比唱的還好聽。這不就是應了要跟我踏踏實實過一輩子麼？',
      claimIds: ['liu-c2'],
    },
    {
      id: 'liu-3',
      text: '霞飛路那對銀質花葉紋相框，兩個並排按緊搭扣那聲脆響，她把手按在我心口說「這心跳一下是我，我也得跳一下是你」。我那點沒出息的傻念頭，居然真成了。',
      claimIds: ['liu-c3', 'liu-c4'],
    },
    {
      id: 'liu-4',
      text: '我要說「死」字，她捂住我的嘴，眼眶發紅，說得活到老，活到嚼不動餛飩為止。今天這日子，真像把命重新活了一回。',
      claimIds: ['liu-c4'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '在金鳳跟前她話多、敢露傻——那個風流殼子還沒長出來。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:liu'],
    },
    {
      id: 'liu-c2',
      text: '她把「家裡飯食全歸你」聽成了一生的承諾。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      editorialNote: '後來她成了角兒、拿風流當殼子，把金鳳磨成「其中一個」——這句承諾是她親手鬆的手。讀《碎扇還帳》。',
      evidenceRefs: ['interlude:liu', 'later:broken-fan'],
    },
    {
      id: 'liu-c3',
      text: '相框、心跳誓——她記得的信物與金鳳記得的一字不差。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:liu', 'interlude:jin'],
    },
    {
      id: 'liu-c4',
      text: '「活到嚼不動餛飩為止」——她們都不敢說死字。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:liu'],
    },
  ],
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '那年剛掛頭牌的她',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '「把咱倆的命釘死在一塊兒了。」她這顆裝了十年的假心，頭一回真跳。',
  passages: [
    {
      id: 'jin-1',
      text: '她後腰那顆小痣，我指尖順著描了多少回，全上海只有我識得那塊皮的紋路。那晚在後台，她紅著耳根讓我搶走的戲本子，扉頁上寫著「傻子遇仙子」——那傻子是她，仙子是我。',
      claimIds: ['jin-c1'],
    },
    {
      id: 'jin-2',
      text: '霞飛路照相館的洋鏡頭前，她死死摟著我，下巴抵在我發頂，笑得像個撿了金元寶的呆子。那對銀質花葉紋相框，搭扣是我倆一塊兒按死的，扣上的聲音比什麼戲文都震耳朵。',
      claimIds: ['jin-c2'],
    },
    {
      id: 'jin-3',
      text: '那相框的搭扣扣上了，就像把咱倆的命釘死在一塊兒了。她心跳一下就是我，我心跳一下就是她，這比什麼山盟海誓都實在。那碗偷學來的蔥花餛飩，還有她按搭扣時手抖的模樣，我到老都忘不了。',
      claimIds: ['jin-c3', 'jin-c4'],
    },
    {
      id: 'jin-4',
      text: '往後這相片貼身放著。台上那個「他」是演給滿堂看客的，我愛的是卸了妝的她——眉頭鬆開、連呼吸都是軟的那個真。這些年我心裡只喚「她」，不喚「他」。',
      claimIds: ['jin-c5'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '後腰的痣、扉頁的「傻子遇仙子」——她記得的親密細節與柳生春記得的互相印證。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:jin', 'interlude:liu'],
    },
    {
      id: 'jin-c2',
      text: '照相館真去成了——她攢錢拍小相的秘密念頭，在這段日子裡實現了。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:jin'],
    },
    {
      id: 'jin-c3',
      text: '「把咱倆的命釘死在一塊兒」——她把那對相框當成了婚書。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'unresolved',
      editorialNote: '六七年後她會等一個不來的人、除夕推局、養一盆晚香玉六年。命沒釘住，她一個人守著。讀《深宵四問》。',
      evidenceRefs: ['interlude:jin', 'later:midnight-inquest'],
    },
    {
      id: 'jin-c4',
      text: '她說到老都忘不了——這是唯一一件她後來果然沒忘的事。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['interlude:jin'],
    },
    {
      id: 'jin-c5',
      text: '她愛的是卸了妝的「她」，不是台上的「他」——本人裁定的稱謂。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'verified',
      editorialNote: '此篇金鳳的記憶原文以「他」稱柳生春；依她本人供詞歸一為「她」（愛的是人，不是殼）。',
      evidenceRefs: ['interlude:jin', 'ruling:pronoun'],
    },
  ],
};

export const goodYearsManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:interlude-huileli:good-years',
  canonHead: 'run://interlude-huileli/history',
  evidence: [
    {
      id: 'frame:irony',
      label: '看官須知 · 你比她們多知道一件事',
      detail:
        '這是六七年前，兩個人最好的年頭。她們記得的一模一樣，一個字不差。難處全在你這頭——你已經讀過《碎扇還帳》《深宵四問》《深宵六問》，你知道這對把好年頭記得分毫不差的人，往後會把彼此誤讀成一面雙面鏡。',
      visibility: 'public',
      anchor: 'run://spring-snow/interlude#frame',
    },
    {
      id: 'interlude:liu',
      label: '柳生春 · 多年後回望（自蒸餾）',
      detail: '憶季跑完，年輕的柳生春各自把那段日子濃縮成刻進心裡的記憶——餛飩、相框、心跳誓、不許說死字。',
      visibility: 'private',
      anchor: 'run://interlude-huileli/memories#liu',
    },
    {
      id: 'interlude:jin',
      label: '金鳳 · 多年後回望（自蒸餾）',
      detail: '同一批夜晚，金鳳記下的版本——後腰的痣、「傻子遇仙子」、照相館、把命釘在一塊兒的搭扣。',
      visibility: 'private',
      anchor: 'run://interlude-huileli/memories#jin',
    },
    {
      id: 'ruling:pronoun',
      label: '金鳳 · 稱謂自裁',
      detail: '「台上那個他是演給看客的，我愛的是卸了妝的她……這些年我心裡只喚她，不喚他。」據此，她的記憶稱謂歸一為「她」。',
      visibility: 'public',
      anchor: 'run://mind-world-5/probes#pronoun',
    },
    {
      id: 'later:broken-fan',
      label: '後來 · 碎扇還帳',
      detail: '六七年後，柳生春在會樂里門口跪還一柄裂骨扇，還一句拖了六年的交代。',
      visibility: 'public',
      anchor: '/feed/event/broken-fan',
    },
    {
      id: 'later:midnight-inquest',
      label: '後來 · 深宵四問',
      detail: '同一顆為她養了六年晚香玉的心，被別人猜疑成「會樂里的門牌不乾淨」。',
      visibility: 'public',
      anchor: '/feed/event/midnight-inquest',
    },
  ],
  perspectives: [liu, jin],
};

export const GOOD_YEARS_PERSPECTIVE_COUNT = goodYearsManifest.perspectives.length;
