import { describe, it, expect } from 'vitest'

// THE FUNNEL -> WIZARD SEAM (ADR-1197, SCAN-533).
//
// `lib/funnels/definitions.ts` builds `/spaces/new?mode=<type>:<variant>` so an operator arriving from
// a `/for/<niche>` door lands pre-seeded in the Mode that door sold them. Until this file existed, one
// half of that contract was tested and the other was not: `lib/funnels/routing.test.ts` asserted the
// URL was BUILT, and nothing asserted it could be READ. The page took no `searchParams` argument at
// all, so every niche door silently landed on `choices[0]` — "Coach" — and asked the visitor to
// re-declare the thing they had just clicked.
//
// These assertions cover the seam itself rather than the page's rendering: the ids on both sides must
// agree, and every niche destination must name a Mode the wizard can actually show.

import { listModeChoices } from '@/lib/spaces/modes'
import { NICHE_FUNNEL_DESTINATIONS, spaceCreatePath } from '@/lib/funnels/definitions'

/** Read the `mode` value out of a funnel destination url the way the page does. */
function modeOf(url: string): string | null {
  const q = url.split('?')[1]
  if (!q) return null
  return new URLSearchParams(q).get('mode')
}

describe('the funnel mode hint and the create wizard agree', () => {
  const choices = listModeChoices()
  const ids = new Set(choices.map((c) => c.id))

  it('the hint format is exactly the ModeChoice id format', () => {
    // If these two ever diverge the lookup on the page becomes a silent no-match, which is the failure
    // this whole row exists to end. Assert the shape rather than trusting it.
    expect(spaceCreatePath({ type: 'business', variant: 'packages' })).toBe(
      '/spaces/new?mode=business:packages',
    )
    expect(ids.has('business:packages')).toBe(true)
  })

  it('EVERY niche funnel destination names a Mode the wizard can show', () => {
    // The one that caught a real defect: `communities` routes to `business:cohort`, and the wizard
    // offered seven choices that did not include it. That door landed every arrival on "Coach".
    const unrenderable: string[] = []
    for (const [niche, dest] of Object.entries(NICHE_FUNNEL_DESTINATIONS)) {
      if (dest.mode !== 'direct' || !dest.url) continue
      const mode = modeOf(dest.url)
      if (!mode) continue
      if (!ids.has(mode)) unrenderable.push(`${niche} -> ${mode}`)
    }
    expect(unrenderable).toEqual([])
  })

  it('resolves a funnel mode to that choice, not to the first one', () => {
    // The page does `choices.find((c) => c.id === requested)`. Prove the lookup selects the intended
    // Mode for every niche, and that the answer is never just the default falling through.
    for (const dest of Object.values(NICHE_FUNNEL_DESTINATIONS)) {
      if (dest.mode !== 'direct' || !dest.url) continue
      const mode = modeOf(dest.url)!
      const picked = choices.find((c) => c.id === mode)
      expect(picked?.id).toBe(mode)
    }
    // And at least one niche must differ from the default, or the assertion above proves nothing.
    const defaults = choices[0]?.id
    const modes = Object.values(NICHE_FUNNEL_DESTINATIONS)
      .map((d) => (d.mode === 'direct' && d.url ? modeOf(d.url) : null))
      .filter((m): m is string => m !== null)
    expect(modes.some((m) => m !== defaults)).toBe(true)
  })

  it('an unknown or absent mode falls back rather than failing', () => {
    // A stale funnel link must still land somewhere usable, so the lookup narrows nothing.
    for (const junk of ['', 'nope', 'business:does-not-exist', 'business', ':', 'business:packages ']) {
      expect(choices.find((c) => c.id === junk)).toBeUndefined()
    }
    expect(choices[0]?.id).toBeTruthy() // there is always a fallback to land on
  })
})
