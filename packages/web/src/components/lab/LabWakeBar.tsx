'use client';

/**
 * LabWakeBar — 活著 · 捎話。mirror 卷專屬的一條小工具列（tick 卷回傳 null，
 * 元件本身克制：一顆開關＋一具迷你表單，語彙照 AGENT_WAKE_LAYER.md 附錄 A
 * 的戲班用語——「捎話」不是「戳」，「活著」不是「on」。
 *
 * 「活著」打 control alive；捎話送出一句話進折子佇列，engine 的 runInterludes
 * 之後在幾十秒內給出回應（debounce 窗 + driver 巡佇列間隔，見 manager.ts）。
 */

import { useState } from 'react';
import { StoryClock } from '@/components/StoryClock';
import { SPRING_SNOW_MIRROR } from '@endless-story/shared/world-clock';
import { useToast } from '@/components/common/Toaster';
import { labApi } from './useLab';
import type { LabLiveSnapshot } from '@/lib/lab/live';

export function LabWakeBar({
    runId,
    snapshot,
    onChanged,
}: {
    runId: string;
    snapshot: LabLiveSnapshot;
    onChanged: () => void;
}) {
    const toast = useToast();
    const [toggling, setToggling] = useState(false);
    const [characterId, setCharacterId] = useState('');
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);

    if (snapshot.timeMode !== 'mirror') return null;
    const alive = snapshot.alive;

    const toggleAlive = async () => {
        setToggling(true);
        try {
            await labApi.control(runId, { action: 'alive', on: !alive });
            onChanged();
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setToggling(false);
        }
    };

    const sendStimulus = async () => {
        const body = text.trim();
        if (!characterId || !body) return;
        setSending(true);
        try {
            await labApi.control(runId, { action: 'stimulus', characterId, text: body });
            setText('');
            toast('捎話已送出——幾十秒內會有折子回應。', 'success');
            onChanged();
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-hairline/40 pt-2.5">
            <span
                className="font-serif text-xs tracking-[0.15em] text-mute"
                title="鏡像時間：鐘面走真實時刻，年份減一百——曆法見 docs/narrative/WORLD_TIME_MIRROR.md"
            >
                {snapshot.dateLabel ?? '……'} · <StoryClock mirror={SPRING_SNOW_MIRROR} />
            </span>

            <button
                type="button"
                disabled={toggling}
                onClick={() => void toggleAlive()}
                title={alive ? '活著 · 與現實同刻——點一下讓它靜止' : '靜止——點一下讓這一卷與現實同刻活著'}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-serif text-2xs tracking-[0.2em] transition disabled:opacity-50 ${
                    alive ? 'border-cinnabar/60 text-cinnabar' : 'border-hairline text-mute hover:text-ink'
                }`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${alive ? 'bg-cinnabar animate-lab-live-dot' : 'bg-mute/50'}`} />
                {alive ? '活著 · 與現實同刻' : '靜止'}
            </button>

            <span className="inline-flex items-center gap-1.5">
                <select
                    value={characterId}
                    onChange={(e) => setCharacterId(e.target.value)}
                    className="es-field px-2 py-1 text-xs"
                    title="捎話給誰"
                >
                    <option value="">捎話給…</option>
                    {snapshot.characters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void sendStimulus();
                    }}
                    placeholder="一句話…"
                    className="es-field w-40 px-2 py-1 text-xs"
                />
                <button
                    type="button"
                    disabled={sending || !characterId || !text.trim()}
                    onClick={() => void sendStimulus()}
                    title="捎話"
                    className="es-button-primary px-3 py-1 text-xs disabled:opacity-40"
                >
                    捎話
                </button>
            </span>
        </div>
    );
}
