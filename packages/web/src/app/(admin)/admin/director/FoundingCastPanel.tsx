'use client';

import { useState, useTransition } from 'react';
import {
    createFoundingCastAction,
    loadFoundingPresetAction,
    type FoundingCharSpec,
    type CreateFoundingCastResult,
} from '@/lib/actions/create-founding-cast';

/**
 * Admin panel: 創世入口 — directly mint the founding cast (no voucher) and weave
 * them with a batch founding induction (mode B: pre-acquainted, full pairwise web).
 *
 * Two sources: hand-write rows, or load the story's recruitment role slots as
 * scaffolding then fill in the bios.
 */

interface RoleSlot {
    specialty: string;
    roleIntent: string;
    genderRequirement?: string;
}

interface Row extends FoundingCharSpec {
    /** roleIntent hint shown under a preset-scaffolded row (not sent on mint). */
    hint?: string;
}

const GENDERS = ['男', '女', '中性'] as const;

function blankRow(): Row {
    return { name: '', ageYears: 0, gender: '', role: '', description: '', secret: '' };
}

function mapGender(g?: string): string {
    if (!g) return '';
    if (g === 'male' || g.includes('男')) return '男';
    if (g === 'female' || g.includes('女')) return '女';
    return '';
}

export function FoundingCastPanel({ roleSlots }: { roleSlots: RoleSlot[] }) {
    const [rows, setRows] = useState<Row[]>([blankRow()]);
    const [result, setResult] = useState<CreateFoundingCastResult | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [isPending, start] = useTransition();

    const patch = (i: number, p: Partial<Row>) =>
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
    const remove = (i: number) => setRows((prev) => (prev.length <= 1 ? [blankRow()] : prev.filter((_, idx) => idx !== i)));
    const add = () => setRows((prev) => [...prev, blankRow()]);

    const loadPreset = () => {
        start(async () => {
            // Prefer the preset's full founding bios; fall back to recruitment-role scaffold.
            const cast = await loadFoundingPresetAction();
            if (cast.length > 0) {
                setRows(cast.map((c) => ({ ...c, secret: c.secret ?? '' })));
                setNote(`已載入 ${cast.length} 位劇本創世班底（含背景，可直接立班或微調）。`);
                return;
            }
            if (roleSlots.length === 0) {
                setNote('劇本沒有 founding_cast,也沒有職缺可當骨架（先去「招募」種子化)。');
                return;
            }
            setRows(
                roleSlots.map((s) => ({
                    name: '',
                    ageYears: 0,
                    gender: mapGender(s.genderRequirement),
                    role: s.specialty,
                    description: '',
                    secret: '',
                    hint: s.roleIntent,
                })),
            );
            setNote(`劇本沒有 founding_cast,改載入 ${roleSlots.length} 個職缺作骨架 — 填入姓名、年齡、性別、描述。`);
        });
    };

    const valid = (r: Row) => r.name.trim() && r.description.trim() && r.ageYears > 0 && r.gender.trim() && r.role.trim();
    const validCount = rows.filter(valid).length;

    const handleMint = () => {
        const specs: FoundingCharSpec[] = rows.filter(valid).map((r) => ({
            name: r.name.trim(),
            ageYears: r.ageYears,
            gender: r.gender,
            role: r.role.trim(),
            description: r.description.trim(),
            secret: r.secret?.trim() || undefined,
            minAttributes: r.minAttributes,
        }));
        if (specs.length === 0) {
            setNote('沒有完整的角色（每人需姓名、年齡、性別、行當、描述）');
            return;
        }
        setNote(null);
        setResult(null);
        start(async () => {
            const r = await createFoundingCastAction({ specs });
            setResult(r);
        });
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={loadPreset}
                    disabled={isPending}
                    className="rounded border border-hairline px-3 py-1.5 text-2xs tracking-widest text-ink hover:border-cinnabar disabled:opacity-50"
                >
                    載入劇本班底（{roleSlots.length} 職缺）
                </button>
                <button
                    type="button"
                    onClick={add}
                    disabled={isPending}
                    className="rounded border border-hairline px-3 py-1.5 text-2xs tracking-widest text-ink hover:border-cinnabar disabled:opacity-50"
                >
                    ＋ 新增一行
                </button>
                <span className="text-2xs tracking-widest text-mute">{rows.length} 行 · {validCount} 完整</span>
            </div>

            <div className="space-y-4">
                {rows.map((r, i) => (
                    <div key={i} className="rounded border border-hairline bg-surface/50 p-4 space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="space-y-1">
                                <div className="text-2xs tracking-widest text-mute">姓名</div>
                                <input
                                    value={r.name}
                                    onChange={(e) => patch(i, { name: e.target.value })}
                                    disabled={isPending}
                                    className="w-32 rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus:border-cinnabar focus:outline-none"
                                />
                            </label>
                            <label className="space-y-1">
                                <div className="text-2xs tracking-widest text-mute">年齡</div>
                                <input
                                    type="number"
                                    value={r.ageYears || ''}
                                    onChange={(e) => patch(i, { ageYears: Number(e.target.value) || 0 })}
                                    disabled={isPending}
                                    className="w-20 rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus:border-cinnabar focus:outline-none"
                                />
                            </label>
                            <label className="space-y-1">
                                <div className="text-2xs tracking-widest text-mute">性別</div>
                                <select
                                    value={r.gender}
                                    onChange={(e) => patch(i, { gender: e.target.value })}
                                    disabled={isPending}
                                    className="rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus:border-cinnabar focus:outline-none"
                                >
                                    <option value="">—</option>
                                    {GENDERS.map((g) => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1 flex-1 min-w-[8rem]">
                                <div className="text-2xs tracking-widest text-mute">行當</div>
                                <input
                                    value={r.role}
                                    onChange={(e) => patch(i, { role: e.target.value })}
                                    disabled={isPending}
                                    className="w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-ink focus:border-cinnabar focus:outline-none"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => remove(i)}
                                disabled={isPending}
                                className="rounded border border-hairline px-2 py-1.5 text-2xs text-mute hover:border-cinnabar hover:text-ink disabled:opacity-50"
                            >
                                ✕
                            </button>
                        </div>
                        {r.hint ? (
                            <p className="text-2xs leading-relaxed text-mute/70">劇本職缺意圖：{r.hint}</p>
                        ) : null}
                        <label className="block space-y-1">
                            <div className="text-2xs tracking-widest text-mute">公開描述（會上鏈 / 顯示；勿洩漏秘密）</div>
                            <textarea
                                value={r.description}
                                onChange={(e) => patch(i, { description: e.target.value })}
                                disabled={isPending}
                                rows={3}
                                className="w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm leading-relaxed text-ink focus:border-cinnabar focus:outline-none"
                            />
                        </label>
                        <label className="block space-y-1">
                            <div className="text-2xs tracking-widest text-mute">心底秘密（不上鏈 · 只化成這個角色的私密記憶）</div>
                            <textarea
                                value={r.secret ?? ''}
                                onChange={(e) => patch(i, { secret: e.target.value })}
                                disabled={isPending}
                                rows={2}
                                className="w-full rounded border border-hairline bg-surface px-2 py-1.5 text-sm leading-relaxed text-ink/80 italic focus:border-cinnabar focus:outline-none"
                            />
                        </label>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={handleMint}
                disabled={isPending || validCount === 0}
                className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
            >
                {isPending ? '立班中…（生圖 + 鑄造 + 入科,可能數分鐘）' : `立班 (${validCount} 人)`}
            </button>

            {note ? <p className="text-2xs tracking-widest text-mute">{note}</p> : null}

            {result ? (
                <div className="space-y-2 rounded border border-hairline bg-surface/40 p-4 text-2xs leading-relaxed">
                    <div className="tracking-widest text-ink">
                        鑄造 {result.minted.length} 人 · 自身記憶 {result.selfSeeded} 條 · 關係 {result.tiesSeeded} 對 · 設定集 {result.viewsSeeded} 張
                        {result.inductionSkipped ? `（記憶未配置:${result.inductionSkipped}）` : ''}
                    </div>
                    {result.minted.map((m) => (
                        <div key={m.id} className="text-ink/80">
                            ✓ {m.name} <span className="font-mono text-mute">{m.id.slice(0, 10)}…</span>
                            {m.portrait ? '' : ' · ⚠ 無畫像（可用對帳補）'}
                        </div>
                    ))}
                    {result.failures.map((f, i) => (
                        <div key={i} className="text-cinnabar">✕ {f.name}：{f.error}</div>
                    ))}
                    {result.genesisWarning ? (
                        <div className="rounded border border-cinnabar/40 bg-cinnabar/5 p-2 text-cinnabar">
                            ⚠ 此生記憶：{result.genesisWarning}
                        </div>
                    ) : null}
                    {result.error ? <div className="text-cinnabar">錯誤：{result.error}</div> : null}
                </div>
            ) : null}

            <p className="text-2xs leading-relaxed text-mute/70">
                直接 admin 簽名鑄造（不走職缺抽卡），OwnerCap + ControlCap 歸班主。這批人視為
                <strong className="text-ink">創世班底 · 彼此早已相識</strong>:一次批次 induction 同時種下各自的自身記憶
                與彼此的關係網（共同往事只寫一次,雙向對稱）。每人會先生畫像再鑄造,鑄造後再補正面 + 設定集圖,避免無頭像或缺設定集。需 admin 錢包有 gas。
            </p>
        </div>
    );
}
