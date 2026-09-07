import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE EVENT PAGE READS ITS OWN ROW ONCE, AND ITS SPACES ONCE (LIVE-180, ADR-1237).
//
// Until 2026-09-07 the page body selected 17 typed columns from `events` by slug, then selected 23
// MORE columns from the SAME row by id in a second, serial round trip, only because those columns
// were newer than the generated types. It then read the hosting Space and the venue Space in two
// more serial round trips, on ids it had derived together. Two removable round trips on the route
// with the most recorded production incidents (LIVE-142, SCAN-545).
//
// A second read of the same row is invisible to tsc, eslint and every wiring test: it compiles, it
// returns the right data, and it costs a round trip on every request forever. So this reads the
// SHAPE of the body: one `.from('events')`, one `.from('spaces')`, the merged select still carrying
// every column both halves used to fetch, and the Space read keyed by `.in('id', …)` on the pair.
//
// generateMetadata keeps its own narrow read above the page body; it is a different request in
// Next and is not counted here. The count below starts at the page function on purpose.

const PAGE = 'app/(main)/events/[slug]/page.tsx'
const page = readFileSync(PAGE, 'utf8')
const bodyStart = page.indexOf('export default async function EventDetailPage')
const body = page.slice(bodyStart)

/** Every string literal handed to a Supabase `.select(...)` in this source (single-quoted only,
 *  the same shape scripts/check-event-hero-parity.test.ts reads). */
function selectStrings(src: string): string[] {
  return [...src.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1])
}

function columnsOf(sel: string): string[] {
  return sel.split(',').map((c) => c.trim().split(/[\s(]/)[0])
}

describe('the event detail page body reads the events row once', () => {
  it('the page function exists where the count starts', () => {
    expect(bodyStart).toBeGreaterThan(-1)
  })

  it('issues exactly one .from(\'events\') read', () => {
    expect(body.match(/\.from\('events'\)/g)?.length ?? 0).toBe(1)
  })

  it('never re-reads the row by id after resolving it by slug', () => {
    // The old second read was `.from('events') … .eq('id', event.id)`. Any read keyed on the
    // event's own id from the events table is the duplicate coming back.
    expect(body).not.toMatch(/\.from\('events'\)[\s\S]{0,600}?\.eq\('id', event\.id\)/)
  })

  it('the one select carries both halves the two reads used to fetch', () => {
    const merged = selectStrings(body).map(columnsOf).find((cols) => cols.includes('slug') && cols.includes('title'))
    expect(merged, 'the header select is gone or is no longer a single-quoted literal').toBeDefined()
    // The typed header half (EventDetail).
    for (const c of ['id', 'title', 'slug', 'starts_at', 'time_zone', 'visibility', 'scope_id', 'scope_type', 'host:profiles!host_id']) {
      expect(merged, `header column ${c} left the merged select`).toContain(c)
    }
    // The newer-than-generated-types half (ExtraMeta): every gate input, in particular `status`
    // (the draft guard), `host_space_id` / `space_id` (attribution + payout), `claim_token`, and
    // `hide_address` (the address gate). Dropping one of these silently defaults the gate.
    for (const c of ['status', 'space_id', 'host_space_id', 'claim_token', 'claimed_at', 'posted_by_profile_id', 'hide_address', 'join_mode', 'rsvp_requires_approval', 'details', 'poster_path', 'cover_image_path', 'geog', 'theme']) {
      expect(merged, `extra column ${c} left the merged select`).toContain(c)
    }
    // Named once: EventDetail and ExtraMeta both declare it and a duplicate is a smell.
    expect(merged!.filter((c) => c === 'time_zone')).toHaveLength(1)
  })

  it('the select stays a single-quoted literal so the hero-parity guard can read it', () => {
    const idx = body.indexOf(".from('events')")
    expect(body.slice(idx, idx + 200)).toMatch(/\.select\(\s*'/)
  })
})

describe('the event detail page body reads its Spaces once', () => {
  it('issues exactly one .from(\'spaces\') read', () => {
    expect(body.match(/\.from\('spaces'\)/g)?.length ?? 0).toBe(1)
  })

  it('keys it on the host + venue pair, not on one id at a time', () => {
    expect(body).toContain("const spaceIds = [eventSpaceId, eventVenueSpaceId].filter((id): id is string => !!id)")
    expect(body).toContain(".in('id', spaceIds)")
    expect(body).not.toContain(".eq('id', eventSpaceId)")
    expect(body).not.toContain(".eq('id', eventVenueSpaceId)")
  })

  it('picks each row back by ITS id, gated on active exactly as before', () => {
    // The host must never be credited as the venue or the venue as the host, and a suspended or
    // archived Space still drops out silently (ADR-911).
    expect(body).toContain("rows.find((r) => r.id === id && r.status === 'active')")
    expect(body).toContain('const s = activeSpace(eventSpaceId)')
    expect(body).toContain('const v = activeSpace(eventVenueSpaceId)')
  })

  it('the read still carries what the host attribution and the payout check need', () => {
    const idx = body.indexOf(".from('spaces')")
    const sel = selectStrings(body.slice(idx, idx + 300))[0]
    expect(sel).toBeDefined()
    for (const c of ['id', 'slug', 'name', 'brand_name', 'brand_logo_url', 'status', 'owner_profile_id']) {
      expect(columnsOf(sel!)).toContain(c)
    }
  })
})

describe('the gates the reads feed did not move', () => {
  it('the draft guard still runs on the merged row and still lets only a manager preview', () => {
    expect(body).toContain("if ((extra?.status ?? 'published') !== 'published' && !canManage) notFound()")
  })

  it('the payee is still the hosting Space owner only when host_space_id names that Space', () => {
    expect(body).toContain('if (extra?.host_space_id === s.id) hostSpaceOwnerId = s.owner_profile_id')
  })

  it('a missing row still 404s before anything reads it', () => {
    expect(body).toContain('if (!rawEvent) notFound()')
    expect(body).toContain('const extra: ExtraMeta = event')
  })
})
