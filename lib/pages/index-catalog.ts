import { EDITABLE_PAGES } from '@/lib/page-editor/data'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { funnelSlugs } from '@/lib/marketing/funnel-config'
import { SITE_DESIGN } from '@/lib/theme/design'

// THE PAGE INDEX (the Pages workspace, /pages): every public page the platform serves, in three
// lists, most important first. The workspace renders these; nothing else reads them.
//
//   Site pages      the pages the site's own header and footer link to (lib/frequency/site-nav.ts)
//   Lead and SEO    pages a visitor reaches from search, a share or a campaign, not from the nav
//   System pages    sign-in, legal, email and account pages: fixed copy, nothing to edit
//
// WHAT EACH ROW SAYS ABOUT EDITING. `editor` is the truth of how the page's body is produced, and the
// workspace draws its Edit button from it, so an operator is never sent into an editor whose output is
// not what the visitor sees:
//
//   blocks   the block editor (/edit/<slug>, lib/page-editor): the published document IS the page
//   coded    a coded design page (components/frequency/site/pages): its copy lives in the tree
//   live     a listing drawn from live data (the Discover directories, the events calendar)
//   help     the help center, written in content/help
//   funnel   the sign-up Funnels (lib/funnels), managed at /pages/sequences
//   fixed    fixed copy with nothing an operator edits (legal, sign-in, email pages)
//
// THE DESIGN SWITCH DECIDES SOME ROWS (ADR-1737). Under the Frequency design the bodies of /, /the-
// community, /spaces, /pricing and /circles are coded pages, and the block document each slug still
// carries in `pages` is NOT what the visitor sees, so those rows read `coded` there and `blocks` under
// DAWN. CODED_UNDER_FREQUENCY mirrors the `SITE_DESIGN === 'frequency'` branch in each route file;
// lib/pages/index-catalog.test.ts reads those files to keep the set honest both ways.
//
// A ROW DERIVES FROM THE REGISTRY THAT OWNS IT. Block pages come from EDITABLE_PAGES, so enrolling
// or retiring a slug there is what adds or removes its row (the test fails on a slug this file does
// not place). Page families (the comparisons, the niche doors) carry a live count from their own
// registries instead of one row per page.

export type PageEditor = 'blocks' | 'coded' | 'live' | 'help' | 'funnel' | 'fixed'

export interface IndexedPage {
  label: string
  /** The public path. A family's path is its index page. */
  path: string
  editor: PageEditor
  /** The block-editor slug (editor === 'blocks' only). */
  slug?: string
  /** One short line under the label. */
  note?: string
  /** A family's page count, drawn from its registry. */
  count?: number
}

export interface PageIndexSection {
  id: 'site' | 'lead' | 'system'
  title: string
  description: string
  pages: readonly IndexedPage[]
}

/** The slugs whose route file renders a coded design page under Frequency (its `SITE_DESIGN` branch). */
export const CODED_UNDER_FREQUENCY: ReadonlySet<string> = new Set(['home', 'the-community', 'spaces', 'pricing', 'circles'])

const FREQUENCY = SITE_DESIGN === 'frequency'

/** The site-nav routes that exist only on a Frequency build (404 under DAWN, ADR-1737): their rows
 *  appear only there, and the test skips them on a DAWN tree. */
export const FREQUENCY_ONLY_PATHS: ReadonlySet<string> = new Set(['/features', '/vision', '/networks'])

/** A block-backed row for an enrolled slug, or null when the slug is not (or no longer) in
 *  EDITABLE_PAGES, so a retired page drops out of the index with its enrolment. */
function blocks(slug: string, label?: string, note?: string): IndexedPage | null {
  const page = EDITABLE_PAGES.find((p) => p.slug === slug)
  if (!page) return null
  const coded = FREQUENCY && CODED_UNDER_FREQUENCY.has(slug)
  return {
    label: label ?? page.title,
    path: page.path,
    editor: coded ? 'coded' : 'blocks',
    slug: coded ? undefined : slug,
    note,
  }
}

function present(rows: (IndexedPage | null)[]): IndexedPage[] {
  return rows.filter((r): r is IndexedPage => r !== null)
}

