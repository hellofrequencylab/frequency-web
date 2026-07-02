import Link from 'next/link'

// Lightweight inline rich text for body copy. Authors type a tiny markdown
// subset; we parse it into React elements (never dangerouslySetInnerHTML, so
// there's no injection surface). Supports:
//   **bold**   *italic*   [label](/path or https://…)
// Keeps the editor dependency-free and the public bundle tiny.

const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g

// Only allow safe link targets (internal paths or http/https). Anything else
// (javascript:, data:, …) is rejected (callers render plain text or fall back to '#').
// Exported so every data-authored link sink (CTA buttons, collection/media links)
// applies the SAME allowlist, not just inline rich text (ADR-390 security follow-up).
export function safeHref(href: string | null | undefined): string | null {
  if (!href) return null
  const h = href.trim()
  if (h.startsWith('/') || h.startsWith('#')) return h
  if (/^https?:\/\//i.test(h)) return h
  return null
}

function inline(text: string): React.ReactNode[] {
  return text
    .split(INLINE)
    .map((part, i) => {
      if (!part) return null
      let m: RegExpExecArray | null
      if ((m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part))) {
        const href = safeHref(m[2])
        if (!href) return m[1]
        return (
          <Link key={i} href={href} className="text-primary-strong underline underline-offset-2 hover:no-underline">
            {m[1]}
          </Link>
        )
      }
      if ((m = /^\*\*([^*]+)\*\*$/.exec(part))) {
        return (
          <strong key={i} className="font-semibold text-text">
            {m[1]}
          </strong>
        )
      }
      if ((m = /^\*([^*]+)\*$/.exec(part))) {
        return <em key={i}>{m[1]}</em>
      }
      return part
    })
    .filter((n) => n !== null)
}

// The same tiny markdown subset, flattened to PLAIN TEXT (for JSON-LD / meta,
// where React nodes aren't valid): [label](href) → label, **bold**/*italic* →
// their inner text, and any paragraph/line breaks collapse to single spaces.
// Mirrors inline() so on-page copy and its structured-data mirror never drift.
export function richPlainText(body?: string | null): string {
  if (!body) return ''
  return body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Body string → <p> per blank-line-separated paragraph, with inline formatting.
export function richParagraphs(body?: string): React.ReactNode {
  if (!body) return null
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => <p key={i}>{inline(p)}</p>)
}
