import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APPROX_MAX_ERROR_M, APPROX_GRID_DEG } from '@/lib/maps/approximate'

// THE FILTER RATCHET for the Around You map.
//
// This map reads through the SERVICE-ROLE client, which holds BYPASSRLS, so every filter in the
// loader is the only thing standing between a private row and a public pin. There is no policy
// underneath to catch a mistake.
//
// It is a SOURCE assertion in its first half, deliberately, and for the reason the sibling guard on
// this page states: a query is wrong the moment it is written, not the moment somebody creates the
// row that exposes it. The event filters below were all added AFTER the page shipped leaking
// drafts, circle-only events and moderator takedowns, and the only reason it read clean was that
// the bad rows happened to be in the past.
//
// ── 🔴 WHAT CHANGED ON 2026-08-13, AND WHY THE HARDEST TEST IN HERE IS NEW ─────────────────────
//
// `hide_address` used to be an EXCLUSION, and this file used to assert `.eq('hide_address', false)`.
// On the owner's call it became a PRECISION: those events are drawn, coarsened. That is a weaker
// rule than "never drawn", so the guard has to be correspondingly stronger, and a `toContain` on a
// query fragment cannot express it at all. The new guarantee is a property of the OUTPUT:
//
//   a hidden-address event's published coordinate is never its real one, and is never further
//   than APPROX_MAX_ERROR_M from it
//
// Both halves matter and they fail in opposite directions. Drop the first and the coarsening has
// silently become a no-op that publishes the address. Drop the second and a "privacy" change could
// scatter pins into the next county and nothing would notice. The same pair guards Spaces whose
// owner chose `approximate`.
const SRC = readFileSync(join(process.cwd(), 'lib/nearby/map-pins.ts'), 'utf8')

