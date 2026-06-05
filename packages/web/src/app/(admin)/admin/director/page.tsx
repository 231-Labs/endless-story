import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { DirectorPanel } from './DirectorPanel';
import { GazettePanel } from './GazettePanel';
import { DreamConfigPanel } from './DreamConfigPanel';
import { ReflectionPanel } from './ReflectionPanel';
import { GenesisMemoryPanel } from './GenesisMemoryPanel';
import { PersonaRedistillPanel } from './PersonaRedistillPanel';
import { RelationshipAssessPanel } from './RelationshipAssessPanel';
import { CustodyPanel } from './CustodyPanel';
import { ProfileDescriptionPatchPanel } from './ProfileDescriptionPatchPanel';
import { AdditionalViewsBackfillPanel } from './AdditionalViewsBackfillPanel';
import { PortraitEvolvePanel } from './PortraitEvolvePanel';
import { EventPanel } from './EventPanel';
import { TimePanel } from './TimePanel';
import { SchedulerPanel } from './SchedulerPanel';
import { ReconcilePanel } from './ReconcilePanel';
import { getDreamConfigSnapshot } from '@/lib/actions/dream-config';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { charactersApi, sagasApi, scenesApi } from '@/lib/api/index';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export const dynamic = 'force-dynamic';

/**
 * Admin → 導演 — feed admin intent into the Saga Director LLM, see the
 * structured capability calls it picks, optionally dispatch them on
 * chain.
 *
 * Server component shell only; the interactive form is a client child.
 */
