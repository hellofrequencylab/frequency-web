import 'server-only'

import { revalidatePath } from 'next/cache'
import { patchSpacePreferences } from '@/lib/spaces/store'
import { buildSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readWebsitePublished } from '@/lib/spaces/website'
import { publishedWebsiteSnapshot } from '@/lib/sites/editor/state'
import { HOUSE_NAV, planHouseSections, siteHasContactPage } from '@/lib/sites/house-theme'
import { resolveRows } from '@/lib/entity-blocks/layout'
import { readTypeKeyedGrid } from '@/lib/entity-blocks/node-projection'
import { refreshSite } from '@/lib/sites/site-cache'
import { readSiteBooking } from '@/lib/sites/site-booking'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import type { Space } from '@/lib/spaces/types'
import { slugify } from '@/lib/utils'
import {
  knownKeys,
  parseHeaderLogo,
  parseSiteMenu,
  readHeaderLogo,
  readSiteMenu,
  type HeaderLogo,
  type MenuCatalogEntry,
  type MenuItem,
  type SiteMenu,
} from '@/lib/spaces/site-menu'


// THE MENU EDITOR'S SHARED CORE (lib/spaces/site-menu.ts). The reads and writes behind the Space console's
// menu actions (app/(main)/spaces/[slug]/manage/layout/menu-actions.ts) and the website editor's
// host-authorized twins (lib/sites/editor/menu-actions.ts, SCAN-832). Each caller proves who is asking in
// its own way (the Frequency session, or the site-admin pass on the site's own host) and hands this module
// the Space it resolved; nothing here authorizes.

/** The Space an authorized caller may edit, with its preferences and whether the plan includes menu editing. */
export interface MenuAuth {
  space: Space
  preferences: Record<string, unknown>
  canEdit: boolean
}

/** One choice in the editor's "Link to" picker: an automatic entry and where it exists today. */
export interface MenuEditorOption {
  key: string
  label: string
  /** Which platform can draw it itself. The other one links to it (or leaves it out). */
  on: 'both' | 'space' | 'website'
  group: 'Pages' | 'Features' | 'Home sections'
}

export interface MenuEditorData {
  /** The plan includes menu editing. False: the editor shows the automatic menu, locked. */
  canEdit: boolean
  /** A menu is saved. False: `menu` is today's automatic menu, ready to become the first save. */
  saved: boolean
  menu: SiteMenu
  options: MenuEditorOption[]
  logo: HeaderLogo
  /** The Space's round image (its brand logo), for the Image + Name preview. */
  image: string | null
  brandName: string
  hasWebsite: boolean
}

function revalidateMenu(slug: string): void {
  revalidatePath(`/spaces/${slug}`, 'layout')
  refreshSite(slug)
  revalidatePath(`/spaces/${slug}/manage/layout`)
}

/** What the website draws on its own: Home's section anchors, its pages, Contact and Book. */
async function websiteCatalog(space: Space): Promise<MenuCatalogEntry[]> {
  const prefs = space.preferences
  const pages = publishedWebsiteSnapshot(prefs)?.pages ?? readProfilePages(prefs)
  const node = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>).profileLayout : null
  const rows = resolveRows(readTypeKeyedGrid(node) ?? {}, 'space')
  const anchors = new Map<string, string>()
  for (const s of planHouseSections(rows)) {
    const nav = HOUSE_NAV[s.kind]
    if (nav && !anchors.has(nav.anchor)) anchors.set(nav.anchor, nav.label)
  }
  const booking = await readSiteBooking(space.id)
  return [
    { key: 'home', label: pages[0]?.label ?? 'Home', href: '' },
    ...[...anchors].map(([anchor, label]) => ({ key: `anchor:${anchor}`, label, href: '' })),
    ...pages.filter((p) => p.slug !== HOME_SLUG).map((p) => ({ key: `page:${p.slug}`, label: p.label, href: '' })),
    ...(siteHasContactPage(prefs) ? [{ key: 'feature:contact', label: 'Contact', href: '' }] : []),
    ...(booking.takesBookings ? [{ key: 'feature:book', label: 'Book', href: '' }] : []),
  ]
}

function hasWebsite(space: Space): boolean {
  return readWebsitePublished(space.preferences) || !!publishedWebsiteSnapshot(space.preferences)
}

