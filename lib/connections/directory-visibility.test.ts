import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {

// The page source interpolates the shared constant; these pins look for that exact text. Built
// from two halves so this file never contains `${` inside a plain string (CodeQL
// js/template-syntax-in-string-literal reads that as a forgotten backtick).
const INTERP = '$' + '{DIRECTORY_VISIBILITY_COLUMNS}'
  DIRECTORY_VISIBILITY_COLUMNS,
  acceptedConnectionIds,
  isListableInDirectory,
  isSurfaceableNearby,
  type DirectoryTarget,
} from './directory-visibility'

// The directory-visibility predicate (ADR-186 controls, ADR-TBD) in two halves:
//
//   1. BEHAVIOUR — every branch of the pure rule, so a clause cannot be dropped without a red test.
//   2. SOURCE SHAPE — that /network and /search actually CALL it, and that the SQL the module
//      mirrors still carries every clause the module claims to mirror. The defect this closes was
//      precisely a rule that existed (in the members_near RPC) and was never consulted by the two
//      listing surfaces; a behavioural test of the rule alone would have passed throughout.
//
// Source-shape idiom: lib/events/rsvp-enforcement.test.ts.

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const MIGRATION = '20270344000100_members_near_honours_target_radius_and_connections.sql'

const VIEWER = { id: 'viewer', connectionIds: new Set(['friend']) }
const base = (over: Partial<DirectoryTarget> = {}): DirectoryTarget => ({
  id: 'target',
  directory_visible: true,
  ghost_mode: false,
  discoverable_by: 'community',
  location_band: 'city',
  home_geocell_lat: 33.04,
  ...over,
})

describe('isListableInDirectory — the name-listing gate (SQL :123-:124 only)', () => {
  it('lists a default row', () => {
    expect(isListableInDirectory(base())).toBe(true)
  })

  it('a row that predates the columns (all null/undefined) lists as it always has', () => {
    expect(isListableInDirectory({ id: 'old' })).toBe(true)
    expect(isListableInDirectory({ id: 'old', directory_visible: null, ghost_mode: null })).toBe(true)
  })

  it('"Show me in the Community directory" OFF hides (:123)', () => {
    expect(isListableInDirectory(base({ directory_visible: false }))).toBe(false)
  })

  it('Ghost mode ON hides, and wins over an explicit directory_visible=true (:124)', () => {
    expect(isListableInDirectory(base({ ghost_mode: true, directory_visible: true }))).toBe(false)
  })

  it('the LOCATION controls do not govern a name listing', () => {
    // "Who can find me nearby" and "Location precision others see" are about being surfaced BY
    // LOCATION. A name listing reveals no location, so 'nobody' and 'hidden' still list.
    expect(isListableInDirectory(base({ discoverable_by: 'nobody' }))).toBe(true)
    expect(isListableInDirectory(base({ location_band: 'hidden' }))).toBe(true)
    expect(isListableInDirectory(base({ home_geocell_lat: null }))).toBe(true)
  })
})

