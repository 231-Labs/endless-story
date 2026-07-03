/**
 * 真實 runner 架構 · 柳蘇班底 — runs the REAL `runTickLoopAction` (perceive→recall→plan→act/POV→
 * remember→關係演化→說書人織回) against the ideal fake chain + REAL in-memory recall/remember +
 * REAL LLM. Unlike my thin `assembled-*-selfdrive` harnesses (static persona + 8 dead memories +
 * a numeric want vector, NO episodic carry-forward → day3 forgets day2), this IS the real pipeline:
 * each tick a character remember()s its plan/observations/POV and recall()s the relevant past, so the
 * story carries forward. We seed the 柳蘇 cast (rich 小傳), PRE-SEED genesis memories (倒倉那年 / 白蘭 /
 * 水袖暗號 …, exactly as create-founding-cast does), and seed FOUR rotating stakes so wants are
 * multi-line and the world stops orbiting one person.
 *
 *   TSX_TSCONFIG_PATH=$PWD/tsconfig.json <node23> <tsx/cli.mjs> \
 *     src/lib/actions/full-tick-harness/experiments/narrative-liyuan.harness.ts [ticks=8]
 */

import {
    seedWorld,
    harnessChain,
    hasTextProviderKey,
    hasEmbeddingKey,
} from '../narrative-setup';
import { CHAPTER_DUMP_DIR } from '../narrative-env';
import { readdirSync, readFileSync } from 'node:fs';
import {
    evolveRelationshipsFromScene,
    directedOutgoingEdges,
    toneZh,
    type ScenePovInput,
    type EvolveRelationshipsResult,
} from '../relationship-evolve';
import { runTickLoopAction } from '@/lib/actions/tick-loop';
import {
    __drainNarrativeRecallHits,
    __resetNarrativeMemory,
    rememberForCharacter,
} from '@/lib/chain/memory';

const TICKS = Math.max(1, Number(process.argv[2] ?? 8));

// ── 柳蘇班底 (rich 小傳 → anchored persona → differentiated plans) ───────────────
const CAST = [
    { name: '柳生春', gender: '女', role: '坤生', description: '春雪社當紅坤生（女子扮小生、巾生路子、持摺扇、無髯口），蘇映雪自小的師妹。台下也風流，睡過不少女人、舊相好常來討風流帳、夜裡常不歸；對師姐藏著一句連自己也不敢認的情，越不敢認越往風塵裡躲，怕一看師姐的眼這風流的殼就碎。' },
    { name: '蘇映雪', gender: '女', role: '花旦', description: '春雪社台柱花旦、演杜麗娘、柳生春自小的師姐。看柳沾染風塵、舊相好上門、夜夜不歸，痛卻不能管（她是師姐、沒立場攔）。偶爾懷念柳還只黏她一人的青春。也想在還能唱的年紀，留一個會讓人記住「蘇映雪」三個字的杜麗娘。' },
    { name: '田巧雲', gender: '女', role: '班主', description: '春雪社班主、前坤生，冷臉熱心、算盤精。年輕時與花旦白蘭搭生旦唱紅牡丹亭，白蘭遠嫁南洋後封箱接班主。最怕班子撐不下去（救命的錢偏要從角的情上割），也最不想看一對生旦重演她與白蘭的拆散。' },
    { name: '金鳳', gender: '女', role: '旦', description: '柳生春的舊相好之一、風塵裡打滾的女子兼戲迷。常來後台討風流帳，不甘只做其中一個。也有自己的難處：贖身的價、生計的帳。' },
] as const;

// ── 預植的創世記憶（kind=genesis, importance 7；正是 create-founding-cast 的做法）──
const GENESIS: Record<string, string[]> = {
    柳生春: [
        '你自小是蘇映雪的小師妹，賣身入科頭回挨打、是她塞你一顆糖。',
        '倒倉那年你以為嗓子廢了，夜夜趴在師姐膝頭哭，是她守著你，那時你的夜只有她。',
        '紅了之後外面的女人一個接一個，你說不清是貪還是躲。',
        '你台上對蘇映雪遞水袖第三道的暗號，台下卻夜夜不歸。',
    ],
    蘇映雪: [
        '你自小帶柳生春入門，那時她只黏你一個、夜裡睏了就趴你膝頭。',
        '倒倉那年她怕廢了、夜夜哭，是你守著，那時她的夜只有你。',
        '她紅了之後頭回在外過夜，你整宿沒合眼、聽更聲到天亮。',
        '你替她擋過要梳攏她的金主，也退過一門親事，理由你不肯對自己說清。',
    ],
    田巧雲: [
        '你年輕時與花旦白蘭搭生旦唱紅牡丹亭，那是你這輩子最好的戲。',
        '白蘭被許了人家、遠嫁南洋，你連句留的話都沒說出口，就此封箱。',
        '你接班頭年差點散了，班子要錢，你比誰都清楚。',
        '你看柳蘇就像看當年的你和白蘭，斷不能再看一對生旦被拆散。',
    ],
    金鳳: [
        '柳生春當日怎麼撩你，那些甜話你到現在還記得。',
        '你知道她屋裡那盞燈是替誰亮的，你偏當沒看見。',
        '你不是第一個、也不會是最後一個，你心知肚明、可你不認。',
        '你也有自己的難處：贖身的價、生計的帳。',
    ],
};

