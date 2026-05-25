'use client';

import { useState, useTransition } from 'react';
import type { RecruitmentMembership } from '@endless-story/shared';
import {
    deleteRecruitment,
    listAllRecruitments,
    newRecruitmentDraft,
    setRecruitmentActive,
    upsertRecruitment,
    type AdminRecruitment,
} from '@/lib/actions/recruitments-store';

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
                <button
                    type="button"
                    onClick={handleNew}
                    disabled={isPending}
                    className="es-outline-button text-sm"
                >
                    + 新增職缺
                </button>
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
        <div className="grid gap-3 px-6 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="font-serif text-base text-ink">{r.specialty || '(未命名行當)'}</span>
                    <span className="text-xs text-mute">· {r.sagaName}</span>
                    <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                            r.active && !expired
                                ? 'bg-jade/15 text-jade'
                                : expired
                                  ? 'bg-cinnabar/15 text-cinnabar'
                                  : 'bg-mute/15 text-mute'
                        }`}
                    >
                        {expired ? '已過期' : r.active ? '上架' : '下架'}
                    </span>
                </div>
                <p className="text-sm text-mute line-clamp-2">{r.roleIntent || '(無說明)'}</p>
                <p className="text-xs text-mute">
                    {r.basePrice} ENDLESS · {r.slots} 缺 · 至 {r.expiresAt.slice(0, 10)}
                    {r.minAttributes &&
                        Object.entries(r.minAttributes)
                            .filter(([, v]) => typeof v === 'number')
                            .map(([k, v]) => ` · ${k} ≥ ${v}`)
                            .join('')}
                </p>
            </div>
            <div className="flex gap-2 self-start">
                <button
                    type="button"
                    onClick={() => onToggle(!r.active)}
                    className="es-outline-button text-xs"
                >
                    {r.active ? '下架' : '上架'}
                </button>
                <button type="button" onClick={onEdit} className="es-outline-button text-xs">
                    編輯
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="es-outline-button text-xs text-cinnabar"
                >
                    刪除
                </button>
            </div>
        </div>
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
            className="space-y-4 px-6 py-5"
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="行當 specialty">
                    <input
                        className="es-field w-full"
                        value={draft.specialty}
                        onChange={(e) => setDraft({ ...draft, specialty: e.target.value })}
                        placeholder="武小生 / 青衣 / 老生 / …"
                        required
                    />
                </Field>
                <Field label="基底價 basePrice">
                    <input
                        type="number"
                        className="es-field w-full"
                        value={draft.basePrice}
                        onChange={(e) => setDraft({ ...draft, basePrice: Number(e.target.value) })}
                        min={0}
                        required
                    />
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
                <Field label="性別限制 gender (空 = 不限)">
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
                        <option value="other">不限</option>
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

            <div>
                <p className="text-sm text-ink mb-2">屬性最低要求 minAttributes (0 = 不要求)</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

            <label className="flex items-center gap-2 text-sm text-ink">
                <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                立刻上架（出現在首頁徵召）
            </label>

            <div className="flex gap-2 pt-2">
                <button type="submit" className="es-outline-button text-sm">
                    儲存
                </button>
                <button type="button" onClick={onCancel} className="es-outline-button text-sm">
                    取消
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
