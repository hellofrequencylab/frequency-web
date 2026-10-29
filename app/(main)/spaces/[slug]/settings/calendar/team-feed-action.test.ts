import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// COPYING THE TEAM FEED MUST NOT KILL IT. The settings sheet's Copy team feed asks for the Space's live
// link; only an absent link is made. Rotating revokes every subscriber, so it stays its own press.
describe('ensurePrivateCalendarFeed', () => {
  const source = readFileSync('app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts', 'utf8')
  const at = source.indexOf('export async function ensurePrivateCalendarFeed(')
  const body = source.slice(at, source.indexOf('\n}', at))

  it('is behind the editor gate and reads the live token first', () => {
    expect(at).toBeGreaterThan(-1)
    expect(body).toContain('const editor = await resolveEditor(slug)')
    expect(body).toContain(".is('revoked_at', null)")
    expect(body).toContain('if (live) return ok({ token: live })')
  })

  it('revokes nothing itself; only a missing link falls through to the maker', () => {
    expect(body).not.toContain('revoked_at: new Date()')
    expect(body).toContain('return rotatePrivateCalendarFeed(slug)')
  })
})
