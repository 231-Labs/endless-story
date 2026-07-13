import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const NIGHT_TUBEROSE_SLUG = 'night-tuberose';

export const nightTuberoseEvent: StoryDossierEvent = {
  slug: NIGHT_TUBEROSE_SLUG,
  saga: '春雪社',
  day: 68,
  scene: '金鳳寓所',
  title: '晚香玉沒有死',
  kicker: '金鳳要的不是柳生春回頭。她只要那個人承認：她們好的那些年，是真的。',
  summary:
    '雨夜，柳生春帶著一把六年前的銅鑰匙回到會樂里。金鳳沒有收，只把窗台那盆晚香玉搬到桌上，問她：「那些年，算不算數？」這一次，柳生春沒有笑著把話岔開。',
  hero: '/handscroll/s-jinfeng.jpg',
  heroAlt: '金鳳寓所內的妝鏡、留聲機、琵琶與窗台晚香玉',
  heroZoom: true,
  canonFacts: [
    '雨夜亥時後，柳生春進入金鳳寓所，帶來一把舊銅鑰匙；這是她七個月來第一次登門。',
    '金鳳沒有收下鑰匙，而是把窗台上養了六年的晚香玉搬到兩人之間。',
    '金鳳問：「那些年，算不算數？」柳生春答：「算。我愛過你。後來是我先走遠。」',
    '兩人分坐桌側直到天亮。鑰匙仍留在桌上；柳生春沒有進內室，金鳳也沒有要求她留下。',
  ],
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '霞飛路紅歌女',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '她等的不是浪子回頭，而是讓自己的六年不再被說成一場收留。',
  passages: [
    {
      id: 'jin-1',
      text: '她敲門的時候，我正在放那張《四季相思》。七個月沒來的人，身上還帶著我熟悉的雨氣，手裡卻捏著那把舊鑰匙，像來替一段日子收屍。',
      claimIds: ['jin-c1', 'jin-c2'],
    },
    {
      id: 'jin-2',
      text: '我沒接。我把晚香玉搬到桌上。這盆花是她六年前抱來的，好的時候她替我描眉，我替她縫水袖；一張窄床擠著說戲到天光。她紅了以後來得愈來愈少，只有這盆花，一夜一夜照舊開。',
      claimIds: ['jin-c3', 'jin-c4'],
    },
    {
      id: 'jin-3',
      text: '我問她，那些年算不算數。不是問她如今愛誰，也不是要她回來。我只要她親口認一句：我不是在她被別人傷透時，順手替人收拾的一張床。',
      claimIds: ['jin-c5'],
    },
    {
      id: 'jin-4',
      text: '她說：「算。我愛過你。後來是我先走遠。」我以為等到這句會痛快，原來只覺得累。天快亮時我去剪了一片枯葉，沒有趕她，也沒有留她。花活著，並不等於非得回到從前。',
      claimIds: ['jin-c6', 'jin-c7'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '柳生春七個月未曾登門，今夜帶著舊鑰匙回來。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:arrival', 'canon:key'],
    },
    {
      id: 'jin-c2',
      text: '金鳳把歸還鑰匙理解為柳生春想替舊情收尾。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:key', 'private:jin-reading'],
    },
    {
      id: 'jin-c3',
      text: '晚香玉是柳生春六年前搬進金鳳寓所的。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'contested',
      evidenceRefs: ['seed:flower', 'canon:flower'],
    },
    {
      id: 'jin-c4',
      text: '柳金好的那些年，金鳳寓所曾是柳生春的半個家。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['seed:shared-home'],
    },
    {
      id: 'jin-c5',
      text: '金鳳要的是承認，不是柳生春回頭或離開蘇映雪。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['seed:jin-demand', 'private:jin-intent'],
    },
    {
      id: 'jin-c6',
      text: '柳生春親口承認曾經愛過金鳳，並承認是自己先走遠。',
      epistemicMode: 'heard',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:words'],
    },
    {
      id: 'jin-c7',
      text: '金鳳認為花活著，不代表兩人必須復合。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['canon:dawn', 'private:jin-release'],
    },
  ],
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '當紅坤生',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '她原本想還一把鑰匙，最後不得不承認，自己欠的從來不是一間屋。',
  passages: [
    {
      id: 'liu-1',
      text: '那把鑰匙在我妝箱底躺了六年。我總說哪日路過會還，卻夜夜繞開會樂里。今夜下雨，像她頭一回把我從戲園後門拽進屋裡的那夜，我忽然再也找不到別的藉口。',
      claimIds: ['liu-c1', 'liu-c2'],
    },
    {
      id: 'liu-2',
      text: '我以為花早死了。晚香玉卻比從前更高，葉尖修得乾乾淨淨。那幾年也是真的：她替我縫水袖，我替她描眉，我曾在那張窄床上真心想過，要同她過一輩子。',
      claimIds: ['liu-c3', 'liu-c4'],
    },
    {
      id: 'liu-3',
      text: '她問那些年算不算數。我差一點又笑，差一點說金老板怎麼也問這種傻話。可那樣一來，我就會再欠她一年。於是我說：「算。我愛過你。不是因為誰不要我。後來是我先走遠。」',
      claimIds: ['liu-c5', 'liu-c6'],
    },
    {
      id: 'liu-4',
      text: '她沒有哭，也沒有叫我留下。我們一人坐桌一邊，聽留聲機轉到只剩沙聲。天亮時我仍沒有碰她——不是不想，是我終於知道，想念不能再拿來向她討一夜原諒。',
      claimIds: ['liu-c7'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '舊鑰匙在柳生春的妝箱裡保存了六年。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'contested',
      evidenceRefs: ['canon:key'],
    },
    {
      id: 'liu-c2',
      text: '今夜的雨使柳生春想起金鳳第一次接住她的雨夜。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['seed:rain-night', 'canon:arrival'],
    },
    {
      id: 'liu-c3',
      text: '柳生春原以為晚香玉早已死去。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['canon:flower'],
    },
    {
      id: 'liu-c4',
      text: '柳生春曾真心想過與金鳳長久生活。',
      epistemicMode: 'remembered',
      relation: 'unresolved',
      review: 'contested',
      evidenceRefs: ['seed:liu-forever', 'seed:shared-home'],
    },
    {
      id: 'liu-c5',
      text: '柳生春承認自己愛過金鳳。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:words'],
    },
    {
      id: 'liu-c6',
      text: '柳生春否認金鳳只是蘇映雪離開後的替代。',
      epistemicMode: 'observed',
      relation: 'reinterprets',
      review: 'verified',
      evidenceRefs: ['canon:words', 'seed:rain-night'],
    },
    {
      id: 'liu-c7',
      text: '柳生春沒有觸碰金鳳，是因為不願再用親密換取原諒。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:dawn', 'private:liu-restraint'],
    },
  ],
};

