'use client';

/**
 * LabCharacterSheet — 人物內頁，遊戲式角色幕：左（窄屏為上）是滿幅立繪柱，
 * 名款、行當、身心三計（乏／飢／緒）與最新一言壓在墨色漸層上，如角色選擇畫面；
 * 右是籤頁式檔案 —— 心事（全帳張力序）／羈絆（我看眾人）／檔案（其人＋恆常
 * 自我＋心底事）／記憶（LocalRecall 全帳）／影像（多圖＋影片）。
 * Operator cockpit：資訊一樣不少；窗內質地以「幽」標記。
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { labApi } from './useLab';
import type { LabCharacterLive } from '@/lib/lab/types';

type TabKey = 'wants' | 'estate' | 'bonds' | 'pov' | 'dossier' | 'memory' | 'media';

function Gauge({ label, value, tone, title }: { label: string; value: number; tone: string; title: string }) {
    const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
    return (
        <div className="flex items-center gap-2" title={`${title} ${value.toFixed(2)}`}>
            <span className="w-4 shrink-0 font-serif text-2xs tracking-[0.2em] text-white/80">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <div className={`h-full rounded-full ${tone} transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right font-serif text-2xs tabular-nums text-white/70">{pct}</span>
        </div>
    );
}

export function LabCharacterSheet({ runId, character: c, onClose, onJumpToScene }: {
    runId: string;
    character: LabCharacterLive;
    onClose: () => void;
    onJumpToScene?: (sceneId: string) => void;
}) {
    const [tab, setTab] = useState<TabKey>('wants');
    const [memories, setMemories] = useState<Array<{ seq: number; content: string; kind: string; day: number; importance: number }>>([]);
    const [memErr, setMemErr] = useState<string | null>(null);
    /** 自述 —— 以此人為主角、逐拍第一人稱的連貫視角（tick eventPovs 依 characterId 濾）。 */
    const [povs, setPovs] = useState<Array<{ day: number; tick: number; scene: string; body: string }>>([]);
    /** 燈箱 —— 點圖放大，點任一處或 Esc 收。 */
    const [zoomUrl, setZoomUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!zoomUrl) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setZoomUrl(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoomUrl]);

    useEffect(() => {
        let cancelled = false;
        labApi
            .memories(runId, c.id)
            .then(({ memories }) => {
                if (!cancelled) setMemories(memories);
            })
            .catch((e) => setMemErr(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
        };
    }, [runId, c.id]);

    // 自述：抽此人在每一拍的 POV，串成一線
    useEffect(() => {
        let cancelled = false;
        labApi
            .ticks(runId, 400)
            .then(({ records }) => {
                if (cancelled) return;
                const out: Array<{ day: number; tick: number; scene: string; body: string }> = [];
                for (const r of records) {
                    const sceneByEvent = new Map(r.events.map((e) => [e.id, e.sceneName]));
                    for (const p of r.eventPovs) {
                        if (p.characterId === c.id) out.push({ day: r.day, tick: r.tick, scene: sceneByEvent.get(p.eventId) ?? '', body: p.body });
                    }
                }
                setPovs(out);
            })
            .catch(() => { /* 冷卷或尚未走拍 —— 空 */ });
        return () => {
            cancelled = true;
        };
    }, [runId, c.id]);

    const art = c.portraitUrl ?? c.gallery.find((g) => g.type === 'image')?.url;
    const tabs: Array<{ key: TabKey; label: string; count?: number; title: string }> = [
        { key: 'wants', label: '心事', count: c.wants.length, title: '全部活著的心事，張力排序' },
        { key: 'estate', label: '身家', count: c.carrying.length, title: '身上的錢與隨身物品欄' },
        { key: 'bonds', label: '羈絆', count: c.views.length, title: '我看眾人 —— 當下的、最新的關係視角' },
        { key: 'pov', label: '自述', count: povs.length, title: '以此人為主角、逐拍第一人稱的連貫視角（眾聲之一線）' },
        { key: 'dossier', label: '檔案', title: '其人・恆常自我・心底事' },
        { key: 'memory', label: '記憶', count: memories.length, title: 'LocalRecall 全帳（植入／焚去到「物界 → 記憶」）' },
        { key: 'media', label: '影像', count: c.gallery.length, title: '圖庫多媒體：多圖＋影片' },
    ];

    return (
        <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-canvas"
        >
            {/* 背景：肖像淡染滿幕 */}
            <div className="absolute inset-0">
                {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art} alt="" className="h-full w-full object-cover opacity-20 blur-md dark:opacity-15" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-r from-canvas/70 via-canvas/92 to-canvas" />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* 立繪柱 —— 角色選擇畫面式：滿幅圖、行當印、名款與身心計壓底 */}
                <div className="relative h-[34dvh] shrink-0 overflow-hidden lg:h-auto lg:w-[340px] xl:w-[400px]">
                    {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <motion.img
                            src={art}
                            alt={c.name}
                            initial={{ scale: 1.06, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => setZoomUrl(art)}
                            title="點看原圖"
                            className="absolute inset-0 h-full w-full cursor-zoom-in object-cover object-top"
                        />
                    ) : (
                        <span className="absolute inset-0 bg-gradient-to-b from-surface via-canvas to-surface dark:from-elevated dark:via-canvas dark:to-elevated">
                            <span className="absolute left-1/2 top-[30%] flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-cinnabar/85 font-serif text-5xl text-white shadow-md">
                                {c.name.slice(0, 1)}
                            </span>
                        </span>
                    )}

                    {/* 行當印 */}
                    {c.role ? (
                        <span className="absolute left-3 top-3 rounded-sm bg-ink/55 px-1.5 py-1.5 font-serif text-2xs tracking-[0.25em] text-white/90 backdrop-blur-[2px] [writing-mode:vertical-rl] dark:bg-black/45">
                            {c.role}
                        </span>
                    ) : null}

                    {/* 名款與身心計 */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-4 pt-14 sm:px-5">
                        <h2 className="font-serif text-3xl tracking-[0.14em] text-white drop-shadow sm:text-4xl">{c.name}</h2>
                        <p className="mt-1 font-serif text-2xs tracking-[0.3em] text-white/70">
                            {[c.role, c.gender, c.age ? `${c.age} 歲` : null].filter(Boolean).join(' · ')}
                        </p>
                        <button
                            type="button"
                            onClick={() => c.sceneId && onJumpToScene?.(c.sceneId)}
                            className="mt-1.5 font-serif text-xs tracking-[0.15em] text-white/85 transition hover:text-white"
                            title="開其所在場景"
                        >
                            在 {c.sceneName} →
                        </button>
                        <div className="mt-3 space-y-1.5">
                            <Gauge label="乏" value={c.fatigue} tone="bg-seal/90" title="疲乏" />
                            <Gauge label="飢" value={c.hunger} tone="bg-cinnabar/80" title="飢餓" />
                            <Gauge label="緒" value={(c.mood + 1) / 2} tone="bg-jade/90" title="情緒（-1…1 折半）" />
                        </div>
                        {c.latestLine ? (
                            <p className="mt-3 line-clamp-2 font-serif text-xs leading-relaxed text-white/75" title={`${c.latestLine.clock} · ${c.latestLine.sceneName}`}>
                                「{c.latestLine.text}」
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* 檔案柱 —— 籤頁 */}
                <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4 sm:px-8">
                    {/* 巨字水印 */}
                    <span aria-hidden className="pointer-events-none absolute -right-4 -top-2 select-none font-serif text-[26vh] leading-none text-ink/[0.045] dark:text-white/[0.04]">
                        {c.name.slice(0, 1)}
                    </span>

                    {/* 內容置中一柱 —— 寬屏不再左偏一邊 */}
                    <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setTab(t.key)}
                                title={t.title}
                                className={`shrink-0 rounded-full px-3.5 py-1.5 font-serif text-xs tracking-[0.25em] transition ${
                                    tab === t.key
                                        ? 'bg-cinnabar text-white shadow-[0_2px_12px_rgba(176,74,60,0.35)]'
                                        : 'text-mute hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5'
                                }`}
                            >
                                {t.label}
                                {t.count ? <span className={`ml-1.5 text-2xs tabular-nums ${tab === t.key ? 'text-white/80' : 'text-mute/70'}`}>{t.count}</span> : null}
                            </button>
                        ))}
                        <button type="button" onClick={onClose} className="es-icon-button ml-auto shrink-0" aria-label="合上內頁">↩</button>
                    </div>

                    <div className="relative mt-4 min-h-0 flex-1 overflow-y-auto pb-2 pr-1 no-scrollbar">
                        {tab === 'wants' ? (
                            <ul className="max-w-2xl space-y-3">
                                {c.wants.map((w, i) => (
                                    <li key={i} className="animate-beat-in">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="min-w-0 font-serif text-sm leading-relaxed text-ink/90">
                                                {w.desc}
                                                {w.target ? <span className="ml-1.5 font-serif text-2xs text-jade/90">→{w.target}</span> : null}
                                            </p>
                                            <span className="shrink-0 font-serif text-2xs tracking-[0.15em] text-mute">
                                                {w.layer} {w.tension.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-hairline/50">
                                            <div className="h-full rounded-full bg-cinnabar/70" style={{ width: `${Math.min(100, Math.round(w.tension * 100))}%` }} />
                                        </div>
                                    </li>
                                ))}
                                {!c.wants.length ? <li className="font-serif text-sm text-mute/70">心無罣礙。</li> : null}
                            </ul>
                        ) : null}

                        {tab === 'estate' ? (
                            <div className="space-y-5">
                                {/* 錢 —— 一枚錢牌 */}
                                <section className="animate-beat-in">
                                    <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">銀錢</h3>
                                    {c.money ? (
                                        <div className="mt-2 inline-flex items-center gap-2.5 rounded-lg bg-gradient-to-br from-cinnabar/15 to-seal/10 px-4 py-2.5 shadow-[0_2px_12px_rgba(176,74,60,0.14)]">
                                            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-seal/80 font-serif text-sm text-white shadow-inner">錢</span>
                                            <span className="font-serif text-xl tracking-[0.08em] text-ink tabular-nums">{c.money}</span>
                                        </div>
                                    ) : (
                                        <p className="mt-2 font-serif text-sm text-mute/70">此界無銀錢流通（未掛帶 economy 的季框）。</p>
                                    )}
                                </section>

                                {/* 物品欄 —— 遊戲式格位 */}
                                <section className="animate-beat-in">
                                    <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">物品欄 · {c.carrying.length}</h3>
                                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                        {c.carrying.map((it) => (
                                            <div
                                                key={it.id}
                                                title={`${it.label}${it.state ? `（${it.state}）` : ''}${it.hidden ? ' · 藏' : ''}${it.origin ? `　生於 d${it.origin.day}·t${it.origin.tick}（${it.origin.source === 'season' ? '季' : '手'}）` : ''}`}
                                                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-cinnabar/30 bg-gradient-to-br from-ink/[0.04] to-transparent p-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:from-white/[0.05]"
                                            >
                                                <span aria-hidden className="font-serif text-lg text-cinnabar/70">物</span>
                                                <span className="line-clamp-2 font-serif text-2xs leading-tight text-ink/85">{it.label}</span>
                                                {it.hidden ? <span className="font-serif text-[9px] tracking-[0.2em] text-jade/80">藏</span> : null}
                                            </div>
                                        ))}
                                        {/* 幾格空位 —— 遊戲感 */}
                                        {Array.from({ length: Math.max(0, 3 - (c.carrying.length % 3 || 3)) + (c.carrying.length ? 0 : 3) }).map((_, i) => (
                                            <div key={`empty-${i}`} className="aspect-square rounded-lg border border-dashed border-hairline/50 bg-ink/[0.015] dark:bg-white/[0.02]" />
                                        ))}
                                    </div>
                                    {!c.carrying.length ? <p className="mt-2 font-serif text-sm text-mute/70">身無長物。</p> : null}
                                </section>
                            </div>
                        ) : null}

                        {tab === 'bonds' ? (
                            <ul className="max-w-2xl space-y-2.5">
                                {c.views.map((v) => (
                                    <li key={v.name} className="animate-beat-in flex items-baseline gap-3">
                                        <span className="shrink-0 rounded-sm bg-cinnabar/85 px-1.5 py-0.5 font-serif text-xs tracking-[0.15em] text-white">
                                            {v.name}
                                        </span>
                                        <p className="min-w-0 font-serif text-sm leading-relaxed text-ink/85">{v.line}</p>
                                    </li>
                                ))}
                                {!c.views.length ? <li className="font-serif text-sm text-mute/70">眼中尚無他人。</li> : null}
                            </ul>
                        ) : null}

                        {tab === 'pov' ? (
                            <div className="space-y-5">
                                {povs.map((p, i) => (
                                    <article key={i} className="animate-beat-in border-l-2 border-cinnabar/30 pl-3">
                                        <p className="font-serif text-2xs tracking-[0.3em] text-mute">
                                            第{p.day}日 · 第{p.tick}拍{p.scene ? ` · ${p.scene}` : ''}
                                        </p>
                                        <p className="mt-1.5 whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink/85">{p.body}</p>
                                    </article>
                                ))}
                                {!povs.length ? (
                                    <p className="font-serif text-sm text-mute/70">尚無自述 —— 走幾拍，其視角自成一線（實錄卷才生 POV）。</p>
                                ) : null}
                            </div>
                        ) : null}

                        {tab === 'dossier' ? (
                            <div className="max-w-2xl space-y-5">
                                <section className="animate-beat-in">
                                    <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">其人</h3>
                                    <p className="mt-2 font-serif text-sm leading-relaxed text-ink/85">{c.description}</p>
                                </section>
                                {c.coreIdentity.length ? (
                                    <section className="animate-beat-in">
                                        <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">恆常自我</h3>
                                        <ul className="mt-2 space-y-1">
                                            {c.coreIdentity.map((line, i) => (
                                                <li key={i} className="font-serif text-sm leading-relaxed text-ink/85">· {line}</li>
                                            ))}
                                        </ul>
                                    </section>
                                ) : null}
                                {c.secret ? (
                                    <section className="animate-beat-in">
                                        <h3 className="font-serif text-2xs tracking-[0.35em] text-jade/90">心底事 · 幽</h3>
                                        <p className="mt-2 border-l-2 border-jade/40 pl-3 font-serif text-sm leading-relaxed text-ink/75">{c.secret}</p>
                                    </section>
                                ) : null}
                            </div>
                        ) : null}

                        {tab === 'memory' ? (
                            <div className="max-w-2xl">
                                {memErr ? <p className="font-serif text-xs text-cinnabar">{memErr}</p> : null}
                                <ul className="space-y-2.5">
                                    {memories.map((m) => (
                                        <li key={m.seq} className="animate-beat-in border-l-2 border-hairline/60 pl-3">
                                            <p className="font-serif text-2xs tracking-[0.18em] text-mute">
                                                {m.kind} · 重{m.importance} · 第{m.day}日
                                            </p>
                                            <p className="mt-0.5 font-serif text-sm leading-relaxed text-ink/85">{m.content}</p>
                                        </li>
                                    ))}
                                    {!memories.length && !memErr ? <li className="font-serif text-sm text-mute/70">白紙一張。</li> : null}
                                </ul>
                            </div>
                        ) : null}

                        {tab === 'media' ? (
                            c.gallery.length ? (
                                /* 拼貼牆 —— CSS columns 疊瓦式，原始比例直出，不裁不方 */
                                <div className="max-w-3xl columns-2 gap-2.5 sm:columns-3">
                                    {c.gallery.map((item) => (
                                        <div key={item.url} className="animate-beat-in mb-2.5 break-inside-avoid overflow-hidden rounded-lg shadow-[0_2px_12px_rgba(20,12,8,0.16)]">
                                            {item.type === 'video' ? (
                                                // eslint-disable-next-line jsx-a11y/media-has-caption
                                                <video src={item.url} controls playsInline className="w-full bg-black/60" />
                                            ) : (
                                                <button type="button" onClick={() => setZoomUrl(item.url)} title="點看原圖" className="block w-full cursor-zoom-in">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={item.url} alt="" className="h-auto w-full" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="font-serif text-sm text-mute/70">尚無影像 —— 到圖庫以其名補圖，此處自動換裝。</p>
                            )
                        ) : null}
                    </div>
                    </div>
                </div>
            </div>

            {/* 燈箱 —— 原圖滿幕靜觀 */}
            <AnimatePresence>
                {zoomUrl ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        onClick={() => setZoomUrl(null)}
                        role="dialog"
                        aria-label="原圖"
                        className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                    >
                        <motion.img
                            src={zoomUrl}
                            alt=""
                            initial={{ scale: 0.96 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="max-h-[94vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
                        />
                        <button
                            type="button"
                            onClick={() => setZoomUrl(null)}
                            aria-label="合上原圖"
                            className="absolute right-4 top-4 font-serif text-lg text-white/70 transition hover:text-white"
                        >
                            ✕
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.section>
    );
}
