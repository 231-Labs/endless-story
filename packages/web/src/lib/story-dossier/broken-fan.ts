import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const BROKEN_FAN_SLUG = 'broken-fan';

/**
 * Hand-compiled from the mind-world v3 playmaking season (run archive:
 * internal/season-runs/mind-world-3). Every passage is adapted from the
 * character's OWN transcript or night reflection; canon facts come from the
 * postman's objective log. First dossier sourced from persistent-mind runs.
 */
export const brokenFanEvent: StoryDossierEvent = {
  slug: BROKEN_FAN_SLUG,
  saga: '春雪社',
  day: 5,
  scene: '會樂里寓所 → 雲錦台戲台',
  title: '碎扇還帳，一日兩跪',
  kicker: '一柄黏了裂骨的湘妃竹摺扇，在《折柳記》首演這一天，走完了它欠了六年的路。',
  summary:
    '首演日清晨，柳生春立在會樂里門口跪下，說「當年我是真心的」，把那柄黏合過裂骨的摺扇留給金鳳。入夜《折柳記》開鑼，她在「碎扇」一場跪於台心；金鳳坐在台下暗處，手袋裡收著那柄扇。滿場彩聲，加了三回簾。',
  hero: '/handscroll/o-huileli.jpg',
  heroAlt: '會樂里寓所——首演日清晨，還帳跪與贈扇的所在',
  canonFacts: [
    '首演前一日，柳生春在戲台上當眾對金鳳說：「這本子我寫了六場，每一場的魂都是你」，並說第五場那個跪「是我自個兒的帳，得我自個兒跪」。',
    '首演日清晨，柳生春獨自到會樂里寓所門口跪下，說「當年我是真心的」，將那柄黏合過裂骨的湘妃竹摺扇留下後離開；金鳳落淚，說「你今兒把這話補上了，我這筆帳算清了。可我從來不是其中一個」。',
    '入夜《折柳記》首演，柳生春在「碎扇」一場跪於台心；金鳳換了旗袍入場，坐在不起眼的角落，手袋中攜著那柄扇。',
    '首演品相〇·九四，滿場彩聲，加了三回簾；散戲後金鳳獨自返回會樂里。',
  ],
  editorialSignals: {
    resolvedWants: 2,
    departures: 2,
    relationshipTurn: true,
  },
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '當紅坤生 · 《折柳記》編劇',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '她還的不是情分，是一句拖了六年沒說出口的真話——不說，上台唱不實。',
  passages: [
    {
      id: 'liu-1',
      text: '這話我欠了六年。開季那夜我就對自己說：金鳳那邊欠的一句交代非還不可，再拖，我這身風流就成了作踐人。可我躲了她四天，直到本子寫完，直到「碎扇」那場的詞落了紙，我才曉得——今兒不說，上台也唱不實。',
      claimIds: ['liu-c1', 'liu-c2'],
    },
    {
      id: 'liu-2',
      text: '我立在會樂里門口沒進屋，跪下去的時候只說了實話：是我先鬆的手，當年我是真心的，真心想過跟她過一輩子。後來是我飄了，是我賴了，是我把她磨成了「其中一個」。扇子留給她——那柄黏了裂骨的，碎過的東西不必裝新。',
      claimIds: ['liu-c3', 'liu-c4'],
    },
    {
      id: 'liu-3',
      text: '入夜開鑼，金鳳在台下。我下意識往包廂那頭看了一眼，黑壓壓的人影裡認不出她，可我知道她在。她紅著眼說的那句「我從來不是其中一個」，比今晚任何一聲彩都重。',
      claimIds: ['liu-c5', 'liu-c6'],
    },
    {
      id: 'liu-4',
      text: '滿堂彩，加了三回簾。可我跪在台上的時候，底下那些叫好聲，我一個字都沒聽進去。',
      claimIds: ['liu-c6'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '柳生春自開季起便認定欠金鳳一句交代，且連續數日刻意迴避她。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['run:aspire-liu', 'run:plans-liu'],
    },
    {
      id: 'liu-c2',
      text: '《折柳記》的「碎扇」一場，寫的就是這筆六年的帳。',
      epistemicMode: 'canonical',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['run:stage-avowal', 'canon:playbook'],
    },
    {
      id: 'liu-c3',
      text: '清晨在會樂里門口，她跪下說出「當年是真心的」，並將裂骨摺扇留給金鳳。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:dawn-kneel'],
    },
    {
      id: 'liu-c4',
      text: '她認為碎過又黏合的扇子，比一柄新扇更配這句遲到的話。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:dawn-kneel'],
    },
    {
      id: 'liu-c5',
      text: '首演時金鳳在場——柳生春沒有看見她，只是「知道她在」。',
      epistemicMode: 'inferred',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:premiere'],
    },
    {
      id: 'liu-c6',
      text: '台上「碎扇」一跪，她跪的是清晨那筆帳，不是戲。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:premiere', 'canon:playbook'],
    },
  ],
};

