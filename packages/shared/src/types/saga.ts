export interface Saga {
  id: string;
  name: string;
  description: string;
  currentDay: number;
  totalDays: number;
  castIds: string[];
  premise: string;
}

export interface RelationshipEdge {
  fromId: string;
  toId: string;
  weight: number;
  label: string;
  lastUpdatedDay: number;
}
