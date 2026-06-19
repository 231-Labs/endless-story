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
import { launchProductionAction } from '@/lib/actions/launch-production';
import { registerResourceAction } from '@/lib/actions/register-resource';
import {
  getRunnerControlStateAction,
  setRunnerPausedAction,
} from '@/lib/actions/runner-control';
import { runWorldAudit } from './audit';
import { fetchRecentGazetteTexts } from './observe';
import { saveArcPlan } from './memory-store';
import {
  fetchCharacterDetail,
  fetchSagaRosterSnapshot,
  resolveCharacterId,
} from './character-inspect';

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
    description:
      '讀現場快照：各場景在場角色 id、開放中的事件（誰出牌了/還差誰）、最新 scene line。要角色名與所在請用 list_saga_roster；要 persona/關係/記憶請用 get_character_detail。',
    argsSpec: '{}',
    execute: () => {
      const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
      if (!sagaId) throw new Error('saga 尚未種子化');
      return getSagaLiveSnapshot(sagaId);
    },
  },
  {
    name: 'list_saga_roster',
    tier: 'read',
    description:
      '讀全班名冊：每名角色的 id、行當、性別、年齡、公開簡介、目前場景（含「誰擠在哪」分組）。查「全班現在在哪」或找 characterId 時先用這個。',
    argsSpec: '{}',
    execute: async () => {
      const snap = await fetchSagaRosterSnapshot();
      if (!snap) throw new Error('saga 尚未種子化');
      return snap;
    },
  },
  {
    name: 'get_character_detail',
    tier: 'read',
    description:
      '讀單一角色完整狀態：公開 profile、本色 persona（軸/腔/界）、鏈上關係圖、主觀 relationship hints、近期記憶片段、經濟 survival、所在場景與最新對白。**查角色設定/OOC 防線用這個**，不是 reconcile_character。',
    argsSpec: '{"characterId": "0x...", "name": "方競西"}（二選一；也可都填）',
    execute: async (args) => {
      const resolved = await resolveCharacterId({
        characterId: typeof args.characterId === 'string' ? args.characterId : undefined,
        name: typeof args.name === 'string' ? args.name : undefined,
      });
      if (!resolved.id) {
        throw new Error(resolved.hint ?? '找不到角色');
      }
      const detail = await fetchCharacterDetail(resolved.id);
      if (!detail) throw new Error(`角色 ${resolved.id} 讀取失敗`);
      return detail;
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
      '把一名角色補完整（缺什麼補什麼：肖像→圖集→標籤→persona→創世記憶→關係），冪等、可重跑。巡檢回報 character_gap 時用這個。**只回報補漏步驟，不回傳 persona 內文**——查角色現況請用 get_character_detail。',
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
      '為角色出一張情境變體肖像（戲妝/老年/日常/真人版/自訂），上鏈留下形象演化軌跡。戲妝會把油彩妝畫在角色的基底臉上（img2img）；stage=水墨戲妝、stage-real=真人寫真戲妝、realistic=真人寫真版。**出圖昂貴**：只在敘事上真的值得的時刻用。',
    argsSpec: '{"characterId": "0x...", "kind": "reference|stage|stage-real|finery|daily|youth|aged|illness|snow|realistic|custom", "occasion": "情境描述（kind=custom 必填）"}',
    execute: (args) =>
      evolvePortraitAction({
        characterId: str(args, 'characterId'),
        kind: str(args, 'kind') as EvolvePortraitInput['kind'],
        occasion: typeof args.occasion === 'string' ? args.occasion : undefined,
      }),
  },
  {
    name: 'register_resource',
    tier: 'narrative',
    description:
      '為這條故事弧「立題」——在鏈上開一個全新的、眾人會爭的稀缺標的，給既有張力一個新出口（例：報館要捧的新人名額、碼頭一筆來路不明的贊助、失傳戲的總講、某人攥在手裡的把柄）。**用於你判斷劇情繞著舊那幾種資源打轉、需要新題材時。** kind 要全新（英文小寫slug；不可是任何既有內建類，如 spotlight/partnership/mentorship/belonging/solace/keepsake），同一 kind 只能有一個；導演自造的標的上限 3（已結算的會自動退場騰位）。capacity 通常 1（越稀缺越有戲）。**wantedBy（建議填）**：列出真正會爭這標的行當（如 ["武旦","老生"]），只有他們會發燒、其餘人不爭——不填則全班一律中等地想要（較扁平）。新標的下一個 tick 會自動長出慾望並照常結算。dryRun=true 只驗不上鏈。',
    argsSpec: '{"kind": "ascii小寫slug(如 feud/patron/scandal)", "display": "中文標的名(≤24字)", "wantedBy": ["武旦","老生"], "capacity": 1, "dryRun": false}',
    execute: (args) =>
      registerResourceAction({
        kind: str(args, 'kind'),
        display: str(args, 'display'),
        wantedBy: Array.isArray(args.wantedBy)
          ? args.wantedBy.filter((s): s is string => typeof s === 'string')
          : undefined,
        capacity: typeof args.capacity === 'number' ? args.capacity : undefined,
        dryRun: args.dryRun === true,
      }),
  },
  {
    name: 'launch_production',
    tier: 'narrative',
    description:
      '排一齣新戲（舊戲新唱）：以全班為班底，班主自選戲碼（或指定 classicKey）→ 編劇寫本 → 行當選角（含乾旦/坤生）→ 琴師作曲 → 角色有感而發填詞 → 全體演戲中戲 → 鑄成「戲折」錨定上鏈。**極昂貴**（多次 LLM＋上鏈），且你要**自己判斷時機**：班底齊整（生旦淨丑有人）、金庫撐得起、敘事上真該排大戲時才用——這是導演級的決定。dryRun=true 只跑不上鏈。',
    argsSpec:
      '{"classicKey": "baishe｜honglou｜大戲（省略=班主自選；要指定選角時必填）", "cast": {"許仙": "0x角色id", "白素貞": "0x角色id"}（可省，欽點誰演某角色名→角色 id；未指定者自動選；角色名須是該戲碼的角色）, "skipScore": false, "dryRun": false}',
    execute: (args) =>
      launchProductionAction({
        classicKey: typeof args.classicKey === 'string' ? args.classicKey : undefined,
        skipScore: args.skipScore === true,
        dryRun: args.dryRun === true,
        cast:
          args.cast && typeof args.cast === 'object' && !Array.isArray(args.cast)
            ? (args.cast as Record<string, string>)
            : undefined,
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
