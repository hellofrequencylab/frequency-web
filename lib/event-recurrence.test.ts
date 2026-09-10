import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  anchorIsDormant,
  propagationPatch,
  computeOccurrenceDates,
  expandOccurrenceInstants,
  occurrenceRow,
  staleOccurrenceIds,
} from './event-recurrence'

// F1: monthly recurrence must NOT overflow for day-29/30/31 anchors. The old
// setUTCMonth(+1) turned Jan 31 → Mar 3 (skipping Feb entirely). The fix counts
// whole months from the series start and clamps the day to the target month's
// length, so each occurrence lands on the right calendar month.

const day = (d: Date) => d.toISOString().slice(0, 10)

// The horizon is `now + horizonDays`, so for fixed future-dated anchors we pass a
// horizon comfortably past every asserted occurrence; recurrence_until is the real
// stop bound under test.
const FAR = 5000

describe('computeOccurrenceDates — monthly day-clamping (F1)', () => {
  it('clamps a Jan-31 anchor to Feb 28/29, Mar 31, Apr 30, … (no Feb skip)', () => {
    // 2027 (non-leap) → Feb 28.
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T09:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-06-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    expect(days).toEqual([
      '2027-02-28', // clamped (Feb has 28 days in 2027), NOT overflowed into March
      '2027-03-31', // back to the original day where the month allows it
      '2027-04-30', // clamped (April has 30)
      '2027-05-31',
      '2027-06-30', // clamped + stops at recurrence_until
    ])
  })

  it('does not accumulate drift: a short month never shortens a later one', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T00:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-04-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // March must be the 31st (original day), proving Feb's clamp didn't carry forward.
    expect(days).toContain('2027-03-31')
  })

  it('handles a Feb-29 leap anchor — only Februaries with a 29th keep the 29', () => {
    // 2028 is a leap year. Anchor on Feb 29, 2028.
    const dates = computeOccurrenceDates(
      { starts_at: '2028-02-29T12:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2029-02-28T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // Mar 29, Apr 29 … (clamped to 28/30 where needed), and the next Feb (2029, non-leap)
    // clamps to the 28th — never overflows into March.
    expect(days[0]).toBe('2028-03-29')
    expect(days).toContain('2028-04-29')
    expect(days).toContain('2029-02-28') // 2029 Feb has no 29th → clamped, not skipped
    expect(days.some((d) => d.startsWith('2029-03'))).toBe(false) // never overflowed past the Feb cap
  })

  it('preserves the anchor time-of-day on each monthly occurrence', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-15T17:30:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-03-31T23:59:59.000Z' },
      FAR,
    )
    expect(dates[0].toISOString()).toBe('2027-02-15T17:30:00.000Z')
  })
})

describe('computeOccurrenceDates — daily/weekly unchanged (regression)', () => {
  it('daily advances one calendar day at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: '2027-01-04T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('weekly advances seven days at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-29T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29'])
  })

  it('returns nothing for a non-recurring anchor', () => {
    expect(
      computeOccurrenceDates({ starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null }),
    ).toEqual([])
  })
})

describe('expandOccurrenceInstants — Date.now()-independent expansion to an explicit bound', () => {
  it('expands from step 1 up to and INCLUDING the untilInstant', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: null },
      new Date('2027-01-04T08:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('stops at recurrence_until even when the bound is later', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-15T23:59:59.000Z' },
      new Date('2027-03-01T00:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15'])
  })

  it('returns [] for a non-recurring anchor', () => {
    expect(
      expandOccurrenceInstants(
        { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null },
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toEqual([])
  })
})

// ── occurrenceRow — what a materialised occurrence INHERITS from its anchor ──────────────────
//
// The defect this locks down (ADR-883 shape): the child payload copied ten columns and let the
// rest fall to the COLUMN DEFAULTS, which are not neutral. In production both live recurring
// series were $22 events, and all 17 materialised occurrences came out FREE (price_cents NULL),
// `circle_only` on a region-scoped row (so the RLS circle disjunct matched nothing and every
// member but the host lost the event), tenanted to the ROOT space instead of the hosting
// Business Space, with no venue, no map point, no cover image and no capacity cap.

