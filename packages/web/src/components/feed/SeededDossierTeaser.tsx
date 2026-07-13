import Image from 'next/image';
import Link from 'next/link';
import {
  SEALED_WATCH_PERSPECTIVE_COUNT,
  sealedWatchEvent,
  sealedWatchManifest,
} from '@/lib/story-dossier/sealed-watch';

export function SeededDossierTeaser() {
  return (
    <Link
      href={`/feed/event/${sealedWatchEvent.slug}`}
      className="group relative mb-8 block min-h-[440px] overflow-hidden bg-[#211916] text-[#fff7e7] shadow-[0_20px_65px_rgba(49,35,26,0.16)] sm:min-h-[500px]"
    >
      <Image
        src={sealedWatchEvent.hero}
        alt="封箱夜的停錶事件"
        fill
        priority
        sizes="(min-width: 1280px) 1152px, 100vw"
        className="object-cover object-[50%_58%] transition duration-700 ease-out group-hover:scale-[1.015]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/54 to-black/15 sm:via-black/34" />
      <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-9 lg:p-11">
        <div className="flex items-center justify-between gap-4">
          <p className="text-2xs tracking-[0.3em] text-[#ecd8b9]">
            SEED 事件卷宗 · 第 {sealedWatchEvent.day} 日
          </p>
          <div className="hidden -space-x-3 sm:flex" aria-label={`${SEALED_WATCH_PERSPECTIVE_COUNT} 個角色視角`}>
            {sealedWatchManifest.perspectives.map((item) => (
              <span
                key={item.id}
                className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-[#f2dfbf]/80 bg-[#d8c7b0]"
              >
                <Image
                  src={item.portrait}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
            ))}
          </div>
        </div>

        <div className="max-w-2xl">
          <p className="text-xs tracking-[0.24em] text-[#e6c699]">
            {sealedWatchEvent.scene} · 正史與三種說法
          </p>
          <h2 className="mt-4 font-serif text-4xl font-medium leading-tight tracking-[0.14em] drop-shadow-lg sm:text-5xl">
            {sealedWatchEvent.title}
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-[#f4e9d8]/86 sm:text-base sm:leading-8">
            {sealedWatchEvent.kicker} 從正史開始，再聽三個人各自怎麼記得這一夜。
          </p>
          <span className="mt-7 inline-flex border-b border-[#e5c18f] pb-1 text-xs tracking-[0.23em] text-[#ffe9c8] transition group-hover:border-white group-hover:text-white">
            進入事件，選擇你相信的視角
          </span>
        </div>
      </div>
    </Link>
  );
}
