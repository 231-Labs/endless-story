'use client';

/**
 * LabCharacterSheet — 角色譜（character codex）：一頁 RPG 式角色幕，披這座戲的水墨皮。
 * 左（窄屏為上）是滿幅立繪柱：名款、行當、身心三計（乏／飢／緒）、此刻執念與最新
 * 一言壓在墨色漸層上，如角色選擇畫面；右是譜頁 —— 總覽（驅動＋羈絆＋此身，探索入口）／
 * 執念（全帳張力，主線最盛）／羈絆（我看眾人，溫度數值＋相待之衡，點頭像即換人）／
 * 身世（其人＋恆常自我＋心底事）／身家（銀錢＋物品欄）／憶（LocalRecall）／述（逐拍自述）／
 * 影（圖庫）。點羈絆卡即把內頁翻到那個人 —— 順著關係網一路探下去。
 * Operator cockpit：資訊一樣不少，數值（張力／溫度／身心）皆現，窗內質地以「幽」標記。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { labApi } from './useLab';
import type { LabCharacterLive } from '@/lib/lab/types';

type TabKey = 'overview' | 'wants' | 'bonds' | 'dossier' | 'skills' | 'estate' | 'memory' | 'pov' | 'media';
type Bond = LabCharacterLive['bonds'][number];
type Want = LabCharacterLive['wants'][number];

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

/** Layer → tint. 情/愛/戀 warm（rose）; 志/圖/業 ambition（cinnabar）; 恨/仇/怨 seal;
 *  else muted — same lens as 願榜, so the whole app speaks one colour language. */
function layerPalette(layer: string): { chip: string; bar: string } {
    if (/情|愛|戀|慾|溫|眷/.test(layer)) return { chip: 'border-rose-400/30 bg-rose-400/[0.07] text-rose-400/90', bar: 'bg-rose-400/70' };
    if (/志|圖|業|功|名|利|錢/.test(layer)) return { chip: 'border-cinnabar/30 bg-cinnabar/[0.07] text-cinnabar/90', bar: 'bg-cinnabar/70' };
    if (/恨|仇|怨|懼|怕/.test(layer)) return { chip: 'border-seal/30 bg-seal/[0.08] text-seal/90', bar: 'bg-seal/75' };
    return { chip: 'border-hairline bg-ink/[0.04] text-mute', bar: 'bg-mute/60' };
}

/** 技藝 domain → tint (same lens family as 願榜/羈絆, so the whole app speaks one
 *  colour language). Stage arts（唱/身/口）warm rose; word arts（文/談）cinnabar;
 *  perception / craft / bearing（眼/手/風/處世 & any new kind）muted. */
function skillKindPalette(kind: string): { chip: string; dot: string } {
    if (/唱|身|口/.test(kind)) return { chip: 'border-rose-400/30 bg-rose-400/[0.07] text-rose-400/90', dot: 'bg-rose-400/70' };
    if (/文|談/.test(kind)) return { chip: 'border-cinnabar/30 bg-cinnabar/[0.07] text-cinnabar/90', dot: 'bg-cinnabar/70' };
    return { chip: 'border-hairline bg-ink/[0.05] text-mute', dot: 'bg-mute/60' };
}

/** 溫度 tint — the emotional NUMBER read as colour. Tone leads (關係語 tells warm
 *  vs cold); when there is no edge, the coarse warmth bucket decides. */
const WARM_TONE = /戀|慕|愛|親|暖|友|情|眷|恩|睦/;
const COLD_TONE = /妒|怨|恨|冷|敵|競|仇|懼|嫌/;
function bondPalette(tone: string | undefined, warmth: number): { bar: string; label: string } {
    const warm = tone ? WARM_TONE.test(tone) : warmth >= 0.65;
    const cold = tone ? COLD_TONE.test(tone) : warmth <= 0.35;
    if (warm && !cold) return { bar: 'bg-rose-400/70', label: '暖' };
    if (cold && !warm) return { bar: 'bg-seal/70', label: '寒' };
    if (warmth >= 0.65) return { bar: 'bg-rose-400/60', label: '暖' };
    if (warmth <= 0.35) return { bar: 'bg-seal/60', label: '寒' };
    return { bar: 'bg-cinnabar/50', label: '平' };
}

/** MUTUAL vs one-sided — compares this→other against other→this. */
function mutualCue(delta: number): { show: boolean; label: string } {
    if (Math.abs(delta) < 0.12) return { show: false, label: '' };
    return delta > 0 ? { show: true, label: '你待TA更暖' } : { show: true, label: 'TA待你更暖' };
}

/** 名頭 (public renown) descriptor — mirrors the engine's `renownLabel` thresholds
 *  (0.8／0.6／0.4／0.2) so the 內頁 speaks the same street-word as the percepts. */
function renownWord(v: number): string {
    if (v >= 0.8) return '名滿上海';
    if (v >= 0.6) return '名頭正盛';
    if (v >= 0.4) return '小有名氣';
    if (v >= 0.2) return '無甚名氣';
    return '名頭黯淡';
}

/** 自視 (private self-regard) descriptor — the inner voice, mirrors the engine's
 *  `selfRegardLabel`. May diverge from 名頭 (名頭正盛 outside, 心裡發虛 within). */
