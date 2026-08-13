import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE FILTER RATCHET for the Around You map.
//
// This map reads through the SERVICE-ROLE client, which holds BYPASSRLS, so every filter in the
// loader is the only thing standing between a private row and a public pin. There is no policy
// underneath to catch a mistake.
//
// It is a SOURCE assertion, deliberately, and for the reason the sibling guard on this page states:
// a query is wrong the moment it is written, not the moment somebody creates the row that exposes
// it. The four event filters below were all added to `app/(main)/nearby/page.tsx` AFTER that page
// shipped leaking drafts, circle-only events and moderator takedowns, and the only reason it read
// clean was that the bad rows happened to be in the past.
//
// 🔴 THE ONE THAT IS NEW HERE, AND THE WORST ONE IF IT GOES. `hide_address`. A host can publish an
// event publicly and still withhold WHERE it is. Measured in production 2026-08-13: 10 of the 19
// otherwise-mappable upcoming events have it set. The LIST beside this map shows those events and
// is right to, because the title and the time are public. But a pin IS the address. Losing this
// filter would drop ten deliberately-withheld locations onto a public map, and nothing else in the
// stack would stop it.
const SRC = readFileSync(join(process.cwd(), 'lib/nearby/map-pins.ts'), 'utf8')

describe('the map filters events on every axis the table carries', () => {
  const REQUIRED: [fragment: string, why: string][] = [
    [`.eq('status', 'published')`, 'a draft event is not announced to the community'],
    [`.eq('visibility', 'public')`, 'circle_only and unlisted events are not discovery rows'],
    [`.is('removed_at', null)`, 'a moderator takedown stays taken down'],
    [`.eq('is_cancelled', false)`, 'a cancelled gathering is not somewhere to turn up'],
    [`.eq('hide_address', false)`, 'a pin IS the address, and this host withheld it'],
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

  it('renders a pin date through the shared formatter, which pins timeZone UTC', () => {
    // 🔴 `starts_at` holds the host's wall-clock kept as UTC PARTS (lib/time/zone.ts), so a bare
    // toLocaleDateString resolves in the RUNTIME's zone and flips the day for any stored hour under
    // the viewer's UTC offset. That shipped once already and printed three different dates for one
    // event across the ⌘K overlay, /search and the event page (see the note above formatEventDate
    // in lib/utils.ts). A pin's date must agree with the card beside it.
    expect(SRC).toContain('formatEventDate')
    expect(SRC).not.toMatch(/toLocaleDateString\(/)
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

  it('prefixes pin ids by layer, because two tables can hold the same uuid', () => {
    expect(SRC).toContain('`event:${')
    expect(SRC).toContain('`circle:${')
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

/** A published, public, upcoming, geocoded, address-visible, non-demo event: the one shape that
 *  earns a pin. Every test below spoils exactly one field of it. */
const okEvent = (over: Row = {}): Row => ({
  id: 'e-1',
  slug: 'sunrise-swim',
  title: 'Sunrise Swim',
  starts_at: FUTURE,
  location: null,
  venue_name: 'Surfers Point',
  city: 'Ventura',
  geog: GEOG,
  status: 'published',
  visibility: 'public',
  removed_at: null,
  is_cancelled: false,
  hide_address: false,
  is_demo: false,
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
  unlisted: false,
  status: 'active',
  is_demo: false,
  ...over,
})

function withRows(events: Row[], circles: Row[]) {
  client.current = stubClient({ events, circles })
}

beforeEach(() => withRows([], []))

describe('events: exactly one shape earns a pin', () => {
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
    expect(pins[0].lat).toBeCloseTo(34.27, 6)
    expect(pins[0].lng).toBeCloseTo(-119.29, 6)
    expect(pins[0].subtitle).toContain('Surfers Point')
  })

  const SPOILED: [why: string, over: Row][] = [
    ['a DRAFT event', { status: 'draft' }],
    ['a CIRCLE_ONLY event', { visibility: 'circle_only' }],
    ['an UNLISTED event (direct link only)', { visibility: 'unlisted' }],
    ['a moderator-REMOVED event', { removed_at: PAST }],
    ['a CANCELLED event', { is_cancelled: true }],
    ['a PAST event', { starts_at: PAST }],
    ['an event whose host HID the address', { hide_address: true }],
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
      subtitle: '12 members · Midtown',
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
    expect((await loadNearbyMapPins())[0].subtitle).toBe('1 member · Midtown')
  })
})

describe('the whole payload', () => {
  it('gives the same uuid in two tables two distinct pin ids', async () => {
    withRows([okEvent({ id: 'same' })], [okCircle({ id: 'same' })])
    const ids = (await loadNearbyMapPins()).map((p) => p.id).sort()
    expect(ids).toEqual(['circle:same', 'event:same'])
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
    withRows([okEvent()], [okCircle()])
    const pins = await loadNearbyMapPins()
    for (const p of pins) {
      for (const s of [p.title, p.subtitle, p.hrefLabel, p.label]) expect(s ?? '').not.toContain('—')
    }
  })
})