// ── Site pages: the header and footer's own links, in the order a visitor meets them ─────────────
const SITE: IndexedPage[] = present([
  blocks('home', 'Home'),
  blocks('the-community', 'For people'),
  blocks('spaces', 'For spaces'),
  // Frequency-only routes (404 under DAWN): their rows show only on a Frequency build.
  FREQUENCY ? { label: 'Features', path: '/features', editor: 'coded' } : null,
  blocks('pricing', 'Pricing', 'Prices come from the Pricing console.'),
  blocks('about', 'About'),
  FREQUENCY ? { label: 'Vision', path: '/vision', editor: 'coded' } : null,
  blocks('circles', 'Circles'),
  { label: 'Discover', path: '/discover', editor: 'live' },
  { label: 'What’s happening near you', path: '/discover/events', editor: 'live' },
  { label: 'Business Spaces', path: '/discover/spaces', editor: 'live' },
  { label: 'Events calendar', path: '/events', editor: 'live' },
  { label: 'Get started', path: '/join', editor: 'funnel', note: 'The Default Funnel.' },
  { label: 'Help', path: '/help', editor: 'help' },
])

// ── Lead and SEO pages: found by search, a share or a campaign; nothing in the nav links them ─────
const LEAD: IndexedPage[] = present([
  blocks('loneliness'),
  blocks('friendship-as-an-adult'),
  blocks('how-to-be-more-social'),
  blocks('calm-down-fast'),
  blocks('how-to-start-a-circle'),
  blocks('how-to-build-community'),
  blocks('tools-for-community-builders'),
  blocks('what-is-frequency'),
  FREQUENCY ? { label: 'Networks', path: '/networks', editor: 'coded', note: 'The Network plan.' } : null,
  { label: 'Mindless', path: '/mindless', editor: 'coded', note: 'The breathing timer.' },
  {
    label: 'Frequency vs the rest',
    path: '/vs',
    editor: 'coded',
    note: 'One comparison page per competitor.',
    count: COMPARISONS.length,
  },
  {
    label: 'Niche doors',
    path: '/for/coaches-and-healers',
    editor: 'coded',
    note: 'One door per niche, from the funnel registry.',
    count: funnelSlugs().length,
  },
  { label: 'Notes sign-up', path: '/subscribe', editor: 'fixed', note: 'Not indexed.' },
])

// ── System pages: fixed copy; an operator views, never edits ─────────────────────────────────────
const SYSTEM: IndexedPage[] = [
  { label: 'Sign in', path: '/sign-in', editor: 'fixed' },
  { label: 'Privacy', path: '/privacy', editor: 'fixed' },
  { label: 'Terms', path: '/terms', editor: 'fixed' },
  { label: 'Community guidelines', path: '/guidelines', editor: 'fixed' },
  { label: 'Space email policy', path: '/space-email-policy', editor: 'fixed' },
  { label: 'Site map', path: '/site-map', editor: 'fixed', note: 'Members only. Built from the menus.' },
  { label: 'Manage emails', path: '/manage-emails', editor: 'fixed' },
  { label: 'Unsubscribe', path: '/unsubscribe', editor: 'fixed' },
  { label: 'Code unavailable', path: '/code-unavailable', editor: 'fixed', note: 'Where a dead QR code lands.' },
]

export const PAGE_INDEX: readonly PageIndexSection[] = [
  {
    id: 'site',
    title: 'Site pages',
    description: 'The pages the site’s own menu and footer link to.',
    pages: SITE,
  },
  {
    id: 'lead',
    title: 'Lead and SEO pages',
    description: 'Pages a visitor reaches from search, a share or a campaign. Nothing in the site menu links them.',
    pages: LEAD,
  },
  {
    id: 'system',
    title: 'System pages',
    description: 'Sign-in, legal and email pages. Fixed copy, nothing to edit.',
    pages: SYSTEM,
  },
]

export function pageIndexSection(id: PageIndexSection['id']): PageIndexSection {
  const section = PAGE_INDEX.find((s) => s.id === id)
  if (!section) throw new Error(`no page index section "${id}"`)
  return section
}

/** What the Content column says for an editor kind. */
export const EDITOR_LABEL: Record<PageEditor, string> = {
  blocks: 'Block editor',
  coded: 'Coded page',
  live: 'Live listings',
  help: 'Help articles',
  funnel: 'Funnel',
  fixed: 'Fixed copy',
}
