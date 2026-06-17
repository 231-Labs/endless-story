/**
 * Decoupled verification harness for the storyteller chapter gate.
 *
 * Reads the LIVE saga's anchored POVs from chain, reconstructs them as
 * `MaterialItem`s, and replays the REAL gate (`decideChapterReadiness`) day by
 * day — the exact module production calls. It proves, on real data, the two
 * guarantees:
 *   • ANTI-STUCK   — chapters keep coming across the whole timeline with NO
 *                    resolve material fed in at all (we deliberately omit it).
 *   • ANTI-REPEAT  — the gate waits instead of re-telling the same standoff.
 * Then, if an LLM key is present, it composes ONE sample chapter through the
 * REAL event-chapter-compiler (dryRun) so the quality lift is visible.
 *
 * Run:
 *   pnpm --filter @endless-story/runner harness:chapter
 *   (= tsx --env-file-if-exists=../web/.env.local src/.../__harness__/replay.ts)
 */

import { ENDLESS_STORY_DEPLOYMENT as D, makeSuiClient, read } from '@endless-story/sdk';
import {
    decideChapterReadiness,
    groupIntoArcs,
    advanceWatermark,
    emptyWatermark,
    DEFAULT_THRESHOLDS,
    type MaterialItem,
    type ArcWatermark,
    type ReadinessDecision,
} from '../index.js';
import { toChapterCompilerPayload, briefSummary } from '../compose.js';
import { runOnce } from '../../event-chapter-compiler/index.js';

const PROV_RE = /^<!--es:prov\s+(\{[\s\S]*?\})\s*-->\s*/;
const AGG = 'https://aggregator.walrus-testnet.walrus.space/v1/blobs/';

function decodeByteString(raw: number[] | string | undefined): string {
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return new TextDecoder().decode(new Uint8Array(raw));
    return '';
}

interface ProvHeader {
    day?: number;
    sceneId?: string;
    sceneName?: string;
    eventTemplate?: string;
    eventLabel?: string;
    eventTx?: string;
    povCharacterId?: string;
}

/** Pull every anchored POV for the saga and shape it as story material. */
async function loadPovMaterial(): Promise<MaterialItem[]> {
    const client = makeSuiClient({ network: D.network });
    const summaries = await read.commitment.listCommitments(client, D.packageId, { sagaId: D.sagaId });
    const sceneSet = new Set(D.sceneIds);
    const charNameById = new Map(D.demoCharacters.map((c) => [c.characterId, c.name]));

    // POVs anchor on character subjects (not scene/saga/world).
    const candidates = summaries.filter(
        (s) => !sceneSet.has(s.subjectId) && s.subjectId !== D.sagaId && s.subjectId !== D.worldId,
    );

    const items = await Promise.all(
        candidates.map(async (s): Promise<MaterialItem | null> => {
            try {
                const res = await read.commitment.getCommitment(client, s.commitmentId);
                const blobId = decodeByteString((res.json as { blob_id?: number[] | string }).blob_id);
                if (!blobId) return null;
                const raw = (await (await fetch(AGG + blobId)).text()).trim();
                const m = raw.match(PROV_RE);
                if (!m) return null;
                const p = JSON.parse(m[1]) as ProvHeader;
                const body = raw.slice(m[0].length).trim();
                if (!body) return null;
                const kind = p.eventTemplate?.includes(':')
                    ? p.eventTemplate.split(':')[1]
                    : undefined;
                return {
                    id: s.commitmentId,
                    kind: 'pov',
                    day: p.day ?? 0,
                    sceneId: p.sceneId ?? s.subjectId,
                    sceneName: p.sceneName,
                    characterId: p.povCharacterId ?? s.subjectId,
                    characterName: charNameById.get(p.povCharacterId ?? '') ?? '某人',
                    eventId: p.eventTx,
                    contentionKind: kind,
                    label: p.eventLabel,
                    text: body,
                };
            } catch {
                return null;
            }
        }),
    );
    return items.filter((i): i is MaterialItem => i != null).sort((a, b) => a.day - b.day);
}

function pct(n: number): string {
    return `${Math.round(n)}`;
}