const jin: NarrativePerspective = {
  id: 'jin-feng',
  characterId: 'spring-snow:jin-feng',
  characterName: '金鳳',
  role: '霞飛路歌場頭牌',
  portrait: '/events/night-tuberose/jin-feng.png',
  lead: '等了六年的一句話，真聽見的那一刻，心裡卻是空的。',
  passages: [
    {
      id: 'jin-1',
      text: '開季那夜我對自己說：我圖的，就是柳生春當面認一句她欠我的。等真拿到那句話，我留不留、走不走，連我自己都未必曉得。',
      claimIds: ['jin-c1'],
    },
    {
      id: 'jin-2',
      text: '她立在門口沒進來，跪下去，說當年是真心的，說是她先鬆的手。我的手抖得厲害，想伸出去扶又縮回來，最後只拾起那柄扇——指腹摩過那道黏合的裂骨，眼眶到底紅了。我告訴她：帳算清了。可我金鳳不是其中一個，從來不是。',
      claimIds: ['jin-c2', 'jin-c3'],
    },
    {
      id: 'jin-3',
      text: '入夜我換了那件壓得住場子的旗袍，把扇子收進手袋，去看她的戲。今夜她跪了我，認了帳——台上那一跪落下去的時候，我在台下攥著那把扇子，像攥著一截斷了又接上的骨頭。',
      claimIds: ['jin-c4'],
    },
    {
      id: 'jin-4',
      text: '帳是清了。可我守了六年的晚香玉，半夜抹的淚，等不到的天亮，這些怎麼算？散了場一個人走回會樂里，對著那盆花，我還是拿不準主意。',
      claimIds: ['jin-c5'],
    },
  ],
  claims: [
    {
      id: 'jin-c1',
      text: '金鳳整季所求只是一句當面的認帳，並早已預留了「拿到之後未必留下」的餘地。',
      epistemicMode: 'remembered',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['run:aspire-jin'],
    },
    {
      id: 'jin-c2',
      text: '清晨柳生春在會樂里門口跪下認帳，並留下裂骨摺扇。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:dawn-kneel'],
    },
    {
      id: 'jin-c3',
      text: '「我從來不是其中一個」——金鳳以此為這六年定性，不接受「風流帳上的一筆」的身分。',
      epistemicMode: 'canonical',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:dawn-kneel'],
    },
    {
      id: 'jin-c4',
      text: '她把台上「碎扇」一場的跪，讀成柳生春當著滿城人再跪她一次。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:premiere', 'canon:playbook'],
    },
    {
      id: 'jin-c5',
      text: '帳清之後去留未定——這不是和解的終點，是她第一次拿回選擇權。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['private:jin-flower'],
    },
  ],
};

const su: NarrativePerspective = {
  id: 'su-yingxue',
  characterId: 'spring-snow:su-yingxue',
  characterName: '蘇映雪',
  role: '台柱花旦 · 《折柳記》續筆',
  portrait: '/events/sealed-watch/su-yingxue.png',
  lead: '她唱著自己寫的詞替人收碎扇，卻不知道那柄真的扇子，清晨已經易了主。',
  passages: [
    {
      id: 'su-1',
      text: '「別丟了，碎了也是你的，我替你收著」——這句詞是我寫的。滿場彩聲炸開時我唱到這裡，眼淚險些當場漏出來。那哪是秋娘對柳生說的，那是我蘇映雪守了八年想對她說的話。',
      claimIds: ['su-c1'],
    },
    {
      id: 'su-2',
      text: '黃昏她對我說「今夜還燈那場，我尋的就是你」。這話聽著燙心。可我心裡過不去的是——昨夜她人在會樂里。',
      claimIds: ['su-c2', 'su-c3'],
    },
    {
      id: 'su-3',
      text: '金鳳坐在角落掐著掌心盯她的扇子，我擋了一整晚的視線。贏了什麼？贏的不過是替她扛住了台的資格。下了戲，她還是那個柳生春，我還是那個替她縫扣子的師姐。',
      claimIds: ['su-c4', 'su-c5'],
    },
  ],
  claims: [
    {
      id: 'su-c1',
      text: '「碎扇」一場的收扇詞出自蘇映雪之筆，寫的是她自己八年未說出口的話。',
      epistemicMode: 'canonical',
      relation: 'reinterprets',
      review: 'verified',
      evidenceRefs: ['canon:playbook'],
    },
    {
      id: 'su-c2',
      text: '蘇映雪認定柳生春「昨夜」去了會樂里。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      evidenceRefs: ['canon:dawn-kneel', 'private:su-timeline'],
    },
    {
      id: 'su-c3',
      text: '她把「我尋的就是你」與會樂里之行並置，讀成柳生春心口不一。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'unresolved',
      evidenceRefs: ['private:su-timeline'],
    },
    {
      id: 'su-c4',
      text: '首演全程，蘇映雪以走位遮擋金鳳望向柳生春的視線。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:premiere'],
    },
    {
      id: 'su-c5',
      text: '她不知道清晨的還帳，因此把金鳳的到場讀成尚未了結的糾纏。',
      epistemicMode: 'inferred',
      relation: 'contradicts',
      review: 'contested',
      evidenceRefs: ['canon:dawn-kneel'],
    },
  ],
};

