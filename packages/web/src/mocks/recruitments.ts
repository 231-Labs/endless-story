import type { Recruitment } from '@endless-story/shared';
import { DEMO_SAGA_ID } from './sagas';

export const recruitments: Recruitment[] = [
  {
    id: 'rec_chunxue_wu_xiaosheng',
    sagaId: DEMO_SAGA_ID,
    sagaName: '春雪社',
    specialty: '武小生',
    roleIntent:
      '春雪社徵召一位武小生 — 工長靠戲、文武兼擅。' +
      '會替葉庭芳擋酒、敢跟梁照水對棒、夜半被班主叫上樓也不慌。' +
      '上海灘的少年郎見過太多、被人捧得多了、心卻仍硬。' +
      '我需要這個人來接住春雪社的另一條人情線 — 他得擔得起當紅小生跟青衣對望那一瞬。',
    membership: 'internal',
    slots: 1,
    basePrice: 100,
    expiresAt: '2026-06-02T00:00:00Z',
    createdAt: '2026-05-15T08:00:00Z',
    minAttributes: { appearance: 80, acuity: 70 },
  },
  {
    id: 'rec_external_shanghai_merchant',
    sagaId: DEMO_SAGA_ID,
    sagaName: '春雪社',
    specialty: '富商',
    roleIntent:
      '徵召一位民國上海的富商。他迷戀戲台上的小生形象，有自己的洋樓，已有兩三位姨太太。' +
      '表面上是新世界裡進出有名的紳士，私底下卻在某齣戲後動了真心。' +
      '我們需要他把春雪社的戲外世界扯進院落內側 — 他不上場、卻會改變誰能上場。',
    membership: 'external',
    slots: 1,
    basePrice: 100,
    expiresAt: '2026-05-30T00:00:00Z',
    createdAt: '2026-05-16T03:00:00Z',
    minAttributes: { appearance: 60 },
    genderRequirement: 'male',
  },
  {
    id: 'rec_chunxue_qingyi',
    sagaId: DEMO_SAGA_ID,
    sagaName: '春雪社',
    specialty: '青衣',
    roleIntent:
      '春雪社欲再添一位青衣。不必像杜聽瀾那般烈如刀鋒，但求唱腔幽婉、水袖能舞出一段江南煙雨。' +
      '她或許帶著不為人知的過去，或許是在某個深夜裡獨自落淚的苦命人。' +
      '需要一個能用眼波流轉就把台下看客魂魄勾走的角兒。',
    membership: 'internal',
    slots: 2,
    basePrice: 150,
    expiresAt: '2026-06-10T00:00:00Z',
    createdAt: '2026-05-20T10:00:00Z',
    minAttributes: { appearance: 85, disposition: 75 },
    genderRequirement: 'female',
  },
  {
    id: 'rec_external_reporter',
    sagaId: DEMO_SAGA_ID,
    sagaName: '春雪社',
    specialty: '小報記者',
    roleIntent:
      '上海灘的八卦小報記者，筆鋒犀利、嗅覺靈敏。' +
      '常在春雪社外頭轉悠，跟包廂裡的達官貴人套近乎，也跟後台的小廝打探消息。' +
      '他是個江湖客串，他的筆下能捧紅一個角，也能毀掉一個角。',
    membership: 'external',
    slots: 1,
    basePrice: 80,
    expiresAt: '2026-06-05T00:00:00Z',
    createdAt: '2026-05-21T09:00:00Z',
    minAttributes: { acuity: 85, disposition: 60 },
    genderRequirement: 'other',
  },
  {
    id: 'rec_chunxue_laosheng',
    sagaId: DEMO_SAGA_ID,
    sagaName: '春雪社',
    specialty: '老生',
    roleIntent:
      '春雪社急需一位能壓陣的老生。年歲不需太大，但嗓音得滄桑厚重，能唱出興亡之歎。' +
      '他在戲班裡是定海神針，看盡了世態炎涼，對年輕一輩既嚴厲又暗藏慈悲。' +
      '他或許曾是名滿天下的大角，如今只願在春雪社圖個安穩。',
    membership: 'internal',
    slots: 1,
    basePrice: 120,
    expiresAt: '2026-06-15T00:00:00Z',
    createdAt: '2026-05-18T14:00:00Z',
    minAttributes: { constitution: 70, disposition: 85 },
    genderRequirement: 'male',
  }
];

export const listActiveRecruitments = (): Recruitment[] => {
  const now = new Date().toISOString();
  return recruitments.filter((r) => r.slots > 0 && r.expiresAt > now);
};

export const getRecruitmentById = (id: string): Recruitment | undefined =>
  recruitments.find((r) => r.id === id);
