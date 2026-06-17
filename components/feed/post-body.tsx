import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import type { ReactNode } from 'react'

// Feed posts are a *light* markdown surface — bold / italic / lists / links plus
// @mentions, and nothing heavier. Headings, images and raw HTML are stripped so
// the stream stays calm and safe (images go through the real attach flow, not
// markdown). Shared by the post card and replies so formatting renders the same
// everywhere it's authored in the composer.
type Kids = { children?: ReactNode }

// Inline-ish elements only. react-markdown unwraps anything not listed, so a
// stray "# heading" or "![img]" degrades to its text rather than rendering.
const ALLOWED = ['p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'code']

function prepare(body: string): string {
  return (
    body
      // Linkify @handles at a word boundary so emails / paths are left alone.
      .replace(/(^|[^\w/])@([a-zA-Z0-9_]+)/g, '$1[@$2](/people/$2)')
      // Keep the line breaks people actually typed (markdown would fold them).
      .replace(/\n/g, '  \n')
  )
}

export function PostBody({ body, className = '' }: { body: string; className?: string }) {
  return (
    <div className={`break-words ${className}`}>
      <ReactMarkdown
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          p: ({ children }: Kids) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }: Kids) => <strong className="font-semibold text-text">{children}</strong>,
          em: ({ children }: Kids) => <em className="italic">{children}</em>,
          del: ({ children }: Kids) => <del className="opacity-70">{children}</del>,
          ul: ({ children }: Kids) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }: Kids) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }: Kids) => <li className="leading-relaxed">{children}</li>,
          code: ({ children }: Kids) => (
            <code className="rounded bg-surface-elevated px-1 py-0.5 text-[0.85em] text-text">{children}</code>
          ),
          a: ({ href, children }: Kids & { href?: string }) => {
            const target = href ?? '#'
            return target.startsWith('/') ? (
              <Link href={target} className="font-medium text-primary-strong hover:underline">
                {children}
              </Link>
            ) : (
              <a
                href={target}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary-strong hover:underline"
              >
                {children}
              </a>
            )
          },
        }}
      >
        {prepare(body)}
      </ReactMarkdown>
    </div>
  )
}