async function catalogs(space: Space): Promise<{ space: MenuCatalogEntry[]; website: MenuCatalogEntry[] }> {
  const [nav, website] = await Promise.all([buildSpaceProfileNav(space), hasWebsite(space) ? websiteCatalog(space) : Promise.resolve([])])
  return { space: nav.catalog, website }
}

function optionsFrom(c: { space: MenuCatalogEntry[]; website: MenuCatalogEntry[] }): MenuEditorOption[] {
  const out = new Map<string, MenuEditorOption>()
  const group = (key: string): MenuEditorOption['group'] =>
    key.startsWith('anchor:') ? 'Home sections' : key.startsWith('feature:') ? 'Features' : 'Pages'
  for (const e of c.space) out.set(e.key, { key: e.key, label: e.label, on: 'space', group: group(e.key) })
  for (const e of c.website) {
    const hit = out.get(e.key)
    if (hit) hit.on = 'both'
    else out.set(e.key, { key: e.key, label: e.label, on: 'website', group: group(e.key) })
  }
  return [...out.values()]
}

/** Today's automatic menus as one editable list: what both show is `both`, the rest keeps its side. */
function seedFrom(c: { space: MenuCatalogEntry[]; website: MenuCatalogEntry[] }): SiteMenu {
  const onWebsite = new Set(c.website.map((e) => e.key))
  const onSpace = new Set(c.space.map((e) => e.key))
  const items: MenuItem[] = []
  const add = (e: MenuCatalogEntry, visibility: MenuItem['visibility']) =>
    items.push({ id: slugify(e.key), label: e.label, visibility, target: { kind: 'auto', key: e.key } })
  for (const e of c.space) add(e, c.website.length === 0 || onWebsite.has(e.key) ? 'both' : 'space')
  for (const e of c.website) if (!onSpace.has(e.key)) add(e, 'website')
  return { v: 1, items, known: knownKeys([...c.space, ...c.website]) }
}

export async function menuEditorData(auth: MenuAuth): Promise<MenuEditorData> {
  const c = await catalogs(auth.space)
  const saved = readSiteMenu(auth.preferences)
  return {
    canEdit: auth.canEdit,
    saved: !!saved && auth.canEdit,
    menu: saved && auth.canEdit ? saved : seedFrom(c),
    options: optionsFrom(c),
    logo: readHeaderLogo(auth.preferences),
    image: auth.space.brandLogoUrl,
    brandName: auth.space.brandName?.trim() || auth.space.name,
    hasWebsite: hasWebsite(auth.space),
  }
}

/** Save the menu for both platforms. `known` is recomputed here from what the platforms offer right now,
 *  so a feature that turns on later joins the end of the menu. */
export async function saveMenu(auth: MenuAuth, slug: string, input: unknown): Promise<ActionResult> {
  if (!auth.canEdit) return fail('Editing your menu comes with the Business plan.')
  const parsed = parseSiteMenu(input)
  if (!parsed) return fail('That menu could not be saved. Check each link and try again.')
  const c = await catalogs(auth.space)
  const menu: SiteMenu = { v: 1, items: parsed.items, known: knownKeys([...c.space, ...c.website]) }
  if (!(await patchSpacePreferences(auth.space.id, { siteMenu: menu }))) return fail('Could not save your menu. Try again.')
  revalidateMenu(slug)
  return ok()
}

/** Drop the saved menu: both platforms go back to building their menu automatically. */
export async function resetMenu(auth: MenuAuth, slug: string): Promise<ActionResult> {
  if (!(await patchSpacePreferences(auth.space.id, { siteMenu: null }))) return fail('Could not reset your menu. Try again.')
  revalidateMenu(slug)
  return ok()
}

export async function saveLogo(auth: MenuAuth, slug: string, input: unknown): Promise<ActionResult> {
  const logo = parseHeaderLogo(input)
  if (!logo) return fail(input && typeof input === 'object' && (input as { mode?: unknown }).mode === 'logo' ? 'Upload a logo first.' : 'Pick how your logo shows.')
  if (!(await patchSpacePreferences(auth.space.id, { headerLogo: logo }))) return fail('Could not save your logo. Try again.')
  revalidateMenu(slug)
  return ok()
}
