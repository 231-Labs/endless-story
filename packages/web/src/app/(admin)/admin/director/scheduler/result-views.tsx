import type { DailyBatchResult } from '@/lib/actions/daily-batch';
import type { TickLoopResult } from '@/lib/actions/tick-loop';
import { txUrl, objectUrl } from '@/lib/explorer';

export function parseCharacterIds(text: string): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const raw of text.split(/[\s,，]+/)) {
        const id = raw.trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

export function TickLoopResultView({ result }: { result: TickLoopResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-mute">
                    {result.advanced ? '已推進 tick · ' : ''}
                    {result.worldTime
                        ? `第 ${result.worldTime.day} 日 · ${result.worldTime.partOfDay}`
                        : '時間未知'}
                </span>
            </div>
            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}
            {result.memoryWarnings && result.memoryWarnings.length > 0 ? (
                <section className="space-y-1 rounded border border-cinnabar/30 bg-cinnabar/5 p-2">
                    <div className="text-2xs tracking-widest text-cinnabar">記憶召回降級</div>
                    <ul className="space-y-1">
                        {result.memoryWarnings.map((warning, i) => (
                            <li key={`${warning}-${i}`} className="text-xs text-cinnabar">
                                {warning}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* PLAN */}
            {result.plans.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">規劃（立志 · 跨 tick 目標）</div>
                    <ul className="space-y-1">
                        {result.plans.map((p) => (
                            <li key={p.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        p.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{p.name}</span>
                                {p.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        {p.hadPrevious ? '（承前）' : '（初志）'}
                                        {p.longTermGoal ? `目標：${p.longTermGoal}` : ''}
                                        {p.dailyPlanHint ? ` · 眼下：${p.dailyPlanHint}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {p.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* MOVE */}
            {result.moves.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">移動（自主走位）</div>
                    <ul className="space-y-1">
                        {result.moves.map((m) => (
                            <li key={m.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        m.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{m.name}</span>
                                {m.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        {m.toSceneId
                                            ? `走去「${m.toSceneName ?? '別處'}」`
                                            : '留在原處'}
                                        {m.reason ? ` — ${m.reason}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {m.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* DRAMA */}
            {result.drama ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">張力（Drama · 稀缺資源）</div>
                    {result.drama.active ? (
                        <ul className="space-y-1">
                            {(result.drama.top ?? []).map((t) => (
                                <li key={t.characterId} className="text-xs">
                                    <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cinnabar" />
                                    <span className="text-ink">{t.name ?? t.characterId.slice(0, 8)}</span>
                                    <span className="text-mute">
                                        {' '}
                                        {t.statement} · 張力 {t.tension.toFixed(2)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-2xs text-mute">
                            （沒有可推導張力的爭用資源{result.drama.skipped ? `：${result.drama.skipped}` : ''}）
                        </p>
                    )}
                </section>
            ) : null}

            {/* SOCIAL */}
            {result.socials.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">互動（Social · 同場觀察/搭話）</div>
                    <ul className="space-y-1">
                        {result.socials.map((s) => (
                            <li key={s.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        s.ok && s.kind !== 'idle'
                                            ? 'bg-jade'
                                            : s.ok
                                              ? 'bg-mute'
                                              : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{s.name}</span>
                                <span className="text-mute">
                                    {' '}
                                    {s.kind}
                                    {s.targetName ? ` → ${s.targetName}` : ''}
                                    {s.line ? `：「${s.line}」` : ''}
                                    {s.observation ? ` · 見：${s.observation}` : ''}
                                    {s.relationshipMemory ? ` · 記：${s.relationshipMemory}` : ''}
                                    {s.reason ? ` · ${s.reason}` : ''}
                                </span>
                                {s.error ? <span className="text-cinnabar"> {s.error}</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* GIVE */}
            {result.gives && result.gives.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">接濟（Give · 角色間金流 · 待上鏈結算）</div>
                    <ul className="space-y-1">
                        {result.gives.map((g) => (
                            <li key={g.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        g.ok && g.gave ? 'bg-jade' : g.ok ? 'bg-mute' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{g.name}</span>
                                <span className="text-mute">
                                    {g.gave && g.gifts
                                        ? ` ${g.gifts
                                              .map((x) => `→ ${x.recipientName ?? x.recipientId} ${x.amount}（${x.memo}${x.manner ? '／' + x.manner : ''}）`)
                                              .join('；')}`
                                        : ' 未接濟'}
                                    {g.reason ? ` · ${g.reason}` : ''}
                                    {g.deferred ? ' · 待結算' : ''}
                                </span>
                                {g.error ? <span className="text-cinnabar"> {g.error}</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* ACT */}
            {result.acts.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">出牌（角色自決）</div>
                    <ul className="space-y-1">
                        {result.acts.map((a, i) => (
                            <li key={`${a.eventId}-${a.characterId}-${i}`} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        a.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{a.name ?? a.characterId.slice(0, 8)}</span>
                                {a.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        打出「{a.cardLabel}」— {a.intent}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {a.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : (
                <p className="text-2xs text-mute">（沒有開著的事件可出牌）</p>
            )}

            {/* RESOLVE (judge) */}
            {result.resolves.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">收尾（judge 自動結算）</div>
                    <ul className="space-y-1">
                        {result.resolves.map((r, i) => (
                            <li key={`${r.eventId}-${i}`} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        r.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-mute">
                                    事件 {r.eventId.slice(0, 8)}…{' '}
                                    {r.ok ? '已收尾' : `失敗：${r.error ?? ''}`}
                                </span>
                                {r.digest ? (
                                    <a
                                        href={txUrl(r.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* POV */}
            {result.povs.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">章回（POV）</div>
                    <ul className="space-y-1">
                        {result.povs.map((p) => (
                            <li key={p.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        p.ok ? 'bg-jade' : p.skipReason ? 'bg-mute' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{p.name}</span>
                                <span className="text-mute">
                                    {' '}
                                    {p.anchored
                                        ? '已上鏈'
                                        : p.skipReason
                                          ? `skip: ${p.skipReason}`
                                          : p.ok
                                            ? 'dry-run'
                                            : `失敗${p.error ? `：${p.error}` : ''}`}
                                    {typeof p.recalledCount === 'number' && p.recalledCount > 0
                                        ? ` · 憶 ${p.recalledCount}`
                                        : ''}
                                </span>
                                {p.digest ? (
                                    <a
                                        href={txUrl(p.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* SLEEP */}
            {result.sleepNote ? (
                <p className="text-2xs text-mute">睡眠整理：{result.sleepNote}</p>
            ) : null}
            {result.sleeps.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">睡眠整理（反思壓縮）</div>
                    <ul className="space-y-1">
                        {result.sleeps.map((s) => (
                            <li key={s.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        s.anchored ? 'bg-jade' : 'bg-mute'
                                    }`}
                                />
                                <span className="text-ink">{s.name}</span>
                                <span className="text-mute">
                                    {' '}
                                    {s.anchored
                                        ? `沉澱 ${s.reflections?.length ?? 0} 條`
                                        : s.skipReason === 'nothing_to_consolidate'
                                          ? '無可沉澱'
                                          : s.skipReason ?? '—'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* GAZETTE */}
            {result.gazette ? (
                <section className="text-xs">
                    <span className="text-2xs tracking-widest text-mute">公報：</span>{' '}
                    {result.gazette.anchored ? (
                        <span className="text-jade">
                            已編 · 事件 {result.gazette.eventCount} · 章回 {result.gazette.chapterCount}
                        </span>
                    ) : (
                        <span className="text-mute">
                            {result.gazette.skipReason ?? result.gazette.error ?? '未編'}
                        </span>
                    )}
                    {result.gazette.digest ? (
                        <a
                            href={txUrl(result.gazette.digest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-cinnabar hover:underline"
                        >
                            tx
                        </a>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}

export function BatchResultView({ result }: { result: DailyBatchResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-mute">
                    {result.advanced ? '已推進 tick · ' : ''}
                    {result.worldTime
                        ? `第 ${result.worldTime.day} 日 · ${result.worldTime.partOfDay}`
                        : '時間未知'}
                    {' · '}
                    {result.results.length} 名角色
                </span>
            </div>

            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {result.results.length > 0 ? (
                <ul className="space-y-2">
                    {result.results.map((r) => (
                        <li
                            key={r.characterId}
                            className="space-y-2 rounded border border-hairline/60 bg-surface/40 p-3"
                        >
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span
                                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                                        r.ok ? 'bg-jade' : r.skipReason ? 'bg-mute' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{r.name}</span>
                                <span className="text-mute">
                                    {r.anchored
                                        ? '已上鏈'
                                        : r.skipReason
                                          ? `skip: ${r.skipReason}`
                                          : r.ok
                                            ? 'dry-run'
                                            : `失敗${r.error ? `：${r.error}` : ''}`}
                                </span>
                                {typeof r.recalledCount === 'number' && r.recalledCount > 0 ? (
                                    <span className="rounded bg-jade/15 px-1.5 py-0.5 text-2xs text-jade">
                                        憶 {r.recalledCount}
                                    </span>
                                ) : null}
                                {r.digest ? (
                                    <a
                                        href={txUrl(r.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                                {r.commitmentId ? (
                                    <a
                                        href={objectUrl(r.commitmentId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cinnabar hover:underline"
                                    >
                                        commit
                                    </a>
                                ) : null}
                            </div>
                            {r.chapter ? (
                                <p className="max-w-prose whitespace-pre-wrap font-serif text-sm leading-loose text-ink/85">
                                    {r.chapter}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
