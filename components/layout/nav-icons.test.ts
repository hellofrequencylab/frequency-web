import { describe, it, expect } from 'vitest'
import { AREA_ICONS, FALLBACK_AREA_ICON, railIconFor } from './nav-icons'
import { NAV_AREAS } from '@/lib/nav-areas'

// The rail draws one lucide glyph per NAV_AREAS row, resolved by KEY through AREA_ICONS.
// A key with no entry does not fail — it silently falls back to a generic Globe, which is
// exactly how three operator rows (Resonance CRM, Loom Studio, the operator Market board)
// shipped wearing the same anonymous glyph: `crm` had an icon but the rail's key is
// `admin-crm`, and nothing compared the two lists. This test is that comparison.
//
// DAWN's rule is that icons are referenced BY MEANING (readme §5). A fallback is the absence
// of meaning, so it is a defect on a real destination even though nothing throws.

describe('AREA_ICONS covers the nav', () => {
  it('gives every nav area its own glyph, never the fallback', () => {
    const missing = NAV_AREAS.filter((a) => !AREA_ICONS[a.key]).map((a) => `${a.key} (${a.label})`)
    expect(missing, `nav areas falling back to the generic glyph: ${missing.join(', ')}`).toEqual([])
  })

  it('resolves every nav area to something other than the fallback', () => {
    for (const area of NAV_AREAS) {
      expect(railIconFor(area.key), `${area.key} resolved to the fallback glyph`).not.toBe(
        FALLBACK_AREA_ICON,
      )
    }
  })

  // The member's Profile row is injected at render time (app-shell `withHomeProfile`) with a
  // dynamic href, so it is not in NAV_AREAS and the loops above cannot see it. It is still a
  // real rail row, and a DB menu row may name it, so it owes a glyph like any other.
  it('covers the render-time Profile row too', () => {
    expect(AREA_ICONS.profile).toBeDefined()
    expect(railIconFor('profile')).not.toBe(FALLBACK_AREA_ICON)
  })

  it('still falls back for a genuinely unknown key', () => {
    expect(railIconFor('not-a-real-area')).toBe(FALLBACK_AREA_ICON)
    expect(railIconFor(undefined)).toBe(FALLBACK_AREA_ICON)
  })
})