describe('isSurfaceableNearby — the full members_near candidate rule (SQL :123-:128)', () => {
  it('a community-discoverable member with a home is surfaced', () => {
    expect(isSurfaceableNearby(base(), VIEWER)).toBe(true)
    // With no viewer identity at all the community tier still answers (the RPC does the same).
    expect(isSurfaceableNearby(base(), null)).toBe(true)
  })

  it(':123 directory_visible=false hides', () => {
    expect(isSurfaceableNearby(base({ directory_visible: false }), VIEWER)).toBe(false)
  })

  it(':124 ghost_mode=true hides', () => {
    expect(isSurfaceableNearby(base({ ghost_mode: true }), VIEWER)).toBe(false)
  })

  it(':128 the viewer is never surfaced to themselves', () => {
    expect(isSurfaceableNearby(base({ id: 'viewer' }), VIEWER)).toBe(false)
  })

  it(":126 location_band='hidden' hides", () => {
    expect(isSurfaceableNearby(base({ location_band: 'hidden' }), VIEWER)).toBe(false)
  })

  it(':127 no home cell, no proximity', () => {
    expect(isSurfaceableNearby(base({ home_geocell_lat: null }), VIEWER)).toBe(false)
    expect(isSurfaceableNearby(base({ home_geocell_lat: undefined }), VIEWER)).toBe(false)
  })

  describe(":125 the tier, as widened by the migration ('connections' means MY connections)", () => {
    it("'connections' + an accepted friendship with the viewer → surfaced", () => {
      expect(isSurfaceableNearby(base({ id: 'friend', discoverable_by: 'connections' }), VIEWER)).toBe(true)
    })

    it("'connections' + no friendship → hidden (this used to be the ONLY outcome)", () => {
      expect(isSurfaceableNearby(base({ id: 'stranger', discoverable_by: 'connections' }), VIEWER)).toBe(false)
    })

    it("'connections' with no viewer identity fails CLOSED", () => {
      expect(isSurfaceableNearby(base({ id: 'friend', discoverable_by: 'connections' }), null)).toBe(false)
    })

    it("'nobody' hides even from a connection", () => {
      expect(isSurfaceableNearby(base({ id: 'friend', discoverable_by: 'nobody' }), VIEWER)).toBe(false)
    })

    it('an unknown value fails closed; an absent value takes the column default (community)', () => {
      expect(isSurfaceableNearby(base({ discoverable_by: 'everyone-ever' }), VIEWER)).toBe(false)
      expect(isSurfaceableNearby(base({ discoverable_by: undefined }), VIEWER)).toBe(true)
      expect(isSurfaceableNearby(base({ discoverable_by: null }), VIEWER)).toBe(true)
    })
  })
})

describe('acceptedConnectionIds', () => {
  it('reads the far end from either side of the canonical pair, accepted rows only', () => {
    const ids = acceptedConnectionIds('me', [
      { user_a_id: 'a', user_b_id: 'me', status: 'accepted' },
      { user_a_id: 'me', user_b_id: 'z', status: 'accepted' },
      { user_a_id: 'me', user_b_id: 'p', status: 'pending' },
      { user_a_id: 'x', user_b_id: 'y', status: 'accepted' },
    ])
    expect([...ids].sort()).toEqual(['a', 'z'])
  })
})

// ── Source shape: the surfaces consult the rule ──────────────────────────────────────────────

describe('/network consults the predicate', () => {
  const PAGE = read('app/(main)/network/page.tsx')

  it('imports it from the shared module', () => {
    expect(PAGE).toMatch(/isListableInDirectory,?\s*\}\s*from '@\/lib\/connections\/directory-visibility'/)
  })

  it('SELECTS the privacy columns by the shared constant, so none can be dropped alone', () => {
    expect(PAGE).toContain(INTERP + ', nexus_regions!nexus_region_id ( name )')
  })

  it('filters the directory BEFORE any downstream use (cards, Online now, counts)', () => {
    // `typedProfiles` feeds the cards, the online rail, the facets and the "Members Worldwide"
    // count; gating it at birth is what keeps a hidden member out of all four.
    expect(PAGE).toMatch(/const typedProfiles = \(\(profiles \?\? \[\]\) as unknown as Profile\[\]\)\.filter\(isListableInDirectory\)/)
  })

  it("no longer passes the viewer's OWN discovery radius as the search radius", () => {
    // The inversion: discovery_radius_m is "be findable within N" (a control on the target,
    // ADR-186 §3). It must never bound how far the viewer looks.
    expect(PAGE).not.toMatch(/membersNear\([^)]*discoveryRadiusM/)
    expect(PAGE).not.toContain('getMyConnectionPrefs')
  })

  it("hands the RPC the viewer's profile id, so 'My connections' can be resolved", () => {
    expect(PAGE).toMatch(/membersNear\(proxLat!, proxLng!, undefined, undefined, viewer\?\.id \?\? null\)/)
    expect(PAGE).toContain(".select('id, display_name, home_lat, home_lng')")
  })
})

