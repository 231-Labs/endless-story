'use server';

/**
 * Server action — the Director-triggered "排一齣新戲". Reads the live saga cast,
 * maps it to the troupe engine's TroupeMember shape, wires the REAL MemWal memory
 * source (so 有感而發 comes from what characters actually lived), and runs the
 * production to premiere + anchors the 戲折 on chain via the runner service.
 *
 * Mirrors compile-gazette.ts (admin keypair + runner.runOnce). The Showrunner
 * invokes this through the `launch_production` tool (gated; see tools.ts +
 * docs/narrative/PRODUCTION_ENGINE.md §2).
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { production as runnerProduction } from '@endless-story/runner';
import {
    castingFromRole,
    resolvePlay,
    type Gender,
    type MemorySource,
    type Production,
    type TroupeMember,
} from '@endless-story/troupe';
import { getAdminContext } from '@/lib/chain/admin-signer';
import { buildSagaRoster, type SagaRosterEntry } from '@/lib/chain/roster';
import { recallStructuredForCharacter } from '@/lib/chain/memory';
import { fetchOnChainEdgesFrom, toneLabel } from '@/lib/chain/relationships';

const RECALL_Q = '人物印象 關係 牽掛 競爭 舊事 心結 情份 提攜';

function rosterToTroupe(entries: SagaRosterEntry[]): TroupeMember[] {
  return entries.map((e): TroupeMember => {
    const { hangdang, yinggong } = castingFromRole(e.role);
    const actorGender: Gender = /female|女/i.test(e.gender) ? 'female' : 'male';
    return {
      id: e.id,
      chainId: e.id, // on-chain Character object id → the MemWal key
      name: e.name,
      hangdang,
      yinggong: [yinggong],
      actorGender,
      skills: [], // induct derives from 行當
      memories: [], // filled by the MemWal source below
      relationships: [],
      voice: e.brief ? e.brief.slice(0, 40) : undefined,
    };
  });
}

/** Assemble the full produced text (劇本 + 詞 + 戲中戲章回) for preview / Dry-Run. */
function buildPreview(prod: Production): string {
    const out: string[] = [];
    if (prod.brief) {
        out.push(`# 《${prod.brief.title}》（${prod.brief.classicSource}·舊戲新唱）`);
        out.push(`> ${prod.brief.premise.split('\n')[0]}`, '');
    }
    if (prod.script) {
        out.push(`## 劇本　編劇：${prod.script.authorName}`);
        for (const sc of prod.script.scenes) {
            out.push('', `### 第${sc.sceneId.slice(1)}場 〈${sc.title}〉（${sc.mood}）`);
            for (const l of sc.lines) {
                out.push(
                    l.type === 'stage'
                        ? `（科介）${l.text}`
                        : `${l.who}${l.mode === '唱' ? '（唱）' : '（白）'}：${l.text}`,
                );
            }
        }
        out.push('');
    }
    if (prod.ci && prod.ci.length) {
        out.push('## 詞');
        for (const c of prod.ci) {
            out.push('', `### ${c.title}　〔${c.source === 'emergent' ? '有感而發' : '應場填詞'}〕${c.authorName}`);
            if (c.provenance) out.push(`*出處：${c.provenance.why}*`);
            out.push(...c.lines.map((l) => `　${l}`));
        }
        out.push('');
    }
    if (prod.chapter) {
        out.push('## 戲中戲章回', '', prod.chapter);
    }
    if (prod.takes && prod.takes.length) {
        out.push('', '## 各角視角');
        for (const t of prod.takes) {
            const cross = prod.cast?.find((c) => c.partId === t.partId)?.crossCastLabel;
            out.push('', `### ${t.actorName} 飾 ${t.partName}${cross ? `〔${cross}〕` : ''}`, '', t.pov);
        }
    }
    return out.join('\n');
}

