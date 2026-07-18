'use client';

/**
 * 劇本館 — batch story configuration, two shelves:
 *   劇本 seed    the whole world in one JSON (cast/scenes/memories/stakes);
 *                saving validates by building a WorldState with the engine's
 *                own loader, so a bad seed fails here, not mid-run
 *   季框 season  the season frame (中心問題/開場事變/期限/賭注/契約紙/天時/
 *                economy 簽約物理); 簽約戲 lives here — a run only gains money
 *                physics when it mounts a season carrying an `economy` block
 */

import { useCallback, useEffect, useState } from 'react';
import { LabPageHeader } from '@/components/lab/LabPageHeader';
import { labApi } from '@/components/lab/useLab';
import type { LabSeasonSummary, LabSeedSummary } from '@/lib/lab/types';

type ShelfKind = 'seed' | 'season';

const SEASON_SKELETON = `{
  "id": "my-season",
  "title": "一季之名",
  "centralQuestion": "這一季逼問所有人的那個問題？",
  "incitingIncident": "開場事變（人人皆知的公開事實）",
  "deadline": "限期（如：七日後的堂會之夜）",
  "stakes": ["無法同時保全的代價一", "代價二"],
  "publicFacts": ["已公開的世界事實"],
  "contestedResources": [{ "label": "contract:一紙獨家唱片契約" }],
  "initialObjects": [
    { "id": "contract-paper", "label": "唱片行的契約紙", "scene": "包廂茶座", "portable": true, "state": "未簽" }
  ],
  "scheduledEvents": [
    { "id": "deadline-night", "atTick": 36, "scene": "雲錦台戲台", "text": "堂會之夜開鑼，答覆之期已至。" }
  ]
}`;
// 簽約戲的錢物理：季框再加 "economy" 區塊（帳戶/薪餉/計價作為/結構化契約），
// 形狀照私庫 seasons/anchun-after-curtain.json 原樣貼即可 — 引擎在點燈時驗證。

