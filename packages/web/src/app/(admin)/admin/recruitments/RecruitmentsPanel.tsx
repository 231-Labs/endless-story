'use client';

import { useState, useTransition } from 'react';
import type { RecruitmentMembership } from '@endless-story/shared';
import {
    autoPriceAllRecruitments,
    deleteRecruitment,
    listAllRecruitments,
    newRecruitmentDraft,
    setRecruitmentActive,
    upsertRecruitment,
    type AdminRecruitment,
} from '@/lib/actions/recruitments-store';
import { suggestedBulkPrice } from '@/lib/recruit-pricing';

const DEFAULT_SAGA_ID = 'spring-snow';
const DEFAULT_SAGA_NAME = '春雪社';

const ATTR_KEYS = [
    { key: 'appearance', label: '外貌' },
    { key: 'constitution', label: '筋骨' },
    { key: 'acuity', label: '機敏' },
    { key: 'disposition', label: '心性' },
] as const;

export function RecruitmentsPanel({ initial }: { initial: AdminRecruitment[] }) {
    const [items, setItems] = useState<AdminRecruitment[]>(initial);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const refresh = async () => setItems(await listAllRecruitments());

    const handleNew = () => {
        startTransition(async () => {
            const draft = await newRecruitmentDraft(DEFAULT_SAGA_ID, DEFAULT_SAGA_NAME);
            await upsertRecruitment(draft);
            await refresh();
            setEditingId(draft.id);
        });
    };

    const handleAutoPrice = () => {
        startTransition(async () => {
            const r = await autoPriceAllRecruitments();
            await refresh();
            alert(`必應已批次更新 ${r.updated} 筆（base × 平均達標抽數 × 0.85）`);
        });
    };

    const handleSave = (updated: AdminRecruitment) => {
        startTransition(async () => {
            await upsertRecruitment(updated);
            await refresh();
            setEditingId(null);
        });
    };

    const handleDelete = (id: string) => {
        if (!confirm('確定刪除這條徵召？')) return;
        startTransition(async () => {
            await deleteRecruitment(id);
            await refresh();
        });
    };

    const handleToggleActive = (id: string, active: boolean) => {
        startTransition(async () => {
            await setRecruitmentActive(id, active);
            await refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-sm text-mute">
                    共 {items.length} 條；活躍 {items.filter((r) => r.active).length} 條
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleAutoPrice}
                        disabled={isPending}
                        className="es-outline-button inline-flex items-center gap-1.5 text-sm"
                        aria-label="批次定必應"
                        title="批次定必應：base × 平均達標抽數 × 0.85"
                    >
                        <TagIcon className="h-4 w-4" />
                        批次定價
                    </button>
                    <button
                        type="button"
                        onClick={handleNew}
                        disabled={isPending}
                        className="es-outline-button inline-flex items-center gap-1.5 text-sm"
                        aria-label="新增職缺"
                        title="新增職缺"
                    >
                        <PlusIcon className="h-4 w-4" />
                        新增
                    </button>
                </div>
            </div>

            <ul className="space-y-3">
                {items.length === 0 && (
                    <li className="rounded-lg border border-dashed border-hairline px-6 py-12 text-center text-mute">
                        尚無職缺。點右上「新增職缺」開始。
                    </li>
                )}
                {items.map((r) => (
                    <li key={r.id} className="es-soft-panel overflow-hidden">
                        {editingId === r.id ? (
                            <EditForm
                                initial={r}
                                onSave={handleSave}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <RowView
                                r={r}
                                onEdit={() => setEditingId(r.id)}
                                onDelete={() => handleDelete(r.id)}
                                onToggle={(active) => handleToggleActive(r.id, active)}
                            />
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function RowView({
    r,
    onEdit,
    onDelete,
    onToggle,
}: {
    r: AdminRecruitment;
    onEdit: () => void;
    onDelete: () => void;
    onToggle: (active: boolean) => void;
}) {
    const expired = new Date(r.expiresAt).getTime() < Date.now();
    return (
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="space-y-2">
                <div className="flex items-center gap-3">
                    <span className="font-serif text-lg text-ink">{r.specialty || '(未命名行當)'}</span>
                    <span className="text-sm text-mute">· {r.sagaName}</span>
                    <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            r.active && !expired
                                ? 'bg-jade/15 text-jade'
                                : expired
                                  ? 'bg-cinnabar/15 text-cinnabar'
                                  : 'bg-mute/15 text-mute'
                        }`}
                    >
                        {expired ? '已過期' : r.active ? '上架中' : '已下架'}
                    </span>
                </div>
                <p className="text-sm leading-relaxed text-mute line-clamp-2">{r.roleIntent || '(無說明)'}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mute">
                    <span className="flex items-center gap-1">
                        <CoinIcon className="h-3.5 w-3.5" />
                        {r.basePrice}
                        {r.bulkPrice != null && r.bulkPrice !== r.basePrice ? ` / ${r.bulkPrice}` : ''} ENDLESS
                    </span>
                    <span className="flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5" />
                        {r.slots} 缺
                    </span>
                    <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        至 {r.expiresAt.slice(0, 10)}
                    </span>
                    {r.minAttributes && Object.keys(r.minAttributes).length > 0 && (
                        <span className="flex items-center gap-1 border-l border-hairline pl-4">
                            屬性要求: 
                            {Object.entries(r.minAttributes)
                                .filter(([, v]) => typeof v === 'number')
                                .map(([k, v]) => `${k}≥${v}`)
                                .join(', ')}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex gap-1.5 self-start">
                <button
                    type="button"
                    onClick={() => onToggle(!r.active)}
                    className="es-icon-button h-8 w-8 border border-hairline"
                    aria-label={r.active ? '下架' : '上架'}
                    title={r.active ? '下架' : '上架'}
                >
                    {r.active ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    className="es-icon-button h-8 w-8 border border-hairline"
                    aria-label="編輯"
                    title="編輯"
                >
                    <PencilIcon className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="es-icon-button h-8 w-8 border border-hairline text-cinnabar hover:border-cinnabar hover:bg-cinnabar/5"
                    aria-label="刪除"
                    title="刪除"
                >
                    <TrashIcon className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

function CoinIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v8" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
        </svg>
    );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
    );
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.5 0 10 7 10 7a13 13 0 0 1-2.3 3.1" />
            <path d="M6.6 6.6A13 13 0 0 0 2 11s3.5 7 10 7a9.7 9.7 0 0 0 4.2-1" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
            <path d="M10 11v6M14 11v6" />
        </svg>
    );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function TagIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.8 8.8a2 2 0 0 0 2.8 0l6.4-6.4a2 2 0 0 0 0-2.8Z" />
            <circle cx="7.5" cy="7.5" r="1.5" />
        </svg>
    );
}

function EditForm({
    initial,
    onSave,
    onCancel,
}: {
    initial: AdminRecruitment;
    onSave: (r: AdminRecruitment) => void;
    onCancel: () => void;
}) {
    const [draft, setDraft] = useState<AdminRecruitment>(initial);
    const updateAttr = (key: string, value: number | undefined) => {
        const min: Record<string, number> = { ...(draft.minAttributes as Record<string, number>) };
        if (value === undefined || value === 0) delete min[key];
        else min[key] = value;
        setDraft({ ...draft, minAttributes: min });
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSave(draft);
            }}
            className="flex flex-col"
        >
            <div className="border-b border-hairline bg-surface/50 px-6 py-4 flex items-center justify-between">
                <h3 className="font-serif text-lg text-ink">編輯職缺</h3>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                        <input
                            type="checkbox"
                            className="accent-cinnabar"
                            checked={draft.active}
                            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                        />
                        上架
                    </label>
                </div>
            </div>

            <div className="space-y-6 px-6 py-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="行當 specialty">
                        <input
                            className="es-field w-full"
                            value={draft.specialty}
                            onChange={(e) => setDraft({ ...draft, specialty: e.target.value })}
                            placeholder="武小生 / 青衣 / 老生 / …"
                            required
                        />
                    </Field>
                    <Field label="單抽價 basePrice">
                        <input
                            type="number"
                            className="es-field w-full"
                            value={draft.basePrice}
                            onChange={(e) => setDraft({ ...draft, basePrice: Number(e.target.value) })}
                            min={0}
                            required
                        />
                    </Field>
                    <Field label="必應 bulkPrice（包骰到符合）">
                        <div className="flex gap-2">
                            <input
                                type="number"
                                className="es-field w-full"
                                value={draft.bulkPrice ?? draft.basePrice}
                                onChange={(e) => setDraft({ ...draft, bulkPrice: Number(e.target.value) })}
                                min={0}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setDraft({
                                        ...draft,
                                        bulkPrice: suggestedBulkPrice(draft.basePrice, draft.minAttributes),
                                    })
                                }
                                className="es-outline-button shrink-0 text-xs"
                                title="依四維門檻自動算：base × 平均達標抽數 × 0.85"
                            >
                                建議
                            </button>
                        </div>
                    </Field>
                    <Field label="缺額 slots">
                        <input
                            type="number"
                            className="es-field w-full"
                            value={draft.slots}
                            onChange={(e) => setDraft({ ...draft, slots: Number(e.target.value) })}
                            min={1}
                            required
                        />
                    </Field>
                    <Field label="到期日 expiresAt">
                        <input
                            type="date"
                            className="es-field w-full"
                            value={draft.expiresAt.slice(0, 10)}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    expiresAt: new Date(e.target.value).toISOString(),
                                })
                            }
                            required
                        />
                    </Field>
                    <Field label="班別 membership">
                        <select
                            className="es-field w-full"
                            value={draft.membership}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    membership: e.target.value as RecruitmentMembership,
                                })
                            }
                        >
                            <option value="internal">internal (班內)</option>
                            <option value="external">external (江湖)</option>
                        </select>
                    </Field>
                    <Field label="性別限制 gender">
                        <select
                            className="es-field w-full"
                            value={draft.genderRequirement ?? ''}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    genderRequirement: (e.target.value || undefined) as AdminRecruitment['genderRequirement'],
                                })
                            }
                        >
                            <option value="">不限</option>
                            <option value="male">男性</option>
                            <option value="female">女性</option>
                        </select>
                    </Field>
                </div>

                <Field label="角色定位 roleIntent">
                    <textarea
                        className="es-field w-full"
                        rows={4}
                        value={draft.roleIntent}
                        onChange={(e) => setDraft({ ...draft, roleIntent: e.target.value })}
                        placeholder="這個角色在故事中該佔什麼位置、能製造什麼張力…"
                    />
                </Field>

                <div className="rounded-md border border-hairline bg-canvas/40 p-4">
                    <p className="text-sm text-ink mb-3 font-medium">屬性最低要求 minAttributes <span className="text-mute font-normal text-xs ml-2">(0 = 不要求)</span></p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {ATTR_KEYS.map((a) => {
                            const cur =
                                (draft.minAttributes as Record<string, number> | undefined)?.[a.key] ??
                                0;
                            return (
                                <Field key={a.key} label={a.label}>
                                    <input
                                        type="number"
                                        className="es-field w-full"
                                        value={cur}
                                        min={0}
                                        max={100}
                                        onChange={(e) =>
                                            updateAttr(a.key, Number(e.target.value) || undefined)
                                        }
                                    />
                                </Field>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="border-t border-hairline bg-surface/50 px-6 py-4 flex items-center justify-end gap-3">
                <button type="button" onClick={onCancel} className="es-outline-button text-sm">
                    取消
                </button>
                <button type="submit" className="rounded border border-transparent bg-cinnabar px-6 py-2 text-sm text-white transition-colors hover:bg-seal">
                    儲存
                </button>
            </div>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs text-mute mb-1">{label}</span>
            {children}
        </label>
    );
}
