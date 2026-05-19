import type { RelationshipEdge } from '@endless-story/shared';

export const relationshipEdges: RelationshipEdge[] = [
  {
    fromId: 'char_ye_tingfang',
    toId: 'char_cheng_hengyu',
    weight: 9,
    label: '替她繫水袖時，我的手不抖。',
    lastUpdatedDay: 3,
  },
  {
    fromId: 'char_cheng_hengyu',
    toId: 'char_ye_tingfang',
    weight: 10,
    label: '她繫得比我自己整齊。',
    lastUpdatedDay: 3,
  },
  {
    fromId: 'char_liang_zhaoshui',
    toId: 'char_ye_tingfang',
    weight: 5,
    label: '她在側幕的時候，我不抬頭也知道是她。',
    lastUpdatedDay: 4,
  },
  {
    fromId: 'char_meng_yunping',
    toId: 'char_ye_tingfang',
    weight: 7,
    label: '我學她、又怕真學成她。',
    lastUpdatedDay: 2,
  },
  {
    fromId: 'char_shen_huaiyin',
    toId: 'char_ye_tingfang',
    weight: 8,
    label: '她身上有當年的我。',
    lastUpdatedDay: 4,
  },
];

export const listEdgesFrom = (fromId: string): RelationshipEdge[] =>
  relationshipEdges.filter((e) => e.fromId === fromId).sort((a, b) => b.weight - a.weight);
