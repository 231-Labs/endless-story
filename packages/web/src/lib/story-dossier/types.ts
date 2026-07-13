export interface StoryDossierEvent {
  slug: string;
  saga: string;
  day: number;
  scene: string;
  title: string;
  kicker: string;
  summary: string;
  hero: string;
  heroAlt: string;
  heroZoom?: boolean;
  canonFacts: readonly string[];
}

export interface RelatedDossier {
  href: string;
  label: string;
}
