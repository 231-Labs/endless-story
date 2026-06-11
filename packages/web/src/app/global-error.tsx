'use client';

/**
 * 根層錯誤邊界 — root layout 自身炸掉時的最後防線。
 * 必須自帶 <html>/<body>；不依賴任何全域樣式之外的東西。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[global-error]', error);
  return (
    <html lang="zh-Hant">
      <body
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgb(250 248 243)',
          color: 'rgb(24 24 27)',
          fontFamily: 'serif',
          textAlign: 'center',
          padding: '0 1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', letterSpacing: '0.2em' }}>這一幕沒能開演</h1>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgb(113 113 122)' }}>
          系統出了點狀況。請重新整理，或稍後再來。
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '2rem',
            borderRadius: '9999px',
            background: 'rgb(176 74 60)',
            color: 'rgb(250 248 243)',
            padding: '0.6rem 1.5rem',
            fontSize: '0.875rem',
            letterSpacing: '0.15em',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          再試一次
        </button>
      </body>
    </html>
  );
}
