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
];

export const listActiveRecruitments = (): Recruitment[] => {
  const now = new Date().toISOString();
  return recruitments.filter((r) => r.slots > 0 && r.expiresAt > now);
};

export const getRecruitmentById = (id: string): Recruitment | undefined =>
  recruitments.find((r) => r.id === id);