const ANCHOR = {
  id: 'anchor-1',
  slug: 'weekly-cowork',
  title: 'Weekly cowork',
  description: 'Bring a laptop.',
  host_id: 'host-1',
  scope_id: 'region-1',
  scope_type: 'public',
  location: '12 Main St',
  starts_at: '2027-01-01T19:00:00.000Z',
  ends_at: '2027-01-01T21:00:00.000Z',
  recurrence_type: 'weekly' as const,
  recurrence_until: null,
  is_cancelled: false,
  removed_at: null,
  // The columns whose defaults contradict the anchor.
  visibility: 'public',
  status: 'published',
  price_cents: 2200,
  currency: 'usd',
  capacity: 22,
  time_zone: 'America/Denver',
  space_id: 'space-royal-temple',
  host_space_id: 'space-royal-temple',
  category: 'social',
  cover_image_path: 'covers/a.jpg',
  venue_name: 'Royal Temple',
  city: 'Ojai',
  hide_address: true,
  join_mode: 'tickets',
  is_demo: false,
  geog: '0101000020E610000071602816AE525DC085D9BA8A7B844040',
  details: { specialInstructions: 'Door code 1234' },
}

describe('occurrenceRow — an occurrence inherits the anchor, not the column defaults', () => {
  const start = new Date('2027-01-08T19:00:00.000Z')
  const row = occurrenceRow(ANCHOR, start, 2 * 60 * 60 * 1000)

  it('carries the MONEY columns forward (a paid series must not materialise free dates)', () => {
    expect(row.price_cents).toBe(2200)
    expect(row.currency).toBe('usd')
    expect(row.capacity).toBe(22)
    expect(row.join_mode).toBe('tickets')
  })

  it('carries VISIBILITY and STATUS forward (the default is circle_only, which hides the row)', () => {
    expect(row.visibility).toBe('public')
    expect(row.status).toBe('published')
  })

  it('carries TENANCY forward (the default trigger rewrites a NULL space_id to ROOT)', () => {
    expect(row.space_id).toBe('space-royal-temple')
    expect(row.host_space_id).toBe('space-royal-temple')
  })

  it('carries the venue, the map point, the zone and the presentation forward', () => {
    expect(row.venue_name).toBe('Royal Temple')
    expect(row.city).toBe('Ojai')
    expect(row.geog).toBe(ANCHOR.geog)
    expect(row.time_zone).toBe('America/Denver')
    expect(row.cover_image_path).toBe('covers/a.jpg')
    expect(row.hide_address).toBe(true)
    expect(row.details).toEqual({ specialInstructions: 'Door code 1234' })
  })

  it('sets the occurrence identity: its own date, per-day slug, parent link, and no cadence', () => {
    expect(row.starts_at).toBe('2027-01-08T19:00:00.000Z')
    expect(row.ends_at).toBe('2027-01-08T21:00:00.000Z')
    expect(row.slug).toBe('weekly-cowork-2027-01-08')
    expect(row.parent_event_id).toBe('anchor-1')
    // A DB CHECK forbids a materialised occurrence from itself recurring.
    expect(row.recurrence_type).toBe('none')
    expect(row.recurrence_until).toBeNull()
  })

  it('never copies the anchor id, its claim link, or its own lifecycle stamps', () => {
    expect(row.id).toBeUndefined()
    expect(row.claim_token).toBeUndefined()
    expect(row.cancelled_at).toBeUndefined()
    expect(row.removed_at).toBeUndefined()
    expect(row.featured_at).toBeUndefined()
  })

  it('leaves ends_at null when the anchor has no duration', () => {
    expect(occurrenceRow(ANCHOR, start, null).ends_at).toBeNull()
  })

  it('drops a GeoJSON-object geog rather than writing a value the insert would reject', () => {
    // PostgREST returns geography as EWKB hex here, but a GeoJSON object serialization would
    // abort the whole batch on insert. Degrade to today's behaviour (no point), never to an error.
    const objectGeog = occurrenceRow(
      { ...ANCHOR, geog: { type: 'Point', coordinates: [-119.2, 34.4] } },
      start,
      null,
    )
    expect('geog' in objectGeog).toBe(false)
  })

  it('passes a NULL inherited column through instead of dropping it to the default', () => {
    const free = occurrenceRow({ ...ANCHOR, price_cents: null, capacity: null }, start, null)
    expect(free.price_cents).toBeNull()
    expect(free.capacity).toBeNull()
  })
})

describe('anchorIsDormant — a cancelled or removed series stops materialising', () => {
  it('is false for a live anchor', () => {
    expect(anchorIsDormant({ is_cancelled: false, removed_at: null })).toBe(false)
  })

  it('is true once the host cancels — the daily cron kept minting fresh occurrences otherwise', () => {
    expect(anchorIsDormant({ is_cancelled: true, removed_at: null })).toBe(true)
  })

  it('is true once staff removes it (moderation sets removed_at)', () => {
    expect(anchorIsDormant({ is_cancelled: false, removed_at: '2026-07-28T00:00:00Z' })).toBe(true)
  })
})