describe('/search?tab=people consults the predicate', () => {
  const PAGE = read('app/(main)/search/page.tsx')

  it('imports it from the shared module', () => {
    expect(PAGE).toMatch(/isListableInDirectory,?\s*\}\s*from '@\/lib\/connections\/directory-visibility'/)
  })

  it('SELECTS the privacy columns by the shared constant', () => {
    expect(PAGE).toContain('community_role, is_demo, ' + INTERP + '`')
  })

  it('filters BEFORE the +1 truncation probe, so a hidden row never advertises "more"', () => {
    expect(PAGE).toMatch(/const rows = \(\(data \?\? \[\]\) as PersonRow\[\]\)\.filter\(isListableInDirectory\)\s*\n\s*return \{ \.\.\.empty, people: rows\.slice\(0, PEOPLE_RESULTS\)/)
  })
})

describe('membersNear carries the viewer into the RPC', () => {
  const LIB = read('lib/connections/connection-settings.ts')

  it('passes _viewer', () => {
    expect(LIB).toMatch(/_viewer: viewerProfileId,/)
    expect(LIB).toMatch(/viewerProfileId: string \| null = null,/)
  })
})

// ── Source shape: the SQL still carries every clause the module claims to mirror ─────────────

describe(`the members_near amendment (${MIGRATION})`, () => {
  const SQL = read(`supabase/migrations/${MIGRATION}`)
  const MODULE = read('lib/connections/directory-visibility.ts')

  it('sorts AFTER the two migrations that revoke the old signature by name', () => {
    // A lower version would replay the drop first, and those revokes would then fail on a
    // signature that no longer exists.
    const files = readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
    expect(files).toContain(MIGRATION)
    expect(MIGRATION > '20270221000200_').toBe(true)
  })

  it('drops the 4-argument signature and creates the 5-argument one with a nullable viewer', () => {
    expect(SQL).toContain('drop function if exists public.members_near(numeric, numeric, integer, integer);')
    expect(SQL).toMatch(/_viewer uuid default null\n\)/)
  })

  it("re-locks the new signature with BOTH role-explicit revokes and the service_role grant (ADR-959)", () => {
    expect(SQL).toContain(
      'revoke execute on function public.members_near(numeric, numeric, integer, integer, uuid) from anon, authenticated, public;',
    )
    expect(SQL).toContain('grant execute on function public.members_near(numeric, numeric, integer, integer, uuid) to service_role;')
  })

  it("honours the TARGET's discovery_radius_m, keeping the viewer-side bound", () => {
    expect(SQL).toMatch(/where c\.d <= _radius_m\s*\n\s*and c\.d <= c\.discovery_radius_m/)
  })

  it("'connections' means an ACCEPTED friendship with the viewer, looked up on the canonical pair", () => {
    expect(SQL).toContain("p.discoverable_by = 'connections'")
    expect(SQL).toContain("f.status = 'accepted'")
    expect(SQL).toMatch(/f\.user_a_id = least\(p\.id, \(select id from viewer\)\)/)
    expect(SQL).toMatch(/f\.user_b_id = greatest\(p\.id, \(select id from viewer\)\)/)
  })

  it('every clause the TypeScript module claims to mirror is still in the SQL, and vice versa', () => {
    const clauses = [
      'p.directory_visible = true',
      'p.ghost_mode = false',
      "p.discoverable_by = 'community'",
      "p.location_band <> 'hidden'",
      'p.home_geocell_lat is not null',
      'p.id <> coalesce((select id from viewer)',
    ]
    for (const c of clauses) expect(SQL, c).toContain(c)
    // The module header cites each of the six lines by number; a clause added to the SQL without
    // a TS branch, or the reverse, must show up as a missing citation here.
    for (const line of [':123', ':124', ':125', ':126', ':127', ':128']) expect(MODULE, line).toContain(line)
    expect(MODULE).toContain(MIGRATION)
  })

  it('the shared column constant names exactly the columns the SQL predicate reads', () => {
    for (const col of DIRECTORY_VISIBILITY_COLUMNS.split(', ')) expect(SQL, col).toContain(`p.${col}`)
  })
})
