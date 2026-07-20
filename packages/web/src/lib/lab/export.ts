/**
 * 卷宗診斷導出 — assemble ONE self-contained, AI-readable Markdown file that
 * captures everything needed to debug a lab run: config, any errors (surfaced
 * FIRST), a SUMMARY of the world (not a raw dump), the full per-tick mechanic
 * record, and the raw engine log verbatim.
 *
 * Reads ONLY from disk (robust for a cold / restarted run) plus the optional
 * in-memory ring when the run is still open in the manager. Every read is
 * guarded — a failed section degrades to 「（讀取失敗：…）」 rather than 500-ing
 * the whole export. No secrets (config flags + ids only; never env / keys).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { bondOf, PRODUCTION, totalEffort, WorldState } from '@endless-story/engine';
import { formatMoney, type SeasonEconomyData } from '@endless-story/engine/core/season-economy';
import { readTickRecords } from './artifacts';
import { labManager } from './manager';
import { runDir } from './paths';
import { readRunMeta, readRunStatus } from './store';
import type { LabRunMeta, LabTickRecord } from './types';

/** run-manifest.json — the frozen provenance the manager writes on first open. */
interface RunManifestView {
    preset?: string;
    season?: string;
    realLlm?: boolean;
    provider?: string;
    model?: string;
    relationshipFallback?: boolean;
    emergentProduction?: boolean;
}

const ENGINE_LOG_TAIL_LINES = 4000;
const ERROR_LINE = /\[fatal\]|\[economy-audit\]|error|throw/i;

function safe<T>(fn: () => T, onFail: (message: string) => T): T {
    try {
        return fn();
    } catch (error) {
        return onFail(error instanceof Error ? error.message : String(error));
    }
}