// ── THE BACKFILL SCRIPT SHARES THIS FILE'S COLUMN LIST ────────────────────────────────────────
//
// scripts/adr-884-backfill-recurrence-drift.sql repairs the occurrences that were minted from
// column DEFAULTS before INHERITED_COLUMNS existed. Its SET list was GENERATED from the constant
// below rather than retyped, and this test is what keeps that true.
//
// The failure it prevents is specific and quiet: someone adds a column to INHERITED_COLUMNS so new
// occurrences inherit it, the repair script is not updated, and every already-materialized
// occurrence keeps a defaulted value for that column forever, because the generator uses
// ignoreDuplicates and will never overwrite an existing row. That is the ORIGINAL bug, re-entering
// through the repair rather than the write.
describe('the repair script and the generator agree on what an occurrence inherits', () => {
  const root = join(__dirname, '..')
  const source = readFileSync(join(root, 'lib/event-recurrence.ts'), 'utf8')
  const script = readFileSync(join(root, 'scripts/adr-884-backfill-recurrence-drift.sql'), 'utf8')

  /** The constant's columns, read from the source so the test cannot drift from the runtime value. */
  const declared = [
    ...(source.match(/const INHERITED_COLUMNS = \[([\s\S]*?)\] as const/)?.[1] ?? '')
      .matchAll(/^\s*'([a-z_]+)',/gm),
  ].map((m) => m[1])

  /** The script's `col = a.col` assignments, which is the whole of what it repairs. */
  const repaired = [...script.matchAll(/^\s{2}([a-z_]+) = a\.\1/gm)].map((m) => m[1])

  it('parses a non-trivial list from both sides (so a regex that silently matches nothing fails)', () => {
    expect(declared.length).toBeGreaterThan(30)
    expect(repaired.length).toBeGreaterThan(30)
  })

  it('repairs exactly the columns a new occurrence inherits, no more and no fewer', () => {
    expect([...repaired].sort()).toEqual([...declared].sort())
  })

  it('never rewrites an occurrence\'s own identity', () => {
    for (const own of ['starts_at', 'ends_at', 'slug', 'parent_event_id', 'id']) {
      expect(repaired).not.toContain(own)
    }
  })

  it('repairs only upcoming occurrences, leaving past ones as the record of what happened', () => {
    expect(script).toContain('c.starts_at >= now()')
  })
})

// ── PROPAGATION: AN ANCHOR EDIT REACHES THE OCCURRENCES THAT ALREADY EXIST ─────────────────────
//
// generateOccurrencesForAnchor only MINTS missing occurrences (ignoreDuplicates), so before this
// existed an edit changed the anchor and left every materialised child holding whatever it was
// born with. propagationPatch is the other half, and it shares INHERITED_COLUMNS with occurrenceRow
// precisely so "same as the anchor" cannot come to mean two different things.
describe('propagationPatch', () => {
  const anchor = {
    id: 'anchor-1',
    slug: 'meld-community-cowork',
    starts_at: '2026-08-01T17:00:00.000Z',
    ends_at: '2026-08-01T19:00:00.000Z',
    recurrence_type: 'weekly',
    recurrence_until: '2026-12-01T00:00:00.000Z',
    is_cancelled: false,
    removed_at: null,
    title: 'Meld - Community Cowork',
    price_cents: 2200,
    visibility: 'public',
    capacity: 22,
    geog: '0101000020E6100000',
  } as unknown as Parameters<typeof propagationPatch>[0]

  it('carries the columns a fresh occurrence would have inherited', () => {
    const patch = propagationPatch(anchor)
    expect(patch.title).toBe('Meld - Community Cowork')
    expect(patch.price_cents).toBe(2200)
    expect(patch.visibility).toBe('public')
    expect(patch.capacity).toBe(22)
  })

  it('never rewrites an occurrence\'s own identity', () => {
    const patch = propagationPatch(anchor)
    for (const own of ['starts_at', 'ends_at', 'slug', 'parent_event_id', 'id']) {
      expect(patch).not.toHaveProperty(own)
    }
  })

  it('never makes an occurrence itself recur (a DB CHECK forbids it)', () => {
    const patch = propagationPatch(anchor)
    expect(patch).not.toHaveProperty('recurrence_type')
    expect(patch).not.toHaveProperty('recurrence_until')
  })

  it('agrees with occurrenceRow on every inherited column', () => {
    const patch = propagationPatch(anchor)
    const row = occurrenceRow(anchor, new Date('2026-08-08T17:00:00.000Z'), 7_200_000)
    for (const key of Object.keys(patch)) {
      expect(row[key], key).toEqual(patch[key])
    }
  })

  it('drops a non-string geog, exactly as occurrenceRow does', () => {
    const withObjectGeog = { ...anchor, geog: { type: 'Point', coordinates: [0, 0] } } as typeof anchor
    expect(propagationPatch(withObjectGeog)).not.toHaveProperty('geog')
  })
})

