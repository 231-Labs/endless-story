/**
 * Deterministic world audit — the AUDIT step of the Showrunner heartbeat
 * (NARRATIVE_AGENTS.md §12.2).
 *
 * Pure reads, zero LLM: "discovery" is code's job; the LLM only decides what
 * to do about the findings. Character-gap checks mirror the reconcile action's
 * detection logic (same chain reads) but REPORT instead of fix — repair is a
 * separate tool call so the heartbeat can budget it.
 */

import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { resolveNetwork } from '@/lib/chain/network';
import { fetchOnChainPersona } from '@/lib/chain/persona-read';
import { getMemoryCount } from '@/lib/chain/memory-counter';
import { getSagaLiveSnapshot } from '@/lib/actions/saga-live';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';

/** kind=6 setting_sheet marks "additional gallery views were generated". */
const SETTING_SHEET_KIND = 6;

export type AuditIssueCode =
  | 'character_gap'
  | 'event_unresolved'
  | 'event_waiting'
  | 'scene_empty'
  | 'no_open_recruitment';

export type AuditSeverity = 'warn' | 'info';

export interface AuditIssue {
  code: AuditIssueCode;
  severity: AuditSeverity;
  /** zh-TW, written to be injected straight into the heartbeat prompt. */
  message: string;
  characterId?: string;
  eventId?: string;
  sceneId?: string;
  /** For character_gap: which enrichments are missing. */
  gaps?: string[];
  /** Registry tool that fixes this issue, if mechanical. */
  suggestedTool?: string;
}

export interface WorldAuditReport {
  ok: boolean;
  day?: number;
  /** 鏡像世界的敘事日期（「民國十五年八月五日」）；tick 世界缺席。 */
  dateLabel?: string;
  currentTick?: number;
  castCount: number;
  openEventCount: number;
  issues: AuditIssue[];
  /** Compact zh-TW block for LLM prompt injection. */
  summary: string;
  error?: string;
}

interface ChainCharacterJson {
  image_url?: string;
  media_assets?: Array<{ kind?: string | number; uri?: string }>;
  tags?: Array<{ label?: string }>;
  profile?: { name?: string };
}

/** Read-only version of reconcile's gap detection for one character. */
async function detectCharacterGaps(
  client: ReturnType<typeof makeSuiClient>,
  characterId: string,
): Promise<{ name: string; gaps: string[] } | null> {
  let json: ChainCharacterJson | undefined;
  try {
    const res = (await read.character.getCharacter(client, characterId)) as {
      json?: ChainCharacterJson;
    } | null;
    json = res?.json ?? undefined;
  } catch {
    return null;
  }
  if (!json) return null;

  const gaps: string[] = [];
  const mediaAssets = Array.isArray(json.media_assets) ? json.media_assets : [];
  const hasCover =
    (typeof json.image_url === 'string' && json.image_url.length > 0) ||
    Boolean(mediaAssets[0]?.uri);
  if (!hasCover) gaps.push('portrait');
  if (!mediaAssets.some((a) => Number(a.kind) === SETTING_SHEET_KIND)) gaps.push('views');
  if (!Array.isArray(json.tags) || json.tags.length === 0) gaps.push('tags');

  const hasPersona = (await fetchOnChainPersona(characterId).catch(() => null)) != null;
  if (!hasPersona) gaps.push('persona');

  const memCount = await getMemoryCount(characterId).catch(() => null);
  // null ⇒ counter unconfigured — not a gap, just unverifiable.
  if (memCount === 0) gaps.push('memory');

  return { name: json.profile?.name ?? characterId.slice(0, 8), gaps };
}