export const brokenFanManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:mind-world-3:day-5:broken-fan',
  canonHead: 'run://mind-world-3/history#day-5',
  evidence: [
    {
      id: 'canon:dawn-kneel',
      label: '正史 · 清晨會樂里還帳',
      detail:
        '第五日清晨，柳生春立在會樂里門口跪下：「是我先鬆的手……當年我是真心的。」留下裂骨摺扇。金鳳：「帳算清了。可我從來不是其中一個。」現場無第三人。',
      visibility: 'public',
      anchor: 'run://mind-world-3/history#d5-dawn',
    },
    {
      id: 'run:stage-avowal',
      label: '正史 · 前夜台上認帳',
      detail: '首演前一日，柳生春當眾對金鳳說「這本子我寫了六場，每一場的魂都是你」「第五場那個跪，是我自個兒的帳」。連翹、方競西在場。',
      visibility: 'public',
      anchor: 'run://mind-world-3/history#d4-stage',
    },
    {
      id: 'canon:premiere',
      label: '正史 · 首演夜',
      detail: '《折柳記》首演，品相〇·九四，滿場彩聲加三回簾。金鳳攜扇在場；蘇映雪全程以走位遮擋其視線；柳生春於「碎扇」一場跪於台心。',
      visibility: 'public',
      anchor: 'run://mind-world-3/history#d5-premiere',
    },
    {
      id: 'canon:playbook',
      label: '戲本 · 《折柳記》第八場「碎扇」',
      detail: '柳生春起筆、蘇映雪續完。生跪台心攥半損摺扇；旦白「別丟了，碎了也是你的，我替你收著」。',
      visibility: 'public',
      anchor: 'run://mind-world-3/playbook#scene-8',
    },
    {
      id: 'run:aspire-liu',
      label: '圖謀 · 柳生春開季自述',
      detail: '「金鳳那邊欠的一句交代非還不可，再拖，我這身風流就成了作踐人。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/mind-柳生春#aspire',
    },
    {
      id: 'run:plans-liu',
      label: '盤算 · 連日迴避',
      detail: '柳生春連續數夜盤算「金鳳那頭還得躲一日，等我真有膽子把那句交代說出口再近她的身」。',
      visibility: 'private',
      anchor: 'run://mind-world-3/mind-柳生春#plans',
    },
    {
      id: 'run:aspire-jin',
      label: '圖謀 · 金鳳開季自述',
      detail: '「我圖的，就是柳生春當面認一句她欠我的。等真拿到那句話，我留不留、走不走，連我自己都未必曉得。」',
      visibility: 'private',
      anchor: 'run://mind-world-3/mind-金鳳#aspire',
    },
    {
      id: 'private:jin-flower',
      label: '金鳳 · 晚香玉',
      detail: '散場後她獨對那盆守了六年的晚香玉，去留未決。',
      visibility: 'private',
    },
    {
      id: 'private:su-timeline',
      label: '蘇映雪 · 錯置的時間線',
      detail: '會樂里之行發生在首演日清晨；蘇映雪記成「昨夜」，且不知還帳與贈扇之事。',
      visibility: 'private',
    },
  ],
  perspectives: [liu, jin, su],
};

export const BROKEN_FAN_PERSPECTIVE_COUNT = brokenFanManifest.perspectives.length;
