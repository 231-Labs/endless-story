export const CHANNEL_TABS = ['此刻', '小報', '劇照', '手記'] as const;

export type ChannelTab = (typeof CHANNEL_TABS)[number];

export type ChannelArtifact = {
  id: string;
  tab: Exclude<ChannelTab, '此刻'>;
  kind: string;
  title: string;
  excerpt: string;
  body: string;
  stamp: string;
  imageUrl?: string;
};

export const CHANNEL_SCENES: Record<ChannelTab, { eyebrow: string; title: string; note: string }> = {
  此刻: {
    eyebrow: '此刻 · 藏歌閣',
    title: '今晚不唱。回答三個原本不該問的問題。',
    note: '窗沒有關嚴。她還不知道外面有多少人。',
  },
  小報: {
    eyebrow: '今晨小報 · 第三版',
    title: '春雪社今日無甚大事——除了那封沒署名的信。',
    note: '由昨夜事件與訪談自動排成初稿，仍保留她親手刪改的痕跡。',
  },
  劇照: {
    eyebrow: '新洗劇照 · 暗房未乾',
    title: '她回頭的那一刻，並不在原來的戲本裡。',
    note: '場景、衣著與人物關係都取自當日正史，不替她補演沒有發生的事。',
  },
  手記: {
    eyebrow: '昨夜手記 · 未公開',
    title: '「我沒有在等誰。」她把這句話寫了兩遍。',
    note: '訪談留下的餘波進入記憶；下一次見面，她可能仍記得你的問法。',
  },
};

export const CHANNEL_ARTIFACTS: ChannelArtifact[] = [
  {
    id: 'morning-paper',
    tab: '小報',
    kind: '今晨小報',
    title: '春雪社今日無甚大事',
    excerpt: '蘇小姐晨起練了一遍水袖。金鳳說她唱慢了半拍，她不認。',
    body: '辰時，院裡的雪化了一線。蘇小姐把同一段水袖走了三遍，第二遍慢了半拍。金鳳隔著門說她聽見了，她說是風。除此以外，今日無甚大事。',
    stamp: '辰時刊',
  },
  {
    id: 'sealed-watch',
    tab: '劇照',
    kind: '暗房新片',
    title: '封箱以前，她回過一次頭',
    excerpt: '沒有台詞，也沒有人喊停。這一格卻被世界留下來了。',
    body: '拍攝標記：藏歌閣，亥時二刻。畫面只依當日服裝、燈位與在場人物重建；回頭不是導演指令，而是事件記錄裡真正發生的一拍。',
    stamp: '新洗出',
    imageUrl: '/events/sealed-watch/event-hero.png',
  },
  {
    id: 'unsent-letter',
    tab: '手記',
    kind: '未寄出的信',
    title: '致一個不肯聽戲的人',
    excerpt: '你若問我臺上是真是假，我只好說：落幕以後才最難演。',
    body: '你總說戲是假的。可我今日下了臺，還是照著戲裡的路多走了一程。若臺上是假，那落幕以後的這一步，又該算甚麼？這封信沒有收信人。',
    stamp: '昨夜存',
  },
  {
    id: 'interview-echo',
    tab: '手記',
    kind: '訪談餘音',
    title: '「我沒有在等誰。」',
    excerpt: '她答得太快。燈芯恰在那時爆了一聲，於是這句話被房間記住。',
    body: '訪問者問：「若那個人今夜回來呢？」她說沒有在等誰。回答用時比此前三題都短；這不是判詞，只是一道可能在明日留下痕跡的波紋。',
    stamp: '新收錄',
  },
];

export function artifactsForTab(tab: ChannelTab): ChannelArtifact[] {
  return tab === '此刻' ? CHANNEL_ARTIFACTS.slice(0, 3) : CHANNEL_ARTIFACTS.filter((artifact) => artifact.tab === tab);
}
