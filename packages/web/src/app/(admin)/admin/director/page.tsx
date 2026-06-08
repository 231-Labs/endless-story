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
import { FoundingCastPanel } from './FoundingCastPanel';
import { getDreamConfigSnapshot } from '@/lib/actions/dream-config';
import { getWorldTimeSnapshot } from '@/lib/actions/world-time';
import { listAllRecruitments } from '@/lib/actions/recruitments-store';
import { charactersApi, sagasApi, scenesApi } from '@/lib/api/index';
import { ENDLESS_STORY_DEPLOYMENT } from '@endless-story/sdk';

export const dynamic = 'force-dynamic';

/**
 * Admin → Director — feed admin intent into the Saga Director LLM, see the
 * structured capability calls it picks, optionally dispatch them on
 * chain.
 *
 * Server component shell only; the interactive form is a client child.
 */
export default async function AdminDirectorPage() {
    const sagaId = ENDLESS_STORY_DEPLOYMENT.sagaId;
    const [dreamConfig, characters, scenes, worldTime, recruitments] = await Promise.all([
        getDreamConfigSnapshot(),
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
                    <h1 className="font-serif text-3xl tracking-wide text-ink">導演後台</h1>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                        班主的控制台,分四區:<strong className="text-ink">敘事推進</strong>(驅動世界向前)、
                        <strong className="text-ink">角色工坊</strong>(單一角色的補完與重生)、
                        <strong className="text-ink">全班對帳</strong>(一鍵補齊所有缺漏)、
                        <strong className="text-ink">互動與治理</strong>。
                    </p>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">一 · 敘事推進</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">驅動世界向前</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            下達導演意圖、推進時間、跑每日章回、出版公報。
                        </p>
                        <div className="mt-8 space-y-12">
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">創世班底 · 一次立班</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    開局時直接鑄造一批<strong className="text-ink">彼此早已相識</strong>的原始班底(不走職缺抽卡)。
                                    手填或載入劇本職缺當骨架,一鍵生畫像 → 上鏈 → 批次入科:同時種下各自的自身記憶
                                    與整張關係網(共同往事只寫一次、雙向對稱)。用戶之後抽卡進來的才是全新陌生人。
                                </p>
                                <div className="mt-5"><FoundingCastPanel roleSlots={roleSlots} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">班主意圖 · 導演 LLM</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    寫下你想看的戲(一句話也好)。導演 LLM 挑 1-5 個結構化 capability
                                    (開 storylet、推氣場、召喚角色、播下關係、推進階段),發到鏈上讓 character
                                    workers 反應。Dry-run 看 LLM 怎麼想、不上鏈;Dispatch 才打 tx。
                                </p>
                                <div className="mt-5"><DirectorPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">世界時間 · 推進敘事日</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    鏈上 <code className="font-mono text-2xs">WorldState.current_tick</code> 是敘事時鐘。
                                    推進 tick 會跨時辰、累積成「日」,公報標題的「第 N 日」由此而來。
                                </p>
                                <div className="mt-5"><TimePanel initial={worldTime} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">排程 · 推進一日</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    一鍵跑「戲班過一日」:推進 tick → 逐一為角色生成當日 POV 章回
                                    (依序,單一 keypair 不能並簽)。
                                </p>
                                <div className="mt-5"><SchedulerPanel /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">公報 · 編輯出版</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    把最近的鏈上事件 + POV 章回打包成 saga 級公報、上鏈 anchor,在
                                    <code className="font-mono text-2xs">/feed?mode=gazette</code> 公開閱覽。
                                </p>
                                <div className="mt-5"><GazettePanel /></div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">二 · 角色工坊</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">單一角色的補完與重生</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            針對選定角色逐項重生:外在(描述 / 形象 / 設定集)與內在(記憶 / 本色 / 關係)。
                            要一次補齊全班,用下一區的「對帳全班」。
                        </p>
                        <div className="mt-8 space-y-12">
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">描述 · 更新 profile</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    改寫角色的鏈上 profile 描述 —— 這是之後所有生成(圖、本色、關係)的依據。
                                </p>
                                <div className="mt-5"><ProfileDescriptionPatchPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">形象 · 動態演化(§11)</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    依同一套 physical_facts(同一人)+ 情境(戲妝 / 老年 / 日常 / 自訂)出新像
                                    → Walrus → 上鏈 update_image,emit CharacterImageUpdated 形成可驗證的演化軌跡。
                                </p>
                                <div className="mt-5"><PortraitEvolvePanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">設定集 · 補生視圖</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    用主圖當參考,img2img 生正面 + 人物美術設定,補進設定集。
                                </p>
                                <div className="mt-5"><AdditionalViewsBackfillPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">初始記憶 · 種下自傳</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    從角色描述蒸餾出第一人稱自傳記憶寫進 MemWal,讓早期 POV 不飄移人設。
                                    新 mint 會自動種;這裡給舊角色補種。(關係已分出,見下方關係面板。)
                                </p>
                                <div className="mt-5"><GenesisMemoryPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">本色 · 重蒸人設</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    重新蒸餾角色的 <strong className="text-ink">軸 / 腔 / 界</strong>、anchor 新 commitment。
                                    讀取永遠取最新 → 直接覆蓋舊本色(對「已有本色」的角色也能強制重蒸)。
                                </p>
                                <div className="mt-5"><PersonaRedistillPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">關係 · 評估與審核</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    依公開描述評估角色與名冊的關係(含<strong className="text-ink">故舊</strong> —— 故事前就認識),
                                    審核後 seed 成<strong className="text-ink">導演公開對稱 tie</strong>(顯示在關係圖)＋雙向記憶。
                                    mint 後自動跑一次;全班補帳在下一區的「對帳全班」。
                                </p>
                                <div className="mt-5"><RelationshipAssessPanel characters={characters} /></div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">三 · 全班對帳</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">一鍵補齊所有缺漏</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            掃描全班,逐一補齊缺的 <strong className="text-ink">主圖 / 設定集 / 標籤 / 本色 / 記憶 / 關係</strong>。
                            這是<strong className="text-ink">唯一的全班批次入口</strong> —— 角色工坊各項的「補全班」版本都收斂在這。
                            idempotent,已有的會跳過,可安心重跑。
                        </p>
                        <div className="mt-8"><ReconcilePanel /></div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">四 · 互動與治理</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">觸發、事件與設定</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            觸發角色反思與劇情事件,設定經濟參數與記憶託管。
                        </p>
                        <div className="mt-8 space-y-12">
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">反思 · 觸發內心獨白</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    passive:角色獨自在後台、沒人問,寫下最近最壓心上的那一句。
                                    active:模擬 owner 在 dossier 問一句,看 LLM 怎麼讓角色被觸動但不直答。
                                    兩種都上 Walrus + reflection::submit。
                                </p>
                                <div className="mt-5"><ReflectionPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">事件 · BudgetEvent 生命週期</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    開事件 → 發牌(每位角色一筆 tx,鏈上 RNG 抽手牌)→ 結算。預設牌組 4 張:
                                    斬 / 攻 / 敘 / 觀,每人抽 3 張。角色必須在事件場景內才能發牌。
                                </p>
                                <div className="mt-5"><EventPanel scenes={scenes} characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">注夢 · 經濟設定</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    設定 character owner 注入夢境的價格 (ENDLESS) 與是否暫停,即時上鏈。
                                </p>
                                <div className="mt-5"><DreamConfigPanel initial={dreamConfig} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">託管 · SEAL 撤訪示範</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    撤銷角色 ControlCap → saga 對該角色記憶的 MemWal recall 在鏈上被斷(ENoAccess);
                                    重新授權即恢復。證明記憶存取由鏈上 cap 把關,不是後端自律。
                                </p>
                                <div className="mt-5"><CustodyPanel characters={characters} /></div>
                            </div>
                        </div>
                    </section>
                </div>
            </SagaAdminGuard>
        </main>
    );
}
