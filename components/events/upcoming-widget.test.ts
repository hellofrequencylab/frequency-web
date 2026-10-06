import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE CHANNEL "Upcoming" STRIP READS THROUGH THE ADMIN CLIENT, so RLS is not there to catch a
// missing filter. This is a source-shape guard rather than a behavioural test for that exact
// reason: the failure it exists to prevent is an ABSENT clause, and an absent clause cannot be
// asserted by calling the component with a mocked client that would answer whatever it is asked.
//
// The history matters, because it explains why this is worth a guard at all. The query originally
// had no `status` and no `visibility` filter, on a page that renders across every Circle practicing
// a Channel, to a viewer who is a member of none of them and may not be signed in. It never leaked
// in production only because circle placement was broken: placement wrote `scope_circle_id`, a
// typed column no reader consulted, so no upcoming event was ever circle-scoped and the strip was
// permanently empty. REPAIRING placement is what would have armed it. At the time of writing 18
// published `circle_only` events exist, and the first of them placed into a Circle would have
// appeared on a public Channel page.
//
// So: a change that removes either filter must fail here, loudly, with this comment attached.

describe('the Channel upcoming strip cannot widen past what a visitor may see', () => {
  const src = readFileSync(join(__dirname, 'upcoming-widget.tsx'), 'utf8')

  // LIVE-731: the gate moved into ONE shared SQL function (public.upcoming_event_series), whose
  // arguments the strip passes. So the guard reads both halves: the strip asks for public only,
  // and the LIVE definition of the function (the last migration that defines it) still applies
  // every other clause and is closed to anon and authenticated callers.
  const fnSql = (() => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    let found = ''
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(dir, f), 'utf8')
      if (/create\s+or\s+replace\s+function\s+public\.upcoming_event_series\b/i.test(sql)) found = sql
    }
    return found
  })()

  it('filters to published events', () => {
    expect(src).toContain('readUpcomingSeries<')
    expect(fnSql).toMatch(/e\.status = 'published'/)
  })

  it('filters to public visibility, so circle_only / unlisted / private can never surface', () => {
    expect(src).toContain("visibilities: ['public']")
    expect(fnSql).toMatch(/e\.visibility = any \(p_visibilities\)/)
    // Nobody but the service role can call it, so the arguments cannot be widened from outside.
    expect(fnSql).toMatch(/revoke all on function public\.upcoming_event_series[^;]*from public, anon, authenticated/)
  })

  it('still excludes cancelled events and anything before today', () => {
    expect(fnSql).toMatch(/e\.is_cancelled = false/)
    expect(fnSql).toMatch(/e\.removed_at is null/)
    // The floor moved from a raw instant to midnight TODAY in the community's zone (ADR-897), and
    // that is the fix, not a widening: starts_at is the host's wall clock kept as UTC parts, so
    // `new Date().toISOString()` is already tomorrow by 5pm Pacific and dropped tonight's gathering
    // off the strip. The same string floors the query and the fold, so they cannot disagree.
    expect(fnSql).toMatch(/e\.starts_at >= p_from/)
    expect(src).toContain('from: floor')
    expect(src).toContain('seriesUpcomingFloor(dayInZone(')
    expect(src).not.toContain('new Date().toISOString()')
  })

  it('does not reach for the viewer-aware visibilities this surface cannot authorize', () => {
    // A Circle's OWN block may widen to circle_only, because there the viewer's membership in that
    // one Circle is known. This cross-Circle strip has no such knowledge and must never copy it.
    //
    // Match against CODE, not the file: the comment above the query explains the leak in prose and
    // necessarily names `circle_only`, so a whole-file check fails on its own documentation. (This
    // test caught exactly that on its first run.) Strip line and block comments first.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(code).not.toContain('circle_only')
    expect(code).not.toContain('unlisted')
    expect(code.match(/\.in\('visibility'/)).toBeNull()
  })
})
