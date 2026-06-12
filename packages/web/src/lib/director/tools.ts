/**
 * Director tool registry — NARRATIVE_AGENTS.md §12.1.
 *
 * One table maps tool name → tier + zh-TW description (shown to the LLM) +
 * executor (an existing server action). The same registry feeds:
 *   - the Showrunner heartbeat's tool-use loop (§12.2)
 *   - the admin DirectorChatPanel (§12.4)
 *
 * Tier policy (enforced by `executeDirectorTool`, not by prompt text):
 *   read      — unrestricted queries
 *   narrative — autonomous story writes (audit-logged; chain writes inside the
 *               wrapped actions already validate/dry-run on their own)
 *   config    — requires explicit human confirmation upstream (chat panel)
 *   danger    — never registered (deploy/reset CLI stays human-only)
 *
 * The tool-use protocol is provider-agnostic JSON-action (the TextClient has
 * no native function-calling surface): the model outputs
 * {"tool": "...", "args": {...}} and the loop appends the JSON result.
 */

import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { getSagaLiveSnapshot } from '@/lib/actions/saga-live';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { reconcileCharacterAction, reconcileSagaAction } from '@/lib/actions/reconcile-character';
import { runDirectorAction } from '@/lib/actions/run-director';
import { compileGazetteAction } from '@/lib/actions/compile-gazette';
import {
  evolvePortraitAction,
  type EvolvePortraitInput,
} from '@/lib/actions/evolve-portrait';
import {
  getRunnerControlStateAction,
  setRunnerPausedAction,
} from '@/lib/actions/runner-control';
import { runWorldAudit } from './audit';
import { fetchRecentGazetteTexts } from './observe';
import { saveArcPlan } from './memory-store';

export type ToolTier = 'read' | 'narrative' | 'config';

export interface DirectorToolDef {
  name: string;
  tier: ToolTier;
  /** zh-TW — rendered into the LLM prompt as the tool catalog. */
  description: string;
  /** zh-TW — JSON arg shape, rendered next to the description. */
  argsSpec: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolCallRecord {
  tool: string;
  tier: ToolTier;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
  /** JSON-serialized result (truncated) or error message. */
  outcome: string;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`參數 ${key} 必須是非空字串`);
  }
  return v.trim();
}

