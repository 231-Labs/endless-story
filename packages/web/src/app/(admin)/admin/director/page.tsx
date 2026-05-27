import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { DirectorPanel } from './DirectorPanel';
import { GazettePanel } from './GazettePanel';
import { DreamConfigPanel } from './DreamConfigPanel';
import { getDreamConfigSnapshot } from '@/lib/actions/dream-config';

/**
 * Admin → 導演 — feed admin intent into the Saga Director LLM, see the
 * structured capability calls it picks, optionally dispatch them on
 * chain.
 *
 * Server component shell only; the interactive form is a client child.
 */
export default async function AdminDirectorPage() {
    const dreamConfig = await getDreamConfigSnapshot();
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
                </div>
            </SagaAdminGuard>
        </main>
    );
}