function buildSummary(report: Omit<WorldAuditReport, 'summary'>): string {
  // 鏡像世界的巡檢報日期，tick 世界仍報日序。
  const when = report.dateLabel ?? `第 ${report.day ?? '?'} 日`;
  const lines: string[] = [
    `【世界巡檢】${when} · 在班 ${report.castCount} 人 · 開放事件 ${report.openEventCount} 件`,
  ];
  if (report.issues.length === 0) {
    lines.push('- 無待處理項。');
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity === 'warn' ? '!' : 'i'}] ${issue.message}`);
    }
  }
  return lines.join('\n');
}

/** Full deterministic sweep. Read-only; safe to run every heartbeat. */
export async function runWorldAudit(): Promise<WorldAuditReport> {
  const d = ENDLESS_STORY_DEPLOYMENT;
  const issues: AuditIssue[] = [];

  if (!d.sagaId || !d.packageId) {
    return {
      ok: false,
      castCount: 0,
      openEventCount: 0,
      issues,
      summary: '',
      error: 'saga 尚未種子化',
    };
  }

  const client = makeSuiClient({ network: resolveNetwork() });

  // —— 時間 / 現場快照 ————————————————————————————————
  const time = await getWorldTimeSnapshot().catch(() => null);
  const live = await getSagaLiveSnapshot(d.sagaId).catch(() => null);

  // —— 角色缺漏 ————————————————————————————————————
  let castCount = 0;
  try {
    const chars = await read.character.listMintedCharacterSummaries(client, d.packageId, {
      sagaId: d.sagaId,
    });
    castCount = chars.length;
    for (const c of chars) {
      const det = await detectCharacterGaps(client, c.characterId);
      if (!det || det.gaps.length === 0) continue;
      issues.push({
        code: 'character_gap',
        severity: 'warn',
        characterId: c.characterId,
        gaps: det.gaps,
        suggestedTool: 'reconcile_character',
        message: `角色「${det.name}」缺 ${det.gaps.join('/')} —— 可用 reconcile_character 補齊。`,
      });
    }
  } catch (err) {
    issues.push({
      code: 'character_gap',
      severity: 'info',
      message: `角色名冊讀取失敗（${err instanceof Error ? err.message : String(err)}），本輪略過角色缺漏檢查。`,
    });
  }

  // —— 事件狀態 ————————————————————————————————————
  // A fully-acted event is NOT "stuck" — in spine mode it lingers on purpose (so
  // reactions land) and the spine resolves it a couple ticks later. Only flag it as
  // unresolved (worth pushing) once it's been open PAST the spine's max linger (~8min);
  // before that it's a normal linger the director should leave alone, not janitor.
  const STUCK_EVENT_MS = 10 * 60 * 1000;
  const nowMs = Date.now();
  const openEvents = live?.openEvents ?? [];
  for (const ev of openEvents) {
    const total = ev.participantIds.length;
    const allActed = total > 0 && ev.actedCount >= total;
    const ageMs = ev.openedAtMs ? nowMs - ev.openedAtMs : 0;
    if (allActed && ageMs >= STUCK_EVENT_MS) {
      issues.push({
        code: 'event_unresolved',
        severity: 'warn',
        eventId: ev.eventId,
        sceneId: ev.sceneId,
        message: `事件「${ev.title}」全員已出牌（${ev.actedCount}/${total}）且已開 ${Math.round(ageMs / 60000)} 分鐘仍未收尾 —— spine 收尾疑似卡住，可推進收尾。`,
      });
    } else {
      issues.push({
        code: 'event_waiting',
        severity: 'info',
        eventId: ev.eventId,
        sceneId: ev.sceneId,
        message: allActed
          ? `事件「${ev.title}」全員已出牌（${ev.actedCount}/${total}），spine 收尾中（正常 linger，先別動）。`
          : `事件「${ev.title}」進行中（${ev.actedCount}/${total} 已出牌）。`,
      });
    }
  }

  // —— 場景冷熱 ————————————————————————————————————
  for (const s of live?.scenes ?? []) {
    if (s.presentCharacterIds.length === 0) {
      issues.push({
        code: 'scene_empty',
        severity: 'info',
        sceneId: s.sceneId,
        message: `場景 ${s.sceneId.slice(0, 8)}… 目前無人。`,
      });
    }
  }

  // —— 徵召 ————————————————————————————————————————
  try {
    const recruits = await listAllRecruitments();
    if (!recruits.some((r) => r.active)) {
      issues.push({
        code: 'no_open_recruitment',
        severity: 'info',
        message: '目前沒有任何開放中的徵召 —— 若想引入新血/新張力，可考慮開一張。',
      });
    }
  } catch {
    // store unavailable — skip silently
  }

  const partial = {
    ok: true,
    day: live?.day ?? undefined,
    dateLabel: time?.dateLabel,
    currentTick: time?.currentTick,
    castCount,
    openEventCount: openEvents.length,
    issues,
  };
  return { ...partial, summary: buildSummary(partial) };
}
