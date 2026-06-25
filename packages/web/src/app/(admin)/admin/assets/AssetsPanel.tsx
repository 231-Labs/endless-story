'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  deleteAssetAction,
  extendAssetAction,
  getAssetWalletAction,
  listAssetsAction,
  patchAssetAction,
  renewDueAction,
  type ActionResult,
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

const PAGE_SIZE = 20;

export function AssetsPanel() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Changing the visible set resets paging + clears selection (a kept selection
  // could silently include now-hidden rows).
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [category, status, query]);

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

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (filtered.length > 0 && filtered.every((a) => prev.has(a.id))) return new Set();
      return new Set(filtered.map((a) => a.id));
    });
  }, [filtered]);

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
      <WalletBar wallet={wallet} onSwept={refresh} />
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

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋標題 / blobId…"
              className={`${inputCls} h-9 min-w-0 flex-1`}
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className={`${inputCls} h-9 w-auto`}
              aria-label="狀態篩選"
            >
              <option value="all">全部狀態</option>
              <option value="live">已上架</option>
              <option value="unpublished">已下架</option>
              <option value="expiring">即將到期</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="es-soft-panel p-6 text-sm text-mute">沒有符合條件的資產。</div>
          ) : (
            <div className="es-soft-panel overflow-hidden">
              <SelectionBar
                allSelected={allFilteredSelected}
                selectedIds={selected}
                filteredCount={filtered.length}
                onToggleAll={toggleAll}
                onClear={() => setSelected(new Set())}
                onChanged={refresh}
              />
              <ul className="divide-y divide-hairline">
                {pageItems.map((a) => (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    checked={selected.has(a.id)}
                    onToggle={() => toggle(a.id)}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            </div>
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

// ── Selection / batch action bar ──
function SelectionBar({
  allSelected,
  selectedIds,
  filteredCount,
  onToggleAll,
  onClear,
  onChanged,
}: {
  allSelected: boolean;
  selectedIds: Set<string>;
  filteredCount: number;
  onToggleAll: () => void;
  onClear: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | undefined>();
  const count = selectedIds.size;
  const some = count > 0 && !allSelected;

  // Native indeterminate state can't be set via JSX prop.
  const boxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = some;
  }, [some]);

  const runBatch = (label: string, fn: (id: string) => Promise<ActionResult>, confirmMsg?: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    startTransition(async () => {
      setMsg(undefined);
      const results = await Promise.allSettled(ids.map((id) => fn(id)));
      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
      ).length;
      setMsg(`${label}：完成 ${ids.length - failed}/${ids.length}${failed ? `，失敗 ${failed}` : ''}`);
      onClear();
      await onChanged();
    });
  };

  const batchBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:border-cinnabar disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-surface/50 px-4 py-2.5">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          ref={boxRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 accent-cinnabar"
          aria-label="全選"
        />
        {count > 0 ? `已選 ${count} 項` : `全選（${filteredCount}）`}
      </label>

      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={batchBtn} disabled={pending} onClick={() => runBatch('批量續租', (id) => extendAssetAction(id, 30))} aria-label="批量續租 +30 天" title="批量續租 +30 天">
            <CalendarPlusIcon />
          </button>
          <button className={batchBtn} disabled={pending} onClick={() => runBatch('批量上架', (id) => patchAssetAction(id, { status: 'live' }))} aria-label="批量上架" title="批量上架">
            <EyeIcon />
          </button>
          <button className={batchBtn} disabled={pending} onClick={() => runBatch('批量下架', (id) => patchAssetAction(id, { status: 'unpublished' }))} aria-label="批量下架" title="批量下架">
            <EyeOffIcon />
          </button>
          <button
            className={`${batchBtn} border-cinnabar/40 text-cinnabar hover:bg-cinnabar hover:text-canvas`}
            disabled={pending}
            onClick={() => runBatch('批量刪除', (id) => deleteAssetAction(id), `刪除並回收選取的 ${count} 項?此操作不可復原。`)}
            aria-label="批量刪除"
            title="批量刪除並回收"
          >
            <TrashIcon />
          </button>
          <button className="es-icon-button h-8 w-8 text-mute hover:text-ink" disabled={pending} onClick={onClear} aria-label="清除選取" title="清除選取">
            <XIcon />
          </button>
        </div>
      )}

      {pending && <span className="text-xs text-mute">處理中…</span>}
      {msg && <span className="text-xs text-mute">{msg}</span>}
    </div>
  );
}

