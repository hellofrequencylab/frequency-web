import type { Space } from '@/lib/spaces/types'
import { HOME_SLUG, MAX_PROFILE_PAGES, isValidPageSlug, readProfilePages } from '@/lib/spaces/profile-pages'
import { publishedWebsiteSnapshot } from '@/lib/sites/editor/state'

// A NETWORK'S SITE FLOWS DOWN TO ITS CHAPTER SITES (LIVE-1288). A chapter is a child Space of a Network, and
// the Network's look, footer and pages are the chapter's defaults: edit them once on the Network and every
// chapter site shows them on its next render, with nothing to copy by hand. PURE: the caller reads the
// Network (and decides it is the chapter's own, active, same-owner Network) and this lays it under the chapter.
//
// THE CHAPTER ALWAYS WINS. Each piece is a fallback, used only where the chapter set nothing of its own:
//   - the logo and accent (spaces.brand_logo_url, brand_accent);
//   - the footer (preferences.siteFooter) and the site look (preferences.siteStyle);
//   - the Network's pages whose address the chapter does not already use, in the legacy page list and in a
//     published website. The chapter's own Home, Contact, Book and Calendar are never replaced.
// A chapter that wants none of it writes its own version of the piece, and its version is the one served.
// Nothing is written: the merged Space only lives for the render that asked for it.

type Prefs = Record<string, unknown>
const isRecord = (v: unknown): v is Prefs => !!v && typeof v === 'object' && !Array.isArray(v)

const readPageDocs = (prefs: unknown): Prefs | null => (isRecord(prefs) && isRecord(prefs.pageDocs) ? prefs.pageDocs : null)

/** Pages that are the chapter's own door and never come down from the Network. */
const OWN_PAGES: ReadonlySet<string> = new Set([HOME_SLUG, 'contact', 'book', 'confirm-booking', 'calendar'])

function inheritedPages(chapter: Prefs | null, network: Prefs | null): { pages: unknown[]; docs: Prefs } | null {
  const have = readProfilePages(chapter)
  const taken = new Set(have.map((p) => p.slug))
  const fromNetwork = readProfilePages(network).filter((p) => !p.system && !OWN_PAGES.has(p.slug) && isValidPageSlug(p.slug) && !taken.has(p.slug))
  const networkDocs = readPageDocs(network) ?? {}
  const room = MAX_PROFILE_PAGES - have.length
  const add = fromNetwork.filter((p) => isRecord(networkDocs) && networkDocs[p.slug]).slice(0, Math.max(0, room))
  if (!add.length) return null
  return {
    pages: [...have, ...add].map((p) => ({ slug: p.slug, label: p.label })),
    docs: Object.fromEntries(add.map((p) => [p.slug, (networkDocs as Prefs)[p.slug]])),
  }
}

function inheritedSnapshot(chapter: Prefs | null, network: Prefs | null): Prefs | null {
  const own = publishedWebsiteSnapshot(chapter)
  const up = publishedWebsiteSnapshot(network)
  // Only a chapter that already wears the Network's skin takes its pages; a house-look chapter keeps its own.
  if (!own || !up || own.theme !== up.theme) return null
  const taken = new Set(own.pages.map((p) => p.slug))
  const add = up.pages.filter((p) => !OWN_PAGES.has(p.slug) && !taken.has(p.slug))
  if (!add.length) return null
  const editor = isRecord(chapter?.websiteEditor) ? chapter.websiteEditor : {}
  return { ...editor, published: { ...own, pages: [...own.pages, ...add] } }
}

/** The chapter with its Network's logo, accent, footer, look and pages laid under what it set itself. */
export function inheritFromNetwork(chapter: Space, network: Space): Space {
  const mine = isRecord(chapter.preferences) ? chapter.preferences : null
  const up = isRecord(network.preferences) ? network.preferences : null
  const prefs: Prefs = { ...(mine ?? {}) }
  if (up?.siteFooter && !mine?.siteFooter) prefs.siteFooter = up.siteFooter
  if (up?.siteStyle && !mine?.siteStyle) prefs.siteStyle = up.siteStyle
  if (up?.theme && !mine?.theme) prefs.theme = up.theme
  const pages = inheritedPages(mine, up)
  if (pages) {
    prefs.pages = pages.pages
    prefs.pageDocs = { ...(readPageDocs(mine) ?? {}), ...pages.docs }
  }
  const editor = inheritedSnapshot(mine, up)
  if (editor) prefs.websiteEditor = editor
  return {
    ...chapter,
    brandLogoUrl: chapter.brandLogoUrl || network.brandLogoUrl,
    brandAccent: chapter.brandAccent || network.brandAccent,
    preferences: prefs,
  }
}
