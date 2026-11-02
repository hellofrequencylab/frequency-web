import { publicUrlFor, SAFE_FALLBACK } from '@/lib/qr/public-url'

// SHORT SHARE LINKS (LIVE-1960). The pure half: which pages may get a short link, and what the link looks
// like. The database half is lib/share/short-link-store.ts. A short link is only ever a door to a PUBLIC
// page, so a path is accepted only when the one public-page resolver (lib/qr/public-url.ts) would hand
// back the very same path. An admin, manage, settings, feed or unknown owner route never qualifies.

/** The public path a short link may point at, or null when `input` is not a shareable public page.
 *  Takes a pathname or absolute URL; the query string and hash are dropped (the sharer's ref is
 *  attached on open, not stored). PURE. */
export function shortenablePath(input: string): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null
  let pathname: string
  try {
    pathname = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : (raw.split(/[?#]/)[0] ?? '')
  } catch {
    return null
  }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) return null
  const safe = publicUrlFor(pathname)
  // publicUrlFor collapses an owner sub-route to its entity page and swaps a private one for the
  // fallback. A short link only exists for a page that is already exactly its public self.
  if (safe !== pathname.replace(/\/+$/, '') && !(pathname === '/' && safe === '/')) return null
  if (safe === SAFE_FALLBACK && pathname !== SAFE_FALLBACK) return null
  return safe
}

/** The short link for a slug, on `origin` (no trailing slash). PURE. */
export function shortLinkFor(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/s/${slug}`
}

/** True for a slug shape the resolver will look up. Keeps junk out of the database call. PURE. */
export function isShareSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{3,48}$/.test(value)
}

/** Crawlers and link-preview fetchers open a link without a person behind it. They still get the
 *  redirect; they just are not counted as an open. PURE. */
export function isPreviewFetcher(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|skype|discord|linkedin|pinterest|headless|curl|wget/i.test(
    userAgent,
  )
}
