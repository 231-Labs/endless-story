'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character } from '@endless-story/shared';
import { characterPortraitTone } from './CharacterPortrait';
import { BlobImage } from './BlobImage';

type NameToken = { kind: 'name'; value: string; char: Character };
type TextToken = { kind: 'text'; value: string };
type Token = NameToken | TextToken;

interface BaseProps {
  text: string;
  characters: Character[];
  /** Exclude self (don't linkify the character on their own dossier page) */
  skipId?: string;
  /** Turn off name linkify but keep markdown / line breaks */
  linkifyNames?: boolean;
}

/* ─────────── Tokenizer ─────────── */

function tokenize(text: string, characters: Character[], skipId?: string): Token[] {
  const pool = characters.filter((c) => c.name && c.name.length >= 2 && c.id !== skipId);
  if (pool.length === 0) return [{ kind: 'text', value: text }];

  const sorted = [...pool].sort((a, b) => b.name.length - a.name.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(sorted.map((c) => escape(c.name)).join('|'), 'g');

  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) tokens.push({ kind: 'text', value: text.slice(last, m.index) });
    const char = sorted.find((c) => c.name === m![0])!;
    tokens.push({ kind: 'name', value: m[0], char });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) });
  return tokens;
}

/* ─────────── Inline markdown (**bold** / *italic*) ─────────── */

function renderMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Fragment key={`${keyPrefix}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    }
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-ink">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i${i++}`} className="italic text-jade dark:text-jade">
          {m[2]}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<Fragment key={`${keyPrefix}-t${i++}`}>{text.slice(last)}</Fragment>);
  }
  return out;
}

function renderInline(
  text: string,
  characters: Character[],
  keyPrefix: string,
  linkifyNames: boolean,
  skipId?: string
): React.ReactNode[] {
  if (!linkifyNames) return renderMarkdown(text, keyPrefix);
  const tokens = tokenize(text, characters, skipId);
  return tokens.map((tok, idx) => {
    if (tok.kind === 'name') {
      return <NameLink key={`${keyPrefix}-n${idx}`} char={tok.char} label={tok.value} />;
    }
    return (
      <Fragment key={`${keyPrefix}-x${idx}`}>
        {renderMarkdown(tok.value, `${keyPrefix}-x${idx}`)}
      </Fragment>
    );
  });
}

/* ─────────── Inline name link + hover card ─────────── */

const CARD_W = 288;
const CARD_H_EST = 196;
const PAD = 12;

function NameLink({ char, label }: { char: Character; label: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link
        ref={ref}
        href={{ pathname: '/dossier', query: { id: char.id } }}
        prefetch={false}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="border-b border-dotted border-cinnabar/45 px-px text-ink transition-colors duration-200 hover:border-solid hover:border-cinnabar hover:text-cinnabar dark:border-cinnabar/55 dark:hover:border-cinnabar"
      >
        {label}
      </Link>
      {open && ref.current ? <NameCard char={char} anchor={ref.current} /> : null}
    </>
  );
}

