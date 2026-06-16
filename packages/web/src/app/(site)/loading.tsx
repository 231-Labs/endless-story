import { InkFluidLoader } from '@/components/common/InkFluidLoader';

// generic cold-nav loading for (site) routes without their own loading.tsx
export default function SiteLoading() {
  return <InkFluidLoader label="開卷中" />;
}