// ── Asset row (functional: status + actions inline) ──
function AssetRow({
  asset,
  checked,
  onToggle,
  onChanged,
}: {
  asset: AssetView;
  checked: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(asset.label);
  const live = asset.status === 'live';
  const expiry =
    asset.epochsRemaining == null
      ? '—'
      : `剩 ${asset.epochsRemaining} epochs${asset.expiresAt ? `（${asset.expiresAt.slice(0, 10)}）` : ''}`;

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setErr(undefined);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else onChanged();
    });

  const startEdit = () => {
    setErr(undefined);
    setDraft(asset.label);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setErr(undefined);
  };
  const saveLabel = () => {
    const next = draft.trim();
    if (!next || next === asset.label) {
      cancelEdit();
      return;
    }
    startTransition(async () => {
      setErr(undefined);
      const r = await patchAssetAction(asset.id, { label: next });
      if (!r.ok) setErr(r.error);
      else {
        setEditing(false);
        onChanged();
      }
    });
  };

  const actionBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:border-cinnabar disabled:opacity-50';

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm ${checked ? 'bg-cinnabar/5' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 flex-none accent-cinnabar"
        aria-label={`選取 ${asset.label}`}
      />
      <AssetThumb asset={asset} className="h-9 w-9 flex-none overflow-hidden rounded" />

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              autoFocus
              disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveLabel();
                else if (e.key === 'Escape') cancelEdit();
              }}
              className="h-7 min-w-0 flex-1 rounded border border-cinnabar bg-surface px-2 text-sm text-ink outline-none"
              aria-label="編輯標題"
            />
            <button
              className="flex-none inline-flex h-7 w-7 items-center justify-center rounded-full border border-cinnabar text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas disabled:opacity-50"
              disabled={pending}
              onClick={saveLabel}
              aria-label="儲存"
              title="儲存"
            >
              <CheckIcon />
            </button>
            <button
              className="flex-none inline-flex h-7 w-7 items-center justify-center rounded-full text-mute transition-colors hover:text-ink disabled:opacity-50"
              disabled={pending}
              onClick={cancelEdit}
              aria-label="取消"
              title="取消"
            >
              <XIcon />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{asset.label}</span>
            <button
              className="flex-none text-mute transition-colors hover:text-cinnabar disabled:opacity-50"
              disabled={pending}
              onClick={startEdit}
              aria-label="編輯標題"
              title="編輯標題"
            >
              <EditIcon />
            </button>
            <StatusBadge live={live} />
            {asset.expiringSoon && <ExpiryBadge epochs={asset.epochsRemaining} />}
            {asset.autoRenew && (
              <span className="rounded bg-jade/10 px-1.5 py-0.5 text-2xs text-jade">自動續租</span>
            )}
          </div>
        )}
        <div className="mt-0.5 truncate font-mono text-2xs text-mute">
          {CATEGORY_LABEL[asset.category]} · {(asset.sizeBytes / 1024).toFixed(0)}KB · {asset.blobId.slice(0, 16)}… · {expiry}
        </div>
        {err && <div className="mt-1 text-2xs text-cinnabar">{err}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button className={actionBtn} disabled={pending} onClick={() => run(() => extendAssetAction(asset.id, 30))} aria-label="續租 +30 天" title="續租 +30 天">
          <CalendarPlusIcon />
        </button>
        <button
          className={actionBtn}
          disabled={pending}
          onClick={() => run(() => patchAssetAction(asset.id, { status: live ? 'unpublished' : 'live' }))}
          aria-label={live ? '下架' : '上架'}
          title={live ? '下架' : '上架'}
        >
          {live ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
            asset.autoRenew ? 'border-jade text-jade' : 'border-hairline text-mute hover:border-cinnabar'
          }`}
          disabled={pending}
          onClick={() => run(() => patchAssetAction(asset.id, { autoRenew: !asset.autoRenew }))}
          aria-label={`自動續租：${asset.autoRenew ? '開' : '關'}`}
          title={`自動續租：${asset.autoRenew ? '開' : '關'}`}
        >
          <RecycleIcon />
        </button>
        {asset.deletable && (
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cinnabar/40 text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              if (confirm(`刪除並回收「${asset.label}」?此操作不可復原。`)) run(() => deleteAssetAction(asset.id));
            }}
            aria-label="刪除"
            title="刪除並回收"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </li>
  );
}

// ── Thumbnail: only real images/videos render a preview; everything else (章回
//    文字、無圖場景) falls back to a small icon — driven by contentType, never
//    assumed from category. ──
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
        alt=""
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
  const icon = ct.startsWith('text') || asset.category === 'chapter-text' ? <TextIcon /> : <FileIcon />;
  return <div className={`${className} flex items-center justify-center bg-surface/60 text-mute`}>{icon}</div>;
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
        <button className={btn} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="上一頁" title="上一頁">
          <ChevronLeftIcon />
        </button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button className={btn} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="下一頁" title="下一頁">
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

function WalletBar({ wallet, onSwept }: { wallet: WalletState | null; onSwept?: () => void }) {
  const low = wallet && (numOr(wallet.wal, 1) < 0.05 || numOr(wallet.sui, 1) < 0.05);
  return (
    <div className={`es-soft-panel flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 text-sm ${low ? 'ring-1 ring-cinnabar/40' : ''}`}>
      <span className="text-mute">Publisher 錢包</span>
      <span className="text-ink">SUI：{fmt(wallet?.sui)}</span>
      <span className="text-ink">WAL：{fmt(wallet?.wal)}</span>
      {low && <span className="text-cinnabar">餘額偏低,請補幣（walrus get-wal）</span>}
      {wallet?.error && <span className="text-mute">（{wallet.error}）</span>}
      <RenewNowButton onDone={onSwept} />
    </div>
  );
}

// Manual trigger for the same sweep the service runs on its interval — scans assets with
// 自動續租 on that are near expiry and extends them. Handy to verify renewal works without
// waiting for the timer.
function RenewNowButton({ onDone }: { onDone?: () => void }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | undefined>();
  const run = () =>
    startTransition(async () => {
      setMsg(undefined);
      const r = await renewDueAction();
      if (!r.ok) setMsg(r.error ? `失敗：${r.error}` : '失敗');
      else if (r.walletBlocked) setMsg(`錢包餘額不足，已跳過 ${r.skippedCount ?? 0} 筆`);
      else {
        const renewed = r.renewedCount ?? 0;
        const skipped = r.skippedCount ?? 0;
        const failed = r.failedCount ?? 0;
        if (renewed === 0 && skipped === 0 && failed === 0) setMsg('目前無到期資產');
        else
          setMsg(
            `已續租 ${renewed}` +
              (skipped ? `，跳過 ${skipped}（多為已過期）` : '') +
              (failed ? `，失敗 ${failed}` : ''),
          );
      }
      onDone?.();
    });
  return (
    <div className="ml-auto flex items-center gap-2">
      {msg && <span className="text-xs text-mute">{msg}</span>}
      <button
        onClick={run}
        disabled={pending}
        title="掃描開啟自動續租且即將到期的資產並立即續租"
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-cinnabar disabled:opacity-50"
      >
        <RecycleIcon />
        {pending ? '檢查中…' : '立即檢查續租'}
      </button>
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
              title="上傳到 Walrus"
              className="inline-flex items-center gap-2 rounded-full bg-cinnabar px-5 py-2 text-sm tracking-wide text-canvas transition-colors hover:bg-seal disabled:opacity-50"
            >
              <UploadIcon />
              {busy ? '上傳中' : '上傳'}
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
      {epochs == null ? '即將到期' : `即將到期 · 剩 ${epochs}`}
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
function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
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
function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-2.3 3.1" />
      <path d="M6.6 6.6A13 13 0 0 0 2 11s3.5 7 10 7a9.7 9.7 0 0 0 4.2-1" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
function CalendarPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
    </svg>
  );
}
function RecycleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
