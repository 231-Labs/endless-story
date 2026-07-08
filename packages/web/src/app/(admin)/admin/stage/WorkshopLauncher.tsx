'use client';

import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import type { Character, Scene } from '@endless-story/shared';
import { InfoHint } from '@/components/common/InfoHint';
import { FoundingCastPanel } from '../director/FoundingCastPanel';
import { DirectorPanel } from '../director/DirectorPanel';
import { DirectorBeatPanel } from '../director/DirectorBeatPanel';
import { SchedulerPanel } from '../director/SchedulerPanel';
import { LiveWorldTickPanel } from '../director/LiveWorldTickPanel';
import { TreasuryFundPanel } from '../director/TreasuryFundPanel';
import { LaunchProductionPanel } from '../director/LaunchProductionPanel';
import { GazettePanel } from '../director/GazettePanel';
import { EventCutPanel } from '../director/EventCutPanel';
import { ReflectionPanel } from '../director/ReflectionPanel';
import { EventPanel } from '../director/EventPanel';
import { PerceptionAbPanel } from '../director/PerceptionAbPanel';
import { ReconcilePanel } from '../director/ReconcilePanel';
import { ProfileDescriptionPatchPanel } from '../director/ProfileDescriptionPatchPanel';
import { PortraitEvolvePanel } from '../director/PortraitEvolvePanel';
import { AdditionalViewsBackfillPanel } from '../director/AdditionalViewsBackfillPanel';
import { GenesisMemoryPanel } from '../director/GenesisMemoryPanel';
import { PersonaRedistillPanel } from '../director/PersonaRedistillPanel';
import { RelationshipAssessPanel } from '../director/RelationshipAssessPanel';
import { CustodyPanel } from '../director/CustodyPanel';
import { StanceKnobPanel } from '../director/StanceKnobPanel';

/** Grouped launcher for every dev/test/maintenance panel: a rail selects one
 *  tool, and only the active tool mounts (so the page doesn't fire every
 *  panel's chain reads at once). */

const GROUP_ORDER = ['開局', '推進世界', '出版', '除錯', '角色工坊'] as const;
type Group = (typeof GROUP_ORDER)[number];

interface Tool {
  key: string;
  group: Group;
  label: string;
  hint: ReactNode;
  render: () => ReactNode;
}