const TOOLS: DirectorToolDef[] = [
  // —— read ————————————————————————————————————————
  {
    name: 'get_world_time',
    tier: 'read',
    description: '讀世界時間（tick、第幾日、晨午暮夜）。',
    argsSpec: '{}',
    execute: () => getWorldTimeSnapshot(),
  },
  {
    name: 'get_saga_live',
    tier: 'read',
    description: '讀現場快照：各場景在場角色、開放中的事件（誰出牌了/還差誰）。',
    argsSpec: '{}',
    execute: () => {
      const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
      if (!sagaId) throw new Error('saga 尚未種子化');
      return getSagaLiveSnapshot(sagaId);
    },
  },
  {
    name: 'list_recruitments',
    tier: 'read',
    description: '列出所有徵召（含未開放的）：定位文案、性別要求、名額、開關狀態。',
    argsSpec: '{}',
    execute: () => listAllRecruitments(),
  },
  {
    name: 'run_world_audit',
    tier: 'read',
    description:
      '跑一次確定性世界巡檢：角色缺漏（肖像/圖集/標籤/persona/記憶）、卡住或進行中的事件、空場景、徵召狀態。回報 issues 清單。',
    argsSpec: '{}',
    execute: () => runWorldAudit(),
  },
  {
    name: 'get_runner_state',
    tier: 'read',
    description: '查 VPS world-loop runner 的狀態（是否設定、是否暫停）。',
    argsSpec: '{}',
    execute: () => getRunnerControlStateAction(),
  },
  {
    name: 'read_recent_gazettes',
    tier: 'read',
    description: '讀最近幾期公報內文（舊→新）——回答「最近劇情如何」先看這個。',
    argsSpec: '{"limit": 3}',
    execute: (args) =>
      fetchRecentGazetteTexts(ENDLESS_STORY_DEPLOYMENT.sagaId ?? '', {
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      }),
  },
  // —— narrative ———————————————————————————————————
  {
    name: 'reconcile_character',
    tier: 'narrative',
    description:
      '把一名角色補完整（缺什麼補什麼：肖像→圖集→標籤→persona→創世記憶→關係），冪等、可重跑。巡檢回報 character_gap 時用這個。',
    argsSpec: '{"characterId": "0x..."}',
    execute: (args) => reconcileCharacterAction(str(args, 'characterId')),
  },
  {
    name: 'reconcile_saga',
    tier: 'narrative',
    description:
      '全班逐一補漏（等同對每名角色跑 reconcile_character）。**昂貴**：只在缺漏面很廣時用，平常優先逐角色補。',
    argsSpec: '{}',
    execute: () => reconcileSagaAction(),
  },
  {
    name: 'direct_capabilities',
    tier: 'narrative',
    description:
      '以一段導演意圖驅動既有 capability catalog（open_storylet / character_call / relationship_seed / attribute_pressure / advance_phase / push_event）。意圖寫「要發生什麼」，不寫台詞。開新張力線用這個。',
    argsSpec: '{"intent": "導演意圖文字", "dryRun": false}',
    execute: (args) =>
      runDirectorAction({
        intent: str(args, 'intent'),
        dryRun: args.dryRun === true,
      }),
  },
  {
    name: 'compile_gazette',
    tier: 'narrative',
    description: '編一期公報（彙整當日鏈上事件+章節，錨定上鏈）。dryRun=true 只預覽不上鏈。',
    argsSpec: '{"day": 12, "dryRun": false}（day 可省略=今日）',
    execute: (args) =>
      compileGazetteAction({
        day: typeof args.day === 'number' ? args.day : undefined,
        dryRun: args.dryRun === true,
      }),
  },
  {
    name: 'set_runner_paused',
    tier: 'narrative',
    description:
      '暫停或恢復 VPS 上的 world-loop runner（世界總開關）。注意：心跳由 world-loop 觸發，暫停後心跳也會停，恢復只能靠 admin 或對話指令。用於發現世界狀態異常需要停機檢修，或 admin 明確要求。',
    argsSpec: '{"paused": true|false}',
    execute: (args) => setRunnerPausedAction({ paused: args.paused === true }),
  },
  {
    name: 'update_arc_plan',
    tier: 'narrative',
    description:
      '覆寫弧線計畫（Showrunner 的跨心跳記憶）。admin 給大方向時用這個記錄——寫**完整自含**的新版本（保留仍有效的舊內容、整合新指示），下次心跳會據此執行。',
    argsSpec: '{"arcPlan": "完整弧線計畫 markdown"}',
    execute: async (args) => {
      const mem = saveArcPlan(str(args, 'arcPlan'));
      return { ok: true, arcPlanUpdatedAt: mem.arcPlanUpdatedAt };
    },
  },
  {
    name: 'evolve_portrait',
    tier: 'narrative',
    description:
      '為角色出一張情境變體肖像（戲妝/老年/日常/自訂），上鏈留下形象演化軌跡。**出圖昂貴**：只在敘事上真的值得的時刻用。',
    argsSpec: '{"characterId": "0x...", "kind": "stage|old|casual|custom", "occasion": "情境描述（kind=custom 必填）"}',
    execute: (args) =>
      evolvePortraitAction({
        characterId: str(args, 'characterId'),
        kind: str(args, 'kind') as EvolvePortraitInput['kind'],
        occasion: typeof args.occasion === 'string' ? args.occasion : undefined,
      }),
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function listDirectorTools(allowTiers: ToolTier[]): DirectorToolDef[] {
  return TOOLS.filter((t) => allowTiers.includes(t.tier));
}

/** Render the catalog block for an LLM prompt. */
export function renderToolCatalog(allowTiers: ToolTier[]): string {
  return listDirectorTools(allowTiers)
    .map((t) => `- ${t.name} ${t.argsSpec}\n  ${t.description}`)
    .join('\n');
}

const OUTCOME_MAX = 4000;

/**
 * Execute one tool call with tier gating. Never throws — the loop feeds the
 * error string back to the model so it can correct itself.
 */
export async function executeDirectorTool(
  name: string,
  args: Record<string, unknown>,
  allowTiers: ToolTier[],
): Promise<ToolCallRecord> {
  const started = Date.now();
  const def = TOOL_MAP.get(name);
  if (!def) {
    return {
      tool: name,
      tier: 'read',
      args,
      ok: false,
      ms: 0,
      outcome: `未知工具「${name}」。可用：${listDirectorTools(allowTiers)
        .map((t) => t.name)
        .join(', ')}`,
    };
  }
  if (!allowTiers.includes(def.tier)) {
    return {
      tool: name,
      tier: def.tier,
      args,
      ok: false,
      ms: 0,
      outcome: `工具「${name}」屬於 ${def.tier} 級，本次執行情境未授權。`,
    };
  }
  try {
    const result = await def.execute(args);
    let outcome = JSON.stringify(result ?? null);
    if (outcome.length > OUTCOME_MAX) {
      outcome = `${outcome.slice(0, OUTCOME_MAX)}…(截斷)`;
    }
    return { tool: name, tier: def.tier, args, ok: true, ms: Date.now() - started, outcome };
  } catch (err) {
    return {
      tool: name,
      tier: def.tier,
      args,
      ok: false,
      ms: Date.now() - started,
      outcome: err instanceof Error ? err.message : String(err),
    };
  }
}
