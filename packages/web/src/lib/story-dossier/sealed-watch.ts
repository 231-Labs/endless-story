import type {
  EpistemicProvenanceManifest,
  NarrativePerspective,
} from '@endless-story/shared/types';
import type { StoryDossierEvent } from './types';

export const SEALED_WATCH_SLUG = 'sealed-watch';

export const sealedWatchEvent: StoryDossierEvent = {
  slug: SEALED_WATCH_SLUG,
  saga: '春雪社',
  day: 63,
  scene: '衣箱房 → 空台',
  title: '停錶以後，水袖第三道',
  kicker: '一只停了十五年的錶，讓兩個總把真心藏進戲裡的人，第一次害怕重演上一代的錯過。',
  summary:
    '封箱夜，沈雪笙從舊衣箱裡收走一只停錶。柳生春看見箱底的旦角戲衣，忽然請蘇映雪陪她到空台重走《驚夢》。水袖揚到第三道時，她沒有照戲接住——她握住了師姐的袖口。',
  hero: '/events/sealed-watch/event-hero.png',
  heroAlt: '封箱後的衣箱房裡，一只停走的懷錶落在舊戲衣上',
  canonFacts: [
    '唐桂蘭在封存的小生衣箱底，發現一件旦角戲衣與一只停走的懷錶；沈雪笙將錶收走。',
    '柳生春拿起戲衣，請蘇映雪陪她到空台重走《驚夢》；當晚並無排戲安排。',
    '水袖揚到第三道時，柳生春握住蘇映雪的袖口，問：「明晚還唱嗎？」',
    '蘇映雪回答：「明晚再排。」隨後先行離開；柳生春獨自留在台上。',
  ],
};

const liu: NarrativePerspective = {
  id: 'liu-shengchun',
  characterId: 'spring-snow:liu-shengchun',
  characterName: '柳生春',
  role: '當紅坤生',
  portrait: '/events/sealed-watch/liu-shengchun-v3.png',
  lead: '她問的是明晚還唱不唱，真正想知道的是師姐這一次會不會留下。',
  passages: [
    {
      id: 'liu-1',
      text: '班主合起手時，錶殼在她指縫裡閃了一下。我忽然明白，有些話若當年不說，十五年後就只剩一件戲衣替人記得。',
      claimIds: ['liu-c1', 'liu-c2'],
    },
    {
      id: 'liu-2',
      text: '我把那件旦角戲衣抱起來，問師姐肯不肯陪我走一回《驚夢》。她沒有問緣故，只替我把台上的燈點了一盞。像八年前那一夜以前，她總是這樣接住我。',
      claimIds: ['liu-c3'],
    },
    {
      id: 'liu-3',
      text: '水袖到第三道，本該是我接她的戲。我卻抓住袖口，問她明晚還唱不唱。其實我問的是：師姐，這一次你還走不走？',
      claimIds: ['liu-c4', 'liu-c5'],
    },
    {
      id: 'liu-4',
      text: '她說明晚再排。我不敢把這當作答應，只敢站在原地，看那截水袖從我掌心裡一寸一寸滑出去。',
      claimIds: ['liu-c6'],
    },
  ],
  claims: [
    {
      id: 'liu-c1',
      text: '柳生春看見沈雪笙掌中的懷錶反光。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:watch'],
    },
    {
      id: 'liu-c2',
      text: '柳生春把停錶理解為一段因沉默而錯過的感情。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:watch', 'seed:shen-bailan'],
    },
    {
      id: 'liu-c3',
      text: '蘇映雪沒有追問緣故，便陪柳生春走上空台。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:stage'],
    },
    {
      id: 'liu-c4',
      text: '水袖第三道是柳生春與蘇映雪之間只屬於彼此的暗號。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['seed:su-third-sleeve', 'canon:gesture'],
    },
    {
      id: 'liu-c5',
      text: '「明晚還唱嗎」真正問的是蘇映雪會不會留下。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:words', 'seed:liu-su-first-night'],
    },
    {
      id: 'liu-c6',
      text: '柳生春不敢把「明晚再排」當成感情上的答應。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['canon:words', 'private:liu-fear'],
    },
  ],
};

