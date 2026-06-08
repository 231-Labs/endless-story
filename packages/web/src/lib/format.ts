export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr.startsWith('0x')) return addr;
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}

export function truncateBlobId(blobId: string, tail = 10): string {
  if (blobId.length <= tail) return blobId;
  return `…${blobId.slice(-tail)}`;
}

export function shortChapterTitle(title: string): string {
  // POV format "〈event〉· <character> POV" → keep the event in angle brackets
  const povMatch = title.match(/^〈([^〉]+)〉/);
  if (povMatch) return povMatch[1];
  // Ensemble format "《saga》day-N · event" → keep the trailing event
  const ensembleMatch = title.match(/^《[^》]+》第[^·]+·\s*(.+)$/);
  if (ensembleMatch) return ensembleMatch[1].trim();
  return title;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const SURVIVAL_TONE: Record<string, string> = {
  critical: 'text-rose-700 bg-rose-50 ring-rose-200 dark:text-rose-200 dark:bg-rose-950/35 dark:ring-rose-800/50',
  low: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-200 dark:bg-amber-950/35 dark:ring-amber-800/50',
  stable: 'text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/35 dark:ring-emerald-800/50',
  healthy: 'text-teal-700 bg-teal-50 ring-teal-200 dark:text-teal-200 dark:bg-teal-950/35 dark:ring-teal-800/50',
};

export function survivalBadgeClasses(level: string): string {
  return SURVIVAL_TONE[level] ?? 'text-mute bg-surface ring-hairline dark:bg-elevated/35';
}

const SURVIVAL_LABEL: Record<string, string> = {
  critical: '緊',
  low: '緊張',
  stable: '安穩',
  healthy: '寬裕',
};

export function survivalLabel(level: string): string {
  return SURVIVAL_LABEL[level] ?? level;
}
