import type { ReactNode } from 'react';

/**
 * 全站「功能頁」主標區：與 SiteNav 以下首屏標題字階、字距、留白對齊。
 */
export function PageLeadTitleBlock({
  eyebrow,
  eyebrowMobile,
  title,
  meta,
  end,
  className = '',
}: {
  eyebrow?: string;
  /** 窄螢顯示較短的輔標（sm 以上仍用 eyebrow） */
  eyebrowMobile?: string;
  title: ReactNode;
  /** 標題下輔助說明（選用） */
  meta?: ReactNode;
  /** 右側欄：搜尋、篩選等 */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="es-page-lead-eyebrow">
            {eyebrowMobile ? (
              <>
                <span className="sm:hidden">{eyebrowMobile}</span>
                <span className="hidden sm:inline">{eyebrow}</span>
              </>
            ) : (
              eyebrow
            )}
          </p>
        ) : null}
        <h1 className="es-page-lead-title">{title}</h1>
        {meta ? <div className="mt-3 text-sm leading-relaxed tracking-wide text-mute">{meta}</div> : null}
      </div>
      {end ? <div className="w-full shrink-0 sm:w-auto">{end}</div> : null}
    </div>
  );
}
