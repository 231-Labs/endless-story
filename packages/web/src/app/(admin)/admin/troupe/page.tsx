import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { ReconcilePanel } from '../director/ReconcilePanel';
import { ProfileDescriptionPatchPanel } from '../director/ProfileDescriptionPatchPanel';
import { PortraitEvolvePanel } from '../director/PortraitEvolvePanel';
import { AdditionalViewsBackfillPanel } from '../director/AdditionalViewsBackfillPanel';
import { GenesisMemoryPanel } from '../director/GenesisMemoryPanel';
import { PersonaRedistillPanel } from '../director/PersonaRedistillPanel';
import { RelationshipAssessPanel } from '../director/RelationshipAssessPanel';
import { CustodyPanel } from '../director/CustodyPanel';
import { charactersApi } from '@/lib/api/index';

export const metadata = {
    title: '劇團 | 班主後台',
};

export const dynamic = 'force-dynamic';

/**
 * Admin → 劇團 — everything about the cast. Reconcile is the lead (the only
 * batch entry); the workshop below rebuilds one character piece by piece.
 * Day to day the Showrunner heartbeat runs reconcile for you — these are the
 * manual versions for when you want control.
 */
export default async function AdminTroupePage() {
    const characters = await charactersApi.listCharacters();
    return (
        <main className="min-h-screen">
            <SiteNav />
            <SagaAdminGuard>
                <div className="mx-auto max-w-3xl px-5 py-12 sm:px-10">
                    <h1 className="font-serif text-3xl tracking-wide text-ink">劇團</h1>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                        角色的補完與重生。日常缺漏由 Showrunner 心跳自動補；這裡是手動入口：
                        <strong className="text-ink">全班對帳</strong>（一鍵批次）與
                        <strong className="text-ink">角色工坊</strong>（單一角色逐項重生）。
                    </p>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">一 · 全班對帳</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">一鍵補齊所有缺漏</h2>
                        <p className="mt-2 text-sm leading-relaxed text-mute">
                            掃描全班,逐一補齊缺的 <strong className="text-ink">主圖 / 設定集 / 標籤 / 本色 / 記憶 / 關係</strong>。
                            這是<strong className="text-ink">唯一的全班批次入口</strong>。idempotent,已有的會跳過,可安心重跑。
                        </p>
                        <div className="mt-8"><ReconcilePanel /></div>
                    </section>

                    <section className="mt-14 border-t border-hairline pt-10">
                        <div className="text-2xs uppercase tracking-[0.25em] text-cinnabar/60">二 · 角色工坊</div>
                        <h2 className="mt-1 font-serif text-2xl tracking-wide text-ink">單一角色的補完與重生</h2>
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
                                    新 mint 會自動種;這裡給舊角色補種。
                                </p>
                                <div className="mt-5"><GenesisMemoryPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">本色 · 重蒸人設</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    重新蒸餾角色的 <strong className="text-ink">軸 / 腔 / 界</strong>、anchor 新 commitment。
                                    讀取永遠取最新 → 直接覆蓋舊本色。
                                </p>
                                <div className="mt-5"><PersonaRedistillPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">關係 · 評估與審核</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    依公開描述評估角色與名冊的關係(含<strong className="text-ink">故舊</strong>),
                                    審核後 seed 成導演公開對稱 tie ＋雙向記憶。mint 後自動跑一次。
                                </p>
                                <div className="mt-5"><RelationshipAssessPanel characters={characters} /></div>
                            </div>
                            <div>
                                <h3 className="font-serif text-lg tracking-wide text-ink">託管 · SEAL 撤訪</h3>
                                <p className="mt-2 text-sm leading-relaxed text-mute">
                                    撤銷角色 ControlCap → saga 對該角色記憶的 MemWal recall 在鏈上被斷(ENoAccess);
                                    重新授權即恢復。記憶存取由鏈上 cap 把關,不是後端自律。
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
