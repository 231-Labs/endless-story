import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import {
  BROKEN_FAN_SLUG,
  brokenFanEvent,
  brokenFanManifest,
} from '@/lib/story-dossier/broken-fan';
import {
  MIDNIGHT_INQUEST_SLUG,
  midnightInquestEvent,
  midnightInquestManifest,
} from '@/lib/story-dossier/midnight-inquest';
import {
  ROMANCE_LEDGER_SLUG,
  romanceLedgerEvent,
  romanceLedgerManifest,
} from '@/lib/story-dossier/romance-ledger';
import {
  GOOD_YEARS_SLUG,
  goodYearsEvent,
  goodYearsManifest,
} from '@/lib/story-dossier/good-years';
import {
  SOUTHBOUND_SLUG,
  southboundEvent,
  southboundManifest,
} from '@/lib/story-dossier/southbound';
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
  [BROKEN_FAN_SLUG]: {
    event: brokenFanEvent,
    manifest: brokenFanManifest,
    related: {
      href: `/feed/event/${MIDNIGHT_INQUEST_SLUG}`,
      label: midnightInquestEvent.title,
    },
  },
  [MIDNIGHT_INQUEST_SLUG]: {
    event: midnightInquestEvent,
    manifest: midnightInquestManifest,
    related: {
      href: `/feed/event/${ROMANCE_LEDGER_SLUG}`,
      label: romanceLedgerEvent.title,
    },
  },
  [ROMANCE_LEDGER_SLUG]: {
    event: romanceLedgerEvent,
    manifest: romanceLedgerManifest,
    related: {
      href: `/feed/event/${GOOD_YEARS_SLUG}`,
      label: goodYearsEvent.title,
    },
  },
  [GOOD_YEARS_SLUG]: {
    event: goodYearsEvent,
    manifest: goodYearsManifest,
    related: {
      href: `/feed/event/${SOUTHBOUND_SLUG}`,
      label: southboundEvent.title,
    },
  },
  [SOUTHBOUND_SLUG]: {
    event: southboundEvent,
    manifest: southboundManifest,
    related: {
      href: `/feed/event/${GOOD_YEARS_SLUG}`,
      label: goodYearsEvent.title,
    },
  },
} as const;

async function loadDynamicDossier(slug: string): Promise<EpistemicDossierBundle | null> {
  const artifactDir = process.env.EVENT_DOSSIER_DIR;
  if (artifactDir && /^[\p{L}\p{N}._-]+$/u.test(slug)) {
    const artifact = await readFile(join(artifactDir, `${slug}.md`), 'utf8').catch(() => null);
    if (artifact) {
      const localBundle = parseDossierHeader(artifact).bundle;
      if (localBundle) return localBundle;
    }
  }

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