function selfRegardWord(v: number): string {
    if (v >= 0.8) return '自負得很';
    if (v >= 0.6) return '頗自許';
    if (v >= 0.4) return '尚算託底';
    if (v >= 0.2) return '心裡不踏實';
    return '心裡發虛';
}

/** 立繪柱身心計 — thin white-on-dark gauge. */
function Gauge({ label, value, tone, title }: { label: string; value: number; tone: string; title: string }) {
    const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
    return (
        <div className="flex items-center gap-2" title={`${title} ${value.toFixed(2)}`}>
            <span className="w-4 shrink-0 font-serif text-2xs tracking-[0.2em] text-white/80">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <div className={`h-full rounded-full ${tone} transition-[width] duration-700 ${EASE}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 shrink-0 text-right font-serif text-2xs tabular-nums text-white/70">{pct}</span>
        </div>
    );
}

/** 小圓像 — circular portrait chip, initial-fallback on cinnabar. */
function PortraitChip({ name, url, cls, textCls }: { name: string; url?: string; cls: string; textCls: string }) {
    return url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover object-top`} />
    ) : (
        <span className={`${cls} ${textCls} flex shrink-0 items-center justify-center rounded-full bg-cinnabar/80 font-serif text-white`}>
            {name.slice(0, 1)}
        </span>
    );
}

function SectionHead({ title, count, moreLabel, onMore }: { title: string; count?: number; moreLabel?: string; onMore?: () => void }) {
    return (
        <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">{title}</h3>
            {count != null ? <span className="font-serif text-2xs tabular-nums text-mute/50">{count}</span> : null}
            {moreLabel && onMore ? (
                <button type="button" onClick={onMore} className="ml-auto font-serif text-2xs tracking-[0.2em] text-cinnabar/80 transition hover:text-cinnabar">
                    {moreLabel}
                </button>
            ) : null}
        </div>
    );
}

/** 打算 —— parsed out of the flat `char.plan` string. Any of the three sections
 *  may be absent; when the string carries none of the markers, `raw` holds the
 *  whole thing so it can still show as a single 打算 block. */
type ParsedPlan = {
    longGoal?: string; // 長期目標 —— the north star
    nowPlan?: string; // 眼下打算 —— what they are about to do
    todos: string[]; // 未竟之事 —— checklist rows
    raw?: string; // fallback: the whole plan when no markers were found
};

/** 未竟之事 body → individual rows: split on " - " / a leading "- " (also tolerates
 *  newline-delimited "- " rows and "•" bullets); trims; drops empties. */