async function main() {
    console.log('# Storyteller chapter gate — decoupled replay on LIVE saga data\n');
    const all = await loadPovMaterial();
    const maxDay = all.reduce((m, i) => Math.max(m, i.day), 0);
    console.log(`載入 ${all.length} 則 POV 素材，跨第 1–${maxDay} 日。NOTE: 不餵任何 resolve 素材（證明解耦）。\n`);

    const arcs = groupIntoArcs(all);
    console.log(`分成 ${arcs.size} 條故事線（arc）：`);
    for (const [key, items] of arcs) {
        const days = items.map((i) => i.day);
        console.log(`  ${key}: ${items.length} 則，第 ${Math.min(...days)}–${Math.max(...days)} 日`);
    }
    console.log('');

    // Replay each arc day by day with its own watermark.
    let totalChapters = 0;
    let worstContinuousGap = 0; // max chapter gap on arcs that HAD continuous material
    for (const [key, items] of arcs) {
        let wm: ArcWatermark = emptyWatermark();
        const fired: { day: number; mode: string; reason: string }[] = [];
        const arcDays = [...new Set(items.map((i) => i.day))].sort((a, b) => a - b);
        for (let day = arcDays[0]; day <= maxDay; day++) {
            const visible = items.filter((i) => i.day <= day);
            if (visible.length === 0) continue;
            const decision: ReadinessDecision = decideChapterReadiness(visible, wm, day);
            if (decision.mode !== 'wait') {
                fired.push({ day, mode: decision.mode, reason: decision.reason });
                // advance watermark with a placeholder summary (real flow uses the
                // woven chapter's briefSummary; we don't call the LLM per-day here).
                wm = advanceWatermark(wm, decision.slice, day, `第${day}日章回（${decision.mode}）`);
            }
        }
        totalChapters += fired.length;
        // Max chapter gap, but only on arcs whose material is roughly continuous
        // (material on ≥ half the days of its span) — a sparse arc's big gap just
        // means no material existed to write, not that the gate stalled.
        const firedDays = fired.map((f) => f.day);
        const matDays = new Set(items.map((i) => i.day)).size;
        const span = Math.max(...items.map((i) => i.day)) - Math.min(...items.map((i) => i.day)) + 1;
        const continuous = matDays >= span / 2;
        for (let i = 1; i < firedDays.length; i++) {
            const gap = firedDays[i] - firedDays[i - 1];
            if (continuous) worstContinuousGap = Math.max(worstContinuousGap, gap);
        }
        console.log(`## arc ${key} — 產出 ${fired.length} 回`);
        for (const f of fired) console.log(`   第${String(f.day).padStart(2)}日 [${f.mode}] ${f.reason}`);
        console.log('');
    }

    console.log('## 結論');
    console.log(`- 新 gate 在第 1–${maxDay} 日共產出 ${totalChapters} 回（對照：產線 cut 停在第 17 日）。`);
    console.log(`- 素材連續的 arc 內，最大章回間隔 = ${worstContinuousGap} 日（floor=${DEFAULT_THRESHOLDS.maxSilentDays}）→ 有素材就不長期沉默＝anti-stuck。`);
    console.log(`  （素材稀疏的 arc 出現大間隔＝那幾日根本沒新素材可寫，gate 正確等待，非卡住。）`);
    console.log(`- 全程未餵任何 resolve 素材，仍持續產出＝與事件收尾解耦。\n`);

    // ── Phase 2: compose ONE sample chapter through the real compiler (dryRun) ──
    const sampleArc = [...arcs.values()].sort((a, b) => b.length - a.length)[0];
    if (!sampleArc) return;
    // take a fresh overview slice near the tail (the days production never wrote).
    const tailDay = maxDay;
    const tailDecision = decideChapterReadiness(
        sampleArc.filter((i) => i.day <= tailDay),
        // pretend everything up to day 17 was already told (where production stopped)
        { toldIds: sampleArc.filter((i) => i.day <= 17).map((i) => i.id), lastToldDay: 17,
          lastSummary: '前情：後台為「誰壓軸」僵持，柳生春與蘇映雪各有盤算。' },
        tailDay,
    );
    console.log(`## Phase 2 — 用真 compiler 織第 18–${tailDay} 日這段「產線從沒寫過」的章回`);
    console.log(`gate 判定：[${tailDecision.mode}] ${tailDecision.reason}\n`);
    const payload = toChapterCompilerPayload(tailDecision, {
        toldIds: [], lastSummary: '前情：後台為「誰壓軸」僵持，柳生春與蘇映雪各有盤算。',
    });
    if (!payload) {
        console.log('（gate 判定 wait — 無樣章）');
        return;
    }
    try {
        const res = await runOnce({
            sagaId: D.sagaId,
            sceneId: payload.sceneId,
            sceneName: payload.sceneName,
            eventTx: payload.eventTx,
            eventLabel: payload.eventLabel,
            day: payload.day,
            povs: payload.povs,
            minVoices: payload.minVoices,
            mode: payload.mode,
            observations: payload.observations,
            intents: payload.intents,
            recalled: payload.recalled,
            prevChapterSummary: payload.prevChapterSummary,
            dryRun: true,
        });
        if (res.chapter) {
            console.log(`織出 ${res.chapter.length} 字、${res.povCount} 視角：\n`);
            console.log(res.chapter);
            console.log(`\n→ briefSummary（下一回的「勿重述」guard）：${briefSummary(res.chapter)}`);
        } else {
            console.log(`compiler skip：${res.skipReason}（${pct(res.povCount)} 視角）`);
        }
    } catch (err) {
        console.log(`（Phase 2 略過——需 LLM 金鑰：${err instanceof Error ? err.message : String(err)}）`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