function NameCard({ char, anchor }: { char: Character; anchor: HTMLElement }) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'top' | 'bottom' } | null>(
    null
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const compute = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = r.left + r.width / 2 - CARD_W / 2;
      left = Math.max(PAD, Math.min(vw - CARD_W - PAD, left));
      const spaceAbove = r.top;
      const spaceBelow = vh - r.bottom;
      const placement: 'top' | 'bottom' =
        spaceAbove >= CARD_H_EST + PAD ? 'top'
        : spaceBelow >= CARD_H_EST + PAD ? 'bottom'
        : 'top';
      const top = placement === 'top' ? r.top - 10 : r.bottom + 10;
      setPos({ left, top, placement });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [anchor]);

  if (!mounted || !pos) return null;
  const yShift = pos.placement === 'top' ? '-100%' : '0';

  const tone = characterPortraitTone(char.role);
  const imageUrl = char.gallery?.anchor?.imageUrl;

  const card = (
    <span
      className="pointer-events-none fixed z-50 hidden md:block"
      style={{ left: pos.left, top: pos.top, width: CARD_W, transform: `translateY(${yShift})` }}
    >
      <span className="animate-fade-in-up block overflow-hidden rounded-lg border border-cinnabar/25 bg-elevated/95 shadow-xl shadow-ink/10 backdrop-blur-xl dark:border-cinnabar/35 dark:shadow-black/40">
        {/* identity row */}
        <span className="flex items-start gap-3 px-4 py-3.5">
          <span
            className={`relative block h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ${tone.ring} ${tone.bg}`}
          >
            <span className={`absolute inset-0 flex items-center justify-center font-serif text-lg ${tone.text}`}>
              {char.name[0]}
            </span>
            {imageUrl ? (
              <BlobImage
                src={imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
          </span>
          <span className="block min-w-0 flex-1">
            <span className="block truncate font-serif text-base leading-tight text-ink">
              {char.name}
            </span>
            <span className="mt-1 block text-2xs tracking-widest text-mute">
              {char.role}
              {char.age ? <span className="ml-2 text-mute/70">{char.age} 歲</span> : null}
            </span>
          </span>
        </span>

        {/* description quote */}
        {char.description ? (
          <span className="line-clamp-3 block border-l border-cinnabar/40 px-4 pb-4 pl-3 text-xs italic leading-relaxed text-ink/75 dark:border-cinnabar/50">
            {char.description}
          </span>
        ) : null}
      </span>
    </span>
  );

  return createPortal(card, document.body);
}

/* ─────────── Public: inline (single-line / single paragraph) ─────────── */

export function Linkified({
  text,
  characters,
  skipId,
  linkifyNames = true,
}: BaseProps) {
  const nodes = useMemo(
    () => renderInline(text, characters, 'inl', linkifyNames, skipId),
    [text, characters, linkifyNames, skipId]
  );
  return <>{nodes}</>;
}

/* ─────────── Public: prose (multi-paragraph, headings, --- dividers) ─────────── */

function splitBlocks(text: string): string[] {
  const norm = text.replace(/\r\n/g, '\n');
  const padded = `\n${norm}\n`;
  return padded.split(/\n[ \t]*[-*_]{3,}[ \t]*\n/);
}

type Part =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string };

function splitParagraphs(block: string): Part[] {
  const lines = block.split('\n');
  const parts: Part[] = [];
  let buf: string[] = [];
  const flush = () => {
    const joined = buf.join('\n').trim();
    if (joined.length > 0) parts.push({ type: 'paragraph', text: joined });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flush();
      parts.push({ type: 'heading', level: h[1].length, text: h[2] });
    } else if (line.trim() === '') {
      flush();
    } else {
      buf.push(line);
    }
  }
  flush();
  return parts;
}

export function LinkifiedProse({
  text,
  characters,
  skipId,
  linkifyNames = true,
  className,
}: BaseProps & { className?: string }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const trimmed = block.replace(/^\n+|\n+$/g, '');
        const parts = splitParagraphs(trimmed);
        return (
          <Fragment key={`b${bi}`}>
            {bi > 0 ? (
              <hr
                aria-hidden
                className="mx-auto my-10 w-20 border-0 border-t border-cinnabar/30 dark:border-cinnabar/40"
              />
            ) : null}
            {parts.map((part, pi) => {
              const key = `b${bi}-p${pi}`;
              if (part.type === 'heading') {
                const Tag = part.level === 1 ? 'h2' : part.level === 2 ? 'h3' : 'h4';
                const headingClass =
                  part.level === 1
                    ? 'mt-10 mb-4 font-serif text-2xl tracking-wide text-ink'
                    : part.level === 2
                      ? 'mt-8 mb-3 font-serif text-xl text-ink/90'
                      : 'mt-6 mb-2 font-serif text-lg text-ink/80';
                return (
                  <Tag key={key} className={headingClass}>
                    {renderInline(part.text, characters, key, linkifyNames, skipId)}
                  </Tag>
                );
              }
              return (
                <p key={key}>
                  {renderInline(part.text, characters, key, linkifyNames, skipId)}
                </p>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