export const nightTuberoseManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:day-68:night-tuberose',
  canonHead: 'seed://spring-snow/v1#night-tuberose',
  evidence: [
    {
      id: 'canon:arrival',
      label: '正史 · 雨夜登門',
      detail: '柳生春在亥時後進入金鳳寓所；距上次登門七個月。',
      visibility: 'public',
    },
    {
      id: 'canon:key',
      label: '正史 · 舊銅鑰匙',
      detail: '柳生春帶來一把金鳳寓所的舊鑰匙；金鳳沒有收，鑰匙留在桌上。',
      visibility: 'public',
    },
    {
      id: 'canon:flower',
      label: '正史 · 晚香玉',
      detail: '金鳳把養了六年的晚香玉搬到兩人之間，植株仍存活。',
      visibility: 'public',
      anchor: 'seed://spring-snow/scene/金鳳寓所/晚香玉',
    },
    {
      id: 'canon:words',
      label: '正史 · 當面承認',
      detail: '金鳳問那些年是否算數；柳生春明確回答曾愛過她，並承認自己先走遠。',
      visibility: 'public',
    },
    {
      id: 'canon:dawn',
      label: '正史 · 直到天亮',
      detail: '兩人分坐桌側至天亮，沒有進入內室，也沒有發生可記錄的身體接觸。',
      visibility: 'public',
    },
    {
      id: 'seed:rain-night',
      label: '共同記憶 · 第一個雨夜',
      detail: '蘇映雪逃開後，金鳳在一個散場雨夜接住失魂落魄的柳生春。',
      visibility: 'private',
      anchor: 'seed://spring-snow/characters/柳生春+金鳳/memory/雨夜',
    },
    {
      id: 'seed:shared-home',
      label: '共同記憶 · 半個家',
      detail: '好的那些年，兩人縫水袖、描眉、擠一張窄床說戲到天光。',
      visibility: 'private',
      anchor: 'seed://spring-snow/characters/柳生春+金鳳/memory/半個家',
    },
    {
      id: 'seed:flower',
      label: '金鳳記憶 · 六年花期',
      detail: '晚香玉由柳生春搬來，金鳳養了六年，從未向旁人說明原因。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/金鳳/memory/晚香玉',
    },
    {
      id: 'seed:liu-forever',
      label: '柳生春記憶 · 曾想長久',
      detail: 'seed 中柳生春記得：那時是真心，曾想過與金鳳過一輩子。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/柳生春/memory/金鳳',
    },
    {
      id: 'seed:jin-demand',
      label: '金鳳記憶 · 要一句交代',
      detail: '金鳳不要拆散誰；她要柳生春當面承認欠她。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/金鳳/secret',
    },
    {
      id: 'private:jin-reading',
      label: '金鳳 · 對鑰匙的解讀',
      detail: '她認為柳生春登門是為了結束舊情；正史只能證明鑰匙被帶來。',
      visibility: 'private',
    },
    {
      id: 'private:jin-intent',
      label: '金鳳 · 真正所求',
      detail: '她要的是承認，不是復合；這是她對自身行動的詮釋。',
      visibility: 'private',
    },
    {
      id: 'private:jin-release',
      label: '金鳳 · 放手或保留',
      detail: '她尚未決定是否原諒，但不再以花是否活著要求關係復原。',
      visibility: 'private',
    },
    {
      id: 'private:liu-restraint',
      label: '柳生春 · 克制的理由',
      detail: '不觸碰可以被觀察；「不願用親密換原諒」只能由柳生春自述。',
      visibility: 'private',
    },
  ],
  perspectives: [jin, liu],
};

export const NIGHT_TUBEROSE_PERSPECTIVE_COUNT = nightTuberoseManifest.perspectives.length;