// ── RETIRING THE DATES A CHANGED RULE NO LONGER PRODUCES (ADR-1304) ──────────────────────────────
//
// Owner, 2026-09-10: "I changed Meld from weekly to bi weekly but it still shows all the repeating
// events that were configured originally."
//
// `staleOccurrenceIds` is the arithmetic that decides whether a real events row is DELETED, so it
// is pinned here, away from the database, where every case is decidable: the rule change itself,
// the two boundaries (past dates, and the exact instant of "now"), and the two shapes that must
// retire everything (a series switched off, a shortened end date).
describe('staleOccurrenceIds — the dates a changed rule leaves behind', () => {
  const kid = (id: string, iso: string) => ({ id, starts_at: iso })
  const NOW = new Date('2026-09-16T00:00:00.000Z')
  const at = (d: string) => new Date(`${d}T18:30:00.000Z`)

  it('🔴 weekly to fortnightly: the odd weeks go, the even ones stay', () => {
    // What Meld looked like: four weekly children minted under FREQ=WEEKLY, then the host moved to
    // INTERVAL=2, which produces only the 30th and the 14th.
    const children = [
      kid('w1', '2026-09-23T18:30:00.000Z'),
      kid('w2', '2026-09-30T18:30:00.000Z'),
      kid('w3', '2026-10-07T18:30:00.000Z'),
      kid('w4', '2026-10-14T18:30:00.000Z'),
    ]
    const expected = [at('2026-09-30'), at('2026-10-14')]
    expect(staleOccurrenceIds(children, expected, NOW)).toEqual(['w1', 'w3'])
  })

  it('never reaches into the past, however wrong the old rule was', () => {
    // A past occurrence is the record of something that already happened. The same rule that makes
    // propagateAnchorEditsToOccurrences stop at `now` stops this one.
    const children = [
      kid('old1', '2026-08-05T18:30:00.000Z'),
      kid('old2', '2026-09-09T18:30:00.000Z'),
      kid('next', '2026-09-23T18:30:00.000Z'),
    ]
    expect(staleOccurrenceIds(children, [], NOW)).toEqual(['next'])
  })

  it('counts an occurrence starting exactly NOW as future, not past', () => {
    // The boundary is `>=`, matching the `.gte('starts_at', now)` the read uses. An occurrence
    // starting this instant has not happened yet.
    expect(staleOccurrenceIds([kid('now', NOW.toISOString())], [], NOW)).toEqual(['now'])
  })

  it('compares on the calendar DAY, because that is what the materialiser dedupes on', () => {
    // The stored timestamp can differ from the expanded instant by a timezone round-trip or a
    // millisecond; generateOccurrencesForAnchor already keys on YYYY-MM-DD for exactly that reason,
    // and a retirement that compared getTime() would delete every date the mint had just made.
    const children = [kid('same-day', '2026-09-23T18:30:00.123Z')]
    expect(staleOccurrenceIds(children, [new Date('2026-09-23T18:30:00.000Z')], NOW)).toEqual([])
  })

  it('a series switched off retires every future date it minted', () => {
    // The case the old code called "must not strand the occurrences it already made" and answered
    // by keeping them, which is what stranding IS. An anchor that no longer repeats expands to
    // nothing, so every future child is a date the rule does not produce.
    const children = [kid('a', '2026-09-23T18:30:00.000Z'), kid('b', '2026-09-30T18:30:00.000Z')]
    expect(staleOccurrenceIds(children, [], NOW)).toEqual(['a', 'b'])
  })

  it('a shortened end date retires what falls past the new end', () => {
    const children = [
      kid('in', '2026-09-23T18:30:00.000Z'),
      kid('out1', '2026-09-30T18:30:00.000Z'),
      kid('out2', '2026-10-07T18:30:00.000Z'),
    ]
    // The expansion already stops at recurrence_until, so a shortened series simply produces fewer
    // dates and the tail falls out here. This is the shape expandOccurrenceInstants returns for
    // `until = 2026-09-24`.
    expect(staleOccurrenceIds(children, [at('2026-09-23')], NOW)).toEqual(['out1', 'out2'])
  })

  it('a child with no start is not a date, and is never retired on a guess', () => {
    // `starts_at` is nullable (drafts, 20261191). A child should always have one; a null is a row
    // this function cannot judge, and judging it would mean deleting on an unknown.
    expect(staleOccurrenceIds([{ id: 'draft', starts_at: null }], [], NOW)).toEqual([])
  })

  it('a rule that still produces every existing date retires nothing (the idempotent case)', () => {
    // The cron runs this on every anchor every day, so the overwhelmingly common answer must be
    // "nothing to do" and must stay that way run after run.
    const children = [kid('a', '2026-09-23T18:30:00.000Z'), kid('b', '2026-09-30T18:30:00.000Z')]
    const expected = [at('2026-09-23'), at('2026-09-30'), at('2026-10-07')]
    expect(staleOccurrenceIds(children, expected, NOW)).toEqual([])
  })
})

