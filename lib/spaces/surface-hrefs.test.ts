import { describe, it, expect } from 'vitest'
import { hrefForSurface, panelHrefForSurface } from './surface-hrefs'

// Stage D1: the RAIL translates a panel-mapped Space surface to a `?panel=` href (inline in the profile
// body), while every non-panel surface — and the console/bank, which keep calling hrefForSurface — stays
// on its full route. Lock the seam so a future surface can only join by an explicit PANEL_SURFACE_TO_ID row.
describe('panelHrefForSurface (rail-only inline-panel translation)', () => {
  const slug = 'demo'

  it('opens Members (space.people) inline via ?panel=members, not its full route', () => {
    expect(panelHrefForSurface('space.people', slug)).toBe(`/spaces/${slug}?panel=members`)
    expect(panelHrefForSurface('space.people', slug)).not.toBe(hrefForSurface('space.people', slug))
  })

  it('opens CRM (space.engage.crm) inline via ?panel=crm — the bounded board panel (Stage D5)', () => {
    expect(panelHrefForSurface('space.engage.crm', slug)).toBe(`/spaces/${slug}?panel=crm`)
    expect(panelHrefForSurface('space.engage.crm', slug)).not.toBe(hrefForSurface('space.engage.crm', slug))
  })

  it('falls through to the full route for a non-panel surface', () => {
    // Basics has no panel, so the rail keeps opening its standalone editor.
    expect(panelHrefForSurface('space.basics', slug)).toBe(`/spaces/${slug}/settings/basics`)
    expect(panelHrefForSurface('space.basics', slug)).toBe(hrefForSurface('space.basics', slug))
  })

  it('preserves the nullable contract for a surface with no route (Danger)', () => {
    expect(panelHrefForSurface('space.danger', slug)).toBeNull()
  })
})
