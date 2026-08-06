'use client';

/**
 * 外力與世情 —— what has been DONE to this world, and what it cost.
 *
 * Until this panel existed the whole macro-rhythm layer was invisible on the
 * stage: 月半結帳 landed, somebody 報了官, the director wrote a card the deck
 * never contained — and the only way to see any of it was to export the
 * diagnostics afterwards. A scroll you have to leave in order to read is a
 * scroll nobody reads while it is running.
 *
 * The panel is deliberately an AUDIT surface, not a control. Every row says who
 * decided it — 到日必打 (the clock), 導演選牌 / 導演自撰 (the director, within
 * bounds the engine enforces), 角色所為 (somebody in the world) — because the
 * whole point of the deck is that those authorities stay separated and legible.
 * Refused proposals are shown for the same reason: a director reaching past what
 * it is allowed is evidence, and silently swallowing it would hide the fence.
 *
 * 兩種態，因為這面板壓在油畫之上：收著時是貼右緣的一枚直書戲籤（「外力 · N 落」，
 * 有駁回或社會性死亡才加一顆硃點），幾乎不遮畫；點開才是審計盒，而「誰打的」那列
 * 就是展開後的第一眼——權責分列是這套牌組的全部意思，該在最上面，但不必時時佔著畫。
 *
 * Absent when the run carries no deck. An empty panel would read as「壞了」
 * rather than as「這一卷沒掛牌組」, which is a legitimate way to run.
 */

import { useState } from 'react';
import type { LabPressureLive, LabPressurePlay } from '@/lib/lab/live';

const CHOSEN_BY: Record<LabPressurePlay['chosenBy'], { zh: string; tone: string; hint: string }> = {
    deadline: { zh: '到日必打', tone: 'text-cinnabar', hint: '死線卡：到日就落，導演無權不打，只能穿戲服' },
    director: { zh: '導演選牌', tone: 'text-ink/70', hint: '導演從引擎算出的牌面裡挑的一張' },
    'director-proposed': { zh: '導演自撰', tone: 'text-amber-700 dark:text-amber-400', hint: '牌組沒有的一張，導演用同一套後果拼出來、引擎驗過才落地' },
    character: { zh: '角色所為', tone: 'text-jade', hint: '世情動作：這是世界裡的人自己做的，不是外力推的' },
    operator: { zh: '營運者', tone: 'text-mute', hint: '從 CLI／注資指令打進來的' },
};

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div className="flex gap-2" title={title}>
            <dt className="shrink-0 text-mute/70">{label}</dt>
            <dd className="min-w-0 text-ink/85">{value}</dd>
        </div>
    );
}

