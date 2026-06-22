/**
 * NARRATIVE OBSERVATORY — RUNNER.
 *
 * Watches the STORY iterate (or loop) under an ideal fake chain + fake walrus, but a
 * REAL LLM and a REAL (in-memory) recall-capable memory. Unlike the mechanism harness
 * (three chain modes, fake LLM, memory off — studies the chain seam) this runs ONE
 * ideal chain and prints the actual prose each tick so a human can read whether the
 * narrative advances or circles the same standoff.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json \
 *     <node23> <tsx/cli.mjs> src/lib/actions/full-tick-harness/narrative.harness.ts [ticks=6]
 *
 * Or via pnpm (node 23 must be active): `pnpm --filter @endless-story/web harness:narrative`.
 *
 * KEYS (in packages/web/.env.local) for REAL iteration:
 *   ZAI_API_KEY=... | POE_API_KEY=... | ANTHROPIC_API_KEY=...   (text LLM)
 *   OPENAI_API_KEY=...                                          (embeddings → recall)
 * Without keys it still runs end-to-end on the fake LLM + deterministic fake
 * embeddings (proves the wiring; prose is filler, recall relevance is crude).
 *
 * narrative-setup MUST be imported before the tick loop — it installs the env + fake
 * client factory at module-init, before tick-loop's transitive sdk client is touched.
 */

import { readdirSync, readFileSync } from 'node:fs';
import {
    seedWorld,
    hasTextProviderKey,
    hasEmbeddingKey,
} from './narrative-setup';
import { CHAPTER_DUMP_DIR } from './narrative-env';
import { runTickLoopAction } from '@/lib/actions/tick-loop';
import { __drainNarrativeRecallHits, __resetNarrativeMemory } from '@/lib/chain/memory';

const TICKS = Math.max(1, Number(process.argv[2] ?? 6));

/* ── capture cut / gazette full text via the chapter-dump file channel ──────────
 * POV chapters are in the result (povs[].chapter); the woven cut (回) and gazette
 * run as background-style steps and are NOT in the result, so we read them off the
 * dump dir each tick. */
const seenDumps = new Set<string>();

interface DumpedChapter {
    kind: string;
    name: string;
    body: string;
}

