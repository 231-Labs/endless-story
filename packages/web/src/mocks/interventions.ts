import type { OwnerIntervention } from '@endless-story/shared';
import { DEMO_OWNERS } from './characters';

export const interventions: OwnerIntervention[] = [
  {
    id: 'intv_001',
    characterId: 'char_ye_tingfang',
    ownerWallet: DEMO_OWNERS.OWNER_A,
    kind: 'inject_dream',
    text: '你夢見很久以前的師父站在台口側幕，沒看你，只看天井外的月亮。她說了一句：「你別怕別人比你唱得好。」',
    createdAt: '2026-05-16T03:12:00Z',
    acknowledgedAt: '2026-05-16T03:18:00Z',
  },
  {
    id: 'intv_002',
    characterId: 'char_cheng_hengyu',
    ownerWallet: DEMO_OWNERS.OWNER_B,
    kind: 'whisper',
    text: '別這麼累。今晚先睡。',
    createdAt: '2026-05-18T00:30:00Z',
  },
];

export const listInterventionsForCharacter = (characterId: string): OwnerIntervention[] =>
  interventions
    .filter((i) => i.characterId === characterId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
