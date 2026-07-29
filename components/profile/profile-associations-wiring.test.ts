import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SERIES_COLUMNS } from '@/lib/events/series'

// The associations panel's PRIVACY DRIFT GUARD (ADR-895), the house source-shape archetype
// (components/events/series-wiring.test.ts, lib/events/options.test.ts).
//
// Why source text and not behaviour: lib/people/associations.ts reads through createAdminClient(),
// where RLS never fires, so every privacy rule in the product is a `.eq()` / `.is()` in that file.
// A behavioural test over a fake PostgREST honours whatever filters it is handed, so it CANNOT
// prove a filter was not deleted. Deleting one is silent, ships green, and leaks. This file is the
// only thing standing between a tidy-up refactor and a Private Space's content being named and
// deep-linked to every stranger.
//
// The behavioural matrix (stranger / member / friend / owner / janitor) lives in
// lib/people/associations.test.ts.

const mod = readFileSync('lib/people/associations.ts', 'utf8')
const panel = readFileSync('components/profile/profile-associations.tsx', 'utf8')
const page = readFileSync('app/(main)/people/[handle]/page.tsx', 'utf8')

// Comments quote predicates on purpose (that is how the reasoning stays with the code), so every
// count-based assertion runs against a comment-stripped copy. Without this, deleting a real
// predicate while leaving the comment that explains it would pass.
const code = mod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe('the associations module is non-trivial (guards a vacuous pass)', () => {
  it('is a real module, not a stub', () => {
    expect(mod.length).toBeGreaterThan(4000)
    expect(panel.length).toBeGreaterThan(2000)
    expect(code).toContain('export async function getProfileAssociations')
  })
})

describe('G1 — the Space wall, which RLS cannot enforce here', () => {
  it("carries .is('space_id', null) on EXACTLY the four walled tables", () => {
    // 20260711090000_space_content_isolation.sql:53-71 puts an identical RESTRICTIVE policy on
    // circles, events, practices, journey_plans and programs. `programs` is out of v1; the other
    // four are all read here, and the admin client bypasses every one of those policies.
    // FEWER than four = a Private Space's content is named to strangers.
    // MORE than four = someone added a seventh kind without re-reading the restrictive set.
    expect(occurrences(code, ".is('space_id', null)")).toBe(4)
  })

  it('market_listings is correctly NOT one of them (no space_id column exists)', () => {
    const listings = code.slice(code.indexOf("from('market_listings')"))
    expect(listings).not.toContain("is('space_id'")
  })
})

describe('G2 — the leak this panel exists to replace', () => {
  it('hides Circles the host kept out of browse', () => {
    expect(code).toContain(".eq('unlisted', false)")
  })

  it("admits only circle statuses whose ROW an ordinary member may read", () => {
    // `archived` needs host+, `draft` needs owner/guide+.
    expect(code).toContain("['forming', 'active', 'inactive']")
    expect(code).not.toContain("'archived'")
    expect(code).not.toContain("'draft'")
  })

  it('the profile band no longer prints the raw circle count or deep-links the single one', () => {
    // The live leak: an unfiltered memberships read printed "{n} circles" and linked /circles/{slug},
    // so a visitor learned this member belonged to exactly one UNLISTED Circle and got its slug.
    expect(page).not.toContain("circles.length === 1 ? `/circles/${circles[0]!.slug}`")
    // Deleting the line alone was NOT enough: the same array still drives the public `Circle Up`
    // achievement chip, so the surviving read must carry the listing gate.
    expect(page).toContain('LISTABLE_CIRCLE_STATUS')
    expect(page).toContain('c.unlisted === false')
    expect(page).toContain('c.space_id === null')
  })
})

describe('G3 — the Events tile counts gatherings, not dates', () => {
  it('selects the recurrence columns, or the fold is a silent no-op', () => {
    // Interpolated rather than retyped, so the three columns can never drift from the fold that
    // reads them. Assert the interpolation AND that the constant still names three columns.
    expect(code).toContain('${SERIES_COLUMNS}')
    expect(code).toContain("SERIES_COLUMNS,")
    expect(SERIES_COLUMNS.split(', ')).toHaveLength(3)
  })

  it('over-fetches and folds through the one owner of the fold', () => {
    // A post-query fold spends the LIMIT on rows it then discards, so the read must be raised.
    expect(code).toContain('seriesFetchLimit(')
    expect(code).toContain('collapseSeriesRows(')
    expect(code).toContain('perSeries: 1')
    // Never a hand-rolled local fold: lib/events/series.ts is the single owner (ADR-897).
    expect(code).not.toContain('parent_event_id ??')
  })

  it('takes the wall-clock floor in the community zone, not a naive instant', () => {
    expect(code).toContain('seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))')
    expect(code).not.toContain("gte('starts_at', new Date().toISOString())")
  })
})

describe('G4 — the events gate is stricter than the RPC the plan cited', () => {
  it('filters status, visibility, cancellation and moderator removal', () => {
    const events = code.slice(code.indexOf("from('events')"), code.indexOf("from('journey_plans')"))
    expect(events).toContain("eq('status', 'published')")
    expect(events).toContain("in('visibility', ['public', 'unlisted'])")
    expect(events).toContain("eq('is_cancelled', false)")
    expect(events).toContain("is('removed_at', null)")
  })
})