// mood → cinematography, 行當 → 身段 vocabulary for the Seedance prompt.
const MOOD_CINE: Record<string, string> = {
    sorrow: '冷青色調、緩慢節奏、淚光與長鏡，哀而不傷',
    longing: '暖黃微光、悠緩呼吸感、淺景深，含蓄思念',
    tense: '壓抑明暗對比、漸快剪接、手持微晃，山雨欲來',
    joy: '明亮通透、輕快流暢、暖陽，喜氣盈盈',
    wrath: '高反差剛烈光、快推快搖、煙塵，怒意奔湧',
    serene: '素淨柔光、舒緩平移、大量留白，澄澈',
};
const HANGDANG_MOVE: Record<string, string> = {
    生: '儒雅台步、折扇開合、書卷身段',
    旦: '水袖輕揚、雲手、碎步、眼波流轉',
    淨: '架式威重、髯口功、亮相剛猛',
    丑: '俏皮身段、插科打諢的小動作',
    樂: '文武場伴奏，不登場',
};

/**
 * Build a Seedance 2.0 TEXT prompt per scene from the produced Scene[]/Cast[].
 * NOTE: this is TEXT-to-video — it does NOT inherit the cast's anchor identity
 * (CONTENT_PIPELINE §4 mandates image-to-video with a 劇照 first frame for the
 * consistency-closed pipeline). This is an admin PREVIEW artifact to hand-test
 * Seedance, not the production-consistency path. Pure; no API call, nothing anchored.
 */
function buildSeedancePrompts(prod: Production): Array<{ sceneTitle: string; prompt: string }> {
    if (!prod.script) return [];
    const byPart = new Map((prod.cast ?? []).map((c) => [c.partId, c]));
    return prod.script.scenes.map((sc) => {
        const onstage = sc.parts.map((pid) => byPart.get(pid)).filter((c) => !!c && !!c.assignedId);
        const figures = onstage.map((c) => {
            const move = HANGDANG_MOVE[c!.hangdang] || '戲曲身段';
            const cross = c!.crossCastLabel ? `（${c!.crossCastLabel}反串）` : '';
            return `· ${c!.partName}（${c!.hangdang}/${c!.yinggong}，演員 ${c!.assignedName ?? ''}${cross}）：${move}`;
        });
        const beat = sc.beats[0]?.summary ?? sc.title;
        const cine = MOOD_CINE[sc.mood] ?? '戲曲舞台寫實';
        const prompt = [
            '中國越劇/京劇舞台短片，15 秒，單一連續鏡頭。',
            `場景：〈${sc.title}〉—— ${beat}`,
            `氣質與運鏡：${cine}。`,
            '登台角色（華麗戲服、臉譜、頭飾；身段如下）：',
            ...figures,
            '舞台：傳統戲台、一桌二椅式寫意佈景、暖色追光，背景虛化；畫面無字幕、無浮水印。',
            `動態：以${cine.split('、')[0]}起勢，角色做出上述身段並完成一次「亮相」定式；鏡頭緩緩推近主角面部收束。`,
        ].join('\n');
        return { sceneTitle: sc.title, prompt };
    });
}

export interface LaunchProductionActionInput {
  /** repertoire key/別名; omit → 班主自選. */
  classicKey?: string;
  skipScore?: boolean;
  dryRun?: boolean;
  /** 指定選角：角色名(partName) → 角色 id(characterId)。需同時給 classicKey 才生效；未指定的角色自動選。 */
  cast?: Record<string, string>;
}

export interface LaunchProductionActionResult {
  ok: boolean;
  title?: string;
  classicKey?: string;
  cast?: Array<{ part: string; actor: string; crossCast?: string }>;
  scenes?: number;
  emergent?: Array<{ author: string; why?: string }>;
  anchored: boolean;
  commitmentId?: string;
  blobId?: string;
  digest?: string;
  /** full produced text — 劇本 + 詞 + 戲中戲章回（preview / Dry-Run）. */
  content?: string;
  /** per-scene Seedance 2.0 text prompts (hand-paste to make a 15s clip). */
  seedancePrompts?: Array<{ sceneTitle: string; prompt: string }>;
  llm?: { calls: number; failures: number; ms: number };
  error?: string;
}