export function WorkshopLauncher({
  characters,
  scenes,
  roleSlots,
}: {
  characters: Character[];
  scenes: Scene[];
  roleSlots: ComponentProps<typeof FoundingCastPanel>['roleSlots'];
}) {
  const tools = useMemo<Tool[]>(
    () => [
      {
        key: 'founding',
        group: '開局',
        label: '創世班底 · 一次立班',
        hint: '開局直接鑄造一批彼此早已相識的原始班底（不走職缺抽卡）。一鍵生畫像 → 上鏈 → 批次入科，同時種下各自的自身記憶與整張關係網。',
        render: () => <FoundingCastPanel roleSlots={roleSlots} />,
      },
      {
        key: 'director',
        group: '推進世界',
        label: '班主意圖 · 導演 LLM',
        hint: '寫下你想看的戲，導演 LLM 挑 1–5 個 capability 發到鏈上。（Showrunner 對話的「開張力線」走的就是這條；此處為直接入口。）',
        render: () => <DirectorPanel />,
      },
      {
        key: 'beat',
        group: '推進世界',
        label: '導演危機 · 公開廣播（感知）',
        hint: '宣告「此刻山雨欲來」。下個 tick 起，全 saga 角色的「當下處境」都會感知到它，PLAN/POV 會回應。只壓單一角色請用 inject_dream。需開啟感知（ES_SITUATION_PERCEIVE）。',
        render: () => <DirectorBeatPanel />,
      },
      {
        key: 'scheduler',
        group: '推進世界',
        label: '排程 · 手動跑 tick / 一日',
        hint: '一鍵跑自治 tick（PLAN→MOVE→…→公報）或「戲班過一日」。VPS world-loop 不在時的手動驅動。',
        render: () => <SchedulerPanel />,
      },
      {
        key: 'liveworld',
        group: '推進世界',
        label: '活世界 · 真結算 tick',
        hint: '一鍵跑「打開全部新機制」的 tick：事件走 spine 結算（真判勝負、資源轉手）、角色感知當下處境。配後臺「帳本資源」看持有者有沒有易手。',
        render: () => <LiveWorldTickPanel />,
      },
      {
        key: 'stance',
        group: '推進世界',
        label: '本班之氣 · 氣質旋鈕',
        hint: '調戲班的情感筆調（克制／溫存／盡致）。這是 emotional_stance 真旋鈕，寫本地覆寫、不上鏈、不reseed，下個 tick 生效；規章頁的「氣質光譜」是它的唯讀鏡像。',
        render: () => <StanceKnobPanel />,
      },
      {
        key: 'treasury',
        group: '推進世界',
        label: '戲班金庫 · 灌注 ENDLESS',
        hint: '班中俸從戲班金庫發放。金庫空了又沒訂閱者時，結算發不出薪 → 班中俸顯示 0。這裡直接鑄入 ENDLESS 補滿；灌注後跑一次「活世界 tick」班中俸才會重算。',
        render: () => <TreasuryFundPanel />,
      },
      {
        key: 'production',
        group: '出版',
        label: '新戲 · 排一齣',
        hint: '手動觸發 launch_production：讀真班底 → 班主選戲 → 編劇/選角/作曲/填詞/演戲中戲 → 戲折上鏈。Dry-Run 先驗，再上鏈。',
        render: () => <LaunchProductionPanel />,
      },
      {
        key: 'gazette',
        group: '出版',
        label: '公報 · 編輯出版',
        hint: 'tick 的 NARRATE phase 會自動編；這裡手動補編或預覽。',
        render: () => <GazettePanel />,
      },
      {
        key: 'eventcut',
        group: '出版',
        label: '章回 · 事件合本（織一回）',
        hint: '自治 tick 收尾後會自動織；此處可手動補織或預覽品質。',
        render: () => <EventCutPanel />,
      },
      {
        key: 'reflection',
        group: '除錯',
        label: '反思 · 觸發內心獨白',
        hint: '睡眠壓縮（REFLECT phase）的手動版：passive 獨白 / active 模擬 owner 提問。',
        render: () => <ReflectionPanel characters={characters} />,
      },
      {
        key: 'event',
        group: '除錯',
        label: '事件 · BudgetEvent 生命週期',
        hint: '手動開事件 → 發牌 → 結算，逐步檢查鏈上事件機制。日常出牌已由 tick 的 ACT phase 自動決策。',
        render: () => <EventPanel scenes={scenes} characters={characters} />,
      },
      {
        key: 'perception',
        group: '除錯',
        label: '感知對照 · A/B（不動世界）',
        hint: '同一個當前狀態，每個角色各跑一次 PLAN：感知關 vs 感知開（dry-run，不推進、不上鏈、不寫記憶）。輸出可一鍵複製貼出判讀。',
        render: () => <PerceptionAbPanel />,
      },
      {
        key: 'reconcile',
        group: '角色工坊',
        label: '全班對帳 · 一鍵補齊',
        hint: '掃描全班，逐一補齊缺的 主圖 / 設定集 / 標籤 / 本色 / 記憶 / 關係。唯一的全班批次入口。idempotent，已有的會跳過，可安心重跑。',
        render: () => <ReconcilePanel />,
      },
      {
        key: 'profile',
        group: '角色工坊',
        label: '描述 · 更新 profile',
        hint: '改寫角色的鏈上 profile 描述——這是之後所有生成（圖、本色、關係）的依據。',
        render: () => <ProfileDescriptionPatchPanel characters={characters} />,
      },
      {
        key: 'portrait',
        group: '角色工坊',
        label: '形象 · 動態演化',
        hint: '依同一套 physical_facts（同一人）＋情境（戲妝/老年/日常/自訂）出新像 → Walrus → 上鏈 update_image，形成可驗證的演化軌跡。',
        render: () => <PortraitEvolvePanel characters={characters} />,
      },
      {
        key: 'views',
        group: '角色工坊',
        label: '設定集 · 補生視圖',
        hint: '用主圖當參考，img2img 生正面 + 人物美術設定，補進設定集。',
        render: () => <AdditionalViewsBackfillPanel characters={characters} />,
      },
      {
        key: 'genesis',
        group: '角色工坊',
        label: '初始記憶 · 種下自傳',
        hint: '從角色描述蒸餾第一人稱自傳記憶寫進 MemWal，讓早期 POV 不飄移人設。新 mint 會自動種；這裡給舊角色補種。',
        render: () => <GenesisMemoryPanel characters={characters} />,
      },
      {
        key: 'persona',
        group: '角色工坊',
        label: '本色 · 重蒸人設',
        hint: '重新蒸餾角色的 軸 / 腔 / 界、anchor 新 commitment。讀取永遠取最新 → 直接覆蓋舊本色。',
        render: () => <PersonaRedistillPanel characters={characters} />,
      },
      {
        key: 'relationship',
        group: '角色工坊',
        label: '關係 · 評估與審核',
        hint: '依公開描述評估角色與名冊的關係（含故舊），審核後 seed 成導演公開對稱 tie ＋雙向記憶。mint 後自動跑一次。',
        render: () => <RelationshipAssessPanel characters={characters} />,
      },
      {
        key: 'custody',
        group: '角色工坊',
        label: '託管 · SEAL 撤訪',
        hint: '撤銷角色 ControlCap → saga 對該角色記憶的 MemWal recall 在鏈上被斷（ENoAccess）；重新授權即恢復。記憶存取由鏈上 cap 把關。',
        render: () => <CustodyPanel characters={characters} />,
      },
    ],
    [characters, scenes, roleSlots],
  );

  const [selected, setSelected] = useState('reconcile');
  const active = tools.find((t) => t.key === selected) ?? tools[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Tier 1 — grouped tool rail (desktop) / select (mobile) */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <label className="lg:hidden">
          <span className="es-page-lead-eyebrow">工具</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="es-field mt-2"
          >
            {GROUP_ORDER.map((g) => (
              <optgroup key={g} label={g}>
                {tools
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>

        <nav className="hidden space-y-5 lg:block">
          {GROUP_ORDER.map((g) => (
            <div key={g}>
              <div className="mb-2 text-2xs uppercase tracking-[0.25em] text-cinnabar/60">{g}</div>
              <div className="space-y-1">
                {tools
                  .filter((t) => t.group === g)
                  .map((t) => {
                    const isActive = t.key === selected;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setSelected(t.key)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-cinnabar/10 font-medium text-cinnabar'
                            : 'text-mute hover:bg-ink/5 hover:text-ink dark:hover:bg-elevated/40'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Tier 2 — the selected tool */}
      <div className="es-soft-panel min-w-0 p-5 sm:p-6">
        <h2 className="flex items-center gap-1.5 font-serif text-xl tracking-wide text-ink">
          {active.label}
          <InfoHint align="right">{active.hint}</InfoHint>
        </h2>
        <div className="mt-5">{active.render()}</div>
      </div>
    </div>
  );
}
