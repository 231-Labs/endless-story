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
  // POV format: 〈event〉· 角色名視角 → keep 〈event〉
  const povMatch = title.match(/^〈([^〉]+)〉/);
  if (povMatch) return povMatch[1];
  // Ensemble format: 《saga》第N日 · event → keep event
  const ensembleMatch = title.match(/^《[^》]+》第[^·]+·\s*(.+)$/);
  if (ensembleMatch) return ensembleMatch[1].trim();
  return title;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const SURVIVAL_TONE: Record<string, string> = {
  critical: 'text-rose-700 bg-rose-50 ring-rose-200',
  low: 'text-amber-700 bg-amber-50 ring-amber-200',
  stable: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  healthy: 'text-teal-700 bg-teal-50 ring-teal-200',
};

export function survivalBadgeClasses(level: string): string {
  return SURVIVAL_TONE[level] ?? 'text-stone-600 bg-stone-50 ring-stone-200';
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