export default function LabSeedsPage() {
    const [seeds, setSeeds] = useState<LabSeedSummary[]>([]);
    const [seasons, setSeasons] = useState<LabSeasonSummary[]>([]);
    const [shelf, setShelf] = useState<ShelfKind>('seed');
    const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [saveId, setSaveId] = useState('');
    const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { seeds, seasons } = await labApi.seeds();
            setSeeds(seeds);
            setSeasons(seasons);
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const openItem = async (source: 'builtin' | 'custom', id: string) => {
        setMessage(null);
        try {
            const { json } = await labApi.seedText(source, id, shelf);
            setText(json);
            setLoadedFrom(`${source}/${id}`);
            setSaveId(source === 'custom' ? id : `${id}-變奏`);
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
        }
    };

    const switchShelf = (next: ShelfKind) => {
        setShelf(next);
        setLoadedFrom(null);
        setText(next === 'season' ? SEASON_SKELETON : '');
        setSaveId(next === 'season' ? 'my-season' : '');
        setMessage(null);
    };

    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            // keep the JSON id in sync with the file id so a run's provenance reads true
            const parsed = JSON.parse(text) as { id?: string };
            parsed.id = saveId.trim();
            const body = JSON.stringify(parsed, null, 2);
            await labApi.saveSeed(shelf, saveId.trim(), body);
            setText(body);
            setMessage({
                kind: 'ok',
                text: shelf === 'season'
                    ? `已存季框「${saveId.trim()}」。回片場開新卷時，「季框」下拉即可掛上。`
                    : `已存為自撰劇本「${saveId.trim()}」，回片場即可點燈。`,
            });
            await load();
        } catch (e) {
            setMessage({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
            <LabPageHeader
                eyebrow="片場 · 劇本館"
                title="劇本與配置"
                titleTip="一份 seed JSON 就是一整個世界的批量配置：saga 前提、地界與場景、開班角色（persona／secret／memories／崗位居所）、爭奪之物、關係底稿。存檔即以引擎 buildWorldState 驗證。"
                backHref="/lab"
            />

            <section className="mt-6 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div>
                    <div className="flex gap-1">
                        {(['seed', 'season'] as const).map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => switchShelf(k)}
                                title={k === 'seed' ? '整個世界的批量配置' : '季目標：中心問題／期限／賭注／契約紙／economy 簽約物理'}
                                className={`rounded-full px-3.5 py-1.5 font-serif text-xs tracking-[0.25em] transition ${
                                    shelf === k ? 'bg-cinnabar text-white' : 'text-mute hover:text-ink'
                                }`}
                            >
                                {k === 'seed' ? '劇本' : '季框'}
                            </button>
                        ))}
                    </div>
                    <ul className="mt-3 space-y-1.5">
                        {shelf === 'seed'
                            ? seeds.map((seed) => (
                                <li key={`${seed.source}/${seed.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => void openItem(seed.source, seed.id)}
                                        className={`w-full rounded-lg px-3 py-2 text-left transition ${
                                            loadedFrom === `${seed.source}/${seed.id}` ? 'bg-cinnabar/10' : 'hover:bg-surface'
                                        }`}
                                    >
                                        <p className="font-serif text-sm tracking-[0.1em] text-ink">{seed.label ?? seed.id}</p>
                                        <p className="font-serif text-2xs tracking-[0.12em] text-mute">
                                            {seed.source === 'custom' ? '自撰' : '館藏'} · {seed.id} · {seed.castCount}角/{seed.sceneCount}景/{seed.memoryCount}憶
                                        </p>
                                    </button>
                                </li>
                            ))
                            : seasons.map((season) => (
                                <li key={`${season.source}/${season.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => void openItem(season.source, season.id)}
                                        className={`w-full rounded-lg px-3 py-2 text-left transition ${
                                            loadedFrom === `${season.source}/${season.id}` ? 'bg-cinnabar/10' : 'hover:bg-surface'
                                        }`}
                                    >
                                        <p className="font-serif text-sm tracking-[0.1em] text-ink">{season.title ?? season.id}</p>
                                        <p className="truncate font-serif text-2xs tracking-[0.12em] text-mute" title={season.centralQuestion}>
                                            {season.source === 'custom' ? '自撰' : '館藏'} · {season.id}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        {shelf === 'season' && !seasons.length ? (
                            <li className="px-1 font-serif text-2xs leading-relaxed text-mute/70">
                                架上無季。右邊已備好骨架——或把私庫 seasons/*.json 整份貼上（簽約戲的
                                economy 區塊照原樣帶著），存了就能在開卷時掛。
                            </li>
                        ) : null}
                    </ul>
                </div>

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            value={saveId}
                            onChange={(e) => setSaveId(e.target.value)}
                            placeholder={shelf === 'season' ? '季框之名（如：anchun-after-curtain）' : '另存之名（如：spring-snow-變奏）'}
                            className="es-field w-72 px-3 py-2 text-sm"
                        />
                        <button
                            type="button"
                            disabled={busy || !text.trim() || !saveId.trim()}
                            onClick={() => void save()}
                            className="es-button-primary px-4 py-2 text-sm disabled:opacity-40"
                        >
                            驗而後存
                        </button>
                        {message ? (
                            <span
                                className={`font-serif text-xs ${message.kind === 'ok' ? 'text-jade' : 'text-cinnabar'}`}
                                role={message.kind === 'err' ? 'alert' : undefined}
                            >
                                {message.text}
                            </span>
                        ) : null}
                    </div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                        rows={30}
                        placeholder={shelf === 'season' ? '貼上季框 JSON（私庫 seasons/*.json 原樣可貼）。' : '左手邊揀一部劇本展開，或整份貼上。'}
                        className="es-field mt-3 w-full px-4 py-3 font-mono text-xs leading-relaxed"
                    />
                </div>
            </section>
        </main>
    );
}
