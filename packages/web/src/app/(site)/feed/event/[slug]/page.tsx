import { notFound } from 'next/navigation';
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dossier = dossiers[slug as keyof typeof dossiers];
  if (!dossier) return { title: '找不到事件卷宗' };
  return {
    title: `${dossier.event.title} · ${dossier.event.saga}`,
    description: dossier.event.kicker,
  };
}

export default async function SeededEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dossier = dossiers[slug as keyof typeof dossiers];
  if (!dossier) notFound();

  return (
    <main className="min-h-screen bg-canvas">
      <SiteNav />
      <EventDossier
        event={dossier.event}
        manifest={dossier.manifest}
        related={dossier.related}
      />
    </main>
  );
}