export async function launchProductionAction(
  input: LaunchProductionActionInput,
): Promise<LaunchProductionActionResult> {
  const d = ENDLESS_STORY_DEPLOYMENT;
  if (!d.sagaId || !d.storytellerCapId) {
    return { ok: false, anchored: false, error: 'saga 尚未種子化' };
  }

  let admin;
  try {
    admin = getAdminContext();
  } catch (err) {
    return { ok: false, anchored: false, error: err instanceof Error ? err.message : 'admin keypair 載入失敗' };
  }

  const entries = await buildSagaRoster(d.sagaId).catch(() => [] as SagaRosterEntry[]);
  if (entries.length < 3) {
    return { ok: false, anchored: false, error: `班底不足（${entries.length} 角），排不了戲` };
  }
  const roster = rosterToTroupe(entries);
  const byChain = new Map(roster.filter((m) => m.chainId).map((m) => [m.chainId!, m.id]));

  // 指定選角：partName → characterId（UI/工具給）→ partId → member.id(=chainId)。
  // 需要 classicKey（戲碼確定才知道有哪些角色）；只認 roster 內的角色 id。
  let castOverrides: Record<string, string> | undefined;
  if (input.cast && input.classicKey) {
    const nameToPartId = new Map(resolvePlay(input.classicKey).parts.map((p) => [p.partName, p.partId]));
    const validIds = new Set(roster.map((m) => m.id));
    const map: Record<string, string> = {};
    for (const [partName, charId] of Object.entries(input.cast)) {
      const pid = nameToPartId.get(partName);
      if (pid && charId && validIds.has(charId)) map[pid] = charId;
    }
    if (Object.keys(map).length) castOverrides = map;
  }

  // REAL memory source: a character's accumulated MemWal memories + on-chain
  // relationship edges. Graceful — empty ⇒ induct falls back to LLM generation.
  const source: MemorySource = async (member) => {
    if (!member.chainId) return null;
    const [recalled, edges] = await Promise.all([
      recallStructuredForCharacter(member.chainId, RECALL_Q, 8).catch(() => []),
      fetchOnChainEdgesFrom(member.chainId).catch(() => []),
    ]);
    const memories = recalled.map((r, i) => ({ id: `mw_${member.id}_${i}`, text: r.text }));
    const relationships = edges.map((e) => ({
      withId: byChain.get(e.toId) ?? e.toId,
      kind: e.tone ? toneLabel(e.tone) : e.label || '相識',
      intensity: Math.max(0, Math.min(100, Math.round((e.weight ?? 0) * 10))),
      note: e.summary || e.label,
    }));
    if (memories.length === 0 && relationships.length === 0) return null;
    return { memories, relationships };
  };

  try {
    const res = await runnerProduction.runOnce({
      sagaId: d.sagaId,
      roster,
      classicKey: input.classicKey,
      skipScore: input.skipScore,
      auto: true, // induct (skills + social web) + 班主自選 + 角色自判有感而發
      castOverrides, // 指定選角（欽點）優先，其餘自動
      source,
      signer: input.dryRun ? undefined : { keypair: admin.signer, storytellerCapId: d.storytellerCapId },
      dryRun: input.dryRun,
    });
    const prod = res.production;
    return {
      ok: res.anchored || input.dryRun === true,
      title: prod.brief?.title,
      classicKey: prod.classicKey,
      cast: (prod.cast ?? []).map((c) => ({
        part: c.partName,
        actor: c.assignedName ?? '（缺角）',
        crossCast: c.crossCastLabel ?? undefined,
      })),
      scenes: prod.script?.scenes.length,
      emergent: (prod.ci ?? [])
        .filter((c) => c.source === 'emergent')
        .map((c) => ({ author: c.authorName, why: c.provenance?.why })),
      anchored: res.anchored,
      commitmentId: res.commitmentId,
      blobId: res.blobId,
      digest: res.digest,
      content: buildPreview(prod),
      seedancePrompts: buildSeedancePrompts(prod),
      llm: res.llm ? { calls: res.llm.calls, failures: res.llm.failures, ms: res.llm.ms } : undefined,
    };
  } catch (err) {
    return { ok: false, anchored: false, error: err instanceof Error ? err.message : String(err) };
  }
}
