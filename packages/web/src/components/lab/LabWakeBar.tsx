'use client';

/**
 * LabWakeBar — 題字行。mirror 卷專屬的一列小字（tick 卷回傳 null），
 * 語彙照 AGENT_WAKE_LAYER.md 附錄 A 的戲班用語——「捎話」不是「戳」，
 * 「活著」不是「on」。
 *
 * 視覺上刻意不是工具列：左邊題日期與時刻，右邊兩個氣口都只是文字，
 * 沒有框也沒有膠囊——這一列壓在手卷之上，任何一枚按鈕的邊都會搶戲。
 * 捎話採漸進揭露：平時只有兩個字，點開才在原位長出「給 誰：一句話」，
 * 不彈窗、不換行、不把版推下去（min-h 撐住）。
 *
 * 「活著」打 control alive；捎話送出一句話進折子佇列，engine 的 runInterludes
 * 之後在幾十秒內給出回應（debounce 窗 + driver 巡佇列間隔，見 manager.ts）。
 */

import { useEffect, useRef, useState } from 'react';
import { StoryClock } from '@/components/StoryClock';
import { SPRING_SNOW_MIRROR } from '@endless-story/shared/world-clock';
import { useToast } from '@/components/common/Toaster';
import { labApi } from './useLab';
import type { LabLiveSnapshot } from '@/lib/lab/live';

/** 無框下劃線欄位：只留一條髮絲線，聚焦時轉硃。select 與 input 共用。 */
const FIELD =
    'border-0 border-b border-hairline bg-transparent py-0.5 font-serif text-xs text-ink/85 focus:border-cinnabar/60 focus:outline-none';
/** 文字型氣口：hover 才浮出一道極輕的下劃線，不佔面積 */
const QUIET_LINK = 'underline-offset-4 decoration-hairline transition hover:underline';

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
    const [composing, setComposing] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Esc 收合。只在展開時掛，unmount／收合都清掉。
    useEffect(() => {
        if (!composing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setComposing(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [composing]);

    // 揭露之後把游標送進去：還沒挑人就先落在「給誰」上。
    // 依賴只列 composing——只在展開的那一下對焦，之後改選人不該把游標搶回去。
    const composeTargetRef = useRef('');
    composeTargetRef.current = characterId;
    useEffect(() => {
        if (!composing) return;
        if (composeTargetRef.current) inputRef.current?.focus();
        else selectRef.current?.focus();
    }, [composing]);

    if (snapshot.timeMode !== 'mirror') return null;
    const alive = snapshot.alive;
    // 誰此刻正做著一件要花時間的事（角色自陳的 activity，喚醒層 P2）——捎話之前
    // 先看得見對方在忙什麼，「柳安春（排戲中）」比一個光禿禿的名字有人味得多。
    const activityByChar = new Map(snapshot.activities.map((a) => [a.characterId, a.what]));
    const canSend = Boolean(characterId) && Boolean(text.trim()) && !sending;

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
            // 留在展開態：捎話常是連著兩三句，收起來反而礙事
            inputRef.current?.focus();
            toast('捎話已送出——幾十秒內會有折子回應。', 'success');
            onChanged();
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex min-h-[2.5rem] flex-wrap items-center justify-between gap-3 border-t border-hairline/40 pt-2.5">
            {/* 題字 —— 日期與時刻一體，日子稍實，時辰退後半步 */}
            <span
                className="font-serif text-xs tracking-[0.15em] text-mute"
                title="鏡像時間：鐘面走真實時刻，年份減一百——曆法見 docs/narrative/WORLD_TIME_MIRROR.md"
            >
                <span className="text-ink/90">{snapshot.dateLabel ?? '……'}</span> · <StoryClock mirror={SPRING_SNOW_MIRROR} />
            </span>

            {/* 氣口 —— 全是文字，沒有一個框 */}
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                    type="button"
                    disabled={toggling}
                    onClick={() => void toggleAlive()}
                    title={alive ? '活著 · 與現實同刻——點一下讓它靜止' : '靜止——點一下讓這一卷與現實同刻活著'}
                    className="group inline-flex items-center gap-1.5 font-serif text-2xs tracking-[0.2em] transition disabled:opacity-50"
                >
                    <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${alive ? 'animate-lab-live-dot bg-cinnabar' : 'bg-mute/40'}`}
                    />
                    <span className={`${alive ? 'text-ink/85' : 'text-mute'} ${QUIET_LINK} group-hover:text-ink group-hover:underline`}>
                        {alive ? '活著' : '靜止'}
                    </span>
                </button>

                {composing ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-xs">
                        <span className="text-mute">給</span>
                        <span className="relative inline-flex items-center">
                            <select
                                ref={selectRef}
                                value={characterId}
                                onChange={(e) => setCharacterId(e.target.value)}
                                className={`${FIELD} appearance-none pr-4 tracking-[0.05em]`}
                                title="捎話給誰"
                            >
                                <option value="">誰</option>
                                {snapshot.characters.map((c) => {
                                    const doing = activityByChar.get(c.id);
                                    return (
                                        <option key={c.id} value={c.id}>
                                            {doing ? `${c.name}（${doing}）` : c.name}
                                        </option>
                                    );
                                })}
                            </select>
                            {/* 原生箭頭已 appearance-none 抹掉，這裡自畫一枚小的 */}
                            <span aria-hidden className="pointer-events-none absolute right-0 text-2xs text-mute/70">
                                ▾
                            </span>
                        </span>
                        <span className="text-mute">：</span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void sendStimulus();
                            }}
                            placeholder="一句話…"
                            className={`${FIELD} w-44 placeholder:text-mute/60`}
                        />
                        <button
                            type="button"
                            disabled={!canSend}
                            onClick={() => void sendStimulus()}
                            title="捎話（Enter 也可）"
                            className={`font-serif text-2xs tracking-[0.2em] transition ${
                                canSend ? 'text-cinnabar hover:text-seal' : 'text-mute/40'
                            }`}
                        >
                            送
                        </button>
                        <button
                            type="button"
                            onClick={() => setComposing(false)}
                            aria-label="收起捎話"
                            title="收起（Esc）"
                            className="font-serif text-xs leading-none text-mute/60 transition hover:text-ink"
                        >
                            ×
                        </button>
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={() => setComposing(true)}
                        title="捎話——給戲班裡的一個人遞一句話，幾十秒內會有折子回應"
                        className={`font-serif text-2xs tracking-[0.2em] text-mute hover:text-ink ${QUIET_LINK}`}
                    >
                        捎話
                    </button>
                )}
            </span>
        </div>
    );
}