function splitTodoItems(body: string): string[] {
    return body
        .replace(/^\s*[-•]\s*/, '') // drop a single leading bullet
        .split(/\s+[-•]\s+/) // items separated by " - " / " • "
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Parse `char.plan`. Tolerates half/full-width brackets around the markers
 *  (`[長期目標]` or `【長期目標】`) and arbitrary surrounding whitespace, and is
 *  robust to any subset of the three sections being present. Returns null only for
 *  an empty/whitespace plan. Pure — never throws. */
function parsePlan(plan?: string | null): ParsedPlan | null {
    const s = (plan ?? '').trim();
    if (!s) return null;
    const markerRe = /[[【]\s*(長期目標|眼下打算|未竟之事)\s*[\]】]/g;
    const hits: Array<{ key: string; from: number; to: number }> = [];
    for (let m = markerRe.exec(s); m; m = markerRe.exec(s)) {
        hits.push({ key: m[1], from: m.index, to: markerRe.lastIndex });
    }
    if (!hits.length) return { todos: [], raw: s };
    const out: ParsedPlan = { todos: [] };
    hits.forEach((h, i) => {
        const bodyEnd = i + 1 < hits.length ? hits[i + 1].from : s.length;
        const body = s.slice(h.to, bodyEnd).trim();
        if (h.key === '長期目標') out.longGoal = body || undefined;
        else if (h.key === '眼下打算') out.nowPlan = body || undefined;
        else out.todos = splitTodoItems(body);
    });
    return out;
}

/** 打算一段 —— a labelled plan block: a small cinnabar glyph badge + eyebrow label
 *  over an ink rail, matching the sheet's 絹本/serif section vocabulary. */
function PlanBlock({ glyph, label, count, children }: { glyph: string; label: string; count?: number; children: ReactNode }) {
    return (
        <div className="animate-beat-in">
            <div className="flex items-center gap-1.5">
                <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-cinnabar/25 bg-cinnabar/[0.06] font-serif text-[11px] leading-none text-cinnabar/80">
                    {glyph}
                </span>
                <span className="font-serif text-2xs tracking-[0.25em] text-mute">{label}</span>
                {count != null ? <span className="font-serif text-2xs tabular-nums text-mute/45">{count}</span> : null}
            </div>
            <div className="ml-[8px] mt-1.5 border-l-2 border-cinnabar/20 pl-3">{children}</div>
        </div>
    );
}

/** 執念卡 — a quest card. The hottest want is 主線 (dominant); the rest 支線. */
function WantCard({ want, hero, target, onSelectCharacter }: {
    want: Want;
    hero?: boolean;
    target?: { name: string; portraitUrl?: string; id?: string };
    onSelectCharacter?: (id: string) => void;
}) {
    const pal = layerPalette(want.layer);
    const pct = Math.max(4, Math.min(100, Math.round(want.tension * 100)));
    const targetTappable = Boolean(target?.id && onSelectCharacter);
    return (
        <div className={`animate-beat-in rounded-lg border bg-canvas/70 p-3 backdrop-blur-sm dark:bg-white/[0.03] ${hero ? 'border-cinnabar/40 shadow-[0_2px_16px_rgba(176,74,60,0.12)]' : 'border-hairline'}`}>
            <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-sm border px-1.5 py-px font-serif text-[10px] tracking-[0.12em] ${pal.chip}`}>{want.layer}</span>
                <span className={`font-serif text-[10px] tracking-[0.2em] ${hero ? 'text-cinnabar/80' : 'text-mute/55'}`}>{hero ? '主線' : '支線'}</span>
                <span className="ml-auto shrink-0 font-serif text-2xs tabular-nums text-mute/80">{want.tension.toFixed(2)}</span>
            </div>
            <p className={`mt-1.5 font-serif leading-relaxed text-ink/90 ${hero ? 'text-base' : 'text-sm'}`}>{want.desc}</p>
            {target ? (
                <div className="mt-1.5">
                    {targetTappable ? (
                        <button
                            type="button"
                            onClick={() => { if (target.id) onSelectCharacter?.(target.id); }}
                            title={`往「${target.name}」內頁`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-ink/[0.03] py-0.5 pl-0.5 pr-2 transition hover:border-cinnabar/40 dark:bg-white/[0.04]"
                        >
                            <PortraitChip name={target.name} url={target.portraitUrl} cls="h-5 w-5" textCls="text-[9px]" />
                            <span className="font-serif text-2xs tracking-[0.1em] text-jade/90">往 {target.name} →</span>
                        </button>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 font-serif text-2xs tracking-[0.1em] text-jade/90">
                            <span aria-hidden>→</span>{target.name}
                        </span>
                    )}
                </div>
            ) : null}
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/10">
                <span className={`block h-full rounded-full ${pal.bar}`} style={{ width: `${pct}%` }} />
            </span>
        </div>
    );
}

/** 相識分寸 chip — how well this character knows the other. Only rendered when it
 *  adds signal (面生／認得); a fully-'named' acquaintance needs no chip, and a
 *  flag-off world reports 'named' everywhere (so nothing shows). Subtle by design. */
function acquaintChip(acquaint?: 'stranger' | 'acquainted' | 'named') {
    if (!acquaint || acquaint === 'named') return null;
    const label = acquaint === 'stranger' ? '面生' : '認得';
    return (
        <span className="rounded-sm border border-hairline bg-ink/[0.04] px-1.5 py-px font-serif text-[10px] tracking-[0.15em] text-mute/80">{label}</span>
    );
}

/** 羈絆卡 — a social-link card. Tapping the portrait/name traverses the sheet to
 *  that person. Warmth is the emotional NUMBER; a ⇄ cue hints mutual vs one-sided. */
function BondCard({ bond, compact, onSelectCharacter }: {
    bond: Bond;
    compact?: boolean;
    onSelectCharacter?: (id: string) => void;
}) {
    const pal = bondPalette(bond.tone, bond.warmth);
    const pct = Math.max(4, Math.min(100, Math.round(bond.warmth * 100)));
    const mutual = mutualCue(bond.warmth - bond.warmthBack);
    return (
        <div className="animate-beat-in rounded-lg border border-hairline bg-canvas/70 p-3 backdrop-blur-sm transition hover:border-cinnabar/40 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={() => onSelectCharacter?.(bond.id)}
                    title={`往「${bond.name}」內頁`}
                    className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                    <PortraitChip name={bond.name} url={bond.portraitUrl} cls="h-9 w-9" textCls="text-sm" />
                    <span className="min-w-0">
                        <span className="flex items-baseline gap-1.5">
                            <span className="truncate font-serif text-sm tracking-[0.08em] text-ink/90 transition group-hover:text-cinnabar">{bond.name}</span>
                            {bond.role ? <span className="shrink-0 font-serif text-[10px] tracking-[0.1em] text-mute/70">{bond.role}</span> : null}
                        </span>
                        {/* 相識分寸: how THIS character refers to the other, when it differs
                            from the canonical name (i.e. they don't know the full name). */}
                        {bond.perceivedName && bond.perceivedName !== bond.name ? (
                            <span className="mt-0.5 block truncate font-serif text-2xs tracking-[0.12em] text-mute/80">稱：{bond.perceivedName}</span>
                        ) : null}
                        {bond.tone ? <span className="mt-0.5 block truncate font-serif text-2xs tracking-[0.12em] text-mute">{bond.tone}</span> : null}
                    </span>
                </button>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {acquaintChip(bond.acquaint)}
                    {bond.established ? (
                        <span className="rounded-sm border border-jade/40 bg-jade/[0.08] px-1.5 py-px font-serif text-[10px] tracking-[0.15em] text-jade/90">相許</span>
                    ) : null}
                    <span aria-hidden className="font-serif text-xs text-mute/40">→</span>
                </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2" title={`溫度 ${bond.warmth.toFixed(2)}　TA待你 ${bond.warmthBack.toFixed(2)}`}>
                <span className="w-4 shrink-0 text-center font-serif text-2xs text-mute/70">{pal.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/10">
                    <span className={`block h-full rounded-full ${pal.bar} transition-[width] duration-700 ${EASE}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right font-serif text-2xs tabular-nums text-mute/80">{bond.warmth.toFixed(2)}</span>
            </div>
            {mutual.show ? (
                <p className="mt-1 flex items-center gap-1 font-serif text-[10px] tracking-[0.12em] text-mute/60" title={`TA待你 ${bond.warmthBack.toFixed(2)}`}>
                    <span aria-hidden>⇄</span>{mutual.label}
                </p>
            ) : null}

            {bond.line ? (
                <p className={`mt-2 border-l-2 border-hairline/70 pl-2.5 font-serif text-sm leading-relaxed text-ink/80 ${compact ? 'line-clamp-2' : ''}`}>{bond.line}</p>
            ) : null}
        </div>
    );
}

/** 技藝卡 — an RPG "ability" row: domain chip + skill name (serif, prominent) +
 *  a ●-dot 造詣 indicator (1–5 when present), the style descriptor as the sub-line. */
function SkillRow({ skill }: { skill: LabCharacterLive['skills'][number] }) {
    const pal = skillKindPalette(skill.kind);
    const lvl = skill.level && skill.level > 0 ? Math.min(5, Math.round(skill.level)) : 0;
    return (
        <div className="animate-beat-in rounded-lg border border-hairline bg-canvas/70 p-3 backdrop-blur-sm dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-sm border px-1.5 py-px font-serif text-[10px] tracking-[0.15em] ${pal.chip}`}>{skill.kind}</span>
                <span className="font-serif text-base tracking-[0.08em] text-ink/90">{skill.name}</span>
                {lvl ? (
                    <span className="ml-auto flex shrink-0 items-center gap-0.5" title={`造詣 ${lvl}／5`} aria-label={`造詣 ${lvl} 之 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < lvl ? pal.dot : 'bg-ink/10 dark:bg-white/[0.12]'}`} />
                        ))}
                    </span>
                ) : null}
            </div>
            <p className="mt-1.5 font-serif text-sm leading-relaxed text-ink/75">{skill.style}</p>
            {skill.note ? <p className="mt-1 font-serif text-2xs tracking-[0.12em] text-mute/70">{skill.note}</p> : null}
        </div>
    );
}

