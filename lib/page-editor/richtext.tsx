import Link from 'next/link'

// Lightweight inline rich text for body copy. Authors type a tiny markdown
// subset; we parse it into React elements (never dangerouslySetInnerHTML, so
// there's no injection surface). Supports:
//   **bold**   *italic*   [label](/path or https://…)
// Keeps the editor dependency-free and the public bundle tiny.

const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g

// Only allow safe link targets (internal paths or http/https). Anything else
// (javascript:, data:, protocol-relative, …) is rejected (callers render plain text or fall back to '#').
// Exported so every data-authored link sink (CTA buttons, collection/media links)
// applies the SAME allowlist, not just inline rich text (ADR-390 security follow-up).
//
// The internal-path case is decided by PARSING, not by reading the first character. `//evil.com/x`
// starts with a slash and points off-origin, and the URL parser folds `/\evil.com` into the same
// thing; both used to come back unchanged, so "starts with / therefore internal" was a claim this
// function made and did not check. Resolving against a base that cannot exist and requiring the
// origin to still BE that base is the guard lib/safe-image-src.ts applies to <img src>; this is the
// href half of the same allowlist, and that branch returns the parser's own path, because a check
// and the value it returns have to agree.
//
// An absolute URL is parsed too — the scheme comes from the parser, not from reading the first
// characters — but comes back as the caller wrote it. Same call as lib/entity-blocks/block-content.ts
// safeUrl, and made once for both: an allowlisted scheme has no origin left to hide, and these two
// helpers guard the same authored strings, so they must not disagree about what they hand back.
//
// `#...` is returned as-is deliberately: a fragment has no origin, and resolving it would turn an
// in-page `#section` into `/#section`, which is a different page anywhere but the root.
const RELATIVE_BASE = 'https://relative.invalid'

export function safeHref(href: string | null | undefined): string | null {
  if (!href) return null
  const h = href.trim()
  if (!h) return null
  if (h.startsWith('#')) return h
  try {
    if (h.startsWith('/')) {
      const u = new URL(h, RELATIVE_BASE)
      return u.origin === RELATIVE_BASE ? `${u.pathname}${u.search}${u.hash}` : null
    }
    const p = new URL(h).protocol
    return p === 'http:' || p === 'https:' ? h : null
  } catch {
    return null
  }
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
