// LINK PREVIEWS, the pure half (LIVE-2530). Which link in a message gets a card, how a URL is keyed in
// the cache, and what a page's <head> says about itself. No IO: lib/link-preview/index.ts fetches.

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/i
// A tag token carries a target, never a URL, but strip them so "(plan:<uuid>)" can never read as a link.
const TAG_RE = /[@#]\[[^\]]{1,120}\]\([a-z]+:[0-9a-f-]{36}\)/gi

/** The first http(s) link in a message, trailing punctuation trimmed, or null. */
export function firstLink(body: string): string | null {
  const m = URL_RE.exec(body.replace(TAG_RE, ' '))
  if (!m) return null
  const trimmed = m[0].replace(/[.,;:!?]+$/, '')
  return normalizeUrl(trimmed)
}

/** The cache key: http(s) only, no credentials, no fragment, lower-case host. Null when unusable. */
export function normalizeUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
  u.hash = ''
  u.hostname = u.hostname.toLowerCase()
  const out = u.toString()
  return out.length <= 2048 ? out : null
}

export interface PagePreview {
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }

function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (all, code: string) => {
      const c = code.toLowerCase()
      if (c in ENTITIES) return ENTITIES[c]
      if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16) || 32)
      if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10) || 32)
      return all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(s: string | null, max: number): string | null {
  if (!s) return null
  const v = decode(s)
  if (!v) return null
  return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v
}

function metaContent(html: string, keys: readonly string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    if (!key || !keys.includes(key)) continue
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag)
    const v = content?.[1] ?? content?.[2]
    if (v && v.trim()) return v
  }
  return null
}

/** Read Open Graph, Twitter and plain <title>/<meta description> from a page's HTML. */
export function parsePreview(html: string, pageUrl: string): PagePreview {
  const head = html.slice(0, 300_000)
  const title = metaContent(head, ['og:title', 'twitter:title']) ?? /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(head)?.[1] ?? null
  const description = metaContent(head, ['og:description', 'twitter:description', 'description'])
  const rawImage = metaContent(head, ['og:image', 'og:image:url', 'twitter:image'])
  let imageUrl: string | null = null
  if (rawImage) {
    try {
      const abs = new URL(decode(rawImage), pageUrl)
      if (abs.protocol === 'https:') imageUrl = abs.toString().slice(0, 2048)
    } catch {
      imageUrl = null
    }
  }
  return {
    title: clip(title, 300),
    description: clip(description, 600),
    imageUrl,
    siteName: clip(metaContent(head, ['og:site_name']), 120),
  }
}
