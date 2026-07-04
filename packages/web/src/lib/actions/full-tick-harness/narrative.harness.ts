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
    harnessChain,
    hasTextProviderKey,
    hasEmbeddingKey,
} from './narrative-setup';
import { CHAPTER_DUMP_DIR } from './narrative-env';
import {
    evolveRelationshipsFromScene,
    directedOutgoingEdges,
    toneZh,
    type ScenePovInput,
    type EvolveRelationshipsResult,
} from './relationship-evolve';
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
    // 柳蘇 canon (§7 ledger): the warm-small four — 師姐妹雙向暗戀 + 慈班主 + 活寶丑。
    // Secrets folded as (心底：…) so want-genesis can grow wants from them.
    seedWorld({
        withResource: true,
        canonCast: [
            {
                name: '柳生春',
                gender: '女',
                role: '小生',
                ageYears: 24,
                description:
                    '春雪社當紅小生（坤生，女兒身扮小生），台上一柄摺扇便能撩動滿堂春水的風流少年郎；' +
                    '台下卻是個愛撒嬌、最黏師姐蘇映雪的暖姑娘。戲痴，七歲坐科，師父臨終留一句「戲比天大」與一把摺扇。' +
                    '（心底：她與師姐是雙向暗戀，誰也不敢說破——飯碗、生旦本分、那年代；唯有台上演柳夢梅對杜麗娘時，那點愛才被許可呼吸。她怕老，怕被後浪蓋過，更怕有一天師姐也只看得見台上的她。）',
            },
            {
                name: '蘇映雪',
                gender: '女',
                role: '花旦',
                ageYears: 28,
                description:
                    '春雪社台柱花旦，台上端莊，台下極懂分寸、總替全班圓場。和柳生春搭了七八年生旦，演過千百回杜麗娘與柳夢梅。' +
                    '（心底：她對師妹也是真的動了心，卻更不敢說破——她是師姐，該穩；那點心思只在替師妹理鬢角、留最好的點心、把茶先溫好裡露一線。她怕的不是師妹不紅，是師妹太紅，紅到誰都能借她一柄扇、同她唱一場情。）',
            },
            {
                name: '田巧雲',
                gender: '女',
                role: '老旦',
                ageYears: 55,
                description:
                    '春雪社班主，唱了一輩子老旦，如今管著一班人的吃穿冷暖。嘴上規矩嚴，心裡把戲班當一家子。' +
                    '（心底：年輕時她也有一個沒能說出口的人，遠嫁去了南洋；看著柳蘇兩個孩子，她有時心軟，有時心驚。）',
            },
            {
                name: '賴金喜',
                gender: '男',
                role: '丑',
                ageYears: 30,
                description:
                    '春雪社的丑角，台上插科打諢，台下是個閒不住的活寶：揣著炒栗子滿後台轉，誰繃著臉他偏要逗出個笑來。' +
                    '（心底：全班的私事他看得最清，包括那對師姐妹檯面下的事；他嘴碎，卻替她們把門看得死緊。）',
            },
            {
                name: '連翹',
                gender: '女',
                role: '刀馬旦',
                ageYears: 24,
                description:
                    '新搭班的刀馬旦，從京班武場滾出來的，身上一股不肯求人讓路的硬氣。功夫扎實、戲路正在開，' +
                    '眼下最眼熱的是壓軸那一折。（心底：她年少時在旁人的戲裡做過無名小武行，摔得再重也沒人在' +
                    '戲單上寫她的名字。她來春雪社，嘴上說謀口飯，心裡是想問：若我也站到台心，這城會不會終於看見我？）',
            },
            {
                name: '方競西',
                gender: '男',
                role: '記者',
                ageYears: 32,
                description:
                    '四馬路小報的副刊寫手，半舊西裝、袖口沾墨，常來後台轉，說話客氣，筆桿子裡卻有刀。' +
                    '能把一個新角捧成隔日全城的談資，也能把一樁後台私事寫成毀人的緋聞。' +
                    '（心底：年輕時他為搏版面毀過恩師，自此下不了手寫壞一個真心人；可編輯天天催稿，' +
                    '他最近隱約嗅到春雪社台柱之間有一段「寫出來必定洛陽紙貴」的私情。）',
            },
        ],
    });

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

        // ── EMERGENT RELATIONSHIPS ───────────────────────────────────────────
        // Read what just happened on stage (each participant's POV of this tick's
        // event) and let the LLM evolve the directed relationship tones from it,
        // writing them back to the on-chain graph. Then print the graph so the
        // operator can watch 感情 grow from the play instead of being fought over.
        if (r) {
            await evolveAndPrint(r);
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

/** id→name over the seeded fake cast (target-name resolution for the graph). */
function castNameOf(id: string): string {
    return harnessChain.characters.get(id)?.name ?? `${id.slice(0, 8)}…`;
}

/**
 * After a tick: for each event that opened this tick, evolve the directed
 * relationship tones from the participants' POVs and seed them; then print the
 * whole cast's outgoing relationship graph so the operator can read the
 * tick-over-tick evolution (孟→文 戀慕 weight 1→2→3, 姚→孟 競爭 appearing, …).
 */
async function evolveAndPrint(r: Awaited<ReturnType<typeof runTickLoopAction>>): Promise<void> {
    // POV text by character id (what each character said/felt this tick).
    const povById = new Map<string, string>();
    for (const p of r.povs ?? []) {
        if (p.chapter && p.chapter.trim()) povById.set(p.characterId, p.chapter.trim());
    }

    // Every event live this tick (≤1 in single mode; storylets[] in parallel mode).
    const events = (r.storylets && r.storylets.length ? r.storylets : r.storylet ? [r.storylet] : [])
        .filter((s) => s && s.characterIds && s.characterIds.length >= 2);

    let evolvedAny = false;
    for (const ev of events) {
        // Include every CO-PRESENT cast member in the scene, not just the event's
        // desirers. The beloved (self-excluded from an affection contest, e.g. 文) has
        // NO POV but MUST be a valid edge target — otherwise 孟→文 戀慕 is dropped as a
        // hallucinated name. POV-less members just give the LLM a name it may point at.
        const sceneCast = harnessChain.scenes.get(ev.sceneId)?.characterIds ?? [];
        const allIds = Array.from(new Set([...ev.characterIds, ...sceneCast]));
        const participants: ScenePovInput[] = allIds.map((id) => ({
            characterId: id,
            name: castNameOf(id),
            pov: povById.get(id) ?? '',
        }));
        // Need ≥2 with actual POV prose for the inference to have evidence.
        if (participants.filter((p) => p.pov).length < 2) continue;
        const res = await evolveRelationshipsFromScene({
            participants,
            sceneId: ev.sceneId,
            eventLabel: ev.label,
        }).catch(
            (e): EvolveRelationshipsResult => ({
                seeded: 0,
                proposed: 0,
                error: e instanceof Error ? e.message : String(e),
            }),
        );
        evolvedAny = true;
        const tag =
            res.error != null
                ? `error: ${res.error}`
                : res.skipReason
                  ? `skip: ${res.skipReason}`
                  : `seeded ${res.seeded}/${res.proposed} directed edge(s)`;
        console.log(`\n  ⤳ 關係演化 ← 〔${ev.label}〕[${ev.names.join('、')}] — ${tag}`);
    }
    if (!evolvedAny) {
        console.log(`\n  ⤳ 關係演化 — (this tick opened no multi-POV event to evolve from)`);
    }

    // Snapshot the directed relationship graph for the WHOLE cast (not just this
    // tick's event) so accumulation across ticks is visible at a glance.
    console.log(`\n  ── 關係圖快照（有向；weight = 累計種子次數）──`);
    let printedEdge = false;
    for (const c of harnessChain.characters.values()) {
        const edges = await directedOutgoingEdges(c.id, castNameOf).catch(() => []);
        if (!edges.length) continue;
        printedEdge = true;
        const line = edges
            .map((e) => `${e.toName}=${toneZh(e.tone)}(${e.tone})×${e.weight}`)
            .join('  ·  ');
        console.log(`    ${c.name} →  ${line}`);
    }
    if (!printedEdge) {
        console.log(`    (還沒有任何有向關係被種下 — 真 LLM 下這裡會逐 tick 長出來)`);
    }
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
