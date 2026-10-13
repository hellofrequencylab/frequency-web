// THE WEBSITE FOOTER'S OWN WORDS (LIVE-904, the Wildheart handoff's footer). A skinned website's footer
// can carry link columns, a closing line, a short note and a copyright suffix, all written by the Space in
// `preferences.siteFooter`. PURE: this is the reader and its shape; components/sites/site-chrome.tsx draws
// it. Without the key the footer keeps the skin's default (the page links and the Frequency badge), so
// nothing changes for a Space that never wrote one. FAIL-SAFE: a malformed value reads as null.

import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'

interface SiteFooterColumn {
  title: string
  links: { label: string; href: string }[]
}

export interface SiteFooter {
  /** Link columns beside the brand column, in order. */
  columns: SiteFooterColumn[]
  /** The line under the mark, in place of the Space's tagline. */
  blurb: string | null
  /** The line on the right of the copyright ("Women-only · Invitation, never instruction ..."). */
  line: string | null
  /** A short note a phone's footer shows under the line. */
  note: string | null
  /** The words after the copyright ("A program on Frequency"); the skin links them to Frequency. */
  suffix: string | null
}

const MAX_COLUMNS = 4
const MAX_LINKS = 8

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const href = (v: unknown): string | null => {
  const h = text(v, 2000)
  if (!h) return null
  if (/^\/(?!\/)[^\\\s]*$/.test(h) || /^#[a-z0-9_-]+$/i.test(h)) return h
  try {
    const u = new URL(h)
    return u.protocol === 'https:' && !u.username && !u.password ? h : null
  } catch {
    return null
  }
}

/** The Space's footer, or null when it wrote none (or wrote something malformed). */
export function readSiteFooter(prefs: unknown): SiteFooter | null {
  const raw = prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>).siteFooter : null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const columns: SiteFooterColumn[] = []
  for (const c of Array.isArray(r.columns) ? r.columns.slice(0, MAX_COLUMNS) : []) {
    if (!c || typeof c !== 'object') continue
    const col = c as Record<string, unknown>
    const title = text(col.title, 60)
    const links = (Array.isArray(col.links) ? col.links.slice(0, MAX_LINKS) : [])
      .map((l) => (l && typeof l === 'object' ? { label: text((l as Record<string, unknown>).label, 80), href: href((l as Record<string, unknown>).href) } : null))
      .filter((l): l is { label: string; href: string } => !!l && !!l.label && !!l.href)
    if (title && links.length) columns.push({ title, links })
  }
  const blurb = text(r.blurb, 300)
  const line = text(r.line, 200)
  const note = text(r.note, 200)
  const suffix = text(r.suffix, 80)
  if (!columns.length && !blurb && !line && !note && !suffix) return null
  return { columns, blurb, line, note, suffix }
}

/** The Space's footer with every link pointed at the website: a page of the site stays on the site
 *  (siteLocalHref), anything else the Space wrote under /spaces/<slug> (the Space page, its calendar) opens
 *  on Frequency. */
export function siteFooterFor(footer: SiteFooter | null, links: SiteLinkMap, origin: string): SiteFooter | null {
  if (!footer) return null
  const resolve = (href: string): string => {
    const m = /^\/spaces\/([^/?#]+)(?:\/([^/?#]+))?\/?(?:[?#].*)?$/.exec(href)
    if (!m || m[1] !== links.slug) return href
    const seg = m[2]
    const local = siteLocalHref(href, links)
    if (local && seg && (links.pages.includes(seg) || seg === 'contact' || seg === 'book')) return local.href
    return `${origin}${href}`
  }
  return { ...footer, columns: footer.columns.map((c) => ({ ...c, links: c.links.map((l) => ({ ...l, href: resolve(l.href) })) })) }
}
