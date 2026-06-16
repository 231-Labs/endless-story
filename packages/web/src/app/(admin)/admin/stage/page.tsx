import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { FoundingCastPanel } from '../director/FoundingCastPanel';
import { DirectorPanel } from '../director/DirectorPanel';
import { TimePanel } from '../director/TimePanel';
import { SchedulerPanel } from '../director/SchedulerPanel';
import { PerceptionAbPanel } from '../director/PerceptionAbPanel';
import { DirectorBeatPanel } from '../director/DirectorBeatPanel';
import { LiveWorldTickPanel } from '../director/LiveWorldTickPanel';
import { ResourceLedgerPanel } from '../director/ResourceLedgerPanel';
import { GazettePanel } from '../director/GazettePanel';
import { EventCutPanel } from '../director/EventCutPanel';
import { ReflectionPanel } from '../director/ReflectionPanel';
import { EventPanel } from '../director/EventPanel';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { charactersApi, scenesApi } from '@/lib/api/index';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export const metadata = {
    title: '戲台 | 班主後台',
};

export const dynamic = 'force-dynamic';

/**
 * Admin → 戲台 — manual narrative overrides. The autonomous loop (world-loop
 * ticks + showrunner heartbeats) drives all of this day to day; these panels
 * are for bootstrapping a new world (founding cast), stepping the world by
 * hand, or debugging a phase in isolation.
 */
export default async function AdminStagePage() {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const [characters, scenes, worldTime, recruitments] = await Promise.all([
        charactersApi.listCharacters(),
        sagaId ? scenesApi.listScenes(sagaId) : Promise.resolve([]),
        getWorldTimeSnapshot(),
        listAllRecruitments().catch(() => []),
    ]);
    const roleSlots = recruitments.map((r) => ({
        specialty: String(r.specialty),
        roleIntent: r.roleIntent,
        genderRequirement: r.genderRequirement,
    }));
    return (
        <main className="min-h-screen">
            <SiteNav />
            <SagaAdminGuard>
                <div className="mx-auto max-w-3xl px-5 py-12 sm:px-10">
                    <h1 className="font-serif text-3xl tracking-wide text-ink">戲台</h1>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                        手動敘事控制。<strong className="text-ink">日常這些都已由自治迴圈接管</strong>
                        （tick 推進 / 出牌收尾 / 章回 / 公報，VPS world-loop 驅動；干預由 Showrunner 心跳決定）——
                        這裡用於<strong className="text-ink">開新世界、單步推進、逐項除錯</strong>。
                    </p>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">一 · 開局</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">創世班底 · 一次立班</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            開局時直接鑄造一批<strong className="text-ink">彼此早已相識</strong>的原始班底(不走職缺抽卡)。
                            一鍵生畫像 → 上鏈 → 批次入科:同時種下各自的自身記憶與整張關係網。
                        </p>
                        <div className="mt-8"><FoundingCastPanel roleSlots={roleSlots} /></div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">二 · 手動推進</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">單步驅動世界</h2>
                        <div className="mt-8 space-y-12">
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">班主意圖 · 導演 LLM</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    寫下你想看的戲,導演 LLM 挑 1-5 個 capability 發到鏈上。
                                    （Showrunner 對話的「開張力線」走的就是這條;此處為直接入口。）
                                </p>
                                <div className="mt-5"><DirectorPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">導演危機 · 公開廣播（感知）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    宣告「此刻山雨欲來」（百代逼宮…）。下個 tick 起,全 saga 角色的「當下處境」都會感知到它,
                                    PLAN/POV 會回應。只壓單一角色請用 inject_dream。需開啟感知（ES_SITUATION_PERCEIVE）。
                                </p>
                                <div className="mt-5"><DirectorBeatPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">世界時間 · 推進敘事日</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    鏈上 <code className="font-mono text-2xs">WorldState.current_tick</code> 是敘事時鐘。
                                </p>
                                <div className="mt-5"><TimePanel initial={worldTime} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">排程 · 手動跑 tick / 一日</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    一鍵跑自治 tick（PLAN→MOVE→…→公報）或「戲班過一日」。VPS 不在時的手動驅動。
                                </p>
                                <div className="mt-5"><SchedulerPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">活世界 · 真結算 tick（spine + 資源轉手 + 感知）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    一鍵跑「打開全部新機制」的 tick —— 事件走 spine 結算（真的判勝負、資源轉手）、角色感知當下處境。
                                    機制寫在 tick body,不靠 env、不用重部署。配下面「資源帳本」看持有者有沒有易手。
                                </p>
                                <div className="mt-5"><LiveWorldTickPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">資源帳本 · 誰持有什麼（除錯）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    每個爭奪資源現在歸誰。若一直「全部懸而未決」,代表事件都 empty_outcome 收掉、資源從沒易手（經濟凍結）。
                                    跑完「活世界 tick」後重整,看持有者有沒有變動。
                                </p>
                                <div className="mt-5"><ResourceLedgerPanel /></div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">三 · 出版與除錯</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">手動補產 / 逐項測試</h2>
                        <div className="mt-8 space-y-12">
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">公報 · 編輯出版</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    tick 的 NARRATE phase 會自動編;這裡手動補編或預覽。
                                </p>
                                <div className="mt-5"><GazettePanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">章回 · 事件合本（織一回）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    自治 tick 收尾後會自動織;此處可手動補織或預覽品質。
                                </p>
                                <div className="mt-5"><EventCutPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">反思 · 觸發內心獨白</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    睡眠壓縮（REFLECT phase）的手動版:passive 獨白 / active 模擬 owner 提問。
                                </p>
                                <div className="mt-5"><ReflectionPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">事件 · BudgetEvent 生命週期（除錯）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    手動開事件 → 發牌 → 結算,逐步檢查鏈上事件機制。日常出牌已由 tick ACT phase 自動決策。
                                </p>
                                <div className="mt-5"><EventPanel scenes={scenes} characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">感知對照 · A/B（不動世界）</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    同一個當前狀態,每個角色各跑一次 PLAN:感知關 vs 感知開（dry-run,不推進、不上鏈、不寫記憶）。
                                    每個角色當自己的對照,唯一差別＝有沒有注入「當下處境」。輸出可一鍵複製貼出判讀。
                                </p>
                                <div className="mt-5"><PerceptionAbPanel /></div>
                            </div>
                        </div>
                    </section>
                </div>
            </SagaAdminGuard>
        </main>
    );
}
