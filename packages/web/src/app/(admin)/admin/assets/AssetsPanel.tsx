'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
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

export function AssetsPanel() {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (!configured) {
    return (
      <div className="es-soft-panel p-6 text-sm text-mute">
        尚未設定 <code className="text-ink">ASSET_SERVICE_URL</code>（指向 asset 服務,例如
        <code className="text-ink"> https://assets.zeabur.app</code>）與
        <code className="text-ink"> ASSET_SERVICE_SECRET</code>。設好後重整即可管理資產。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WalletBar wallet={wallet} />
      <UploadCard onUploaded={refresh} />

      {loadError && (
        <div className="es-soft-panel p-4 text-sm text-cinnabar">讀取資產失敗：{loadError}</div>
      )}

      {loading ? (
        <div className="es-soft-panel p-6 text-sm text-mute">讀取資產…</div>
      ) : (
        CATEGORIES.map(({ key, label }) => {
          const rows = assets.filter((a) => a.category === key);
          if (rows.length === 0) return null;
          return (
            <section key={key} className="es-soft-panel overflow-hidden">
              <div className="border-b border-hairline bg-surface/50 px-6 py-3">
                <h2 className="font-serif text-base text-ink">
                  {label} <span className="text-mute">· {rows.length}</span>
                </h2>
              </div>
              <ul className="divide-y divide-hairline">
                {rows.map((a) => (
                  <AssetRow key={a.id} asset={a} onChanged={refresh} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {!loading && assets.length === 0 && !loadError && (
        <div className="es-soft-panel p-6 text-sm text-mute">尚無資產。上傳第一支影片試試。</div>
      )}
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
  const [category, setCategory] = useState<AssetCategory>('hero-clip');
  const [label, setLabel] = useState('');
  const [epochs, setEpochs] = useState('30');
  const [day, setDay] = useState('1');
  const [duration, setDuration] = useState('12');
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
            durationSeconds: Number(duration) || undefined,
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
      <div className="border-b border-hairline bg-surface/50 px-6 py-3">
        <h2 className="font-serif text-base text-ink">上傳資產</h2>
      </div>
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
            <Field label="秒數"><input value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} inputMode="numeric" /></Field>
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
    </div>
  );
}

function AssetRow({ asset, onChanged }: { asset: AssetView; onChanged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | undefined>();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setErr(undefined);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else onChanged();
    });

  const live = asset.status === 'live';
  const expiry =
    asset.epochsRemaining == null
      ? '—'
      : `剩 ${asset.epochsRemaining} epochs${asset.expiresAt ? `（${asset.expiresAt.slice(0, 10)}）` : ''}`;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{asset.label}</span>
          <StatusBadge live={live} />
          {asset.expiringSoon && <span className="rounded bg-cinnabar/10 px-1.5 py-0.5 text-2xs text-cinnabar">即將到期</span>}
        </div>
        <div className="mt-0.5 truncate font-mono text-2xs text-mute">
          {CATEGORY_LABEL[asset.category]} · {(asset.sizeBytes / 1024).toFixed(0)}KB · {asset.blobId.slice(0, 16)}… · {expiry}
        </div>
        {err && <div className="mt-1 text-2xs text-cinnabar">{err}</div>}
      </div>

      <button
        onClick={() => run(() => extendAssetAction(asset.id, 30))}
        disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-cinnabar disabled:opacity-50"
      >
        續租 +30
      </button>
      <button
        onClick={() => run(() => patchAssetAction(asset.id, { status: live ? 'unpublished' : 'live' }))}
        disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink transition-colors hover:border-cinnabar disabled:opacity-50"
      >
        {live ? '下架' : '上架'}
      </button>
      <button
        onClick={() => run(() => patchAssetAction(asset.id, { autoRenew: !asset.autoRenew }))}
        disabled={pending}
        className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${asset.autoRenew ? 'border-jade text-jade' : 'border-hairline text-mute hover:border-cinnabar'}`}
      >
        自動續租{asset.autoRenew ? '：開' : '：關'}
      </button>
      {asset.deletable && (
        <button
          onClick={() => {
            if (confirm(`刪除並回收「${asset.label}」?此操作不可復原。`)) run(() => deleteAssetAction(asset.id));
          }}
          disabled={pending}
          className="rounded-full border border-cinnabar/40 px-3 py-1 text-xs text-cinnabar transition-colors hover:bg-cinnabar hover:text-canvas disabled:opacity-50"
        >
          刪除
        </button>
      )}
    </li>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-2xs ${live ? 'bg-jade/10 text-jade' : 'bg-mute/10 text-mute'}`}>
      {live ? '已上架' : '已下架'}
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
