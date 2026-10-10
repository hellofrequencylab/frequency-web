// THE SPACE MENU (owner ask 2026-10-10): ONE list of menu items stored on the Space
// (preferences.siteMenu) that both the Space page's tab row and the Space website's header read, so a
// link edited on either platform shows on both. Each item says where it shows (both, the Space page
// only, or the website only).
//
// An item points at one of three things:
//   · an AUTO entry the platform already knows how to build, by a key that means the same on both:
//     `home`, `page:<slug>`, `feature:<id>` (calendar, circles, shop, contact...) or `anchor:<id>`
//     (a section on Home). A platform drops an auto item it cannot draw (a feature that switched off,
//     a page that was deleted), so a saved menu never links to a dead end;
//   · a custom URL (https, mailto, tel, a site path or #anchor);
//   · a DROPDOWN: child links (each with an optional line of description) and an optional photo card,
//     drawn as the header's mega panel on both platforms.
//
// Who edits: Business and up (the space_full_website entitlement, the same key that unlocks extra
// pages). A Free Space, and any Space that never saved a menu, keeps the menu each platform builds on
// its own today (canEdit false or no saved menu: resolveSiteMenu returns null and the caller keeps
// its default). Once a menu is saved, a feature or page that becomes available later (not in `known`,
// the keys the owner saw when they saved) joins the end of the menu on both platforms.
//
// Pure: no I/O. Readers and writers are fail-safe; a malformed node reads as "no saved menu".

export type MenuVisibility = 'both' | 'space' | 'website'
type MenuPlatform = 'space' | 'website'

export type MenuTarget = { kind: 'auto'; key: string } | { kind: 'url'; href: string }

export interface MenuChild {
  label: string
  desc?: string
  target: MenuTarget
}

interface MenuFeatureCard {
  title: string
  desc?: string
  target: MenuTarget
  img?: string
  /** CSS object-position for the photo, e.g. "center 30%". */
  pos?: string
}

export interface MenuItem {
  id: string
  label: string
  visibility: MenuVisibility
  /** A plain link. Absent on a dropdown. */
  target?: MenuTarget
  /** A dropdown's links. Present (non-empty) makes the item a dropdown. */
  children?: MenuChild[]
  feature?: MenuFeatureCard
}

export interface SiteMenu {
  v: 1
  items: MenuItem[]
  /** The auto page and feature keys available when the owner last saved. Anything newer joins the end. */
  known: string[]
}

/** One link a platform can draw by itself, keyed so the same key means the same thing on both. */
export interface MenuCatalogEntry {
  key: string
  label: string
  href: string
  external?: boolean
}

export interface ResolvedMenuLink {
  href: string
  label: string
  external?: boolean
  mega?: {
    links: { label: string; desc?: string | null; href: string }[]
    feature?: { title: string; desc?: string | null; href: string; img?: string | null; pos?: string | null } | null
  } | null
}

export const MAX_MENU_ITEMS = 24
export const MAX_MENU_CHILDREN = 12
const MAX_LABEL = 60
const MAX_DESC = 160
const MAX_HREF = 2000
const MAX_KEY = 120

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= max ? t : null
}

/** A key the auto catalog can produce. */
function isMenuKey(key: string): boolean {
  return key === 'home' || /^(page|feature|anchor):[a-z0-9][a-z0-9-]{0,80}$/.test(key)
}

