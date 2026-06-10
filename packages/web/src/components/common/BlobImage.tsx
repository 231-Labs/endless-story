'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * Walrus / 本地圖片的統一出口。
 *
 * 可優化來源（同源路徑、Walrus aggregator、自架 aggregator）走 next/image
 * （resize + webp + lazy），其餘任意主機退回原生 <img> — 避免 next/image
 * 對未設定 remotePatterns 的主機直接 throw。載入失敗一律歸於 null，
 * 由呼叫端的字形海報 / 底色接手，不出現破圖示。
 *
 * 所有呼叫端都把它放在「已定位、有固定比例」的容器裡（absolute inset-0），
 * 所以 next/image 用 fill 模式；`sizes` 請按實際渲染寬度傳，預設 100vw。
 */
export function BlobImage({
  src,
  alt,
  className,
  sizes = '100vw',
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) return null;

  const cls = `${className ?? ''} transition-opacity duration-200 ${
    loaded ? 'opacity-100' : 'opacity-0'
  }`;

  if (isOptimizable(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={cls}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      className={cls}
    />
  );
}

/** 與 next.config.ts 的 images.remotePatterns 保持同一份口徑。 */
function isOptimizable(src: string): boolean {
  if (src.startsWith('/')) return true; // 同源（public/ 或 /api/blob proxy）
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'aggregator.walrus.space' || u.hostname.endsWith('.walrus.space')) {
      return true;
    }
    const selfHosted = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
    if (selfHosted) {
      try {
        return new URL(selfHosted).hostname === u.hostname;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}
