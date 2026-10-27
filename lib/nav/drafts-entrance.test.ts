import { describe, it, expect } from 'vitest'
import { NAV_REGISTRY, canSee, paletteDestinations, profileSections, type NavViewer } from '@/lib/nav/registry'
import { FQ_ACCOUNT_MENU, groupRows } from '@/components/frequency/members/shell/nav'
import { draftsBadgeLabel as badgeLabel } from '@/components/frequency/members/shell/drafts-count'
import type { MyFrequency } from '@/lib/nav/my-frequency'
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
//
// ── THE ENTRANCE MOVED TO MY FREQUENCY (owner ruling 2026-08-12) ──────────────────────
//
// It first landed in the ACCOUNT MENU, which the seed's own comment called "the honest interim":
// the intended home was always My Frequency, beside Journal and My Contacts, because DAWN files a
// member's own content under "You, and what you run". The ruling that wired the drafts badge
// finished that move, so this file now guards the new home AND the thing that made the move safe:
// the row appears in exactly ONE dock, and ⌘K keeps it either way.

const DRAFTS_HREF = '/drafts'
const member: NavViewer = { role: 'member', staffRole: null }
const visitor: NavViewer = { role: null, staffRole: null }

/** A resolved menu with `n` drafts waiting and nothing else in it. */
const menuWith = (n: number): MyFrequency => ({
  profileHref: '/people/ada',
  drafts: n,
  spaces: [],
  circles: [],
  total: n,
})

const personalRows = (data: MyFrequency) => groupRows(FQ_ACCOUNT_MENU, { navAccess: {}, signedIn: true, host: false, operatesSpaces: false }, data.profileHref, { drafts: data.drafts }).flatMap(g => g.rows)
const draftsRow = (n = 0) => personalRows(menuWith(n)).find(r => r.href === DRAFTS_HREF)

describe('/drafts has an entrance', () => {
  it('is declared in the registry exactly once', () => {
    const nodes = NAV_REGISTRY.filter((n) => n.href === DRAFTS_HREF)
    expect(nodes.map((n) => n.id)).toEqual(['profile:drafts'])
  })

  it('renders as a row in the My Frequency menu, so a member reaches it from any page', () => {
    const row = draftsRow()
    expect(row, '/drafts is not in the My Frequency menu').toBeDefined()
    // The nav row and the page must agree on the name; the page's H1 + metadata.title are
    // "Drafts", and docs/NAMING.md pins that word to this one surface. Never "My drafts".
    expect(row!.label).toBe('Drafts')
  })

  it('keeps the active Frequency account-menu entrance', () => {
    expect(personalRows(menuWith(4)).filter(r => r.href === DRAFTS_HREF)).toHaveLength(1)
  })

  it('is reachable from ⌘K, and by the word a member would actually type', () => {
    // The move must not cost the palette. ⌘K is the surface a member uses when they know the
    // word and not the path, which is why the seed is menuHidden rather than deleted.
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

// ── THE BADGE (owner ruling 2026-08-12, CP-4) ─────────────────────────────────────────
//
// countMyCreateProposals shipped written, documented, indexed, carrying a deliberate ADR-246
// jsonb-filter exception — and called by nothing. The ruling wired it here. These assertions are
// the difference between a badge and a number nobody renders.

describe('the Drafts row wears the count', () => {
  it('carries the open-proposal count through to the row', () => {
    expect(draftsRow(3)!.count).toBe(3)
  })

  it('ZERO RENDERS NO BADGE, never a "0"', () => {
    // A rail row reading "Drafts 0" tells a member about the absence of something on every page
    // forever. The chip's whole message is "there is something".
    expect(draftsRow(0)!.count).toBe(0)
    expect(badgeLabel(0)).toBeNull()
  })

  it('prints a real count, and caps the shout at 99+', () => {
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
  })

  it('a fail-safe read that returns junk still renders nothing', () => {
    // countMyCreateProposals resolves to 0 on any error, but the menu must not print "NaN" if a
    // future caller hands it something worse.
    expect(badgeLabel(Number.NaN)).toBeNull()
    expect(badgeLabel(-1)).toBeNull()
  })

  it('leaves every other personal row unbadged', () => {
    // Profile / Journal / My Contacts are places, not queues. Only Drafts can be waiting.
    const others = personalRows(menuWith(5)).filter((r) => r.href !== DRAFTS_HREF)
    expect(others.map((r) => r.count)).toEqual(personalRows(menuWith(5)).filter(r => r.href !== DRAFTS_HREF).map(() => undefined))
  })
})

describe('the palette opt-in stays an opt-in', () => {
  it('does not drag the account menu settings forms into ⌘K', () => {
    // The account menu is mostly settings; only member DESTINATIONS carry `palette`. Drafts was
    // the one destination in it and has moved to My Frequency, so the correct answer is now
    // NONE. If this grows, it is because someone opted a form in — check that it is really a place.
    const profileHrefs = new Set(profileSections().flatMap((s) => s.nodes.map((n) => n.href)))
    const inPalette = paletteDestinations(member).filter((d) => profileHrefs.has(d.href))
    expect(inPalette.map((d) => d.href)).toEqual([])
  })
})
