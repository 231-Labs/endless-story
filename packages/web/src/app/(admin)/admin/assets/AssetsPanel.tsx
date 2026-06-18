'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  deleteAssetAction,
  extendAssetAction,
  getAssetWalletAction,
  listAssetsAction,
  patchAssetAction,
  type AssetCategory,
  type AssetView,
  type WalletState,
} from '@/lib/actions/walrus-assets';

const CATEGORIES: { key: AssetCategory; label: string }[] = [
  { key: 'hero-clip', label: 'Hero 影片' },
  { key: 'character-image', label: '角色圖' },
  { key: 'scene-anchor', label: '場景錨點' },
  { key: 'chapter-text', label: '章回文字' },
];

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  'hero-clip': 'Hero 影片',
  'character-image': '角色圖',
  'scene-anchor': '場景錨點',
  'chapter-text': '章回文字',
};

type CategoryFilter = 'all' | AssetCategory;
type StatusFilter = 'all' | 'live' | 'unpublished' | 'expiring';
type ViewMode = 'grid' | 'list';

const PAGE_SIZE = 12;

export function AssetsPanel() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

  // IA controls
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(0);

  const refresh = useCallback(async () => {
    const [list, w] = await Promise.all([listAssetsAction(), getAssetWalletAction()]);
    setConfigured(list.configured);
    setLoadError(list.error);
    setAssets(list.assets);
    setWallet(w);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reset to first page whenever the visible set changes.
  useEffect(() => {
    setPage(0);
  }, [category, status, query]);

  // Per-category counts for the tab badges (status/search independent → stable).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.length };
    for (const a of assets) c[a.category] = (c[a.category] ?? 0) + 1;
    return c;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (status === 'live' && a.status !== 'live') return false;
      if (status === 'unpublished' && a.status !== 'unpublished') return false;
      if (status === 'expiring' && !a.expiringSoon) return false;
      if (q && !`${a.label} ${a.blobId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, category, status, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (!configured) {
    return (
      <div className="es-soft-panel p-6 text-sm text-mute">
        尚未設定 <code className="text-ink">ASSET_SERVICE_URL</code>（指向 asset 服務,例如
        <code className="text-ink"> https://assets.zeabur.app</code>）與
        <code className="text-ink"> ASSET_SERVICE_SECRET</code>。設好後重整即可管理資產。
      </div>
    );
  }

  const liveCount = assets.filter((a) => a.status === 'live').length;
  const expiringCount = assets.filter((a) => a.expiringSoon).length;

  return (
    <div className="space-y-5">
      <WalletBar wallet={wallet} />
      <UploadCard onUploaded={refresh} />

      {loadError && (
        <div className="es-soft-panel p-4 text-sm text-cinnabar">讀取資產失敗：{loadError}</div>
      )}

      {loading ? (
        <div className="es-soft-panel p-6 text-sm text-mute">讀取資產…</div>
      ) : assets.length === 0 && !loadError ? (
        <div className="es-soft-panel p-6 text-sm text-mute">尚無資產。上傳第一支影片試試。</div>
      ) : (
        <div className="space-y-4">
          <SummaryCards total={assets.length} live={liveCount} expiring={expiringCount} />

          <CategoryTabs active={category} counts={counts} onChange={setCategory} />

          <Toolbar
            query={query}
            onQuery={setQuery}
            status={status}
            onStatus={setStatus}
            view={view}
            onView={setView}
          />

          {filtered.length === 0 ? (
            <div className="es-soft-panel p-6 text-sm text-mute">沒有符合條件的資產。</div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {pageItems.map((a) => (
                <AssetCard key={a.id} asset={a} onChanged={refresh} />
              ))}
            </div>
          ) : (
            <ul className="es-soft-panel divide-y divide-hairline">
              {pageItems.map((a) => (
                <AssetListRow key={a.id} asset={a} onChanged={refresh} />
              ))}
            </ul>
          )}

          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            shown={pageItems.length}
            onPage={setPage}
          />
        </div>
      )}
    </div>
  );
}

// ── Summary ──
function SummaryCards({ total, live, expiring }: { total: number; live: number; expiring: number }) {
  const cell = 'flex-1 rounded-lg bg-surface/60 px-4 py-3';
  return (
    <div className="flex gap-3">
      <div className={cell}>
        <div className="text-2xs tracking-widest text-mute">資產總數</div>
        <div className="mt-0.5 text-2xl font-medium text-ink tabular-nums">{total}</div>
      </div>
      <div className={cell}>
        <div className="text-2xs tracking-widest text-mute">已上架</div>
        <div className="mt-0.5 text-2xl font-medium text-jade tabular-nums">{live}</div>
      </div>
      <div className={cell}>
        <div className="text-2xs tracking-widest text-mute">即將到期</div>
        <div className="mt-0.5 text-2xl font-medium text-cinnabar tabular-nums">{expiring}</div>
      </div>
    </div>
  );
}

// ── Category tabs ──
function CategoryTabs({
  active,
  counts,
  onChange,
}: {
  active: CategoryFilter;
  counts: Record<string, number>;
  onChange: (c: CategoryFilter) => void;
}) {
  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    ...CATEGORIES.filter((c) => (counts[c.key] ?? 0) > 0),
  ];
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex-none rounded-full border px-4 py-1.5 text-sm tracking-wide transition-colors ${
              on
                ? 'border-ink bg-ink text-canvas'
                : 'border-hairline text-mute hover:border-cinnabar hover:text-ink'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-2xs ${on ? 'text-canvas/60' : 'text-mute/70'}`}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Toolbar ──
function Toolbar({
  query,
  onQuery,
  status,
  onStatus,
  view,
  onView,
}: {
  query: string;
  onQuery: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="搜尋標題 / blobId…"
        className={`${inputCls} h-9 min-w-0 flex-1`}
      />
      <select
        value={status}
        onChange={(e) => onStatus(e.target.value as StatusFilter)}
        className={`${inputCls} h-9 w-auto`}
        aria-label="狀態篩選"
      >
        <option value="all">全部狀態</option>
        <option value="live">已上架</option>
        <option value="unpublished">已下架</option>
        <option value="expiring">即將到期</option>
      </select>
      <div className="flex h-9 overflow-hidden rounded-lg border border-hairline">
        <button
          onClick={() => onView('grid')}
          aria-label="網格檢視"
          aria-pressed={view === 'grid'}
          className={`flex w-9 items-center justify-center transition-colors ${
            view === 'grid' ? 'bg-surface text-ink' : 'text-mute hover:text-ink'
          }`}
        >
          <GridIcon />
        </button>
        <button
          onClick={() => onView('list')}
          aria-label="列表檢視"
          aria-pressed={view === 'list'}
          className={`flex w-9 items-center justify-center border-l border-hairline transition-colors ${
            view === 'list' ? 'bg-surface text-ink' : 'text-mute hover:text-ink'
          }`}
        >
          <ListIcon />
        </button>
      </div>
    </div>
  );
}

// ── Asset thumbnail ──
function blobUrl(asset: AssetView): string {
  const ct = asset.contentType || 'application/octet-stream';
  return `/api/blob/${asset.blobId}?ct=${encodeURIComponent(ct)}`;
}

function AssetThumb({ asset, className }: { asset: AssetView; className: string }) {
  const [failed, setFailed] = useState(false);
  const ct = asset.contentType || '';
  if (!failed && ct.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={blobUrl(asset)}
        alt={asset.label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${className} object-cover`}
      />
    );
  }
  if (!failed && ct.startsWith('video/')) {
    return (
      <video
        src={`${blobUrl(asset)}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-hidden
        onError={() => setFailed(true)}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <div className={`${className} flex items-center justify-center bg-surface/60 text-mute`}>
      <FileIcon />
    </div>
  );
}

// ── Grid card ──
function AssetCard({ asset, onChanged }: { asset: AssetView; onChanged: () => void }) {
  return (
    <div className="group relative rounded-xl border border-hairline bg-surface/40">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-elevated/40">
        <AssetThumb asset={asset} className="absolute inset-0 h-full w-full" />
      </div>
      {/* Outside the thumbnail's overflow-hidden so the dropdown isn't clipped. */}
      <div className="absolute right-1.5 top-1.5">
        <ActionMenu asset={asset} onChanged={onChanged} />
      </div>
      <div className="p-2.5">
        <div className="truncate text-xs font-medium text-ink" title={asset.label}>
          {asset.label}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusBadge live={asset.status === 'live'} />
          {asset.expiringSoon && <ExpiryBadge epochs={asset.epochsRemaining} />}
          {asset.autoRenew && (
            <span className="rounded bg-jade/10 px-1.5 py-0.5 text-2xs text-jade">自動續租</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compact list row ──
function AssetListRow({ asset, onChanged }: { asset: AssetView; onChanged: () => void }) {
  const expiry =
    asset.epochsRemaining == null
      ? '—'
      : `剩 ${asset.epochsRemaining} epochs${asset.expiresAt ? `（${asset.expiresAt.slice(0, 10)}）` : ''}`;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <AssetThumb asset={asset} className="h-10 w-10 flex-none overflow-hidden rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{asset.label}</span>
          <StatusBadge live={asset.status === 'live'} />
          {asset.expiringSoon && <ExpiryBadge epochs={asset.epochsRemaining} />}
        </div>
        <div className="mt-0.5 truncate font-mono text-2xs text-mute">
          {CATEGORY_LABEL[asset.category]} · {(asset.sizeBytes / 1024).toFixed(0)}KB · {asset.blobId.slice(0, 16)}… · {expiry}
        </div>
      </div>
      <ActionMenu asset={asset} onChanged={onChanged} />
    </li>
  );
}

// ── Per-asset action menu (續租 / 上下架 / 自動續租 / 刪除) ──
function ActionMenu({ asset, onChanged }: { asset: AssetView; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | undefined>();
  const live = asset.status === 'live';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setErr(undefined);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else {
        setOpen(false);
        onChanged();
      }
    });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label="更多動作"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/80 text-ink ring-1 ring-hairline backdrop-blur transition-colors hover:bg-cinnabar hover:text-canvas disabled:opacity-50"
      >
        <DotsIcon />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-lg border border-hairline bg-elevated py-1 text-sm shadow-xl">
            <MenuItem disabled={pending} onClick={() => run(() => extendAssetAction(asset.id, 30))}>
              續租 +30
            </MenuItem>
            <MenuItem
              disabled={pending}
              onClick={() => run(() => patchAssetAction(asset.id, { status: live ? 'unpublished' : 'live' }))}
            >
              {live ? '下架' : '上架'}
            </MenuItem>
            <MenuItem
              disabled={pending}
              onClick={() => run(() => patchAssetAction(asset.id, { autoRenew: !asset.autoRenew }))}
            >
              自動續租：{asset.autoRenew ? '開' : '關'}
            </MenuItem>
            {asset.deletable && (
              <MenuItem
                danger
                disabled={pending}
                onClick={() => {
                  if (confirm(`刪除並回收「${asset.label}」?此操作不可復原。`)) run(() => deleteAssetAction(asset.id));
                }}
              >
                刪除
              </MenuItem>
            )}
            {err && <div className="px-3 py-1 text-2xs text-cinnabar">{err}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-1.5 text-left transition-colors hover:bg-surface disabled:opacity-50 ${
        danger ? 'text-cinnabar' : 'text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// ── Pagination ──
function Pagination({
  page,
  pageCount,
  total,
  shown,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  shown: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) {
    return <div className="text-2xs tracking-widest text-mute">共 {total} 項</div>;
  }
  const from = page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + shown;
  const btn =
    'rounded-lg border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-cinnabar disabled:opacity-40 disabled:hover:border-hairline';
  return (
    <div className="flex items-center justify-between text-2xs tracking-widest text-mute">
      <span>
        顯示 {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          上一頁
        </button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button className={btn} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          下一頁
        </button>
      </div>
    </div>
  );
}

function WalletBar({ wallet }: { wallet: WalletState | null }) {
  const low = wallet && (numOr(wallet.wal, 1) < 0.05 || numOr(wallet.sui, 1) < 0.05);
  return (
    <div className={`es-soft-panel flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 text-sm ${low ? 'ring-1 ring-cinnabar/40' : ''}`}>
      <span className="text-mute">Publisher 錢包</span>
      <span className="text-ink">SUI：{fmt(wallet?.sui)}</span>
      <span className="text-ink">WAL：{fmt(wallet?.wal)}</span>
      {low && <span className="text-cinnabar">餘額偏低,請補幣（walrus get-wal）</span>}
      {wallet?.error && <span className="text-mute">（{wallet.error}）</span>}
    </div>
  );
}

function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<AssetCategory>('hero-clip');
  const [label, setLabel] = useState('');
  const [epochs, setEpochs] = useState('30');
  const [day, setDay] = useState('1');
  const [aspect, setAspect] = useState('16/9');
  const [sagaId, setSagaId] = useState('spring-snow');
  const [chapterId, setChapterId] = useState('');
  const [caption, setCaption] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();

  const isHero = category === 'hero-clip';

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg('請選擇檔案');
    if (!label.trim()) return setMsg('請填標題');
    setBusy(true);
    setMsg(undefined);
    try {
      const meta: Record<string, unknown> = isHero
        ? {
            sagaId: sagaId.trim() || undefined,
            day: Number(day) || 1,
            aspect,
            chapterId: chapterId.trim() || undefined,
            caption: caption.trim() || undefined,
          }
        : {};
      const fd = new FormData();
      fd.set('file', file);
      fd.set('category', category);
      fd.set('label', label.trim());
      if (epochs) fd.set('epochs', epochs);
      fd.set('meta', JSON.stringify(meta));

      const res = await fetch('/api/admin/assets/upload', { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; asset?: { blobId?: string } };
      if (!res.ok) {
        setMsg(`上傳失敗：${body.error ?? res.statusText}`);
      } else {
        setMsg(`已上傳 ✓ blobId ${String(body.asset?.blobId ?? '').slice(0, 12)}…`);
        setLabel('');
        if (fileRef.current) fileRef.current.value = '';
        onUploaded();
      }
    } catch (err) {
      setMsg(`上傳失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="es-soft-panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-hairline bg-surface/50 px-6 py-3 text-left transition-colors hover:bg-surface"
        aria-expanded={open}
      >
        <h2 className="font-serif text-base text-ink">上傳資產</h2>
        <span className={`text-mute transition-transform ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="類別">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AssetCategory)}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="標題（manifest 用）">
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="顧柳爭位" />
            </Field>
          </div>

          {isHero && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="第幾日"><input value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} inputMode="numeric" /></Field>
              <Field label="比例">
                <select value={aspect} onChange={(e) => setAspect(e.target.value)} className={inputCls}>
                  {['16/9', '9/16', '1/1', '4/3', '3/4'].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="sagaId"><input value={sagaId} onChange={(e) => setSagaId(e.target.value)} className={inputCls} /></Field>
              <Field label="chapterId（選填）"><input value={chapterId} onChange={(e) => setChapterId(e.target.value)} className={inputCls} /></Field>
              <Field label="說明（選填）"><input value={caption} onChange={(e) => setCaption(e.target.value)} className={inputCls} /></Field>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="檔案（影片建議壓到 < 4.5MB）">
              <input ref={fileRef} type="file" accept="video/*,image/*" className="block w-full text-sm text-ink file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-canvas" />
            </Field>
            <Field label="租期 epochs（testnet ≈ 天）">
              <input value={epochs} onChange={(e) => setEpochs(e.target.value)} className={`${inputCls} w-28`} inputMode="numeric" />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-cinnabar px-5 py-2 text-sm tracking-wide text-canvas transition-colors hover:bg-seal disabled:opacity-50"
            >
              {busy ? '上傳中…' : '上傳到 Walrus'}
            </button>
            {msg && <span className="text-sm text-mute">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-2xs ${live ? 'bg-jade/10 text-jade' : 'bg-mute/10 text-mute'}`}>
      {live ? '已上架' : '已下架'}
    </span>
  );
}

function ExpiryBadge({ epochs }: { epochs: number | null }) {
  return (
    <span className="rounded bg-cinnabar/10 px-1.5 py-0.5 text-2xs text-cinnabar">
      {epochs == null ? '即將到期' : `剩 ${epochs}`}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-2xs tracking-widest text-mute">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'block w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-cinnabar';

function fmt(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2);
}
function numOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

// ── Icons ──
function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