function readTextFile(file: string): string | null {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

function readManifest(runId: string): RunManifestView {
    return safe(
        () => JSON.parse(readTextFile(path.join(runDir(runId), 'run-manifest.json')) ?? '{}') as RunManifestView,
        () => ({}),
    );
}

function loadWorld(runId: string): WorldState | null {
    const dir = path.join(runDir(runId), 'state');
    if (!WorldState.exists(dir)) return null;
    return WorldState.restore(dir);
}

function n2(x: number | undefined): string {
    return typeof x === 'number' && Number.isFinite(x) ? x.toFixed(2) : '—';
}

// ── 1. header + summary ─────────────────────────────────────────────────────

function buildHeader(runId: string, meta: LabRunMeta | null, manifest: RunManifestView, world: WorldState | null): string {
    const generatedAt = new Date().toISOString();
    if (!meta) {
        return [
            `# 卷宗診斷 · ${runId}`,
            '',
            `> 找不到 lab-run.json（run id：\`${runId}\`）；generatedAt ${generatedAt}。`,
        ].join('\n');
    }
    const cfg = meta.config;
    const status = readRunStatus(runId);
    const clock = world?.data.clock;
    const day = clock?.day ?? status?.day ?? '—';
    const tick = clock?.currentTick ?? status?.tick ?? '—';
    const part = clock?.partOfDay ?? status?.partOfDay ?? '—';
    const flags = [
        cfg.relationshipFallback ? 'relationshipFallback' : null,
        cfg.emergentProduction ? 'emergentProduction' : null,
        cfg.realEmbeddings ? 'realEmbeddings' : null,
    ].filter(Boolean);
    const source = `seed ${cfg.seedSource}/${cfg.presetId}`
        + (cfg.seasonId ? ` · season ${cfg.seasonSource ?? 'builtin'}/${cfg.seasonId}` : '');
    const provider = manifest.provider ?? (cfg.llm === 'real' ? '?' : 'deterministic');
    const model = manifest.model ?? (cfg.llm === 'real' ? '?' : 'fake');
    const counts = status
        ? `cast ${status.castCount} · scenes ${status.sceneCount} · liveWants ${status.liveWants} · events ${status.eventsTotal}`
        : world
            ? `cast ${world.data.cast.length} · scenes ${world.data.scenes.length}`
            : '（無計數）';
    const lineage = meta.parentRunId ? ` · 分自 ${meta.parentRunId}（第 ${meta.forkedAtTick ?? '?'} 拍）` : '';
    return [
        `# 卷宗診斷 · ${meta.title}`,
        '',
        `此為一卷 Endless Story cinema-lab 走卷的完整診斷紀錄，供 AI 冷讀除錯。`
        + `Run \`${runId}\`${lineage}；${source}；LLM ${cfg.llm}（provider ${provider} · model ${model}）；`
        + `ticksPerDay ${cfg.ticksPerDay}${flags.length ? ` · 旗標 ${flags.join('、')}` : ''}；`
        + `此刻走到第 ${day} 日 · 第 ${tick} 拍（${part}）；${counts}；generatedAt ${generatedAt}。`,
        meta.note ? `\n備註：${meta.note}` : '',
    ].filter(Boolean).join('\n');
}

// ── 2. errors first ─────────────────────────────────────────────────────────

function buildErrors(runId: string, engineLog: string): string {
    const out: string[] = ['## ⚠ 錯誤與警訊'];
    const found: string[] = [];
    const active = safe(() => labManager().get(runId), () => undefined);
    if (active?.lastError) found.push(`最後致命錯誤（in-memory）：${active.lastError}`);

    // grepped error / fatal / audit / throw lines out of the durable engine log
    if (engineLog) {
        const lines = engineLog.split('\n').filter((line) => line.trim() && ERROR_LINE.test(line));
        for (const line of lines) found.push(line.trim());
    }

    // post-process failures the tick recorded to disk (dossier / editorial)
    const failuresDir = path.join(runDir(runId), 'postprocess-failures');
    safe(() => {
        for (const file of fs.readdirSync(failuresDir)) {
            const body = readTextFile(path.join(failuresDir, file));
            if (body) found.push(`postprocess ${file}：${body.replace(/\s+/g, ' ').trim()}`);
        }
        return null;
    }, () => null);

    if (!found.length) {
        out.push('（無）');
        return out.join('\n\n');
    }
    // de-dup while preserving order; cap so a runaway audit can't drown the file
    const seen = new Set<string>();
    const unique = found.filter((line) => (seen.has(line) ? false : (seen.add(line), true)));
    const shown = unique.slice(0, 200);
    out.push('```text\n' + shown.join('\n') + '\n```');
    if (unique.length > shown.length) out.push(`（另有 ${unique.length - shown.length} 條同類訊息略去）`);
    return out.join('\n\n');
}

// ── 3. world summary ────────────────────────────────────────────────────────

function acctLabel(economy: SeasonEconomyData, world: WorldState, id: string): string {
    if (id === 'external') return '外部';
    return economy.state.accounts[id]?.label ?? world.nameById(id);
}

const TXN_KIND_LABEL: Record<string, string> = {
    wage: '例錢', purchase: '購置', transfer: '轉帳', 'external-in': '外入', settle: '結算', give: '相贈',
};

function moneyOf(economy: SeasonEconomyData | undefined, id: string): string | undefined {
    const acct = economy?.state.accounts[id];
    if (!acct) return undefined;
    return safe(() => formatMoney(economy!, BigInt(acct.available)), () => acct.available);
}

function topBonds(world: WorldState, memberId: string, relationshipView: Record<string, string>, n: number): string[] {
    const bondGraph = world.bondGraph();
    const others = new Set<string>([
        ...Object.keys(relationshipView),
        ...Object.keys(world.data.edges[memberId] ?? {}),
    ]);
    others.delete(memberId);
    return [...others]
        .map((oId) => {
            const warmth = bondGraph.has(`${memberId}→${oId}`)
                ? bondOf(bondGraph, memberId, oId)
                : world.welcome(memberId, oId);
            return { name: world.nameById(oId), warmth, tone: world.data.edges[memberId]?.[oId]?.tone };
        })
        .sort((a, b) => b.warmth - a.warmth)
        .slice(0, n)
        .map((b) => `${b.name} 溫 ${n2(b.warmth)}${b.tone ? `（${b.tone}）` : ''}`);
}

function buildWorld(world: WorldState | null): string {
    const out: string[] = ['## 世界現況'];
    if (!world) {
        out.push('（讀取失敗：無世界快照 state/world.json）');
        return out.join('\n\n');
    }
    const w = world.data;
    const economy = w.economy;

    // ── cast ──
    out.push('### 戲班（cast）');
    const castLines: string[] = [];
    for (const member of w.cast) {
        const sceneName = world.sceneNameById(w.roster[member.id] ?? '');
        const money = moneyOf(economy, member.id);
        const wants = world.liveWantsOf(member.id).slice(0, 2).map(
            (want) => `${want.desc}（${want.layer}／張力 ${n2(want.weight * (1 - want.sat))}）`,
        );
        const bonds = topBonds(world, member.id, member.relationshipView, 2);
        const skills = (member.skills ?? []).map((s) => s.name);
        const keys = world.keysHeldBy(member.id).map(
            (k) => `${world.sceneNameById(k.sceneId)}（${k.kind === 'standing' ? '常' : '次'}）`,
        );
        // 居所 tenure — deed-aware via ownersOf: 自有 / 租住(屋主 X) / 公處(無主借宿).
        const homeId = w.homeByChar[member.id];
        let home = '';
        if (homeId) {
            const owners = world.ownersOf(homeId);
            const homeName = world.sceneNameById(homeId);
            home = owners.length === 0
                ? `公處 · ${homeName}`
                : owners.includes(member.id)
                  ? `自有 · ${homeName}`
                  : `租住 · ${homeName}（屋主 ${owners.map((id) => world.nameById(id)).join('、')}）`;
        }
        const parts = [
            `**${member.name}**（${member.role ?? '—'}｜${member.id}）@ ${sceneName}`,
            `狀態 乏 ${n2(member.state.fatigue)}／飢 ${n2(member.state.hunger)}／緒 ${n2(member.state.mood)}`
            + (money ? `｜銀錢 ${money}` : ''),
        ];
        if (wants.length) parts.push(`心事：${wants.join('；')}`);
        if (bonds.length) parts.push(`羈絆：${bonds.join('、')}`);
        if (skills.length) parts.push(`技藝：${skills.join('、')}`);
        if (home) parts.push(`居所：${home}`);
        if (keys.length) parts.push(`持鑰：${keys.join('、')}`);
        if (member.plan) parts.push(`打算：${member.plan.replace(/\s+/g, ' ').trim()}`);
        castLines.push('- ' + parts.join('\n  · '));
    }
    out.push(castLines.join('\n') || '（無角色）');

    // ── economy ──
    if (economy) {
        const econ: string[] = ['### 銀錢帳（economy）'];
        const accts = Object.values(economy.state.accounts).map(
            (a) => `- ${a.label}（${a.id}）：餘 ${safe(() => formatMoney(economy, BigInt(a.available)), () => a.available)}`
                + `，日耗 ${safe(() => formatMoney(economy, BigInt(a.dailyFixedCost)), () => a.dailyFixedCost)}`,
        );
        econ.push('**帳戶**', accts.join('\n') || '（無帳戶）');
        const ledger = economy.state.ledger.slice(-20).map((t) => {
            const kind = TXN_KIND_LABEL[t.kind] ?? t.kind;
            const amount = safe(() => formatMoney(economy, BigInt(t.amount)), () => t.amount);
            return `- 第${t.day}日 ${kind} ${acctLabel(economy, world, t.from)}→${acctLabel(economy, world, t.to)} ${amount}`
                + (t.memo ? `（${t.memo}）` : '');
        });
        econ.push(`**近帳（末 ${Math.min(20, economy.state.ledger.length)}／共 ${economy.state.ledger.length} 筆）**`, ledger.join('\n') || '（無交易）');
        const contracts = Object.values(economy.contracts).map((c) => {
            const signed = c.signedBy.map((id) => acctLabel(economy, world, id)).join('、') || '無';
            return `- ${c.label}（${c.status}）：總 ${safe(() => formatMoney(economy, BigInt(c.total)), () => c.total)}`
                + `，限第 ${c.deadlineDay} 日；已署 ${signed}`;
        });
        if (contracts.length) econ.push('**契約**', contracts.join('\n'));
        const tenancies = Object.values(economy.tenancies ?? {}).map(
            (t) => `- ${world.nameById(t.characterId)} 賃定【${t.sceneName}】`,
        );
        if (tenancies.length) econ.push('**租約（未遷入）**', tenancies.join('\n'));
        const bills = (economy.bills ?? []).map((b) => {
            const remaining = safe(() => formatMoney(economy, BigInt(b.amountSubunits) - BigInt(b.paidSubunits)), () => b.amountSubunits);
            return `- ${b.label} 尚欠 ${remaining}，第 ${b.dueDay} 日到期${b.creditor ? `（${b.creditor}）` : ''}`;
        });
        if (bills.length) econ.push('**帳期**', bills.join('\n'));
        out.push(econ.join('\n\n'));
    } else {
        out.push('### 銀錢帳（economy）\n\n（本卷世界無銀錢帳）');
    }

    // ── established pairs ──
    const established = (w.establishedPairs ?? []).map((key) =>
        key.split('|').map((id) => world.nameById(id)).join(' × '));
    out.push('### 相許（establishedPairs）\n\n' + (established.length ? established.map((p) => `- ${p}`).join('\n') : '（無）'));

    // ── prayers ──
    const prayers = [...(w.prayers ?? [])].slice(-6).reverse().map(
        (p) => `- 第${p.day}日 ${p.name}＠【${p.sceneName}】：${p.text}`,
    );
    out.push('### 願牆（recent prayers）\n\n' + (prayers.length ? prayers.join('\n') : '（無）'));

    // ── production ──
    if (w.production) {
        const p = w.production;
        const contributors = p.contributors.map((id) => world.nameById(id)).join('、');
        const prod = [
            '### 劇本產出（production）',
            `- 《${p.title}》 · 狀態 ${p.status} · 立於第 ${p.startedDay} 日${p.premieredDay ? ` · 首演第 ${p.premieredDay} 日` : ''}`,
            `- 成之者：${contributors}｜戲文 ${p.scriptFragments.length} 段｜積功 ${totalEffort(p)}／${PRODUCTION.rehearsalThreshold}`,
            `- 近事：${p.timeline.slice(-6).join('；')}`,
        ];
        out.push(prod.join('\n'));
    }

    // ── scenes ──
    const presentByScene = new Map<string, string[]>();
    for (const [charId, sceneId] of Object.entries(w.roster)) {
        (presentByScene.get(sceneId) ?? presentByScene.set(sceneId, []).get(sceneId)!).push(world.nameById(charId));
    }
    const sceneLines = w.scenes.map((s) => {
        const here = presentByScene.get(s.id) ?? [];
        return `- ${s.id} ${s.name}（privacy ${s.privacyLevel}）：${here.length ? `在場 ${here.join('、')}` : '空'}`;
    });
    out.push('### 場景（scenes · 此刻在場）\n\n' + (sceneLines.join('\n') || '（無場景）'));

    return out.join('\n\n');
}

// ── 4. per-tick timeline ────────────────────────────────────────────────────

function buildTimeline(records: LabTickRecord[], world: WorldState | null): string {
    const out: string[] = ['## 逐拍紀事'];
    if (!records.length) {
        out.push('（尚無走拍紀錄 ticks.jsonl）');
        return out.join('\n\n');
    }
    const nameOf = (id: string) => (world ? world.nameById(id) : id);
    const sceneOf = (id: string) => (world ? world.sceneNameById(id) : id);
    for (const record of records) {
        const block: string[] = [`### 第${record.day}日·第${record.tick}拍（${record.partOfDay}${record.night ? '·夜' : ''}）`];
        const routed = Object.entries(record.routed ?? {});
        if (routed.length) {
            block.push('移步：' + routed.map(([charId, sceneId]) => `${nameOf(charId)}→${sceneOf(sceneId)}`).join('、'));
        }
        for (const event of record.events) {
            const beats = event.beats.map(
                (b) => `  ${b.name}：${b.text}${b.inner ? `（心下 ${b.inner}）` : ''}${b.addressed ? `〔向 ${b.addressed}〕` : ''}`,
            );
            block.push(`〔${event.sceneName}${event.visibility === 'private' ? '·私' : ''}〕\n${beats.join('\n')}`);
        }
        const flags = [
            `resolved ${record.resolved}`,
            `beats ${record.beats}`,
            record.wove ? 'wove ✓' : 'wove ✗',
            record.episode ? 'episode ✓' : 'episode ✗',
        ];
        block.push('旗標：' + flags.join(' · '));
        if (record.economyNotices?.length) {
            block.push('銀錢告示：\n' + record.economyNotices.map((line) => `  - ${line}`).join('\n'));
        }
        out.push(block.join('\n'));
    }
    return out.join('\n\n');
}

// ── 5. raw engine log ───────────────────────────────────────────────────────

function buildEngineLog(engineLog: string): string {
    const out: string[] = ['## 引擎日誌（全）'];
    if (!engineLog.trim()) {
        out.push('（無 engine-log.txt；此卷可能在日誌落地功能之前走過，或尚未走拍）');
        return out.join('\n\n');
    }
    const lines = engineLog.split('\n');
    let body = engineLog;
    let note = '';
    if (lines.length > ENGINE_LOG_TAIL_LINES) {
        body = lines.slice(-ENGINE_LOG_TAIL_LINES).join('\n');
        note = `（日誌過長：已截去前 ${lines.length - ENGINE_LOG_TAIL_LINES} 行，僅存末 ${ENGINE_LOG_TAIL_LINES} 行）\n\n`;
    }
    out.push(note + '```text\n' + body.replace(/```/g, '`​``') + '\n```');
    return out.join('\n\n');
}

/**
 * Assemble the whole diagnostic Markdown for one run. Never throws: each
 * section is independently guarded so a partial run still exports.
 */
export function buildRunDiagnostics(runId: string): string {
    const meta = safe(() => readRunMeta(runId), () => null);
    const manifest = readManifest(runId);
    const world = safe(() => loadWorld(runId), () => null);

    // engine log source: durable file, falling back to the in-memory ring for a
    // run that was active before the on-disk tee existed.
    let engineLog = readTextFile(path.join(runDir(runId), 'engine-log.txt')) ?? '';
    if (!engineLog.trim()) {
        const active = safe(() => labManager().get(runId), () => undefined);
        if (active?.logs.length) engineLog = active.logs.map((l) => l.line).join('\n');
    }
    const records = safe(() => readTickRecords(runId), () => [] as LabTickRecord[]);

    return [
        safe(() => buildHeader(runId, meta, manifest, world), (m) => `# 卷宗診斷 · ${runId}\n\n（讀取失敗：${m}）`),
        safe(() => buildErrors(runId, engineLog), (m) => `## ⚠ 錯誤與警訊\n\n（讀取失敗：${m}）`),
        safe(() => buildWorld(world), (m) => `## 世界現況\n\n（讀取失敗：${m}）`),
        safe(() => buildTimeline(records, world), (m) => `## 逐拍紀事\n\n（讀取失敗：${m}）`),
        safe(() => buildEngineLog(engineLog), (m) => `## 引擎日誌（全）\n\n（讀取失敗：${m}）`),
    ].join('\n\n');
}
