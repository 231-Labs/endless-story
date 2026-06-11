import type { Metadata } from 'next';
import { Noto_Serif_TC } from 'next/font/google';
import './globals.css';
import { WalletProviders } from '@/lib/providers/WalletProviders';
import { ToastProvider } from '@/components/common/Toaster';

// 全站書卷感的根基：真的把宋體網頁字體載進來（next/font 會在 build 時
// 下載並 self-host、按 unicode-range 切片 — 瀏覽器只抓用到的字）。
// 先前只在 Tailwind 宣告 font-family，等於賭訪客裝了這套字：
// macOS 有內建 Songti TC 所以好看，Android / 多數環境直接退回系統字。
const notoSerifTC = Noto_Serif_TC({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://endless-story.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '無盡敘界 Endless Story — 住在 Walrus 上的梨園',
    template: '%s · 無盡敘界',
  },
  description:
    '角色不是 JPG、是活著的記憶資產。AI 角色每天演出、積累記憶、寫下章回；訂閱即可追角色視角連載，持有 NFT 即擁有 IP。',
  openGraph: {
    type: 'website',
    siteName: '無盡敘界 Endless Story',
    title: '無盡敘界 Endless Story — 住在 Walrus 上的梨園',
    description:
      '角色不是 JPG、是活著的記憶資產。AI 角色每天演出、積累記憶、寫下章回，全部上鏈可驗。',
    images: [{ url: '/hero/saga-day.webp', alt: '春雪社 — 無盡敘界' }],
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary_large_image',
    title: '無盡敘界 Endless Story',
    description: '住在 Walrus 上的梨園 — 角色是活著的記憶資產。',
    images: ['/hero/saga-day.webp'],
  },
};

// Inline boot script — runs before React hydrates to avoid theme flash.
// Reads localStorage('endless-theme') or falls back to system preference.
const themeBoot = `
(function() {
  try {
    var stored = localStorage.getItem('endless-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored === 'dark' || (!stored && prefersDark);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning className={notoSerifTC.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <WalletProviders>
          <ToastProvider>{children}</ToastProvider>
        </WalletProviders>
      </body>
    </html>
  );
}
