// THE WEBSITE FOOTER'S OWN WORDS (LIVE-904, the Wildheart handoff's footer). A skinned website's footer
// can carry link columns, a closing line, a short note and a copyright suffix, all written by the Space in
// `preferences.siteFooter`. PURE: this is the reader and its shape; components/sites/site-chrome.tsx draws
// it. Without the key the footer keeps the skin's default (the page links and the Frequency badge), so
// nothing changes for a Space that never wrote one. FAIL-SAFE: a malformed value reads as null.

import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'

interface SiteFooterColumn {
  title: string
  links: { label: string; href: string }[]
  /** Plain lines under the title (hours, an address), for a column with nothing to link. */
  lines: string[]
}

/** A closing call above the footer's columns (the Designer footer's band): a heading with an italic word and up to
 *  two buttons. Other skins ignore it. */
interface SiteFooterBand {
  title: string
  ctas: { label: string; href: string }[]
}

/** The footer's letter sign-up (one email, one button), written by the Space. Other skins ignore it. */
interface SiteFooterSubscribe {
  title: string
  body: string
  fine: string
  button: string
  placeholder: string
  success: string
}

/** The strip above the header (a licence line on the left, hours / phone / email on the right). */
interface SiteFooterUtility {
  left: string | null
  items: { label: string; href: string | null }[]
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
  /** A footer mark of its own (the Designer footer's logo tile), in place of the header logo. */
  logo: string | null
  band: SiteFooterBand | null
  subscribe: SiteFooterSubscribe | null
  utility: SiteFooterUtility | null
}

const MAX_COLUMNS = 4
const MAX_LINKS = 8

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const href = (v: unknown): string | null => {
  const h = text(v, 2000)
  if (!h) return null
  if (/^\/(?!\/)[^\\\s]*$/.test(h) || /^#[a-z0-9_-]+$/i.test(h)) return h
  if (/^(mailto|tel):[^\s]+$/i.test(h)) return h
  try {
    const u = new URL(h)
    return u.protocol === 'https:' && !u.username && !u.password ? h : null
  } catch {
    return null
  }
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function readBand(v: unknown): SiteFooterBand | null {
  const r = obj(v)
  const title = text(r?.title, 120)
  if (!r || !title) return null
  const ctas = (Array.isArray(r.ctas) ? r.ctas.slice(0, 2) : [])
    .map((c) => ({ label: text(obj(c)?.label, 60), href: href(obj(c)?.href) }))
    .filter((c): c is { label: string; href: string } => !!c.label && !!c.href)
  return { title, ctas }
}

function readSubscribe(v: unknown): SiteFooterSubscribe | null {
  const r = obj(v)
  const title = text(r?.title, 60)
  if (!r || !title) return null
  return {
    title,
    body: text(r.body, 200) ?? '',
    fine: text(r.fine, 160) ?? '',
    button: text(r.button, 24) ?? 'Subscribe',
    placeholder: text(r.placeholder, 40) ?? 'Email Address',
    success: text(r.success, 160) ?? 'Thanks. You are on the list.',
  }
}

function readUtility(v: unknown): SiteFooterUtility | null {
  const r = obj(v)
  if (!r) return null
  const items = (Array.isArray(r.items) ? r.items.slice(0, 4) : [])
    .map((i) => ({ label: text(obj(i)?.label, 80), href: href(obj(i)?.href) }))
    .filter((i): i is { label: string; href: string | null } => !!i.label)
  const left = text(r.left, 80)
  return left || items.length ? { left, items } : null
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
    const lines = (Array.isArray(col.lines) ? col.lines.slice(0, MAX_LINKS) : []).map((l) => text(l, 80)).filter((l): l is string => !!l)
    if (title && (links.length || lines.length)) columns.push({ title, links, lines })
  }
  const blurb = text(r.blurb, 300)
  const line = text(r.line, 200)
  const note = text(r.note, 200)
  const suffix = text(r.suffix, 80)
  const logo = text(r.logo, 2000)
  const band = readBand(r.band)
  const subscribe = readSubscribe(r.subscribe)
  const utility = readUtility(r.utility)
  if (!columns.length && !blurb && !line && !note && !suffix && !logo && !band && !subscribe && !utility) return null
  return { columns, blurb, line, note, suffix, logo: logo && /^(\/(?!\/)|https:\/\/)\S+$/.test(logo) ? logo : null, band, subscribe, utility }
}

/** The Space's footer with every link pointed at the website: a page of the site stays on the site
 *  (siteLocalHref), anything else the Space wrote under /spaces/<slug> (the Space page, its calendar) opens
 *  on Frequency. */
export function siteFooterFor(footer: SiteFooter | null, links: SiteLinkMap, origin: string): SiteFooter | null {
  if (!footer) return null
  const resolve = (href: string): string => {
    // Every way of writing to the Space opens its own Contact page, where the form is.
    if (/^mailto:/i.test(href) && links.contactHref) return links.contactHref
    const m = /^\/spaces\/([^/?#]+)(?:\/([^/?#]+))?\/?(?:[?#].*)?$/.exec(href)
    if (!m || m[1] !== links.slug) return href
    const seg = m[2]
    const local = siteLocalHref(href, links)
    if (local && seg && (links.pages.includes(seg) || seg === 'contact' || seg === 'book')) return local.href
    return `${origin}${href}`
  }
  return {
    ...footer,
    columns: footer.columns.map((c) => ({ ...c, links: c.links.map((l) => ({ ...l, href: resolve(l.href) })) })),
    band: footer.band && { ...footer.band, ctas: footer.band.ctas.map((c) => ({ ...c, href: resolve(c.href) })) },
  }
}