/** 鑰匙牌 — 常 (standing, durable jade) vs 次 (one-time, cinnabar). */
function KeyChip({ kind }: { kind: 'standing' | 'oneTime' }) {
    return kind === 'standing' ? (
        <span title="半永久 · 常持之鑰" className="shrink-0 rounded-sm border border-jade/40 bg-jade/[0.08] px-1.5 py-px font-serif text-[10px] tracking-[0.15em] text-jade/90">常</span>
    ) : (
        <span title="一次性 · 用一回便收" className="shrink-0 rounded-sm border border-cinnabar/40 bg-cinnabar/[0.08] px-1.5 py-px font-serif text-[10px] tracking-[0.15em] text-cinnabar/90">次</span>
    );
}

/** 述頁讀者字級 —— the reading-view font sizes the operator can step through. */
const READER_SCALES = [0.9, 1, 1.15, 1.32, 1.52, 1.75] as const;

/** 述文分塊 —— the woven POV body carries light markup: `# 場景題`, `---` 分隔線,
 *  and prose / 對白 paragraphs. Parse it so the 述頁 renders as a page, not raw
 *  pre-wrapped text. Pure; tolerant of blank lines and half/full-width rules. */
type ProseBlock = { kind: 'head' | 'rule' | 'para'; text: string };
function parseProse(body: string): ProseBlock[] {
    const out: ProseBlock[] = [];
    for (const raw of body.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const h = /^#{1,4}\s*(.+)$/.exec(line);
        if (h) { out.push({ kind: 'head', text: h[1].trim() }); continue; }
        if (/^([-–—]{2,}|·{3,}|\*{3,}|—+)$/.test(line)) { out.push({ kind: 'rule', text: '' }); continue; }
        out.push({ kind: 'para', text: line });
    }
    return out;
}

/** 述頁 —— one POV body as a reading page: centred 場景題, ornamental 分隔, and
 *  首行縮排 paragraphs at book line-height. Font-size is inherited from the
 *  reader-scaled container, so everything zooms together. */
function NarrativeProse({ body }: { body: string }) {
    const blocks = useMemo(() => parseProse(body), [body]);
    return (
        <div className="space-y-[0.72em]" style={{ lineHeight: 1.95 }}>
            {blocks.map((b, i) => {
                if (b.kind === 'head') {
                    return (
                        <div key={i} className="flex items-center justify-center gap-3 pt-[0.5em]">
                            <span aria-hidden className="h-px w-8 bg-cinnabar/25" />
                            <span className="font-serif text-[1.02em] tracking-[0.22em] text-cinnabar/80">{b.text}</span>
                            <span aria-hidden className="h-px w-8 bg-cinnabar/25" />
                        </div>
                    );
                }
                if (b.kind === 'rule') {
                    return <div key={i} aria-hidden className="py-[0.15em] text-center font-serif text-[0.8em] tracking-[0.6em] text-cinnabar/25">❖</div>;
                }
                return <p key={i} className="font-serif text-ink/90" style={{ textIndent: '2em' }}>{b.text}</p>;
            })}
        </div>
    );
}