const su: NarrativePerspective = {
  id: 'su-yingxue',
  characterId: 'spring-snow:su-yingxue',
  characterName: '蘇映雪',
  role: '台柱花旦',
  portrait: '/events/sealed-watch/su-yingxue.png',
  lead: '她把「留下」說成「明晚再排」，因為戲裡的承諾比真話安全。',
  passages: [
    {
      id: 'su-1',
      text: '生春抱著那件舊戲衣問我肯不肯陪她走一回《驚夢》。她笑得和平常一樣，手指卻把衣角攥出一道很深的皺。',
      claimIds: ['su-c1'],
    },
    {
      id: 'su-2',
      text: '八年前也是這齣戲。那一夜我們都沒有從杜麗娘和柳夢梅裡醒來；天一亮，先逃的人是我。後來她學會不追，也不拒絕，我知道那副風流的殼是從哪一夜長出來的。',
      claimIds: ['su-c2', 'su-c3'],
    },
    {
      id: 'su-3',
      text: '水袖第三道，是我早年同她說好的：台上我把袖揚到那裡，便是只唱給她。今晚她沒有照戲接住，卻捉住我的袖口，問明晚還唱不唱。',
      claimIds: ['su-c4', 'su-c5'],
    },
    {
      id: 'su-4',
      text: '我想說我不走。出口卻還是那句最穩妥的：「明晚再排。」至少明晚是真的；至少這一次，我沒有把門關死。',
      claimIds: ['su-c6'],
    },
  ],
  claims: [
    {
      id: 'su-c1',
      text: '柳生春表面平靜，手卻緊攥著戲衣。',
      epistemicMode: 'observed',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['canon:robe'],
    },
    {
      id: 'su-c2',
      text: '八年前《驚夢》之夜，柳蘇曾越過師姊妹的界線。',
      epistemicMode: 'remembered',
      relation: 'unresolved',
      review: 'contested',
      evidenceRefs: ['seed:liu-su-first-night'],
    },
    {
      id: 'su-c3',
      text: '蘇映雪認為柳生春後來的風流，是自己當年逃開造成的。',
      epistemicMode: 'inferred',
      relation: 'unresolved',
      review: 'unresolved',
      evidenceRefs: ['private:su-guilt'],
    },
    {
      id: 'su-c4',
      text: '水袖第三道代表「這一折只唱給你」。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['seed:su-third-sleeve'],
    },
    {
      id: 'su-c5',
      text: '柳生春在第三道水袖時改變了原有身段。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:gesture'],
    },
    {
      id: 'su-c6',
      text: '「明晚再排」是蘇映雪目前所能說出的留下。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:words', 'private:su-intent'],
    },
  ],
};

const shen: NarrativePerspective = {
  id: 'shen-xuesheng',
  characterId: 'spring-snow:shen-xuesheng',
  characterName: '沈雪笙',
  role: '班主 · 昔年小生',
  portrait: '/events/sealed-watch/shen-xuesheng.png',
  lead: '她在暗處看見兩個後輩停在自己當年沒能跨過的那一步。',
  passages: [
    {
      id: 'shen-1',
      text: '那件旦角戲衣從箱底露出來時，我先收走了錶。生春卻抱起衣裳，追著映雪去了空台。我原該叫她們散戲後不要胡鬧，今晚沒有。',
      claimIds: ['shen-c1', 'shen-c2'],
    },
    {
      id: 'shen-2',
      text: '我在二樓包廂後看她們走《驚夢》。水袖到第三道，生春捉住了映雪。那一瞬間，我看見的不是她們，是十五年前白蘭的車已經等在門口，而我還把那句話含在嘴裡。',
      claimIds: ['shen-c3', 'shen-c4'],
    },
    {
      id: 'shen-3',
      text: '映雪說明晚再排，生春沒有追。我把懷錶握在掌心，第一次覺得三點二刻不是終點。至少她們還有一個明晚。',
      claimIds: ['shen-c5'],
    },
  ],
  claims: [
    {
      id: 'shen-c1',
      text: '沈雪笙從衣箱房收走懷錶。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:watch'],
    },
    {
      id: 'shen-c2',
      text: '沈雪笙刻意沒有阻止柳蘇夜間登台。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:stage'],
    },
    {
      id: 'shen-c3',
      text: '沈雪笙從二樓包廂看見水袖第三道與握袖。',
      epistemicMode: 'observed',
      relation: 'supports',
      review: 'verified',
      evidenceRefs: ['canon:gesture'],
    },
    {
      id: 'shen-c4',
      text: '柳蘇的停頓使沈雪笙想起十五年前未能留下的白蘭。',
      epistemicMode: 'remembered',
      relation: 'reinterprets',
      review: 'contested',
      evidenceRefs: ['seed:shen-bailan', 'seed:shen-watch'],
    },
    {
      id: 'shen-c5',
      text: '沈雪笙把「明晚再排」理解為柳蘇仍有改寫結局的機會。',
      epistemicMode: 'inferred',
      relation: 'reinterprets',
      review: 'unresolved',
      evidenceRefs: ['canon:words', 'private:shen-hope'],
    },
  ],
};

