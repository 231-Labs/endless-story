import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

/**
 * Saga-themed markdown renderer.
 *
 * Used for gazettes + (eventually) POV chapters when LLM emits
 * structured markdown. Styling matches the site's serif + spacing
 * conventions; external links open in new tab; relative links
 * (e.g. `/api/blob/...`) stay in-app.
 *
 * Why a shared component: every consumer needs the same h1/h2 weight,
 * paragraph rhythm, link colour. Centralising means one place to
 * tweak rendering when LLM tightens or loosens style.
 */
export function Markdown({
    source,
    className = '',
    compact = false,
}: {
    source: string;
    className?: string;
    /** Tighter type scale for dense admin surfaces (後臺 弧線計畫 / 導演日誌),
     *  so structured markdown renders properly without the feed's display sizes. */
    compact?: boolean;
}) {
    const base = compact
        ? 'es-markdown font-serif text-sm leading-relaxed text-ink/90'
        : 'es-markdown max-w-prose font-serif text-base leading-loose text-ink/90 sm:text-lg';
    return (
        <div className={`${base} ${className}`}>
            <ReactMarkdown components={compact ? COMPACT_COMPONENTS : COMPONENTS}>{source}</ReactMarkdown>
        </div>
    );
}

const COMPONENTS: Components = {
    h1: (props) => (
        <h1
            {...props}
            className="mt-2 mb-6 font-serif text-2xl tracking-wide text-ink sm:text-3xl"
        />
    ),
    h2: (props) => (
        <h2
            {...props}
            className="mt-8 mb-3 font-serif text-xl tracking-wide text-ink sm:text-2xl"
        />
    ),
    h3: (props) => (
        <h3
            {...props}
            className="mt-6 mb-2 font-serif text-lg tracking-wide text-ink sm:text-xl"
        />
    ),
    p: (props) => <p {...props} className="my-4 leading-loose" />,
    ul: (props) => <ul {...props} className="my-4 space-y-2 pl-6 list-disc marker:text-cinnabar/70" />,
    ol: (props) => <ol {...props} className="my-4 space-y-2 pl-6 list-decimal marker:text-cinnabar/70" />,
    li: (props) => <li {...props} className="leading-loose" />,
    a: ({ href, ...rest }) => {
        const isExternal =
            typeof href === 'string' && /^https?:\/\//.test(href);
        return (
            <a
                {...rest}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-cinnabar underline-offset-4 hover:underline"
            />
        );
    },
    blockquote: (props) => (
        <blockquote
            {...props}
            className="my-4 border-l-2 border-cinnabar/40 pl-4 italic text-ink/80"
        />
    ),
    code: (props) => (
        <code
            {...props}
            className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm text-ink/85"
        />
    ),
    hr: () => <hr className="my-8 border-hairline" />,
};

// Tighter scale for the 後臺 panels — same theme (serif, cinnabar markers, ink),
// smaller headings/spacing so a long 弧線計畫 stays a compact, scannable card
// instead of feed-sized prose.
const COMPACT_COMPONENTS: Components = {
    h1: (props) => <h1 {...props} className="mt-1 mb-2 font-serif text-base tracking-wide text-ink" />,
    h2: (props) => <h2 {...props} className="mt-4 mb-1.5 font-serif text-sm tracking-wide text-ink" />,
    h3: (props) => (
        <h3 {...props} className="mt-3 mb-1 font-serif text-sm tracking-wide text-cinnabar/90" />
    ),
    p: (props) => <p {...props} className="my-2 leading-relaxed" />,
    ul: (props) => <ul {...props} className="my-2 space-y-1 pl-5 list-disc marker:text-cinnabar/70" />,
    ol: (props) => <ol {...props} className="my-2 space-y-1 pl-5 list-decimal marker:text-cinnabar/70" />,
    li: (props) => <li {...props} className="leading-relaxed" />,
    a: ({ href, ...rest }) => {
        const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
        return (
            <a
                {...rest}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-cinnabar underline-offset-4 hover:underline"
            />
        );
    },
    blockquote: (props) => (
        <blockquote {...props} className="my-2 border-l-2 border-cinnabar/40 pl-3 italic text-ink/80" />
    ),
    code: (props) => (
        <code {...props} className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink/85" />
    ),
    hr: () => <hr className="my-4 border-hairline" />,
    strong: (props) => <strong {...props} className="font-medium text-ink" />,
};
