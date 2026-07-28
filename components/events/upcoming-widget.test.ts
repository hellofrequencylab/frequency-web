import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

  it('filters to published events', () => {
    expect(src).toContain(".eq('status', 'published')")
  })

  it('filters to public visibility, so circle_only / unlisted / private can never surface', () => {
    expect(src).toContain(".eq('visibility', 'public')")
  })

  it('still excludes cancelled events and anything already started', () => {
    expect(src).toContain(".eq('is_cancelled', false)")
    expect(src).toContain(".gte('starts_at', now)")
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
