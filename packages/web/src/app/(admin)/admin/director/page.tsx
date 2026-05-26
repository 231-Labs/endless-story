import { SiteNav } from '@/components/home/SiteNav';
import { SagaAdminGuard } from '@/components/common/SagaAdminGuard';
import { DirectorPanel } from './DirectorPanel';

/**
 * Admin → 導演 — feed admin intent into the Saga Director LLM, see the
 * structured capability calls it picks, optionally dispatch them on
 * chain.
 *
 * Server component shell only; the interactive form is a client child.
 */
export default function AdminDirectorPage() {
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
                </div>
            </SagaAdminGuard>
        </main>
    );
}
