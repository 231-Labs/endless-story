import { notFound } from 'next/navigation';
import type { EpistemicDossierBundle } from '@endless-story/shared/types';
import { parseDossierHeader } from '@endless-story/runner/services/event-dossier';
import { EventDossier } from '@/components/feed/EventDossier';
import { SiteNav } from '@/components/home/SiteNav';
import {
  SEALED_WATCH_SLUG,
  sealedWatchEvent,
  sealedWatchManifest,
} from '@/lib/story-dossier/sealed-watch';
import {
  NIGHT_TUBEROSE_SLUG,
  nightTuberoseEvent,
  nightTuberoseManifest,
} from '@/lib/story-dossier/night-tuberose';
import {
  BORROWED_LINE_SLUG,
  borrowedLineEvent,
  borrowedLineManifest,
} from '@/lib/story-dossier/borrowed-line';
import { cutsApi } from '@/lib/api/index';

const dossiers = {
  [SEALED_WATCH_SLUG]: {
    event: sealedWatchEvent,
    manifest: sealedWatchManifest,
    related: {
      href: `/feed/event/${NIGHT_TUBEROSE_SLUG}`,
      label: nightTuberoseEvent.title,
    },
  },
  [NIGHT_TUBEROSE_SLUG]: {
    event: nightTuberoseEvent,
    manifest: nightTuberoseManifest,
    related: {
      href: `/feed/event/${BORROWED_LINE_SLUG}`,
      label: borrowedLineEvent.title,
    },
  },
  [BORROWED_LINE_SLUG]: {
    event: borrowedLineEvent,
    manifest: borrowedLineManifest,
    related: {
      href: `/feed/event/${NIGHT_TUBEROSE_SLUG}`,
      label: nightTuberoseEvent.title,
    },
  },
} as const;

async function loadDynamicDossier(slug: string): Promise<EpistemicDossierBundle | null> {
  const cut = await cutsApi.getEventCut(slug).catch(() => null);
  if (!cut?.body) return null;
  // cut-read has already removed es:cut; es:dossier is the next header.
  return parseDossierHeader(cut.body).bundle ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dossier = dossiers[slug as keyof typeof dossiers];
  const dynamic = dossier ? null : await loadDynamicDossier(slug);
  if (!dossier && !dynamic) return { title: '找不到事件卷宗' };
  const event = dossier?.event ?? dynamic!.event;
  return {
    title: `${event.title} · ${event.saga}`,
    description: event.kicker,
  };
}

export default async function SeededEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dossier = dossiers[slug as keyof typeof dossiers];
  const dynamic = dossier ? null : await loadDynamicDossier(slug);
  if (!dossier && !dynamic) notFound();
  const event = dossier?.event ?? dynamic!.event;
  const manifest = dossier?.manifest ?? dynamic!.manifest;

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <EventDossier
        event={event}
        manifest={manifest}
        related={dossier?.related}
      />
    </main>
  );
}
