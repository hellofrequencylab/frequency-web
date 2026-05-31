import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import type { ReactNode } from 'react'

// Renders help-article Markdown with DAWN-token styling. Server component (no
// client JS) so help pages stay static and fast. Each handler takes only the
// children it needs, so react-markdown's internal `node` prop never leaks to the DOM.
type Kids = { children?: ReactNode }

export function HelpMarkdown({ children }: { children: string }) {
  return (
    <div className="max-w-none">
      <ReactMarkdown
        components={{
          h1: ({ children }: Kids) => (
            <h2 className="font-display text-2xl text-text mt-10 mb-3">{children}</h2>
          ),
          h2: ({ children }: Kids) => (
            <h2 className="font-display text-xl text-text mt-10 mb-3">{children}</h2>
          ),
          h3: ({ children }: Kids) => (
            <h3 className="text-lg font-semibold text-text mt-6 mb-2">{children}</h3>
          ),
          p: ({ children }: Kids) => (
            <p className="text-text/80 leading-relaxed mb-4">{children}</p>
          ),
          ul: ({ children }: Kids) => (
            <ul className="list-disc pl-6 mb-4 space-y-1.5 text-text/80">{children}</ul>
          ),
          ol: ({ children }: Kids) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1.5 text-text/80">{children}</ol>
          ),
          li: ({ children }: Kids) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }: Kids & { href?: string }) => {
            const target = href ?? '#'
            return target.startsWith('/') ? (
              <Link href={target} className="text-primary-strong underline underline-offset-2">
                {children}
              </Link>
            ) : (
              <a
                href={target}
                target="_blank"
                rel="noreferrer"
                className="text-primary-strong underline underline-offset-2"
              >
                {children}
              </a>
            )
          },
          blockquote: ({ children }: Kids) => (
            <blockquote className="border-l-2 border-primary pl-4 italic text-muted my-4">
              {children}
            </blockquote>
          ),
          code: ({ children }: Kids) => (
            <code className="rounded bg-surface px-1.5 py-0.5 text-sm text-text">{children}</code>
          ),
          pre: ({ children }: Kids) => (
            <pre className="rounded-lg bg-surface border border-border p-4 overflow-x-auto text-sm mb-4">
              {children}
            </pre>
          ),
          strong: ({ children }: Kids) => (
            <strong className="text-text font-semibold">{children}</strong>
          ),
          hr: () => <hr className="my-8 border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
