import type { DossierEventPresentation } from '@endless-story/shared/types';

export type StoryDossierEvent = DossierEventPresentation;

export interface RelatedDossier {
  href: string;
  label: string;
}