const seenDumps = new Set<string>();
function readNewDumps(): { kind: string; name: string; body: string }[] {
    if (!CHAPTER_DUMP_DIR) return [];
    let files: string[];
    try { files = readdirSync(CHAPTER_DUMP_DIR); } catch { return []; }
    const out: { kind: string; name: string; body: string }[] = [];
    for (const f of files.sort()) {
        if (seenDumps.has(f) || !f.endsWith('.md')) continue;
        seenDumps.add(f);
        const m = f.match(/^d\d+-([a-z]+)-(.*)-\d+\.md$/);
        const kind = m?.[1] ?? '?';
        let body = '';
        try { body = readFileSync(`${CHAPTER_DUMP_DIR}/${f}`, 'utf8'); } catch { /* ignore */ }
        const divider = body.indexOf('\n---\n');
        const text = divider >= 0 ? body.slice(divider + 5).trim() : body.trim();
        const nameLine = body.match(/^# 〔[a-z]+〕(.+)$/m);
        out.push({ kind, name: (nameLine?.[1] ?? '').trim(), body: text });
    }
    return out;
}
const rule = (label: string) => `\n${label} ${'═'.repeat(Math.max(0, 72 - label.length))}`;
const indent = (s: string) => s.split('\n').map((l) => `    ${l}`).join('\n');
const castNameOf = (id: string) => harnessChain.characters.get(id)?.name ?? `${id.slice(0, 8)}…`;

async function evolveAndPrint(r: Awaited<ReturnType<typeof runTickLoopAction>>): Promise<void> {
    const povById = new Map<string, string>();
    for (const p of r.povs ?? []) if (p.chapter && p.chapter.trim()) povById.set(p.characterId, p.chapter.trim());
    const events = (r.storylets && r.storylets.length ? r.storylets : r.storylet ? [r.storylet] : [])
        .filter((s) => s && s.characterIds && s.characterIds.length >= 2);
    for (const ev of events) {
        const sceneCast = harnessChain.scenes.get(ev.sceneId)?.characterIds ?? [];
        const allIds = Array.from(new Set([...ev.characterIds, ...sceneCast]));
        const participants: ScenePovInput[] = allIds.map((id) => ({ characterId: id, name: castNameOf(id), pov: povById.get(id) ?? '' }));
        if (participants.filter((p) => p.pov).length < 2) continue;
        const res = await evolveRelationshipsFromScene({ participants, sceneId: ev.sceneId, eventLabel: ev.label })
            .catch((e): EvolveRelationshipsResult => ({ seeded: 0, proposed: 0, error: e instanceof Error ? e.message : String(e) }));
        const tag = res.error != null ? `error: ${res.error}` : res.skipReason ? `skip: ${res.skipReason}` : `seeded ${res.seeded}/${res.proposed} 有向邊`;
        console.log(`\n  ⤳ 關係演化 ← 〔${ev.label}〕[${ev.names.join('、')}] — ${tag}`);
    }
    console.log(`\n  ── 關係圖快照（有向；weight = 累計種子次數）──`);
    let printed = false;
    for (const c of harnessChain.characters.values()) {
        const edges = await directedOutgoingEdges(c.id, castNameOf).catch(() => []);
        if (!edges.length) continue;
        printed = true;
        console.log(`    ${c.name} →  ${edges.map((e) => `${e.toName}=${toneZh(e.tone)}(${e.tone})×${e.weight}`).join('  ·  ')}`);
    }
    if (!printed) console.log(`    (還沒有有向關係被種下)`);
}

async function main(): Promise<void> {
    console.log(rule('真實 RUNNER 架構 · 柳蘇班底'));
    console.log(`  ticks=${TICKS}`);
    console.log(`  text LLM   : ${hasTextProviderKey() ? 'REAL' : 'FAKE'}`);
    console.log(`  embeddings : ${hasEmbeddingKey() ? 'REAL OpenAI（真召回相關性）' : 'FAKE（crude）'}`);
    console.log(`  chain+walrus: FAKE（ideal — 無 RPC 限流、無 prune）`);
    console.log(`  memory     : REAL in-memory（remember→recall 情節記憶，逐拍把過去餵進現在）`);

    __resetNarrativeMemory();
    // 多軸 stake：affection（傾心柳）/ partnership（搭戲柳）/ spotlight（蘇爭頭牌）/ patronage（金主捧柳）
    // → selectContention 逐拍輪換 → 事件主題不再單軸繞一個人。cast 序：0柳 1蘇 2田 3金。
    seedWorld({
        withResource: true,
        story: {
            saga: { name: '春雪社', description: '民國一個梨園戲班。當紅坤生柳生春與台柱花旦蘇映雪自小是生旦一對，台上「柳蘇」是招牌；柳台下風流、夜夜不歸，蘇痛卻不能管；班主田巧雲心裡有白蘭的舊事；舊相好金鳳常來討風流帳。' },
            scenes: [{ name: '後台' }, { name: '廂房' }],
            cast: CAST.map((c) => ({ name: c.name, gender: c.gender, role: c.role, description: c.description })),
        },
        stake: { kind: 'affection', targetIndex: 0 },
        extraStakes: [
            { kind: 'partnership', targetIndex: 0 },
            { kind: 'spotlight', targetIndex: 1 },
            { kind: 'patronage', targetIndex: 0 },
        ],
    });

    // 預植創世記憶（name→id，逐條 rememberForCharacter kind=genesis）。
    let seeded = 0;
    for (const c of harnessChain.characters.values()) {
        for (const mem of GENESIS[c.name] ?? []) {
            if (await rememberForCharacter(c.id, mem, { kind: 'genesis', importance: 7 })) seeded += 1;
        }
    }
    console.log(`  創世記憶預植：${seeded} 條（之後每拍 remember 觀察/計畫/POV 會疊上去）\n`);

    let totalRecall = 0;
    for (let i = 0; i < TICKS; i++) {
        console.log(rule(`TICK ${i + 1}/${TICKS}`));
        const t0 = Date.now();
        let r: Awaited<ReturnType<typeof runTickLoopAction>> | null = null;
        try { r = await runTickLoopAction({ povAll: true }); }
        catch (e) { console.warn(`  [tick ${i + 1}] threw:`, e instanceof Error ? e.message : String(e)); }
        const ms = Date.now() - t0;
        const recallThisTick = __drainNarrativeRecallHits();
        totalRecall += recallThisTick;

        if (r) {
            const day = r.worldTime?.day ?? '?';
            const storylet = r.storylet ?? r.storylets?.[0];
            console.log(`  day=${day} tookMs=${ms} recallHits=${recallThisTick}` + (storylet ? ` | event: ${storylet.label} [${storylet.names.join('、')}]` : ' | (no event opened)'));
            const wrote = (r.povs ?? []).filter((p) => p.chapter && p.chapter.trim());
            if (wrote.length) {
                console.log(`\n  ── POV 章回 (${wrote.length}) ──`);
                for (const p of wrote) {
                    console.log(`\n  【${p.name}】 recalled=${p.recalledCount ?? 0} anchored=${p.anchored} (${p.chapter!.length} chars)`);
                    console.log(indent(p.chapter!.trim()));
                }
            } else console.log(`  (本拍無 POV 章回)`);
            const verdicts = (r.resolves ?? []).filter((v) => v.ok && v.verdict);
            if (verdicts.length) { console.log(`\n  ── 收口 / verdict ──`); for (const v of verdicts) console.log(`  ⚖ ${v.verdict}`); }
        }

        for (const c of readNewDumps()) {
            if (c.kind === 'cut') { console.log(`\n  ══ 回（說書人織回 · ${c.name}）${c.body.length} chars ══`); console.log(indent(c.body)); }
            else if (c.kind === 'gazette') { console.log(`\n  ══ 公報（gazette）${c.body.length} chars ══`); console.log(indent(c.body)); }
        }
        if (r) await evolveAndPrint(r);
    }

    console.log(rule('SUMMARY'));
    console.log(`  ticks=${TICKS}  totalRecallHits=${totalRecall}  avgRecall/tick=${(totalRecall / TICKS).toFixed(1)}`);
    console.log(`  讀上面章回：後面幾拍是 ADVANCE（新處境/後果/關係挪動）還是 LOOP（同一僵局重描）？`);
    console.log(`  recallHits>0 每拍 = 情節記憶引擎（remember→recall）真的在把過去餵進現在。`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[narrative-liyuan] fatal:', e); process.exit(1); });