/** An href an owner may type: https, mailto, tel, a site path or a #anchor. Never javascript: or http:. */
export function isMenuHref(href: string): boolean {
  if (href.length > MAX_HREF || /\s/.test(href)) return false
  if (/^\/(?!\/)/.test(href) || /^#[\w-]+$/.test(href)) return true
  if (/^(mailto|tel):[^\s]+$/i.test(href)) return true
  try {
    return new URL(href).protocol === 'https:'
  } catch {
    return false
  }
}

function parseTarget(v: unknown): MenuTarget | null {
  if (!record(v)) return null
  if (v.kind === 'auto') {
    const key = text(v.key, MAX_KEY)
    return key && isMenuKey(key) ? { kind: 'auto', key } : null
  }
  if (v.kind === 'url') {
    const href = text(v.href, MAX_HREF)
    return href && isMenuHref(href) ? { kind: 'url', href } : null
  }
  return null
}

function parseImage(v: unknown): string | undefined {
  const s = text(v, MAX_HREF)
  if (!s) return undefined
  if (/^\/(?!\/)/.test(s)) return s
  try {
    return new URL(s).protocol === 'https:' ? s : undefined
  } catch {
    return undefined
  }
}

function parseItem(v: unknown): MenuItem | null {
  if (!record(v)) return null
  const id = text(v.id, 64)
  const label = text(v.label, MAX_LABEL)
  if (!id || !label) return null
  const visibility: MenuVisibility = v.visibility === 'space' || v.visibility === 'website' ? v.visibility : 'both'
  const children = Array.isArray(v.children)
    ? v.children
        .slice(0, MAX_MENU_CHILDREN)
        .map((c): MenuChild | null => {
          if (!record(c)) return null
          const cl = text(c.label, MAX_LABEL)
          const target = parseTarget(c.target)
          if (!cl || !target) return null
          const desc = text(c.desc, MAX_DESC)
          return { label: cl, target, ...(desc ? { desc } : {}) }
        })
        .filter((c): c is MenuChild => !!c)
    : []
  if (children.length > 0) {
    let feature: MenuFeatureCard | undefined
    if (record(v.feature)) {
      const title = text(v.feature.title, MAX_LABEL)
      const target = parseTarget(v.feature.target)
      if (title && target) {
        const desc = text(v.feature.desc, MAX_DESC)
        const img = parseImage(v.feature.img)
        const pos = text(v.feature.pos, 40)
        feature = { title, target, ...(desc ? { desc } : {}), ...(img ? { img } : {}), ...(pos && /^[\w\s.%-]+$/.test(pos) ? { pos } : {}) }
      }
    }
    return { id, label, visibility, children, ...(feature ? { feature } : {}) }
  }
  const target = parseTarget(v.target)
  return target ? { id, label, visibility, target } : null
}

/** Validate an untrusted menu (a client save, or the stored node). Null when it is not a menu at all. */
export function parseSiteMenu(v: unknown): SiteMenu | null {
  if (!record(v) || !Array.isArray(v.items)) return null
  const seen = new Set<string>()
  const items = v.items
    .map(parseItem)
    .filter((i): i is MenuItem => {
      if (!i || seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })
    .slice(0, MAX_MENU_ITEMS)
  const known = Array.isArray(v.known)
    ? [...new Set(v.known.filter((k): k is string => typeof k === 'string' && k.length <= MAX_KEY && isMenuKey(k)))]
    : []
  return { v: 1, items, known }
}

export function readSiteMenu(preferences: unknown): SiteMenu | null {
  return record(preferences) ? parseSiteMenu(preferences.siteMenu) : null
}

/** Write (or with null, clear back to the automatic menu) the saved menu, keeping every other key. */
export function withSiteMenu(preferences: unknown, menu: SiteMenu | null): Record<string, unknown> {
  const next = { ...(record(preferences) ? preferences : {}) }
  if (menu) next.siteMenu = menu
  else delete next.siteMenu
  return next
}

/** Whether a catalog key is one that joins a saved menu automatically when it first appears. */
function joinsAutomatically(key: string): boolean {
  return key.startsWith('page:') || key.startsWith('feature:')
}

/** The keys a save records as seen: every page and feature either platform offered at save time. */
export function knownKeys(catalog: MenuCatalogEntry[]): string[] {
  return [...new Set(catalog.map((e) => e.key).filter(joinsAutomatically))]
}

/**
 * The menu a platform draws from the saved list, or null when the platform should keep its own
 * automatic menu (no saved menu, or the Space's plan does not include menu editing).
 *
 * `fallbackHref` lets a platform reach an auto key it cannot draw itself (the website links a Space
 * feature it has no page for to that feature on the Space page); returning null drops the item.
 */
export function resolveSiteMenu(
  menu: SiteMenu | null,
  catalog: MenuCatalogEntry[],
  platform: MenuPlatform,
  opts: { canEdit: boolean; fallbackHref?: (key: string) => string | null },
): ResolvedMenuLink[] | null {
  if (!menu || !opts.canEdit) return null
  const byKey = new Map(catalog.map((e) => [e.key, e]))
  const isExternal = (href: string) => /^https:\/\//i.test(href)
  const hrefOf = (t: MenuTarget): { href: string; external: boolean } | null => {
    if (t.kind === 'url') return { href: t.href, external: isExternal(t.href) }
    const hit = byKey.get(t.key)
    if (hit) return { href: hit.href, external: !!hit.external }
    const fallback = opts.fallbackHref?.(t.key) ?? null
    return fallback ? { href: fallback, external: isExternal(fallback) } : null
  }
  const shows = (v: MenuVisibility) => v === 'both' || v === platform

  const referenced = new Set<string>()
  const out: ResolvedMenuLink[] = []
  for (const item of menu.items) {
    const keys = [item.target, item.feature?.target, ...(item.children ?? []).map((c) => c.target)]
    for (const t of keys) if (t?.kind === 'auto') referenced.add(t.key)
    if (!shows(item.visibility)) continue
    if (item.children?.length) {
      const links = item.children
        .map((c) => {
          const to = hrefOf(c.target)
          return to ? { label: c.label, desc: c.desc ?? null, href: to.href } : null
        })
        .filter((l): l is { label: string; desc: string | null; href: string } => !!l)
      if (links.length === 0) continue
      const card = item.feature ? hrefOf(item.feature.target) : null
      out.push({
        href: links[0].href,
        label: item.label,
        mega: {
          links,
          feature:
            item.feature && card
              ? { title: item.feature.title, desc: item.feature.desc ?? null, href: card.href, img: item.feature.img ?? null, pos: item.feature.pos ?? null }
              : null,
        },
      })
      continue
    }
    const to = item.target ? hrefOf(item.target) : null
    if (to) out.push({ href: to.href, label: item.label, ...(to.external ? { external: true } : {}) })
  }
  // A page or feature that appeared after the last save joins the end, on both platforms.
  const known = new Set(menu.known)
  for (const e of catalog) {
    if (!joinsAutomatically(e.key) || known.has(e.key) || referenced.has(e.key)) continue
    out.push({ href: e.href, label: e.label, ...(e.external ? { external: true } : {}) })
  }
  return out
}

// ── THE HEADER LOGO (shared by both platforms) ────────────────────────────────────────────────────

/** `image_name`: the Space's round image beside its name (the default). `name`: the name alone, image
 *  off. `logo`: an uploaded logo image on its own (a wordmark, never cropped). */
export type HeaderLogoMode = 'image_name' | 'name' | 'logo'

export interface HeaderLogo {
  mode: HeaderLogoMode
  /** The uploaded logo for `logo` mode. */
  logoUrl: string | null
}

export function readHeaderLogo(preferences: unknown): HeaderLogo {
  const node = record(preferences) && record(preferences.headerLogo) ? preferences.headerLogo : null
  const mode: HeaderLogoMode = node?.mode === 'name' || node?.mode === 'logo' ? node.mode : 'image_name'
  return { mode, logoUrl: parseImage(node?.logoUrl) ?? null }
}

export function parseHeaderLogo(v: unknown): HeaderLogo | null {
  if (!record(v) || (v.mode !== 'image_name' && v.mode !== 'name' && v.mode !== 'logo')) return null
  const logoUrl = v.logoUrl == null || v.logoUrl === '' ? null : parseImage(v.logoUrl) ?? undefined
  if (logoUrl === undefined) return null
  if (v.mode === 'logo' && !logoUrl) return null
  return { mode: v.mode, logoUrl }
}

export function withHeaderLogo(preferences: unknown, logo: HeaderLogo): Record<string, unknown> {
  return { ...(record(preferences) ? preferences : {}), headerLogo: logo }
}

/** What a header draws for the logo slot: which image (if any) and whether the name shows beside it.
 *  `logo` mode without an uploaded logo falls back to the default. */
export function headerLogoSlot(logo: HeaderLogo, image: string | null): { image: string | null; shape: 'round' | 'logo' | null; showName: boolean } {
  if (logo.mode === 'name') return { image: null, shape: null, showName: true }
  if (logo.mode === 'logo' && logo.logoUrl) return { image: logo.logoUrl, shape: 'logo', showName: false }
  return image ? { image, shape: 'round', showName: true } : { image: null, shape: null, showName: true }
}