export const sealedWatchManifest: EpistemicProvenanceManifest = {
  v: 1,
  eventId: 'spring-snow:day-63:sealed-watch',
  canonHead: 'seed://spring-snow/v1#sealed-watch',
  evidence: [
    {
      id: 'canon:watch',
      label: '正史 · 停錶',
      detail: '唐桂蘭在舊箱裡發現懷錶，沈雪笙隨後將它收走。',
      visibility: 'public',
      anchor: 'seed://spring-snow/character/沈雪笙/memory/stopped-watch',
    },
    {
      id: 'canon:robe',
      label: '正史 · 戲衣',
      detail: '柳生春從箱底拿起旦角戲衣，衣角留下明顯抓皺。',
      visibility: 'public',
      anchor: 'seed://spring-snow/character/沈雪笙/memory/旦角戲衣',
    },
    {
      id: 'canon:stage',
      label: '正史 · 空台',
      detail: '柳生春邀蘇映雪夜間重走《驚夢》，沈雪笙知情但沒有阻止。',
      visibility: 'public',
    },
    {
      id: 'canon:gesture',
      label: '正史 · 第三道水袖',
      detail: '柳生春沒有完成原定接袖身段，而是握住蘇映雪的袖口。',
      visibility: 'public',
    },
    {
      id: 'canon:words',
      label: '正史 · 可聽見的話',
      detail: '柳問「明晚還唱嗎？」蘇答「明晚再排。」話語本身可錨定，含義仍屬詮釋。',
      visibility: 'public',
    },
    {
      id: 'seed:liu-su-first-night',
      label: '共同記憶 · 八年前《驚夢》',
      detail: 'seed 中柳蘇皆記得：初次合演《驚夢》後越過界線，翌日蘇映雪先逃開。',
      visibility: 'private',
      anchor: 'seed://spring-snow/characters/柳生春+蘇映雪/memory/驚夢',
    },
    {
      id: 'seed:su-third-sleeve',
      label: '共同暗號 · 水袖第三道',
      detail: 'seed 中蘇映雪記得：她接到第三道水袖，便是這一折只唱給柳生春。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/蘇映雪/memory/水袖第三道',
    },
    {
      id: 'seed:shen-watch',
      label: '角色記憶 · 停錶',
      detail: '沈雪笙將停錶收藏十五年，錶停在白蘭離開的那一天。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/沈雪笙/memory/stopped-watch',
    },
    {
      id: 'seed:shen-bailan',
      label: '角色記憶 · 白蘭',
      detail: '沈雪笙曾想在散戲後留下白蘭，話未出口，車已離開。',
      visibility: 'private',
      anchor: 'seed://spring-snow/character/沈雪笙/memory/白蘭',
    },
    {
      id: 'private:liu-fear',
      label: '柳生春 · 不敢相信',
      detail: '她害怕再把一句舞台上的話誤認成感情承諾。',
      visibility: 'private',
    },
    {
      id: 'private:su-guilt',
      label: '蘇映雪 · 愧意',
      detail: '她認為自己當年的退縮，參與塑成柳生春後來的風流與疏離。',
      visibility: 'private',
    },
    {
      id: 'private:su-intent',
      label: '蘇映雪 · 沒說出的答覆',
      detail: '她想說的是「我不走」，真正出口的是「明晚再排」。',
      visibility: 'private',
    },
    {
      id: 'private:shen-hope',
      label: '沈雪笙 · 未公開詮釋',
      detail: '她相信一個確定存在的明晚，已足以讓後輩不必重演自己的錯過。',
      visibility: 'private',
    },
  ],
  perspectives: [liu, su, shen],
};

export const SEALED_WATCH_PERSPECTIVE_COUNT = sealedWatchManifest.perspectives.length;