describe('the map filters events on every axis the table carries', () => {
  const REQUIRED: [fragment: string, why: string][] = [
    [`.eq('status', 'published')`, 'a draft event is not announced to the community'],
    [`.eq('visibility', 'public')`, 'circle_only and unlisted events are not discovery rows'],
    [`.is('removed_at', null)`, 'a moderator takedown stays taken down'],
    [`.eq('is_cancelled', false)`, 'a cancelled gathering is not somewhere to turn up'],
  ]

  for (const [fragment, why] of REQUIRED) {
    it(`carries ${fragment} — ${why}`, () => {
      expect(SRC).toContain(fragment)
    })
  }

  it('only maps events that have not happened yet', () => {
    expect(SRC).toContain(`.gte('starts_at', nowIso)`)
  })

  it('keeps seeded demo events off the map, exactly as the circle layer does', () => {
    // Every other event read in the app carries this (lib/events/store.ts filters it on all four
    // of its queries). A map is the one surface that would put a fictional gathering on a real
    // street corner, and no demo event is upcoming TODAY, which is precisely why the filter has to
    // be asserted now rather than after one is seeded. Both layers, so neither can lose it alone.
    expect(SRC.split(`.eq('is_demo', false)`).length - 1).toBeGreaterThanOrEqual(2)
  })

  it('SELECTS hide_address, because the pin now depends on it', () => {
    // It stopped being a filter and became an input. A SELECT that drops it would hand every row
    // `hide_address: undefined`, the `=== true` test would fail open, and every withheld address
    // would publish at full precision. This is the cheapest possible tripwire for that.
    expect(SRC).toContain('hide_address')
    expect(SRC).toContain('row.hide_address === true')
  })

  it('renders a pin date through the shared formatter, which pins timeZone UTC', () => {
    // 🔴 `starts_at` holds the host's wall-clock kept as UTC PARTS (lib/time/zone.ts), so a bare
    // toLocaleDateString resolves in the RUNTIME's zone and flips the day for any stored hour under
    // the viewer's UTC offset. That shipped once already and printed three different dates for one
    // event across the ⌘K overlay, /search and the event page (see the note above formatEventDate
    // in lib/utils.ts). A pin's date must agree with the card beside it.
    expect(SRC).toContain('formatEventDate')
    expect(SRC).not.toMatch(/toLocaleDateString\(/)
  })

  it('carries SERIES_COLUMNS into the select, without which the fold is a silent no-op', () => {
    // lib/events/series.ts names this as the single most likely way the fold ships half-working:
    // collapseSeries reads recurrence_type and parent_event_id, and a SELECT that omits them makes
    // every row its own series again. That is the exact bug this map shipped with.
    expect(SRC).toContain('${SERIES_COLUMNS}')
    expect(SRC).toContain('collapseSeries')
  })

  it('over-fetches events, because the fold spends the LIMIT on rows it discards', () => {
    // Reading only the display cap and folding afterwards would hand the map a handful of
    // gatherings out of a region that has many: one daily series can eat 61 rows of the budget.
    expect(SRC).toContain('EVENT_ROW_CAP')
    expect(SRC).toContain('SERIES_WIDE_READ')
  })
})

describe('the map respects both Circle privacy axes (ADR-1015)', () => {
  it('maps only LISTED circles, which is axis 1', () => {
    // A pin is a discovery row, so the question is canSeeCircle. An unlisted circle must never
    // appear on a public map whatever its access mode.
    expect(SRC).toContain(`.eq('unlisted', false)`)
  })

  it('maps only forming or active circles, never a draft or an archived one', () => {
    expect(SRC).toContain(`.in('status', ['forming', 'active'])`)
  })

  it('keeps demo circles off the map', () => {
    expect(SRC).toContain(`.eq('is_demo', false)`)
  })

  it('does NOT filter on access, and that is deliberate', () => {
    // 🔴 A listed-but-CLOSED circle SHOULD get a pin. That cell is the lead funnel ADR-1015 exists
    // to express: its name and its place are public face, and the shut door is the point. Someone
    // "tightening" this by adding an access filter would delete the funnel's best surface, so the
    // absence is asserted rather than left to be tidied away.
    expect(SRC).not.toContain(`.eq('access',`)
  })
})

describe('the Space layer draws the discoverable set only (ADR-1026)', () => {
  it('maps only ACTIVE spaces', () => {
    expect(SRC).toContain(`.eq('status', 'active')`)
  })

  it('maps only NETWORK-visible spaces, never private and never unlisted', () => {
    // The same distinction ADR-1015 draws for Circles: an unlisted Space is reachable by direct
    // link, which makes it visible and NOT discoverable, and a pin is a discovery row. Asserting
    // the exact predicate rather than "some visibility filter" is what stops a later widening to
    // `.in('visibility', ['network','unlisted'])` from passing.
    expect(SRC).toContain(`.eq('visibility', 'network')`)
  })

  it('consults location_precision before publishing a coordinate', () => {
    expect(SRC).toContain(`s.location_precision === 'approximate'`)
  })
})

describe('the loader cannot take the page down', () => {
  it('returns an empty array rather than throwing', () => {
    // A map is an enhancement on this page. Every failure path has to end in no pins, never a 500.
    expect(SRC).toContain('return []')
    expect(SRC).toContain('} catch {')
  })

  it('caps each layer, so a growing region cannot ship a hung tab', () => {
    expect(SRC).toContain('PER_LAYER_CAP')
    expect(SRC).toContain('.limit(PER_LAYER_CAP)')
  })

  it('prefixes pin ids by layer, because three tables can hold the same uuid', () => {
    expect(SRC).toContain('`event:${')
    expect(SRC).toContain('`circle:${')
    expect(SRC).toContain('`space:${')
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE SAME RULES, PROVED END TO END.
//
// Everything above asserts about TEXT. That catches a filter someone deletes, which is the common
// failure, but it cannot catch a filter that is present and wrong: `.eq('status', 'draft')` would
// satisfy a `toContain` for `.eq('status',` and leak every draft on the platform. So the loader is
// also run for real against a stub client that APPLIES the filters it is handed — a small PostgREST
// emulator, doing the filtering the database would do, which is the only way a stub can testify
// about a database predicate at all.
//
// Each case takes ONE correct row and spoils exactly ONE axis, so a failure names the axis.
// ───────────────────────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const { client } = vi.hoisted(() => ({ client: { current: null as unknown } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client.current }))

// Imported AFTER the mock on purpose: vitest hoists `vi.mock`, so this binding resolves against
// the stub rather than the real service-role client.
import { loadNearbyMapPins } from './map-pins'

function stubClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? []
      const where: ((r: Row) => boolean)[] = []
      let sort: { col: string; ascending: boolean } | null = null
      let max = Infinity
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (where.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (where.push((r) => v.includes(r[c])), q),
        is: (c: string, v: unknown) => (where.push((r) => (v === null ? r[c] == null : r[c] === v)), q),
        not: (c: string, op: string, v: unknown) => (
          where.push((r) => (op === 'is' && v === null ? r[c] != null : r[c] !== v)), q
        ),
        gte: (c: string, v: string) => (where.push((r) => typeof r[c] === 'string' && (r[c] as string) >= v), q),
        order: (c: string, o?: { ascending?: boolean }) => ((sort = { col: c, ascending: o?.ascending !== false }), q),
        limit: (n: number) => ((max = n), q),
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let out = rows.filter((r) => where.every((p) => p(r)))
          if (sort) {
            const { col, ascending } = sort
            out = [...out].sort((a, b) => {
              const av = a[col] as string | number
              const bv = b[col] as string | number
              const cmp = av === bv ? 0 : av < bv ? -1 : 1
              return ascending ? cmp : -cmp
            })
          }
          resolve({ data: out.slice(0, max), error: null })
        },
      }
      return q
    },
  }
}

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString()
const PAST = new Date(Date.now() - 7 * 864e5).toISOString()
/** A real PostGIS EWKB hex POINT at 34.27, -119.29 — the shape PostgREST actually returns. */
const GEOG = '0101000020E6100000C3F5285C8FD25DC0C3F5285C8F224140'
const TRUE_LAT = 34.27
const TRUE_LNG = -119.29

/** Great-circle metres between two points. The coarsening's promise is a DISTANCE, so the test has
 *  to measure one; comparing degrees would quietly pass a longitude bug at any latitude. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A published, public, upcoming, geocoded, address-visible, non-demo event: the plain shape. */
const okEvent = (over: Row = {}): Row => ({
  id: 'e-1',
  slug: 'sunrise-swim',
  title: 'Sunrise Swim',
  starts_at: FUTURE,
  location: null,
  venue_name: 'Surfers Point',
  street: '1 Beach Way',
  city: 'Ventura',
  region: 'CA',
  cover_image_path: null,
  geog: GEOG,
  status: 'published',
  visibility: 'public',
  removed_at: null,
  is_cancelled: false,
  hide_address: false,
  is_demo: false,
  recurrence_type: 'none',
  recurrence_until: null,
  parent_event_id: null,
  ...over,
})

/** A LISTED, active, non-demo circle with public coordinates. */
const okCircle = (over: Row = {}): Row => ({
  id: 'c-1',
  slug: 'ventura-breathwork',
  name: 'Ventura Breathwork',
  city: 'Ventura',
  neighborhood: 'Midtown',
  member_count: 12,
  latitude: 34.28,
  longitude: -119.29,
  image_url: null,
  unlisted: false,
  status: 'active',
  is_demo: false,
  ...over,
})

/** An active, network-visible Space that placed an exact pin. */
const okSpace = (over: Row = {}): Row => ({
  id: 's-1',
  slug: 'royal-temple',
  name: 'Royal Temple',
  brand_name: null,
  tagline: 'A room for the work',
  street: '100 Temple Way',
  city: 'Vista',
  region: 'CA',
  cover_image_url: null,
  brand_logo_url: null,
  latitude: 33.2,
  longitude: -117.24,
  location_precision: 'exact',
  status: 'active',
  visibility: 'network',
  ...over,
})

function withRows(events: Row[], circles: Row[], spaces: Row[] = []) {
  client.current = stubClient({ events, circles, spaces })
}

beforeEach(() => withRows([], [], []))

describe('events: the shape that earns a pin', () => {
  it('the good row becomes one layer-prefixed event pin', async () => {
    withRows([okEvent()], [])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({
      id: 'event:e-1',
      kind: 'event',
      title: 'Sunrise Swim',
      href: '/events/sunrise-swim',
    })
    expect(pins[0].lat).toBeCloseTo(TRUE_LAT, 6)
    expect(pins[0].lng).toBeCloseTo(TRUE_LNG, 6)
    // 🔴 EXACT PRECISION LISTS THE ADDRESS. The venue name is what a member looks for on arrival
    // and the street is how they get there, so both are on the WHERE row.
    expect(pins[0].detail).toContain('Surfers Point')
    expect(pins[0].detail).toContain('1 Beach Way')
    // No pill: nothing about this pin needs qualifying.
    expect(pins[0].badge ?? null).toBeNull()
    // WHEN and WHERE are separate rows, not one joined sentence.
    expect(pins[0].subtitle).toContain('Thu')
    expect(pins[0].subtitle ?? '').not.toContain('Surfers Point')
    // A one-off stands for nothing but itself, so it draws as a plain pin and not a `1+` bubble.
    expect(pins[0].moreCount).toBe(0)
  })

  const SPOILED: [why: string, over: Row][] = [
    ['a DRAFT event', { status: 'draft' }],
    ['a CIRCLE_ONLY event', { visibility: 'circle_only' }],
    ['an UNLISTED event (direct link only)', { visibility: 'unlisted' }],
    ['a moderator-REMOVED event', { removed_at: PAST }],
    ['a CANCELLED event', { is_cancelled: true }],
    ['a PAST event', { starts_at: PAST }],
    ['a DEMO event', { is_demo: true }],
    ['an event that was never geocoded', { geog: null }],
  ]

  for (const [why, over] of SPOILED) {
    it(`${why} produces NO pin`, async () => {
      withRows([okEvent(over)], [])
      expect(await loadNearbyMapPins()).toEqual([])
    })
  }
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE COARSENING. The most important block in this file.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('a host who hid the address gets an area, never the address', () => {
  it('still earns a pin, which is the whole point of the 2026-08-13 change', async () => {
    // Before it, 3 of the community's 5 gatherings were excluded and the map showed one event.
    withRows([okEvent({ hide_address: true })], [])
    expect(await loadNearbyMapPins()).toHaveLength(1)
  })

  it('🔴 NEVER publishes the real coordinate', async () => {
    withRows([okEvent({ hide_address: true })], [])
    const pin = (await loadNearbyMapPins())[0]
    expect(pin.lat).not.toBeCloseTo(TRUE_LAT, 4)
    expect(pin.lng).not.toBeCloseTo(TRUE_LNG, 4)
  })

  it('🔴 stays inside the radius the copy promises', async () => {
    withRows([okEvent({ hide_address: true })], [])
    const pin = (await loadNearbyMapPins())[0]
    expect(metresBetween(TRUE_LAT, TRUE_LNG, pin.lat, pin.lng)).toBeLessThanOrEqual(APPROX_MAX_ERROR_M)
  })

  it('🔴 two events at the SAME real address land on different dots', async () => {
    // Otherwise the coarsening is a public equality oracle: "these two withheld events are at the
    // identical address" is itself a disclosure, and a lattice of identical dots would announce it.
    withRows(
      [okEvent({ id: 'e-1', slug: 'a', hide_address: true }), okEvent({ id: 'e-2', slug: 'b', hide_address: true })],
      [],
    )
    const [a, b] = await loadNearbyMapPins()
    expect(a.lat === b.lat && a.lng === b.lng).toBe(false)
  })

  it('is stable across reads, so the pin does not wander between page loads', async () => {
    withRows([okEvent({ hide_address: true })], [])
    const first = (await loadNearbyMapPins())[0]
    withRows([okEvent({ hide_address: true })], [])
    const second = (await loadNearbyMapPins())[0]
    expect(second.lat).toBe(first.lat)
    expect(second.lng).toBe(first.lng)
  })

  it('wears a pill that says how to get the real address', async () => {
    withRows([okEvent({ hide_address: true })], [])
    expect((await loadNearbyMapPins())[0].badge).toBe('RSVP for address')
  })

  it('🔴 lists the CITY and nothing sharper', async () => {
    withRows([okEvent({ hide_address: true })], [])
    const pin = (await loadNearbyMapPins())[0]
    expect(pin.detail).toContain('Ventura')
    expect(pin.detail ?? '').not.toContain('Beach Way')
  })

  it('🔴 drops the VENUE NAME too, because a venue name is an address in disguise', async () => {
    // "Royal Temple" is one building in Vista: a member with a search engine turns that name into a
    // street number in one step. Coarsening the dot and publishing the name beside it would be
    // worse than not coarsening at all, because it looks careful.
    withRows([okEvent({ hide_address: true })], [])
    const pin = (await loadNearbyMapPins())[0]
    for (const field of [pin.subtitle, pin.detail, pin.badge]) {
      expect(field ?? '').not.toContain('Surfers Point')
    }
  })

  it('🔴 drops the free-text location line, which is where a street usually gets typed', async () => {
    withRows([okEvent({ hide_address: true, location: '1234 Real Street, Vista CA' })], [])
    const pin = (await loadNearbyMapPins())[0]
    for (const field of [pin.subtitle, pin.detail, pin.badge]) {
      expect(field ?? '').not.toContain('Real Street')
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE SERIES FOLD. The bug the owner reported: nine pins for one event.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('a repeating event is ONE pin, not one per date', () => {
  /** An anchor plus `n - 1` materialised occurrences, exactly as ADR-007 stores them. */
  const series = (n: number): Row[] =>
    Array.from({ length: n }, (_, i) =>
      okEvent({
        id: i === 0 ? 'anchor' : `occ-${i}`,
        slug: i === 0 ? 'cowork' : `cowork-${i}`,
        title: 'Meld Community Cowork',
        starts_at: new Date(Date.now() + (i + 1) * 7 * 864e5).toISOString(),
        recurrence_type: 'weekly',
        parent_event_id: i === 0 ? null : 'anchor',
      }),
    )

  it('nine occurrences of one series draw exactly one pin', async () => {
    withRows(series(9), [])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(1)
  })

  it('the pin elected is the NEXT date, not the anchor and not the last', async () => {
    withRows(series(9), [])
    expect((await loadNearbyMapPins())[0].id).toBe('event:anchor')
  })

  it('🔴 survives the anchor ageing out, which is how established series disappear', async () => {
    // Browse filters starts_at >= now, so a long-running series' anchor row is simply not in the
    // result set any more. A fold that elected "the anchor" would delete every established series
    // from this map. lib/events/series.ts elects the earliest row PRESENT for exactly this reason.
    const withoutAnchor = series(9).slice(1)
    withRows(withoutAnchor, [])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(1)
    expect(pins[0].id).toBe('event:occ-1')
  })

  it('carries the other dates as moreCount, which is what makes the bubble read 1+', async () => {
    withRows(series(9), [])
    expect((await loadNearbyMapPins())[0].moreCount).toBe(8)
  })

  it('says how many more dates there are, in words, in the popup', async () => {
    withRows(series(9), [])
    expect((await loadNearbyMapPins())[0].subtitle).toContain('and 8 more dates')
  })

  it('spells the singular, on the one surface built to fix a counting bug', async () => {
    withRows(series(2), [])
    expect((await loadNearbyMapPins())[0].subtitle).toContain('and 1 more date')
  })

  it('two different series stay two pins', async () => {
    const other = okEvent({ id: 'other', slug: 'other', title: 'Breathwork', recurrence_type: 'weekly' })
    withRows([...series(9), other], [])
    expect(await loadNearbyMapPins()).toHaveLength(2)
  })
})

describe('circles: the listed set, and only the listed set', () => {
  it('the good row becomes one layer-prefixed circle pin', async () => {
    withRows([], [okCircle()])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({
      id: 'circle:c-1',
      kind: 'circle',
      title: 'Ventura Breathwork',
      href: '/circles/ventura-breathwork',
      subtitle: '12 members',
      detail: 'Midtown',
    })
  })

  it('🔴 a LISTED CLOSED circle STILL gets a pin, because that cell is the lead funnel', async () => {
    // Axis 2 is shut all the way; axis 1 says list it. A map that dropped this row would delete the
    // funnel's public face, which is the exact mistake the two-axis split exists to prevent.
    withRows([], [okCircle({ access: 'invite' })])
    expect(await loadNearbyMapPins()).toHaveLength(1)
  })

  const SPOILED: [why: string, over: Row][] = [
    ['an UNLISTED circle', { unlisted: true }],
    ['a DRAFT circle', { status: 'draft' }],
    ['an ARCHIVED circle', { status: 'archived' }],
    ['a DEMO circle', { is_demo: true }],
    ['a circle with no public latitude', { latitude: null }],
    ['a circle with no public longitude', { longitude: null }],
  ]

  for (const [why, over] of SPOILED) {
    it(`${why} produces NO pin`, async () => {
      withRows([], [okCircle(over)])
      expect(await loadNearbyMapPins()).toEqual([])
    })
  }

  it('one member reads "1 member", not "1 members"', async () => {
    withRows([], [okCircle({ member_count: 1 })])
    expect((await loadNearbyMapPins())[0].subtitle).toBe('1 member')
  })
})

describe('spaces: a layer that could not exist before ADR-1026', () => {
  it('an active, network-visible, placed Space becomes one pin', async () => {
    withRows([], [], [okSpace()])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({
      id: 'space:s-1',
      kind: 'space',
      title: 'Royal Temple',
      href: '/spaces/royal-temple',
    })
    expect(pins[0].lat).toBeCloseTo(33.2, 6)
    // Exact precision lists the address, not just the city.
    expect(pins[0].detail).toContain('100 Temple Way')
    expect(pins[0].badge ?? null).toBeNull()
    expect(pins[0].subtitle).toBe('A room for the work')
  })

  it('prefers the brand name, which is what the Space calls itself in public', async () => {
    withRows([], [], [okSpace({ brand_name: 'RAPID Cold Plunge' })])
    expect((await loadNearbyMapPins())[0].title).toBe('RAPID Cold Plunge')
  })

  const SPOILED: [why: string, over: Row][] = [
    ['a PRIVATE space', { visibility: 'private' }],
    ['an UNLISTED space (direct link only)', { visibility: 'unlisted' }],
    ['a space that is not active', { status: 'suspended' }],
    ['a space that never placed a pin', { latitude: null, longitude: null }],
  ]

  for (const [why, over] of SPOILED) {
    it(`${why} produces NO pin`, async () => {
      withRows([], [], [okSpace(over)])
      expect(await loadNearbyMapPins()).toEqual([])
    })
  }

  describe('the owner picked approximate', () => {
    it('🔴 never publishes the real coordinate', async () => {
      withRows([], [], [okSpace({ location_precision: 'approximate' })])
      const pin = (await loadNearbyMapPins())[0]
      expect(pin.lat).not.toBeCloseTo(33.2, 4)
      expect(pin.lng).not.toBeCloseTo(-117.24, 4)
    })

    it('🔴 stays inside the radius the copy promises', async () => {
      withRows([], [], [okSpace({ location_precision: 'approximate' })])
      const pin = (await loadNearbyMapPins())[0]
      expect(metresBetween(33.2, -117.24, pin.lat, pin.lng)).toBeLessThanOrEqual(APPROX_MAX_ERROR_M)
    })

    it('wears the Approximate area pill and lists only the city', async () => {
      withRows([], [], [okSpace({ location_precision: 'approximate' })])
      const pin = (await loadNearbyMapPins())[0]
      expect(pin.badge).toBe('Approximate area')
      expect(pin.detail).toContain('Vista')
      expect(pin.detail ?? '').not.toContain('Temple Way')
    })

    it('an EXACT space is left exactly where its owner put it', async () => {
      withRows([], [], [okSpace()])
      const pin = (await loadNearbyMapPins())[0]
      expect(pin.lat).toBeCloseTo(33.2, 9)
      expect(pin.lng).toBeCloseTo(-117.24, 9)
      expect(pin.badge ?? null).toBeNull()
    })

    it('🔴 an unrecognised precision value is treated as EXACT, and that is checked on purpose', async () => {
      // Fail-safe direction matters. This one fails OPEN, deliberately: the coarsening is opt-in,
      // and a typo that silently coarsened every Space would make the map wrong everywhere without
      // anyone noticing. The column has a CHECK constraint, so only a schema change can produce a
      // third value, and this test is what makes that change loud rather than silent.
      withRows([], [], [okSpace({ location_precision: 'fuzzy' })])
      expect((await loadNearbyMapPins())[0].lat).toBeCloseTo(33.2, 9)
    })
  })
})

describe('the whole payload', () => {
  it('gives the same uuid in three tables three distinct pin ids', async () => {
    withRows([okEvent({ id: 'same' })], [okCircle({ id: 'same' })], [okSpace({ id: 'same' })])
    const ids = (await loadNearbyMapPins()).map((p) => p.id).sort()
    expect(ids).toEqual(['circle:same', 'event:same', 'space:same'])
  })

  it('keeps the SOONEST events and the LARGEST circles when a layer overflows its cap', async () => {
    const events = Array.from({ length: 400 }, (_, i) =>
      okEvent({ id: `e-${i}`, slug: `e-${i}`, starts_at: new Date(Date.now() + (i + 1) * 36e5).toISOString() }),
    )
    const circles = Array.from({ length: 400 }, (_, i) => okCircle({ id: `c-${i}`, slug: `c-${i}`, member_count: i }))
    withRows(events, circles)
    const pins = await loadNearbyMapPins()
    const ids = new Set(pins.map((p) => p.id))
    expect(pins.length).toBeLessThanOrEqual(600)
    expect(ids.has('event:e-0')).toBe(true) // soonest kept
    expect(ids.has('event:e-399')).toBe(false) // furthest out dropped
    expect(ids.has('circle:c-399')).toBe(true) // largest kept
    expect(ids.has('circle:c-0')).toBe(false) // smallest dropped
    // Neither layer starves the other: the caps are per layer, not a shared slice.
    expect(pins.filter((p) => p.kind === 'event').length).toBe(300)
    expect(pins.filter((p) => p.kind === 'circle').length).toBe(300)
  })

  it('returns an empty array, never a throw, when the client blows up', async () => {
    client.current = {
      from() {
        throw new Error('connection reset')
      },
    }
    expect(await loadNearbyMapPins()).toEqual([])
  })

  it('emits no em dashes in any member-visible string (docs/CONTENT-VOICE.md)', async () => {
    withRows([okEvent({ hide_address: true })], [okCircle()], [okSpace({ location_precision: 'approximate' })])
    const pins = await loadNearbyMapPins()
    expect(pins).toHaveLength(3)
    for (const p of pins) {
      for (const s of [p.title, p.subtitle, p.detail, p.badge, p.hrefLabel, p.label]) {
        expect(s ?? '').not.toContain('—')
      }
    }
  })
})

describe('the coarsening grid is the number the docs quote', () => {
  it('a ~1 km cell, so the published area is a neighbourhood and not a building', () => {
    // Quoted in lib/maps/approximate.ts, in the migration comment, and in the ADR. If someone
    // widens or narrows it, all three become wrong at once and this is the test that says so.
    expect(APPROX_GRID_DEG).toBe(0.01)
    expect(APPROX_MAX_ERROR_M).toBe(1250)
  })
})
