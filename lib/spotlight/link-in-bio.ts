// THE PERSONAL SPOTLIGHT, LINK-IN-BIO SIDE. PURE: no IO, no React. A member's ordered link list, social row and the
// one master switch "Show Frequency features", stored at the top-level `meta.spotlightPage` key (written only by
// spotlight-page-actions.ts through merge_profile_meta). Validated on every read and every write: the wire and a
// tampered meta blob are never trusted. A member who has never saved here has `configured: false`, and the public
// page renders exactly as it did before.

export const PAGE_META_KEY = 'spotlightPage'
export const MAX_PAGE_LINKS = 40
const TITLE_MAX = 60
const SOCIAL_MAX = 8

export const LINK_ICONS = ['link', 'calendar', 'mail', 'music', 'video', 'shop', 'book', 'heart'] as const
export type LinkIcon = (typeof LINK_ICONS)[number]

export const SOCIAL_KINDS = ['instagram', 'tiktok', 'youtube', 'spotify', 'x', 'linkedin', 'facebook', 'email', 'website'] as const
export type SocialKind = (typeof SOCIAL_KINDS)[number]
export const SOCIAL_LABEL: Record<SocialKind, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  spotify: 'Spotify',
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  email: 'Email',
  website: 'Website',
}

export interface PageLink {
  id: string
  title: string
  url: string
  icon: LinkIcon
  hidden: boolean
  highlight: boolean
  /** ISO instants. Either, both or neither. A link outside its window is not shown to visitors. */
  startsAt?: string
  endsAt?: string
}
export interface PageSocial {
  kind: SocialKind
  /** A https URL, or a mailto: address for `email`. */
  url: string
}
export interface SpotlightPageSettings {
  /** False until the member first saves the editor; the public page then keeps its older render. */
  configured: boolean
  /** The master switch. Off: a clean link-in-bio with no Frequency extras. Default on. */
  frequencyFeatures: boolean
  links: PageLink[]
  socials: PageSocial[]
}

export const EMPTY_PAGE: SpotlightPageSettings = { configured: false, frequencyFeatures: true, links: [], socials: [] }

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** http(s) only: kills javascript:, data: and vbscript: injection. A bare "maya.com" gets https. */
export function safeWebUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const raw = v.trim()
  if (!raw || raw.length > 2000) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.toString() : null
  } catch {
    return null
  }
}

function safeMailto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const addr = v.trim().replace(/^mailto:/i, '')
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) && addr.length <= 254 ? `mailto:${addr}` : null
}

function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined
}

function safeId(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : fallback
}

/** Coerce anything into settings. Bad links and socials are dropped, never thrown. Duplicate ids are renumbered. */
export function validatePageSettings(raw: unknown): SpotlightPageSettings {
  if (!isObj(raw)) return EMPTY_PAGE
  const links: PageLink[] = []
  const seen = new Set<string>()
  const rawLinks = Array.isArray(raw.links) ? raw.links : []
  for (const item of rawLinks) {
    if (links.length >= MAX_PAGE_LINKS) break
    if (!isObj(item)) continue
    const url = safeWebUrl(item.url)
    if (!url) continue
    const title = (typeof item.title === 'string' ? item.title.trim() : '').slice(0, TITLE_MAX)
    let id = safeId(item.id, `l${links.length + 1}`)
    while (seen.has(id)) id = `${id}x`
    seen.add(id)
    const icon = LINK_ICONS.find((i) => i === item.icon) ?? 'link'
    links.push({
      id,
      title: title || new URL(url).hostname.replace(/^www\./, ''),
      url,
      icon,
      hidden: item.hidden === true,
      highlight: item.highlight === true,
      startsAt: isoOrUndefined(item.startsAt),
      endsAt: isoOrUndefined(item.endsAt),
    })
  }
  // One highlighted link at most: the first wins.
  let highlighted = false
  for (const l of links) {
    if (l.highlight && highlighted) l.highlight = false
    if (l.highlight) highlighted = true
  }
  const socials: PageSocial[] = []
  const kinds = new Set<SocialKind>()
  for (const item of Array.isArray(raw.socials) ? raw.socials : []) {
    if (socials.length >= SOCIAL_MAX || !isObj(item)) continue
    const kind = SOCIAL_KINDS.find((k) => k === item.kind)
    if (!kind || kinds.has(kind)) continue
    const url = kind === 'email' ? safeMailto(item.url) : safeWebUrl(item.url)
    if (!url) continue
    kinds.add(kind)
    socials.push({ kind, url })
  }
  return { configured: true, frequencyFeatures: raw.frequencyFeatures !== false, links, socials }
}

/** Read the settings off a profile's meta blob, fail-safe. */
export function readPageSettings(meta: unknown): SpotlightPageSettings {
  return isObj(meta) && PAGE_META_KEY in meta ? validatePageSettings(meta[PAGE_META_KEY]) : EMPTY_PAGE
}

/** The links a visitor sees right now: not hidden, inside any start/end window. */
export function visibleLinks(links: readonly PageLink[], now: Date = new Date()): PageLink[] {
  const t = now.getTime()
  return links.filter((l) => {
    if (l.hidden) return false
    if (l.startsAt && Date.parse(l.startsAt) > t) return false
    if (l.endsAt && Date.parse(l.endsAt) < t) return false
    return true
  })
}

/** Block ids the clean page and the page's own link list replace, so the Frequency body never repeats them. */
export const LINK_IN_BIO_OWNED_BLOCKS: ReadonlySet<string> = new Set(['about', 'links', 'topfriends'])
