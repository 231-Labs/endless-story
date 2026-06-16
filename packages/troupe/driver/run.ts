/**
 * The troupe-production driver — runs the whole pipeline and dumps every
 * artifact to ./out, with NO chain / Walrus / Move. This is the "does it
 * actually produce coherent, usable work?" verification step.
 *
 * Run:
 *   pnpm --filter @endless-story/troupe run:mock      # no key, local templates
 *   pnpm --filter @endless-story/troupe run            # uses ZAI/POE/ANTHROPIC key
 *
 * Pass a key by dropping packages/troupe/.env.local (or reuse web/.env.local):
 *   ZAI_API_KEY=...   (or POE_API_KEY / ANTHROPIC_API_KEY)
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAsk } from '../src/llm.ts';
import { springSnow } from '../src/fixtures/spring-snow.ts';
import { induct } from '../src/genesis.ts';
import { makeMemwalSource } from '../src/memwal-source.ts';
import { chooseProduction } from '../src/roles/director.ts';
import { newProduction, runToPremiere } from '../src/pipeline.ts';
import { assembleXiZhe } from '../src/xizhe.ts';
import { scoreToMidi } from '../src/music.ts';
import type { Production, Score, ScriptLine } from '../src/types.ts';

const argv = process.argv.slice(2);
const mock = argv.includes('--mock');
const noScore = argv.includes('--no-score'); // 純排戲：跳過 琴師作曲/出譜（音律）
const auto = argv.includes('--auto'); // 自治：班主自選戲、入科生成社交網、角色自判有感而發
const useMemwal = argv.includes('--memwal'); // 入科改讀 MemWal 真累積的關係/記憶（需 chainId+憑證+tsx）
const playArg = argv.indexOf('--play');
const classicKey = playArg >= 0 ? argv[playArg + 1] : undefined; // e.g. --play honglou / 紅樓夢 / 大戲
const outArg = argv.indexOf('--out');
// Default out/ sits next to the package (packages/troupe/out) regardless of the
// cwd you launch from; --out <dir> overrides, resolved from your cwd.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = outArg >= 0 ? resolve(process.cwd(), argv[outArg + 1]) : join(PKG_DIR, 'out');

function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_');
}

function renderLine(l: ScriptLine): string {
  if (l.type === 'stage') return `（科介）${l.text}`;
  return `${l.who}${l.mode === '唱' ? '（唱）' : '（白）'}：${l.text}`;
}

function scoreMd(s: Score): string {
  return [
    `### ${s.title}`,
    ``,
    `- 板式：**${s.banshi}**`,
    `- 調式：${s.mode}`,
    `- 演奏調（人類可彈）：**${s.keyForPlayer}** · ♩≈${s.tempoBpm}`,
    `- 作曲：${s.composerName}`,
    ``,
    '```',
    `简谱  ${s.jianpu}`,
    '```',
    ``,
    s.articulation.length ? `演奏記號：${s.articulation.map((a) => `${a.at}（${a.tech}）`).join('、')}` : '',
    `> 同步輸出 MIDI（GM program 110 = Fiddle，胡琴替身）。你會樂器就能照简谱彈。`,
  ].join('\n');
}

async function main() {
  const ask = makeAsk({ mock });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  console.log(
    `\n戲班開排 · provider = ${ask.provider}${ask.mock ? '（mock 模板，無金鑰）' : '（真 LLM）'}` +
      `${auto ? ' · 自治 --auto' : ''}${useMemwal ? ' · MemWal --memwal' : ''}\n`,
  );

  // induct: derive skills + load the social web. Source priority:
  //   --memwal → MemWal accumulated memories/relationships (needs chainId+creds)
  //   else --auto + key → LLM-generated social web; mock/none → hand-set fixture.
  let troupe = springSnow;
  if (auto || useMemwal) {
    const source = useMemwal ? makeMemwalSource(springSnow) : undefined;
    if (useMemwal) console.log('  · MemWal 來源已掛載（角色需 chainId + 憑證才讀真記憶/關係，否則退回生成/底稿）');
    troupe = await induct(springSnow, '梨園戲班，角兒之間有舊情、暗慕與較勁', ask, source);
    const rels = troupe.reduce((n, m) => n + m.relationships.length, 0);
    const tag = useMemwal ? '（MemWal 優先）' : ask.mock ? '（mock：沿用班底底稿）' : '（自治生成）';
    console.log(`  · 入科 → 社交網：${troupe.length} 角、${rels} 段關係${tag}`);
  }
  const key = classicKey ?? (auto ? await chooseProduction(troupe, ask) : undefined);
  if (auto && !classicKey) console.log(`  · 班主自選戲碼 → ${key}`);

  const prod: Production = newProduction('saga_chunxue', key, { skipScore: noScore, auto });

  await runToPremiere(prod, troupe, ask, (p) => {
    const last = p.log[p.log.length - 1];
    if (last) console.log('  · ' + last);
  });

  // ── dump artifacts ──
  const files: string[] = [];
  const put = (name: string, body: string | Uint8Array) => {
    writeFileSync(join(OUT, name), body);
    files.push(name);
  };

  put('production.json', JSON.stringify(prod, null, 2));

  put(
    '01_brief.md',
    [
      `# ${prod.brief!.title}（${prod.brief!.classicSource} · 舊戲新唱）`,
      ``,
      `- 班主：${prod.brief!.directorName}`,
      `- 氣質：${prod.brief!.qizhi}`,
      `- 立意：${prod.brief!.premise}`,
      `- 預算（模擬）：${prod.brief!.budget}`,
      ``,
      `## 分場`,
      ...prod.brief!.sceneOutline.map((o, i) => `${i + 1}. 〈${o.title}〉（${o.mood}）— ${o.summary}`),
    ].join('\n'),
  );

  const nm = new Map(prod.script!.parts.map((p) => [p.partId, p.partName]));
  put(
    '02_script.md',
    [
      `# ${prod.script!.title}（${prod.brief!.classicSource}·舊戲新唱　編劇：${prod.script!.authorName}）`,
      `> ${prod.script!.premise}`,
      ``,
      ...prod.script!.scenes.flatMap((sc) => [
        `## 第${sc.sceneId.slice(1)}場 〈${sc.title}〉　（${sc.mood}）`,
        `*在場：${sc.parts.map((id) => nm.get(id) ?? id).join('、')}*`,
        ``,
        ...sc.lines.map(renderLine),
        ``,
      ]),
    ].join('\n'),
  );

  put('03_cast.json', JSON.stringify(prod.cast, null, 2));
  put(
    '03_cast.md',
    [
      `# 選角表（${prod.script!.title}）`,
      ``,
      `| 角色 | 行當/應工 | 角色性別 | 演員 | 演員性別 | 反串 | 備註 |`,
      `|---|---|---|---|---|---|---|`,
      ...prod.cast!.map(
        (c) =>
          `| ${c.partName} | ${c.hangdang}/${c.yinggong} | ${c.roleGender === 'male' ? '男' : '女'} | ${c.assignedName ?? '—'} | ${c.actorGender ? (c.actorGender === 'male' ? '男' : '女') : '—'} | ${c.crossCastLabel ?? '—'} | ${c.note ?? ''} |`,
      ),
    ].join('\n'),
  );

  for (const s of prod.scores!) {
    const base = `04_score_${safe(s.title)}`;
    put(`${base}.json`, JSON.stringify(s, null, 2));
    put(`${base}.mid`, scoreToMidi(s));
    put(`${base}.md`, scoreMd(s));
  }

  put(
    '05_ci.md',
    [
      `# 詞`,
      ``,
      ...prod.ci!.flatMap((c) => [
        `## ${c.title}　〔${c.source === 'emergent' ? '有感而發' : '應場填詞'}〕`,
        `*作者：${c.authorName}*`,
        c.provenance ? `*出處：${c.provenance.kind === 'relationship' ? '關係' : '記憶'} → ${c.provenance.why}*` : '',
        ``,
        ...c.lines.map((l) => `　${l}`),
        ``,
      ]),
    ].join('\n'),
  );

  put('06_戲中戲_章回.md', prod.chapter ?? '');

  // 00_戲折 — assembled collectible (shared with the runner production service).
  put('00_戲折.md', assembleXiZhe(prod));

  // ── console summary ──
  const xcast = prod.cast!.filter((c) => c.crossCastLabel);
  const emergent = prod.ci!.find((c) => c.source === 'emergent');
  const sorrowScore = prod.scores!.find((s) => s.banshi.includes('反'));
  console.log('\n──────── 首演齊備 ────────');
  if (ask.mock) {
    console.log('LLM：mock（本機模板，未呼叫）');
  } else {
    const verdict = ask.failures === 0 ? '全部成功 ✓' : `⚠️ ${ask.failures}/${ask.calls} 失敗（那些段落退回本機模板）`;
    console.log(`真 LLM（${ask.provider}）：呼叫 ${ask.calls} 次，${verdict}，耗時 ${(ask.ms / 1000).toFixed(1)}s`);
    if (ask.failures > 0 && ask.lastError) console.log(`  首個錯誤：${ask.lastError}`);
  }
  console.log(`產物：${files.length} 個檔，寫到 ${OUT}`);
  if (xcast.length) console.log(`反串看點：${xcast.map((c) => `${c.assignedName} [${c.crossCastLabel}] 飾 ${c.partName}`).join('、')}`);
  if (sorrowScore) console.log(`悲調可彈：${sorrowScore.title} — ${sorrowScore.keyForPlayer}（${sorrowScore.banshi}）→ ${safe(sorrowScore.title)}.mid`);
  if (emergent) console.log(`有感而發：${emergent.authorName} 因「${emergent.provenance?.why ?? ''}」寫了《${emergent.title}》`);
  console.log('上鏈（production.move / 技能 DOF / Walrus）為 gate-after，未在此 harness。\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