describe('G5 — Spaces: the directory rule, not "not private"', () => {
  it('names only network-connected, active, network-visible Spaces', () => {
    const spaces = code.slice(code.indexOf("from('spaces')"), code.indexOf("from('events')"))
    expect(spaces).toContain("eq('visibility', 'network')")
    expect(spaces).toContain("eq('network_connected', true)")
    expect(spaces).toContain("eq('status', 'active')")
    expect(spaces).toContain("neq('type', 'root')")
  })

  it("never uses .neq('visibility','private'), which would name an UNLISTED Space", () => {
    // spaces.visibility gained a third value 'unlisted' (20261142000000) documented as excluded
    // from the directory. A `not private` test admits it.
    expect(code).not.toContain("neq('visibility', 'private')")
  })

  it('links the Spaces tile at /spaces/directory, because /spaces has no page', () => {
    expect(panel).toContain("href: '/spaces/directory'")
    expect(panel).not.toContain("href: '/spaces'")
  })
})

describe('G6 — moderation-rejected content stays off a member profile', () => {
  it("requires status 'approved' on both Journeys and Practices", () => {
    expect(occurrences(code, "eq('status', 'approved')")).toBe(2)
  })

  it('practices carries its full gate, because that table has NO RLS backstop at all', () => {
    // "practices: public read" is `using (true)` (20240228000000_practices.sql:75). These
    // predicates are 100% of the gate.
    const practices = code.slice(code.indexOf("from('practices')"), code.indexOf("from('market_listings')"))
    expect(practices).toContain("eq('is_public', true)")
    expect(practices).toContain("eq('created_by', profileId)")
    expect(practices).toContain("eq('status', 'approved')")
    expect(practices).toContain(".is('space_id', null)")
  })
})

describe('G7 — no cross-request cache on viewer-scoped data', () => {
  it('never reaches for unstable_cache', () => {
    // A cache keyed on the profile id alone would serve ONE VIEWER'S tier B to a different viewer.
    // That is cache poisoning, not a performance trade. React cache() (per-request) only.
    expect(code).not.toContain('unstable_cache')
    expect(code).not.toContain("'use cache'")
    expect(code).toContain("from 'react'")
  })

  it('request-caches only the viewer-INDEPENDENT tier', () => {
    // cache() wraps readBuilt and nothing else; readShared/readOwn take a viewer and must not be
    // memoised across viewers.
    expect(code).toContain('const readBuilt = cache(')
    expect(code).not.toContain('const readShared = cache(')
    expect(code).not.toContain('const readOwn = cache(')
  })
})

describe('G8 — tier A takes no viewer, tier C runs only for the owner', () => {
  it('readBuilt has no viewer parameter, so it cannot widen for a friend', () => {
    expect(code).toContain('cache(async (profileId: string)')
    const built = code.slice(code.indexOf('const readBuilt'), code.indexOf('async function readShared'))
    expect(built).not.toContain('viewerProfileId')
    expect(built).not.toContain('isOwner')
  })

  it('gates the owner-only read BEFORE it is issued, not before it is rendered', () => {
    const gate = code.indexOf('const wantsOwn = isOwner')
    const call = code.indexOf('wantsOwn ? readOwn(profileId)')
    expect(gate).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(gate)
  })
})

describe('the panel is composed from the kit, and a null count never renders as a zero', () => {
  it('uses SectionHeader and StatCard rather than a hand-rolled header or box', () => {
    expect(panel).toContain("from '@/components/ui/section-header'")
    expect(panel).toContain("from '@/components/ui/stat-card'")
    expect(panel).toContain('<SectionHeader')
    expect(panel).toContain('<StatCard')
    expect(panel).not.toContain('<h2')
    expect(panel).not.toContain('<h3')
  })

  it('omits a failed read instead of printing 0', () => {
    expect(panel).toContain('(s.count ?? 0) > 0')
  })

  it('is mounted at the TOP of the right column, behind its own Suspense', () => {
    // Owner ruling, 2026-07-28: this moved out of the 2/3 content column into the 1/3 rail, so
    // the guard moved with it. Pinning placement matters because the panel fans out six reads;
    // dropping its Suspense or burying it below the tiled panels are both silent regressions.
    const aside = page.indexOf('<aside className="order-1 min-w-0')
    // Match the Suspense that wraps THIS panel, not the first one on the page: the profile has
    // several null-fallback boundaries and indexOf on the bare tag found an earlier one.
    const suspense = page.indexOf('<Suspense fallback={null}>\n            <ProfileAssociations')
    const asideClose = page.indexOf('</aside>')
    expect(aside).toBeGreaterThan(-1)
    expect(asideClose).toBeGreaterThan(-1)
    // Structural, not word-matching: the panel opens INSIDE the aside and closes before it does.
    // (An earlier attempt compared against the string "Standing", which also appears higher up
    // the file in the season-standing block, so it proved nothing.)
    expect(suspense).toBeGreaterThan(aside)
    expect(suspense).toBeLessThan(asideClose)
  })

  it('carries NO card background, so the rail does not gain a fourth box', () => {
    // The other half of the same ruling: "No back ground, just a Preview card."
    expect(panel).toContain('<section className="space-y-1">')
    expect(panel).not.toMatch(/<section className="[^"]*bg-surface/)
  })
})

describe('the kinds excluded from v1 stay excluded', () => {
  it('never reads a table whose listing rule could not be proved', () => {
    // Each of these is host-private, own-rows-only, or service-role-only. Adding one needs a new
    // proof in the ADR, not a copy-pasted query.
    for (const t of ['event_rsvps', 'journey_runs', 'journey_completions', 'practice_logs',
                     'friendships', 'library_assets', 'recordings', 'podcast_shows', 'programs']) {
      expect(code).not.toContain(`from('${t}')`)
    }
  })

  it('reads the four own-rows tables ONLY inside the owner-gated tier', () => {
    const own = code.slice(code.indexOf('async function readOwn'))
    for (const t of ['topical_channel_memberships', 'space_members', 'journey_enrollments']) {
      expect(occurrences(code, `from('${t}')`)).toBe(1)
      expect(own).toContain(`from('${t}')`)
    }
  })
})
