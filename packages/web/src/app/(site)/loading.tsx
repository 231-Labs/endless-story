import { InkFluidLoader } from '@/components/common/InkFluidLoader';

/**
 * (site) 群組的通用冷導航 loading — 沒有自己 loading.tsx 的路由（首頁等）
 * 冷進入時不再白屏。最近的 loading 邊界優先，所以 saga / dossier / feed /
 * subscriptions 各自的 skeleton 不受影響。
 *
 * 中央是「墨綻」水墨流體：一滴墨在米色和紙上化開、捲出渦流，朱砂方印於其中呼吸。
 */
export default function SiteLoading() {
  return <InkFluidLoader variant="bloom" label="開卷中" />;
}
