import { InkFluidLoader } from '@/components/common/InkFluidLoader';

/** Route loading for /saga/[id] — 墨綻紙上，展卷中。 */
export default function SagaLoading() {
  return <InkFluidLoader variant="bloom" label="展卷中" />;
}
