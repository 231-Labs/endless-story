import Link from 'next/link';
import { recruitmentsApi } from '@/lib/api/index';
import { SiteNav } from '@/components/home/SiteNav';
import { BackButton } from '@/components/common/BackButton';

const ATTR_LABEL: Record<string, string> = {
  constitution: '筋骨',
  disposition: '心性',
  acuity: '機敏',
  appearance: '外貌',
};

const GENDER_LABEL: Record<string, string> = {
  male: '限男',
  female: '限女',
  other: '不限',
};

const STEPS = [
  { label: '描述' },
  { label: '付款' },
  { label: '選一' },
  { label: '定裝' },
];

function daysLeft(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
}

export default async function RecruitmentIntentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recruitment = await recruitmentsApi.getRecruitment(id);

  if (!recruitment) {
    return (
      <main className="min-h-screen">
        <SiteNav />
        <section className="px-5 py-20 text-center text-mute sm:px-10">
          找不到這份徵召。
        </section>
      </main>
    );
  }

  const minEntries: [string, number][] = recruitment.minAttributes
    ? Object.entries(recruitment.minAttributes).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    : [];

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
        <BackButton fallback="/" label="返回首頁" ariaLabel="返回" />

        <div className="mt-8 text-2xs tracking-widest text-mute">
          {recruitment.sagaName}
        </div>

        <h1 className="mt-2 font-serif text-5xl leading-tight tracking-wide text-ink sm:text-6xl">
          {recruitment.specialty}
        </h1>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-mute">
          <span className="font-serif text-base text-ink">{recruitment.basePrice} Endless</span>
          <span className="text-hairline">·</span>
          <span>剩 {recruitment.slots} 位</span>
          <span className="text-hairline">·</span>
          <span>{daysLeft(recruitment.expiresAt)} 日內</span>
        </div>

        {(minEntries.length > 0 || recruitment.genderRequirement) ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {recruitment.genderRequirement && recruitment.genderRequirement !== 'other' ? (
              <span className="rounded-full bg-cinnabar/5 px-3 py-1 text-sm text-cinnabar ring-1 ring-cinnabar/30">
                {GENDER_LABEL[recruitment.genderRequirement]}
              </span>
            ) : null}
            {minEntries.map(([key, value]) => (
              <span
                key={key}
                className="rounded-full bg-cinnabar/5 px-3 py-1 text-sm text-cinnabar ring-1 ring-cinnabar/30"
              >
                {ATTR_LABEL[key] ?? key} ≥ {value}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-10 max-w-prose text-base leading-loose text-ink/85 sm:text-lg">
          {recruitment.roleIntent}
        </p>

        {/* Process row — icon steps */}
        <div className="mt-12 grid grid-cols-4 gap-2">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-cinnabar/40 font-serif text-base text-cinnabar">
                {i + 1}
              </span>
              <span className="mt-2 text-2xs tracking-widest text-mute">{step.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/dossier/recruit/${recruitment.id}?step=prompt`}
            className="rounded bg-cinnabar px-6 py-3 text-center text-base text-canvas transition-colors hover:bg-seal"
          >
            進入徵召
          </Link>
          <p className="text-2xs tracking-widest text-mute">
            付款即鎖席位 · Voucher 不過期
          </p>
        </div>
      </div>
    </main>
  );
}