export default async function AdminDirectorPage() {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const [dreamConfig, characters, scenes, worldTime] = await Promise.all([
        getDreamConfigSnapshot(),
        charactersApi.listCharacters(),
        sagaId ? scenesApi.listScenes(sagaId) : Promise.resolve([]),
        getWorldTimeSnapshot(),
    ]);
    return (
        <main className="min-h-screen">
            <SiteNav />
            <SagaAdminGuard>
                <div className="mx-auto max-w-3xl px-5 py-12 sm:px-10">
                    <h1 className="font-serif text-3xl tracking-wide text-ink">導演 · 班主意圖</h1>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                        把你想看的戲（一句話也好）寫下來。導演 LLM 會挑 1-5 個結構化的
                        capability（開 storylet、推氣場、召喚角色、播下關係、推進階段），
                        發到鏈上讓 character workers 跟著反應。Dry-run 看 LLM 怎麼想，
                        不上鏈。Dispatch 才會真正打出 tx。
                    </p>
                    <div className="mt-8">
                        <DirectorPanel />
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">世界時間 · 推進敘事日</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            鏈上 <code className="font-mono text-2xs">WorldState.current_tick</code> 是敘事時鐘。
                            推進 tick 會跨時辰、累積成「日」，公報標題的「第 N 日」由此而來。
                            （Phase 2 的 scheduler 上線後會自動推進；現在手動。）
                        </p>
                        <div className="mt-6">
                            <TimePanel initial={worldTime} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">排程 · 推進一日</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            一鍵跑「戲班過一日」：推進 tick →
                            逐一為角色生成當日 POV 章回（依序，因單一 keypair 不能並簽）。
                            這是自動循環的手動驅動；之後可由獨立 CLI 定時呼叫同一批次。
                        </p>
                        <div className="mt-6">
                            <SchedulerPanel />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">對帳 · 補齊角色缺漏</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            一鍵掃描全班,把 mint 當下漏掉的 <strong className="text-ink">主圖 / 設定集 / 標籤 / 本色 / 記憶</strong> 補齊。
                            idempotent —— 已有的會跳過,可安心重跑。這也是「入班不等圖」的後盾:即使 mint 完全沒生圖,
                            這裡也能把主圖補上。
                        </p>
                        <div className="mt-6">
                            <ReconcilePanel />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">公報 · 編輯出版</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            把最近的鏈上事件 + POV 章回打包成一份 saga 級公報，上鏈 anchor。
                            公報在 <code className="font-mono text-2xs">/feed?mode=gazette</code> 公開閱覽，
                            事實全來自鏈，LLM 只負責語氣與排版。
                        </p>
                        <div className="mt-6">
                            <GazettePanel />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">注夢 · 經濟設定</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            設定 character owner 注入夢境的價格 (ENDLESS) 與是否暫停。
                            價格與暫停狀態都即時上鏈，下次 owner 開注夢面板時生效。
                        </p>
                        <div className="mt-6">
                            <DreamConfigPanel initial={dreamConfig} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">反思 · 觸發內心獨白</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            passive：角色獨自在後台、沒人問，寫她最近最壓在心上的那一句。
                            active：模擬 owner 在 dossier 問了一句，看 LLM 怎麼讓她
                            被觸動但不直接回答。兩種都上 Walrus + reflection::submit。
                        </p>
                        <div className="mt-6">
                            <ReflectionPanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">初始記憶 · 種下人設</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            從角色描述蒸餾出第一人稱開場記憶寫進 MemWal，讓早期 POV 不飄移人設。
                            新招募的角色會自動種；這裡是給「在這功能之前就 mint 的角色」補種。
                        </p>
                        <div className="mt-6">
                            <GenesisMemoryPanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">本色 · 重蒸人設</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            重新從鏈上公開 profile 蒸餾角色的 <strong className="text-ink">軸 / 腔 / 界</strong>，
                            anchor 一筆新的 commitment。讀取永遠取最新，所以會直接覆蓋舊本色。
                            和「對帳補漏」不同 —— 那個只補沒有本色的角色，這裡可對「已經有本色」的角色強制重蒸。
                        </p>
                        <div className="mt-6">
                            <PersonaRedistillPanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">關係 · 評估與補帳</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            依公開描述評估角色與名冊的關係（含<strong className="text-ink">故舊</strong>——故事前就認識），
                            審核後 seed 成<strong className="text-ink">導演公開對稱 tie</strong>（會顯示在關係圖）＋雙向記憶。
                            mint 後會自動跑一次；這裡可手動重評、或用「全班補帳」補上 mint 順序錯過的舊識。冪等可安心重跑。
                        </p>
                        <div className="mt-6">
                            <RelationshipAssessPanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">託管 · SEAL 撤訪示範</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            撤銷角色的 ControlCap → saga 對她記憶的 MemWal recall 在鏈上被斷（ENoAccess）。
                            重新授權即恢復。這證明記憶存取由鏈上 cap 把關，不是後端自律。
                        </p>
                        <div className="mt-6">
                            <CustodyPanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">
                            動態形象 · AI-native NFT（§11）
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            角色的形象不是凍結的 mint 圖：依同一套 physical_facts（同一人）+ 情境
                            （戲妝 / 老年 / 日常 / 自訂）出一張新像 → Walrus → 上鏈 update_image。
                            每次演化都 emit CharacterImageUpdated，形成可驗證的形象演化軌跡。
                        </p>
                        <div className="mt-6 space-y-6">
                            <ProfileDescriptionPatchPanel characters={characters} />
                            <AdditionalViewsBackfillPanel characters={characters} />
                            <PortraitEvolvePanel characters={characters} />
                        </div>
                    </div>

                    <div className="mt-16 border-t border-hairline pt-10">
                        <h2 className="font-serif text-2xl tracking-wide text-ink">事件 · BudgetEvent 生命週期</h2>
                        <p className="mt-3 text-sm leading-relaxed text-mute">
                            開事件 → 發牌（每位角色一筆 tx，鏈上 RNG 抽手牌）→ 結算（空 outcomes，後續可加 death / scene-delta editor）。
                            預設牌組 4 張：斬 / 攻 / 敘 / 觀，每人抽 3 張。角色必須在事件場景內才能發牌。
                        </p>
                        <div className="mt-6">
                            <EventPanel scenes={scenes} characters={characters} />
                        </div>
                    </div>
                </div>
            </SagaAdminGuard>
        </main>
    );
}