describe('the retirement is wired where a rule is actually changed', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('🔴 the SETTINGS RAIL reconciles, which is the path that did none of it', () => {
    // updateEvent (the /edit form) has materialised and propagated since ADR-884. updateEventSettings
    // — the Manage/Studio rail, where a host actually changes the repeat rule — wrote the rule onto
    // the anchor and stopped. That asymmetry IS the owner's report, and a source-shape check is the
    // honest guard for it: the alternative is a live Supabase write path, and the arithmetic that
    // decides what gets deleted is already pinned above.
    const admin = read('app/(main)/events/admin-actions.ts')
    expect(admin).toContain('retireStaleOccurrences')
    expect(admin).toContain('generateOccurrencesForAnchor')
    // The propagator here is the FORWARD one (ADR-1307). `propagateAnchorEditsToOccurrences` copies
    // the ANCHOR onto every upcoming date, which is only right when the anchor is what was edited;
    // this action now propagates from the row the host actually opened, and only when they asked
    // for "this and all future dates".
    expect(admin).toContain('propagateEditsForward')
  })

  it('the /edit form retires for ANY anchor, not only a still-recurring one', () => {
    // Turning a series off is precisely when its future dates have to go, so a retirement gated on
    // `recurrence_type !== 'none'` would leave the worst version of the bug in place.
    const actions = read('app/(main)/events/actions.ts')
    const call = actions.slice(actions.indexOf('  if (isAnchor) {\n    retireStaleOccurrences'))
    expect(call.startsWith('  if (isAnchor) {\n    retireStaleOccurrences(eventId)')).toBe(true)
  })

  it('the daily cron reconciles too, because the drift it heals already exists', () => {
    // Every series whose rule changed before this shipped is carrying its old rule's dates, and
    // nobody is going to re-save all of them. The cron is what heals them without anyone touching
    // the event, and its counts are logged so a fail-safe that fires is not silent.
    const source = read('lib/event-recurrence.ts')
    expect(source).toContain('const reconcile = opts.reconcile ?? true')
    expect(source).toContain('occurrencesRetired')
    const route = read('app/api/cron/event-occurrences/route.ts')
    expect(route).toContain('occurrencesRetired: result.occurrencesRetired')
    expect(route).toContain('occurrencesKept:    result.occurrencesKept')
  })

  it('🔴 the delete is fenced to the anchor’s own children and cannot reach the anchor', () => {
    // The one mistake this function could make that matters. The id list is already built from a
    // read of this anchor's children, so the `.eq('parent_event_id', anchorId)` on the DELETE is
    // redundant by construction — which is the point: it is the clause that makes a bug in the
    // construction unable to delete a standalone event or the series anchor itself.
    const source = readFileSync(join(process.cwd(), 'lib/event-recurrence.ts'), 'utf8')
    const fn = source.slice(source.indexOf('export async function retireStaleOccurrences'))
    expect(fn).toContain(".in('id', removable)")
    expect(fn).toContain(".eq('parent_event_id', anchorId)")
    // And it never deletes a date somebody is attached to.
    for (const table of ['event_rsvps', 'event_tickets', 'event_guests', 'event_posts']) {
      expect(source).toContain(`'${table}'`)
    }
  })
})
