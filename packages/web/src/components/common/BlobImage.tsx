'use client';

import { useState } from 'react';

export function BlobImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      className={`${className ?? ''} transition-opacity duration-200 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