export function LabPressurePanel({
    pressure,
    /** 製作中 occupies the opposite corner. On a phone both cards are near
     *  full-width, so they would sit on top of each other; from `sm` up they are
     *  in different corners and no shift is needed. */
    shiftDown = false,
}: {
    pressure: LabPressureLive;
    shiftDown?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const { tally, vitals, plays, refused, standing } = pressure;
    const total = tally.deadline + tally.director + tally.proposed + tally.character + tally.operator;
    const latest = plays[0];
    const dead = standing.filter((row) => row.sociallyDead);
    const deckTitle = `外力牌組「${pressure.deckId}」：結帳死線、發俸分紅、導演選牌，以及角色自己做得出來的世情動作`;
    // 收合時貼著視窗右緣；展開才吃內距與寬度（top 兩種：製作中佔了對角就下移）
    const anchor = `pointer-events-auto absolute z-30 sm:top-5 ${shiftDown ? 'top-28' : 'top-3'}`;

    // 收合態 —— 一枚直書戲籤，只報「外力 N 落」，幾乎不遮畫
    if (!open) {
        return (
            <div className={`${anchor} right-0`}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    title={deckTitle}
                    className="flex flex-col items-center gap-1.5 rounded-l-md border border-r-0 border-hairline bg-canvas/75 px-1.5 py-3 shadow-sm backdrop-blur-sm transition hover:bg-canvas/90 dark:bg-black/55 dark:hover:bg-black/70"
                >
                    <span className="font-serif text-2xs tracking-[0.3em] text-cinnabar/85 [writing-mode:vertical-rl]">
                        外力 · <span className="[text-combine-upright:all]">{total}</span> 落
                    </span>
                    {refused.length || dead.length ? (
                        // 硃點：籤面不寫細節，但有駁回／社會性死亡時得看得出來「裡頭有事」
                        <span
                            className="h-1 w-1 shrink-0 rounded-full bg-cinnabar"
                            title={[
                                refused.length ? `導演自撰遭駁 ${refused.length}` : '',
                                dead.length ? `社會性死亡 ${dead.length}` : '',
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        />
                    ) : null}
                </button>
            </div>
        );
    }

    return (
        <div className={`${anchor} right-3 w-[min(22rem,calc(100%-1.5rem))] sm:right-5`}>
            <div className="overflow-hidden rounded-xl border border-hairline bg-canvas/80 shadow-[0_4px_20px_rgba(20,12,8,0.14)] backdrop-blur-md dark:bg-black/60">
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    title={deckTitle}
                >
                    <span className="font-serif text-2xs tracking-[0.35em] text-cinnabar/90">外力</span>
                    <span className="min-w-0 flex-1 truncate font-serif text-xs tracking-[0.12em] text-ink/90">
                        {latest ? `${latest.label}` : pressure.deckId}
                    </span>
                    <span className="shrink-0 font-serif text-2xs tracking-[0.14em] text-mute">{total} 落</span>
                    <span aria-hidden className="text-mute/70" title="收回籤態">▸</span>
                </button>

                <div className="max-h-[26rem] overflow-y-auto border-t border-hairline px-3 py-2.5">
                    {/* 誰打的 —— 展開後的第一眼：權責分列是這副牌組的全部意思 */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 pb-2.5 font-serif text-2xs tracking-[0.12em] text-mute">
                        <span title={CHOSEN_BY.deadline.hint}>死線 {tally.deadline}</span>
                        <span title={CHOSEN_BY.director.hint}>導演 {tally.director}</span>
                        <span title={CHOSEN_BY['director-proposed'].hint} className={tally.proposed ? 'text-amber-700 dark:text-amber-400' : ''}>
                            自撰 {tally.proposed}
                        </span>
                        <span title={CHOSEN_BY.character.hint} className={tally.character ? 'text-jade' : ''}>
                            世情 {tally.character}
                        </span>
                        {refused.length ? <span className="text-cinnabar/80" title="導演提的牌越了界，引擎連同理由駁回">駁 {refused.length}</span> : null}
                        {dead.length ? (
                            <span className="text-cinnabar" title="社會性死亡：一大半人轉冷、沒有一張暖臉、名頭見底——沒有人設這面旗，這是推導出來的">
                                社會性死亡 {dead.length}
                            </span>
                        ) : null}
                    </div>

                    {/* 生命體徵 —— the numbers the macro-rhythm work exists to move */}
                    {vitals ? (
                        <dl className="space-y-1 border-t border-hairline pt-2.5 font-serif text-2xs tracking-[0.1em] text-mute">
                            <Row
                                label="不可逆"
                                value={`本拍 ${vitals.irreversible}`}
                                title="這一拍留下幾件收不回來的事。長期為 0＝世界只是在說話"
                            />
                            <Row
                                label="心事"
                                value={`了結 ${vitals.wantsResolved}／在榜 ${vitals.wantsLive}（成事率 ${Math.round(vitals.resolvedRate * 100)}%）`}
                                title="願榜只進不出，是「什麼都不會發生」最早的症狀"
                            />
                            <Row
                                label="場景熵"
                                value={vitals.sceneEntropy < 0 ? '—（無人動作）' : `${vitals.sceneEntropy.toFixed(2)}　最擠一場 ${vitals.sceneCrowdPeak} 人`}
                                title="1＝散得開，0＝全班擠在同一間屋裡"
                            />
                            {vitals.convergence.length ? (
                                <Row
                                    label="趨同"
                                    value={vitals.convergence.map((c) => `「${c.token}」${c.characterIds.length} 人`).join('；')}
                                    title="全班同時伸手去拿同一樣東西——糖粥那種毛病"
                                />
                            ) : null}
                            {vitals.loops.length ? (
                                <Row
                                    label="迴圈"
                                    value={vitals.loops.map((l) => `「${l.token}」${l.ticks} 拍`).join('；')}
                                    title="同一個人反覆講同一句話"
                                />
                            ) : null}
                        </dl>
                    ) : null}

                    {/* 近日落牌 */}
                    {plays.length ? (
                        <ul className="mt-2.5 space-y-2 border-t border-hairline pt-2.5">
                            {plays.map((play, i) => {
                                const kind = CHOSEN_BY[play.chosenBy] ?? CHOSEN_BY.operator;
                                return (
                                    <li key={`${play.day}-${play.tick}-${play.cardId}-${i}`} className="font-serif text-2xs leading-relaxed">
                                        <div className="flex flex-wrap items-baseline gap-x-1.5 tracking-[0.1em]">
                                            <span className="text-mute/60">第{play.day}日</span>
                                            <span className={`${kind.tone} tracking-[0.2em]`} title={kind.hint}>{kind.zh}</span>
                                            <span className="text-ink/90">{play.label}</span>
                                            {play.actorName ? <span className="text-jade/90">· {play.actorName}</span> : null}
                                            {play.targetNames.length ? (
                                                <span className="text-mute" title="這張牌對準的人">對 {play.targetNames.join('、')}</span>
                                            ) : null}
                                            {play.irreversible ? (
                                                <span className="text-cinnabar/70" title="這一落留下幾件收不回來的事">不可逆 {play.irreversible}</span>
                                            ) : null}
                                        </div>
                                        {play.lines.map((line, j) => (
                                            <p key={j} className="mt-0.5 text-ink/70">{line}</p>
                                        ))}
                                        {play.rationale ? (
                                            <p className="mt-0.5 text-mute/70" title="導演的理由只進 log，不入世界">理由：{play.rationale}</p>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="mt-2.5 border-t border-hairline pt-2.5 font-serif text-2xs text-mute">牌組掛著，還沒有牌落下。</p>
                    )}

                    {/* 自撰遭駁 —— the fence, made visible */}
                    {refused.length ? (
                        <ul className="mt-2.5 space-y-1 border-t border-hairline pt-2.5 font-serif text-2xs leading-relaxed text-cinnabar/80">
                            {refused.map((row, i) => (
                                <li key={i}>· 第{row.day}日 導演自撰「{row.label}」不予採納：{row.problems.join('；')}</li>
                            ))}
                        </ul>
                    ) : null}

                    {/* 處境 —— derived from edges/bonds/renown; there is no stored ledger */}
                    {standing.length ? (
                        <div className="mt-2.5 border-t border-hairline pt-2.5">
                            <p className="font-serif text-2xs tracking-[0.3em] text-mute/70" title="街上怎麼看一個人，住在既有的關係圖裡——沒有第二本口碑帳">處境</p>
                            <ul className="mt-1 space-y-0.5 font-serif text-2xs tracking-[0.1em]">
                                {standing.map((row) => (
                                    <li key={row.characterId} className={row.sociallyDead ? 'text-cinnabar' : 'text-ink/75'}>
                                        {row.name}：冷 {row.cold}／暖 {row.warm}／名頭 {row.renown.toFixed(2)}
                                        {row.sociallyDead ? <span className="ml-1 tracking-[0.2em]">社會性死亡</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
