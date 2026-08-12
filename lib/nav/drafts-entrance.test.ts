import { describe, it, expect } from 'vitest'
import { NAV_REGISTRY, canSee, paletteDestinations, profileSections, type NavViewer } from '@/lib/nav/registry'
import { railIconFor, FALLBACK_AREA_ICON } from '@/components/layout/nav-icons'

// ── /drafts MUST STAY REACHABLE ───────────────────────────────────────────────────────
//
// This is a REGRESSION guard, not a coverage exercise. app/(main)/drafts/page.tsx shipped to
// production with zero entry points anywhere in the repo — a finished member page that no
// surface linked to. That is not a cosmetic gap for this page: ADR-998 put Vera's create
// proposals there to be confirmed (unreached, they expire in silence, which is the defect the
// ADR exists to close) and ADR-1001 made it the member's erasure surface for the wizard answers
// we stage across devices (unreached, we hold data the member cannot delete). Both are
// reachability-dependent by construction, so "is it linked" is a correctness property.
//
// The nav commit that would have wired it was lost, and nothing failed. These assertions are
// what would have failed.

const DRAFTS_HREF = '/drafts'
const member: NavViewer = { role: 'member', staffRole: null }
const visitor: NavViewer = { role: null, staffRole: null }

describe('/drafts has an entrance', () => {
  it('is declared in the registry exactly once', () => {
    const nodes = NAV_REGISTRY.filter((n) => n.href === DRAFTS_HREF)
    expect(nodes.map((n) => n.id)).toEqual(['profile:drafts'])
  })

  it('renders as a row in the account menu, so a member reaches it from any page', () => {
    const rows = profileSections().flatMap((s) => s.nodes.map((n) => ({ section: s.label, node: n })))
    const drafts = rows.find((r) => r.node.href === DRAFTS_HREF)
    expect(drafts, '/drafts is not in the account menu').toBeDefined()
    // "You" is the member's-own-things group. If this moves, it moves to My Frequency (see the
    // seed's comment) — it must never end up in Membership/Commerce, which are billing surfaces.
    expect(drafts!.section).toBe('You')
    // The nav row and the page must agree on the name; the page's H1 + metadata.title are "Drafts".
    expect(drafts!.node.label).toBe('Drafts')
  })

  it('is reachable from ⌘K, and by the word a member would actually type', () => {
    const hrefs = (q: string) => paletteDestinations(member, q).map((d) => d.href)
    expect(hrefs('')).toContain(DRAFTS_HREF)
    expect(hrefs('draft')).toContain(DRAFTS_HREF)
  })

  it('is member-gated, matching the page (which redirects a signed-out visitor to /sign-in)', () => {
    const node = NAV_REGISTRY.find((n) => n.href === DRAFTS_HREF)!
    expect(canSee(node, member)).toBe(true)
    expect(canSee(node, visitor)).toBe(false)
    expect(paletteDestinations(visitor).map((d) => d.href)).not.toContain(DRAFTS_HREF)
  })

  it('draws its own glyph, never the anonymous fallback', () => {
    // Profile seeds store a lucide NAME (LUCIDE_BY_NAME), not a NAV_AREAS key — a name that is
    // not in that vocabulary resolves to a generic globe without throwing, which is how three
    // operator rows shipped wearing the same glyph (see components/layout/nav-icons.test.ts).
    const node = NAV_REGISTRY.find((n) => n.href === DRAFTS_HREF)!
    expect(railIconFor(node.icon)).not.toBe(FALLBACK_AREA_ICON)
  })
})

describe('the palette opt-in stays an opt-in', () => {
  it('does not drag the account menu settings forms into ⌘K', () => {
    // The account menu is mostly settings; only member DESTINATIONS carry `palette`. If this
    // count grows, it is because someone opted a form in — check that it is really a place.
    const profileHrefs = new Set(profileSections().flatMap((s) => s.nodes.map((n) => n.href)))
    const inPalette = paletteDestinations(member).filter((d) => profileHrefs.has(d.href))
    expect(inPalette.map((d) => d.href)).toEqual([DRAFTS_HREF])
  })
})