export function LabCharacterSheet({ runId, character: c, onClose, onJumpToScene, onSelectCharacter }: {
    runId: string;
    character: LabCharacterLive;
    onClose: () => void;
    onJumpToScene?: (sceneId: string) => void;
    /** 順羈絆換人 —— tapping a bonded character re-opens the sheet on THEM. */
    onSelectCharacter?: (characterId: string) => void;
}) {
    const [tab, setTab] = useState<TabKey>('overview');
    const [memories, setMemories] = useState<Array<{ seq: number; content: string; kind: string; day: number; importance: number }>>([]);
    const [memErr, setMemErr] = useState<string | null>(null);
    /** 自述 —— 以此人為主角、逐拍第一人稱的連貫視角（tick eventPovs 依 characterId 濾）。 */
    const [povs, setPovs] = useState<Array<{ day: number; tick: number; scene: string; body: string }>>([]);
    /** 燈箱 —— 點圖放大，點任一處或 Esc 收。 */
    const [zoomUrl, setZoomUrl] = useState<string | null>(null);
    /** 述頁讀者字級 —— index into READER_SCALES, persisted so it sticks across卷/角色. */
    const [readerIdx, setReaderIdx] = useState(1);
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem('es-lab-reader-scale'));
            if (Number.isInteger(saved) && saved >= 0 && saved < READER_SCALES.length) setReaderIdx(saved);
        } catch { /* no storage — keep the default */ }
    }, []);
    const stepReader = (delta: number) =>
        setReaderIdx((i) => {
            const next = Math.max(0, Math.min(READER_SCALES.length - 1, i + delta));
            try { localStorage.setItem('es-lab-reader-scale', String(next)); } catch { /* no storage */ }
            return next;
        });

    /** name → bond, so a want's target (a name string) can borrow the bonded
     *  person's portrait + id and become tappable — the same traversal loop. */
    const bondByName = useMemo(() => {
        const map = new Map<string, Bond>();
        for (const b of c.bonds) map.set(b.name, b);
        return map;
    }, [c.bonds]);
    const resolveTarget = (targetName?: string) => {
        if (!targetName) return undefined;
        const b = bondByName.get(targetName);
        return { name: targetName, portraitUrl: b?.portraitUrl, id: b?.id };
    };

    /** 打算 —— parse the flat plan string into 長期目標／眼下打算／未竟之事. */
    const plan = useMemo(() => parsePlan(c.plan), [c.plan]);

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
    const hottest = c.wants[0];
    const tabs: Array<{ key: TabKey; label: string; count?: number; title: string }> = [
        { key: 'overview', label: '總覽', title: '一眼看盡：驅動（心事）／羈絆（關係）／此身（所在與打算）' },
        { key: 'wants', label: '執念', count: c.wants.length, title: '全部活著的心事，張力排序 —— 最盛者為主線' },
        { key: 'bonds', label: '羈絆', count: c.bonds.length, title: '我看眾人 —— 關係語、溫度數值、相待之衡；點頭像即翻到那人' },
        { key: 'dossier', label: '身世', title: '其人・恆常自我・心底事' },
        { key: 'skills', label: '技藝', count: c.skills.length, title: '看家本事：一身風格與行事之道（貫在言行裡的底色）' },
        { key: 'estate', label: '身家', count: c.carrying.length, title: '身上的錢與隨身物品欄' },
        { key: 'memory', label: '憶', count: memories.length, title: 'LocalRecall 全帳（植入／焚去到「物界 → 記憶」）' },
        { key: 'pov', label: '述', count: povs.length, title: '以此人為主角、逐拍第一人稱的連貫視角（眾聲之一線）' },
        { key: 'media', label: '影', count: c.gallery.length, title: '圖庫多媒體：多圖＋影片' },
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
                        {hottest ? (
                            <p className="mt-3 flex items-baseline gap-1.5 font-serif text-xs leading-relaxed" title={`此刻執念 · ${hottest.layer} ${hottest.tension.toFixed(2)}`}>
                                <span className="shrink-0 rounded-sm bg-white/15 px-1.5 py-px font-serif text-[10px] tracking-[0.2em] text-white/85">執念</span>
                                <span className="line-clamp-1 text-white/85">{hottest.desc}</span>
                            </p>
                        ) : null}
                        {c.latestLine ? (
                            <p className="mt-2.5 line-clamp-2 font-serif text-xs leading-relaxed text-white/70" title={`${c.latestLine.clock} · ${c.latestLine.sceneName}`}>
                                「{c.latestLine.text}」
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* 譜頁柱 —— RPG 式選單 */}
                <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4 sm:px-8">
                    {/* 巨字水印 */}
                    <span aria-hidden className="pointer-events-none absolute -right-4 -top-2 select-none font-serif text-[26vh] leading-none text-ink/[0.045] dark:text-white/[0.04]">
                        {c.name.slice(0, 1)}
                    </span>

                    {/* 內容置中一柱 —— 寬屏不再左偏一邊 */}
                    <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
                        <nav className="flex items-center gap-0.5 overflow-x-auto border-b border-hairline/60 no-scrollbar">
                            {tabs.map((t) => {
                                const on = tab === t.key;
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => setTab(t.key)}
                                        title={t.title}
                                        aria-current={on ? 'page' : undefined}
                                        className={`group relative shrink-0 px-3 py-2.5 font-serif text-xs tracking-[0.2em] transition ${on ? 'text-cinnabar' : 'text-mute hover:text-ink'}`}
                                    >
                                        <span className="inline-flex items-baseline gap-1">
                                            {t.label}
                                            {t.count != null ? <span className={`text-[10px] tabular-nums ${on ? 'text-cinnabar/70' : 'text-mute/50'}`}>{t.count}</span> : null}
                                        </span>
                                        {on ? <motion.span layoutId="es-codex-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cinnabar" /> : null}
                                    </button>
                                );
                            })}
                            <button type="button" onClick={onClose} className="es-icon-button ml-auto shrink-0" aria-label="合上內頁">↩</button>
                        </nav>

                        <div className="relative mt-4 min-h-0 flex-1 overflow-y-auto pb-2 pr-1 no-scrollbar">
                            {/* ── 總覽 —— 探索入口 ───────────────────────────────── */}
                            {tab === 'overview' ? (
                                <div className="space-y-6">
                                    <section>
                                        <SectionHead title="驅動" count={c.wants.length} moreLabel={c.wants.length > 3 ? `全部 ${c.wants.length} →` : undefined} onMore={() => setTab('wants')} />
                                        {c.wants.length ? (
                                            <div className="mt-2.5 space-y-2">
                                                {c.wants.slice(0, 3).map((w, i) => (
                                                    <WantCard key={i} want={w} hero={i === 0} target={resolveTarget(w.target)} onSelectCharacter={onSelectCharacter} />
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-2 font-serif text-sm text-mute/70">心無罣礙。</p>
                                        )}
                                    </section>

                                    <section>
                                        <SectionHead title="羈絆" count={c.bonds.length} moreLabel={c.bonds.length > 4 ? `全部 ${c.bonds.length} →` : undefined} onMore={() => setTab('bonds')} />
                                        {c.bonds.length ? (
                                            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                                                {c.bonds.slice(0, 4).map((b) => (
                                                    <BondCard key={b.id} bond={b} compact onSelectCharacter={onSelectCharacter} />
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-2 font-serif text-sm text-mute/70">眼中尚無他人。</p>
                                        )}
                                    </section>

                                    <section>
                                        <SectionHead title="此身" />
                                        <div className="mt-2.5 space-y-4 rounded-lg border border-hairline bg-canvas/70 p-3.5 dark:bg-white/[0.03]">
                                            {/* 現於 —— 當下所在（點開其場景）。身心三計已在立繪柱常現，此處不再重出 */}
                                            <button
                                                type="button"
                                                onClick={() => c.sceneId && onJumpToScene?.(c.sceneId)}
                                                title="開其所在場景"
                                                className="group flex w-full items-baseline gap-1.5 font-serif text-sm tracking-[0.08em] text-ink/85 transition hover:text-cinnabar"
                                            >
                                                <span className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute/70">現於</span>
                                                <span className="truncate">{c.sceneName}</span>
                                                <span aria-hidden className="shrink-0 text-mute/45 transition group-hover:text-cinnabar">→</span>
                                            </button>

                                            {/* 打算 —— 長期目標／眼下打算／未竟之事，各成一段 */}
                                            {plan ? (
                                                plan.raw ? (
                                                    <PlanBlock glyph="算" label="打算">
                                                        <p className="font-serif text-sm leading-relaxed text-ink/85">{plan.raw}</p>
                                                    </PlanBlock>
                                                ) : plan.longGoal || plan.nowPlan || plan.todos.length ? (
                                                    <div className="space-y-4">
                                                        {plan.longGoal ? (
                                                            <PlanBlock glyph="遠" label="長期目標">
                                                                <p className="font-serif text-sm leading-relaxed text-ink/85">{plan.longGoal}</p>
                                                            </PlanBlock>
                                                        ) : null}
                                                        {plan.nowPlan ? (
                                                            <PlanBlock glyph="近" label="眼下打算">
                                                                <p className="font-serif text-sm leading-relaxed text-ink/85">{plan.nowPlan}</p>
                                                            </PlanBlock>
                                                        ) : null}
                                                        {plan.todos.length ? (
                                                            <PlanBlock glyph="未" label="未竟之事" count={plan.todos.length}>
                                                                <ul className="space-y-1.5">
                                                                    {plan.todos.map((t, i) => (
                                                                        <li key={i} className="flex items-start gap-2">
                                                                            <span aria-hidden className="mt-[0.42em] h-[9px] w-[9px] shrink-0 rounded-[3px] border border-cinnabar/45" />
                                                                            <span className="font-serif text-sm leading-relaxed text-ink/85">{t}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </PlanBlock>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <p className="font-serif text-sm text-mute/70">尚無打算。</p>
                                                )
                                            ) : (
                                                <p className="font-serif text-sm text-mute/70">尚無打算。</p>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {/* ── 執念 —— 全帳，主線最盛 ─────────────────────────── */}
                            {tab === 'wants' ? (
                                c.wants.length ? (
                                    <div className="space-y-2.5">
                                        {c.wants.map((w, i) => (
                                            <WantCard key={i} want={w} hero={i === 0} target={resolveTarget(w.target)} onSelectCharacter={onSelectCharacter} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="font-serif text-sm text-mute/70">心無罣礙。</p>
                                )
                            ) : null}

                            {/* ── 羈絆 —— 情感數值中樞，點頭像即換人 ──────────────── */}
                            {tab === 'bonds' ? (
                                c.bonds.length ? (
                                    <div className="grid gap-2.5 sm:grid-cols-2">
                                        {c.bonds.map((b) => (
                                            <BondCard key={b.id} bond={b} onSelectCharacter={onSelectCharacter} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="font-serif text-sm text-mute/70">眼中尚無他人 —— 走幾拍，關係自會生根。</p>
                                )
                            ) : null}

                            {/* ── 身世 ──────────────────────────────────────────── */}
                            {tab === 'dossier' ? (
                                <div className="max-w-2xl space-y-5">
                                    <section className="animate-beat-in">
                                        <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">其人</h3>
                                        <p className="mt-2 font-serif text-sm leading-relaxed text-ink/85">{c.description}</p>
                                    </section>
                                    {/* 名頭 —— 公論之口碑（公開），自視為裡（私），僅在此卷種下名頭時現 */}
                                    {c.renown !== undefined ? (
                                        <section className="animate-beat-in">
                                            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">名頭</h3>
                                            <div className="mt-2 flex items-center gap-2.5" title={`口碑（滿街公論）${c.renown.toFixed(2)}`}>
                                                <span className="shrink-0 font-serif text-sm tracking-[0.08em] text-ink/85">{renownWord(c.renown)}</span>
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                                                    <div className="h-full rounded-full bg-cinnabar/70 transition-[width] duration-700" style={{ width: `${Math.round(c.renown * 100)}%` }} />
                                                </div>
                                                <span className="w-7 shrink-0 text-right font-serif text-2xs tabular-nums text-mute/70">{Math.round(c.renown * 100)}</span>
                                            </div>
                                            {c.selfRegard !== undefined ? (
                                                <p className="mt-1.5 font-serif text-2xs leading-relaxed text-mute/70">自視 · 幽：{selfRegardWord(c.selfRegard)}（心裡掂量自己的斤兩）</p>
                                            ) : null}
                                        </section>
                                    ) : null}
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

                            {/* ── 技藝 —— 看家本事與行事風格 ─────────────────────── */}
                            {tab === 'skills' ? (
                                c.skills.length ? (
                                    <div className="space-y-2.5">
                                        {c.skills.map((s, i) => (
                                            <SkillRow key={`${s.kind}-${s.name}-${i}`} skill={s} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="font-serif text-sm text-mute/70">尚無載錄的技藝。</p>
                                )
                            ) : null}

                            {/* ── 身家 ──────────────────────────────────────────── */}
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

                                    {/* 居所 —— 居所 tenure：自有屋主 / 租住(屋主 X) / 公處借宿 */}
                                    {c.home ? (
                                        <section className="animate-beat-in">
                                            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">居所</h3>
                                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1.5 dark:bg-white/[0.03]">
                                                <span aria-hidden className="shrink-0 font-serif text-sm text-cinnabar/70">居</span>
                                                <span className="min-w-0 flex-1 truncate font-serif text-sm text-ink/85">
                                                    {c.home.tenure === 'own'
                                                        ? `自有 · ${c.home.sceneName}`
                                                        : c.home.tenure === 'rent'
                                                          ? `租住 · ${c.home.sceneName}（屋主：${c.home.ownerNames.join('、')}）${c.home.rentYuan !== undefined ? `，租金 ${c.home.rentYuan}圓` : ''}`
                                                          : `借宿 · ${c.home.sceneName}`}
                                                </span>
                                            </div>
                                        </section>
                                    ) : null}

                                    {/* 收租 —— rentals this character is the landlord of (leases they own) */}
                                    {c.rentalsOut?.length ? (
                                        <section className="animate-beat-in">
                                            <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">收租</h3>
                                            <ul className="mt-2 space-y-1.5">
                                                {c.rentalsOut.map((r) => (
                                                    <li
                                                        key={r.sceneName}
                                                        className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1.5 dark:bg-white/[0.03]"
                                                    >
                                                        <span aria-hidden className="shrink-0 font-serif text-sm text-cinnabar/70">租</span>
                                                        <span className="min-w-0 flex-1 truncate font-serif text-sm text-ink/85">
                                                            {r.sceneName}（租客 {r.tenantName}{r.rentYuan !== undefined ? `，${r.rentYuan}圓` : ''}）
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    ) : null}

                                    {/* 持鑰 —— 訪問權限：你能進的私處、與持你家鑰匙的人 */}
                                    <section className="animate-beat-in">
                                        <h3 className="font-serif text-2xs tracking-[0.35em] text-mute">持鑰 · 訪問權限</h3>
                                        <div className="mt-2 grid gap-4 sm:grid-cols-2">
                                            {/* 你持有的鑰匙 —— which private places this character may enter as a guest */}
                                            <div>
                                                <p className="font-serif text-[10px] tracking-[0.2em] text-mute/70">你持有的鑰匙</p>
                                                {c.keys.holding.length ? (
                                                    <ul className="mt-1.5 space-y-1.5">
                                                        {c.keys.holding.map((k) => (
                                                            <li
                                                                key={k.sceneId}
                                                                className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1.5 dark:bg-white/[0.03]"
                                                            >
                                                                <span aria-hidden className="shrink-0 font-serif text-sm text-cinnabar/70">鑰</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onJumpToScene?.(k.sceneId)}
                                                                    title={`開「${k.sceneName}」`}
                                                                    className="min-w-0 flex-1 truncate text-left font-serif text-sm text-ink/85 transition hover:text-cinnabar"
                                                                >
                                                                    {k.sceneName}
                                                                </button>
                                                                <KeyChip kind={k.kind} />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="mt-1.5 font-serif text-sm text-mute/70">無旁人私處可自由出入。</p>
                                                )}
                                            </div>

                                            {/* 持你家鑰匙的 —— who holds a key to this character's own home */}
                                            <div>
                                                <p className="font-serif text-[10px] tracking-[0.2em] text-mute/70">持你家鑰匙的</p>
                                                {c.keys.myPlaceHolders.length ? (
                                                    <ul className="mt-1.5 space-y-1.5">
                                                        {c.keys.myPlaceHolders.map((h) => (
                                                            <li
                                                                key={h.id}
                                                                className="flex items-center gap-2 rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1.5 dark:bg-white/[0.03]"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onSelectCharacter?.(h.id)}
                                                                    title={`往「${h.name}」內頁`}
                                                                    className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                                                                >
                                                                    <PortraitChip name={h.name} url={h.portraitUrl} cls="h-6 w-6" textCls="text-[10px]" />
                                                                    <span className="truncate font-serif text-sm text-ink/85 transition group-hover:text-cinnabar">{h.name}</span>
                                                                </button>
                                                                <KeyChip kind={h.kind} />
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="mt-1.5 font-serif text-sm text-mute/70">你的門，只你自己開。</p>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {/* ── 憶 ────────────────────────────────────────────── */}
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

                            {/* ── 述 —— 讀卷處：以書頁排版渲染，字級讀者自控 ────────────── */}
                            {tab === 'pov' ? (
                                !povs.length ? (
                                    <p className="font-serif text-sm text-mute/70">尚無自述 —— 走幾拍，其視角自成一線（實錄卷才生 POV）。</p>
                                ) : (
                                    <div>
                                        {/* 讀者字級 —— 自控放大，記在 localStorage */}
                                        <div className="mb-4 flex items-center justify-end gap-2">
                                            <span className="font-serif text-2xs tracking-[0.2em] text-mute/55">字級</span>
                                            <button
                                                type="button"
                                                onClick={() => stepReader(-1)}
                                                disabled={readerIdx === 0}
                                                title="縮小"
                                                className="flex h-6 w-6 items-center justify-center rounded-md border border-hairline bg-canvas/70 font-serif text-sm leading-none text-ink/70 transition hover:border-cinnabar/40 hover:text-cinnabar disabled:opacity-30 dark:bg-white/[0.04]"
                                            >
                                                －
                                            </button>
                                            <span className="w-9 text-center font-serif text-2xs tabular-nums text-mute/70">{Math.round(READER_SCALES[readerIdx] * 100)}%</span>
                                            <button
                                                type="button"
                                                onClick={() => stepReader(1)}
                                                disabled={readerIdx === READER_SCALES.length - 1}
                                                title="放大"
                                                className="flex h-6 w-6 items-center justify-center rounded-md border border-hairline bg-canvas/70 font-serif text-sm leading-none text-ink/70 transition hover:border-cinnabar/40 hover:text-cinnabar disabled:opacity-30 dark:bg-white/[0.04]"
                                            >
                                                ＋
                                            </button>
                                        </div>
                                        {/* 讀卷 —— 舒適欄寬置中，字級隨 readerIdx 縮放，全篇同步 */}
                                        <div className="mx-auto max-w-[40em] space-y-[1.7em]" style={{ fontSize: `${Math.round(15.5 * READER_SCALES[readerIdx])}px` }}>
                                            {povs.map((p, i) => (
                                                <article key={i} className="animate-beat-in">
                                                    <p className="mb-[0.7em] flex items-center gap-2 font-serif text-[0.7em] tracking-[0.3em] text-mute/70">
                                                        <span aria-hidden className="inline-block h-1 w-1 shrink-0 rounded-full bg-cinnabar/60" />
                                                        第{p.day}日 · 第{p.tick}拍{p.scene ? ` · ${p.scene}` : ''}
                                                    </p>
                                                    <NarrativeProse body={p.body} />
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                )
                            ) : null}

                            {/* ── 影 ────────────────────────────────────────────── */}
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