function readNewDumps(): DumpedChapter[] {
    if (!CHAPTER_DUMP_DIR) return [];
    let files: string[];
    try {
        files = readdirSync(CHAPTER_DUMP_DIR);
    } catch {
        return [];
    }
    const out: DumpedChapter[] = [];
    for (const f of files.sort()) {
        if (seenDumps.has(f) || !f.endsWith('.md')) continue;
        seenDumps.add(f);
        // filename: d<day>-<kind>-<nameSlug>-<seq>.md
        const m = f.match(/^d\d+-([a-z]+)-(.*)-\d+\.md$/);
        const kind = m?.[1] ?? '?';
        let body = '';
        try {
            body = readFileSync(`${CHAPTER_DUMP_DIR}/${f}`, 'utf8');
        } catch {
            /* ignore */
        }
        // Strip the dump header (everything up to and including the `---` divider).
        const divider = body.indexOf('\n---\n');
        const text = divider >= 0 ? body.slice(divider + 5).trim() : body.trim();
        // pull the subject name out of the header for a readable label.
        const nameLine = body.match(/^# 〔[a-z]+〕(.+)$/m);
        out.push({ kind, name: (nameLine?.[1] ?? '').trim(), body: text });
    }
    return out;
}

function rule(label: string): string {
    const bar = '═'.repeat(Math.max(0, 72 - label.length));
    return `\n${label} ${bar}`;
}

async function main(): Promise<void> {
    console.log(rule('NARRATIVE OBSERVATORY'));
    console.log(`  ticks=${TICKS}`);
    console.log(`  text LLM   : ${hasTextProviderKey() ? 'REAL (provider key present)' : 'FAKE (no provider key → filler prose)'}`);
    console.log(`  embeddings : ${hasEmbeddingKey() ? 'REAL OpenAI (genuine recall relevance)' : 'FAKE deterministic (mechanism-only; crude relevance)'}`);
    console.log(`  chain+walrus: FAKE (ideal — no RPC limiting, no prune)`);
    console.log(`  chapter dumps: ${CHAPTER_DUMP_DIR}`);
    if (!hasTextProviderKey() || !hasEmbeddingKey()) {
        console.log(
            `  NOTE: running in SMOKE mode. To READ real iteration, put ZAI_API_KEY (or\n` +
                `        POE_API_KEY / ANTHROPIC_API_KEY) + OPENAI_API_KEY in packages/web/.env.local.`,
        );
    }

    __resetNarrativeMemory();
    seedWorld({ cast: 6, withResource: true });

    let totalRecall = 0;
    for (let i = 0; i < TICKS; i++) {
        console.log(rule(`TICK ${i + 1}/${TICKS}`));
        const t0 = Date.now();
        let r: Awaited<ReturnType<typeof runTickLoopAction>> | null = null;
        try {
            r = await runTickLoopAction({ povAll: true });
        } catch (e) {
            console.warn(`  [tick ${i + 1}] threw:`, e instanceof Error ? e.message : String(e));
        }
        const ms = Date.now() - t0;
        const recallThisTick = __drainNarrativeRecallHits();
        totalRecall += recallThisTick;

        if (r) {
            const day = r.worldTime?.day ?? '?';
            const storylet = r.storylet ?? r.storylets?.[0];
            console.log(
                `  day=${day} tookMs=${ms} recallHits=${recallThisTick}` +
                    (storylet ? ` | event: ${storylet.label} [${storylet.names.join('、')}]` : ' | (no event opened)'),
            );

            // Per-character POV: full chapter text (the per-tick iteration evidence).
            const wrote = (r.povs ?? []).filter((p) => p.chapter && p.chapter.trim());
            if (wrote.length) {
                console.log(`\n  ── POV chapters (${wrote.length}) ──`);
                for (const p of wrote) {
                    console.log(
                        `\n  【${p.name}】 recalled=${p.recalledCount ?? 0} anchored=${p.anchored}` +
                            ` (${p.chapter!.length} chars)`,
                    );
                    console.log(indent(p.chapter!.trim()));
                }
            } else {
                console.log(`  (no POV chapter generated this tick)`);
            }

            // resolves / verdicts — the concrete Δ that should let the next tick MOVE ON.
            const verdicts = (r.resolves ?? []).filter((v) => v.ok && v.verdict);
            if (verdicts.length) {
                console.log(`\n  ── resolved ──`);
                for (const v of verdicts) console.log(`  ⚖ ${v.verdict}`);
            }
        }

        // cut (回) + gazette full text from the dump channel.
        const dumps = readNewDumps();
        const cuts = dumps.filter((d) => d.kind === 'cut');
        const gazettes = dumps.filter((d) => d.kind === 'gazette');
        for (const c of cuts) {
            console.log(`\n  ══ 回（woven cut · ${c.name}）${c.body.length} chars ══`);
            console.log(indent(c.body));
        }
        for (const g of gazettes) {
            console.log(`\n  ══ 公報（gazette）${g.body.length} chars ══`);
            console.log(indent(g.body));
        }
    }

    console.log(rule('SUMMARY'));
    console.log(`  ticks=${TICKS}  totalRecallHits=${totalRecall}  avgRecall/tick=${(totalRecall / TICKS).toFixed(1)}`);
    console.log(
        `  READ THE CHAPTERS ABOVE: do later ticks ADVANCE (new stakes / consequences /\n` +
            `  relationships shift) or LOOP (same standoff re-described)? recallHits>0 each tick\n` +
            `  confirms the iteration engine (remember→recall) is feeding past into present.`,
    );
}

function indent(s: string): string {
    return s
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n');
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[narrative-harness] fatal:', e);
        process.exit(1);
    });
