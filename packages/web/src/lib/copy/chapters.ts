/**
 * Centralized chapter / 章回 copy.
 *
 * The two-book content model (docs/narrative/CONTENT_PIPELINE.md §2/§8):
 *   - 梨園回 (event_cut)  — the canonical public "回", multi-POV woven prose.
 *   - 角色回 (per-char POV) — a character's first-person deep cut, subscriber-gated.
 *   - 公報 (gazette)       — public broadside.
 *
 * These labels were duplicated across ChainPovSection, ChaptersTab, CutList and
 * the feed/chapter & feed/cut reading pages. Keep them here so a wording tweak
 * is a one-file change and the IA vocabulary stays consistent.
 */

/** Static labels used across chapter surfaces. */
export const CHAPTER_COPY = {
  /** 角色回 — the per-character first-person book. */
  pov: {
    /** Dossier section header (primary book). */
    sectionHeader: (name: string) => `${name} 的本傳 · 第一人稱`,
    /** One-liner under the section header. */
    sectionNote: '角色親筆的單人視角 — 這是她的本傳，台前幕後每一念都在這裡。',
    /** Reading-surface eyebrow chip. */
    eyebrow: '視角原料',
    eyebrowWithName: (name: string) => `視角原料 · ${name} 的第一人稱`,
    /** Dynamic owner/subscriber/locked subtitle for the dossier POV section. */
    accessNote: (state: 'owner' | 'subscriber' | 'locked') =>
      state === 'owner'
        ? '你是班主，每一回都讀得到。'
        : state === 'subscriber'
          ? '你已訂閱，每一回都讀得到。'
          : '訂閱之後可讀全文；此刻只見開篇與鏈上憑證。',
    /** Locked-state teaser fade CTA. */
    lockCtaLabel: (name: string) => `訂閱 ${name}，往下每一念都讀得到`,
    lockHint: '這一回只給班主與訂閱者。',
    /** When a body fails to load. */
    bodyUnavailable: '— 章回內容暫時讀不到 —',
    /** Provenance, embedded-event line. */
    fromEvent: (label: string) => `本回出自鏈上事件「${label}」`,
  },

  /** 梨園回 — the woven public event cut. */
  cut: {
    /** Dossier section header (secondary book — the public ensemble). */
    sectionHeader: (name: string) => `${name} 出現的公開合本`,
    sectionNote: (name: string) =>
      `多視角織成的公開「回」— ${name} 是其中一條視角。`,
    /** Count badge. */
    povCount: (n: number) => `${n} 視角合本`,
    fromEvent: (label: string) => `本回織自鏈上事件「${label}」`,
    readThisCut: '讀這一回 →',
  },

  /** Shared on-chain provenance footer copy. */
  provenance: {
    /** Footer lead for the tidy verification line. */
    footerLead: '鏈上查驗',
    onChainAnchor: 'on-chain anchor ↗',
    walrusBlob: 'walrus blob ↗',
    verifyEvent: '在區塊鏈瀏覽器查驗此事件 ↗',
    chapterCommitment: '此章上鏈承諾 ↗',
    cutCommitment: '此回上鏈承諾 ↗',
    /** Inline "verify" affordance next to an embedded event label. */
    verifyShort: '查驗 ↗',
  },

  /** Cross-links between the two books. */
  crossLink: {
    readCut: '讀本事件的合本「回」→',
    otherPovs: '同一事件的其他視角：',
    povRawMaterials: '本回視角 · 各角色的第一人稱原料',
    povRawHint: '視角原料是角色親筆的單人版本 — 訂閱該角色或持有 NFT 才能讀全文。',
    followPov: (name: string) => `追 ${name} 的視角 →`,
    /** Muted chip when a cast member's POV for this event isn't reachable yet. */
    povUnlinked: '視角待收錄',
    povUnlinkedHint: '這個角色在這一場有視角，但章回尚未收錄到這裡。',
    /** Chapter page — header for the prominent「同一事件」cross-link card. */
    siblingCardHeader: '同一事件',
  },
} as const;
