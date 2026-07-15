/**
 * VOICE COUNTER — who still has a voice at the table, and who has gone quiet.
 * ============================================================================
 * A mind that has stopped contending stops SPEAKING: it withdraws into pure
 * interiority (parenthetical actions, unvoiced thought) and lets the others hold
 * the table. That is mechanically countable without any judge:
 *
 *   說話拍   beats containing quoted speech 「…」 or a spoken line
 *   點名拍   beats that address another by name (a claim on them)
 *   括號拍   beats that are nothing but interiority/stage action
 *
 * Used to answer "from when did 金鳳 stop wanting to contend?" by running the
 * same table at different formation stages and comparing these ratios — the only
 * variable being how much life the mind has behind it.
 *
 *   pnpm exec tsx experiments/mind-world/voice-counter.ts <出檔.md> [更多...]
 */
import * as fs from 'node:fs';

const FILES = process.argv.slice(2);
/** In this saga's beat format a mind writes （interiority / stage action） and
 *  then its spoken words as PLAIN TEXT — its own dialogue carries no 「」 at all.
 *  「」 appears only when it QUOTES what someone else said. So:
 *    outward speech = whatever survives stripping every parenthetical span
 *    quoted 「」     = evidence of listening, NOT of speaking
 *  Counting 「」 as speech scored 金鳳 at 29% and led me to call her silent when
 *  she in fact spoke in all seven beats and contended in every one of them
 *  (caught 2026-07-15 — the monitor only ever showed each beat's first line,
 *  which is the bracketed opener, and I generalised from the truncation). */
const stripBrackets = (s: string): string => s.replace(/（[^（）]*）/g, ' ').trim();
const outward = (s: string): string => stripBrackets(s).replace(/[\s\p{P}]/gu, '');
/** She said something aloud at this table. */
const speaksAloud = (s: string): boolean => outward(s).length >= 8;
/** Nothing outward at all — pure interiority, the shape of true withdrawal. */
const isBracketOnly = (s: string): boolean => outward(s).length < 8;

interface Stat { beats: number; speech: number; bracket: number; named: number; chars: number; said: number; inner: number }

function analyse(file: string): Record<string, Stat> {
    const md = fs.readFileSync(file, 'utf-8');
    const parts = md.split(/\*\*([^*]{2,4})\*\*/);
    const out: Record<string, Stat> = {};
    const who: string[] = [];
    for (let i = 1; i < parts.length - 1; i += 2) who.push(parts[i]);
    for (let i = 1; i < parts.length - 1; i += 2) {
        const n = parts[i];
        const t = parts[i + 1].replace(/^[：:\s]+/, '').trim();
        if (!t) continue;
        const s = (out[n] ??= { beats: 0, speech: 0, bracket: 0, named: 0, chars: 0, said: 0, inner: 0 });
        s.beats++;
        s.chars += t.length;
        const spoken = outward(t).length;
        s.said += spoken;
        s.inner += t.replace(/[\s\p{P}]/gu, '').length - spoken;
        if (speaksAloud(t)) s.speech++;
        if (isBracketOnly(t)) s.bracket++;
        // naming another participant = a claim addressed at them
        const others = [...new Set(who)].filter((o) => o !== n);
        if (others.some((o) => t.includes(o))) s.named++;
    }
    return out;
}

for (const f of FILES) {
    console.log(`\n■ ${f.split('/').pop()}`);
    const st = analyse(f);
    for (const [n, s] of Object.entries(st)) {
        const pct = (x: number): string => `${((x / s.beats) * 100).toFixed(0)}%`.padStart(4);
        const voiced = s.said + s.inner;
        console.log(
            `  ${n.padEnd(4)}｜拍=${String(s.beats).padStart(2)}  ` +
                `開口拍=${String(s.speech).padStart(2)} (${pct(s.speech)})  ` +
                `全內心拍=${String(s.bracket).padStart(2)} (${pct(s.bracket)})  ` +
                `點名對方=${String(s.named).padStart(2)} (${pct(s.named)})  ` +
                `對外字數=${String(Math.round(s.said / s.beats)).padStart(3)}/拍 ` +
                `(佔 ${((s.said / Math.max(1, voiced)) * 100).toFixed(0)}%)`,
        );
    }
}
