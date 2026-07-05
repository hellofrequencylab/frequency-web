import { describe, it, expect } from 'vitest'
import { hrefForSurface, panelHrefForSurface, panelHrefForModule } from './surface-hrefs'
import { spaceModuleById } from '@/lib/admin/modules/space-modules'

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

  // Modular menu P2 (ADR-545): the six independent commerce surfaces now open inline like Members, instead
  // of deep-linking to their /settings/* page.
  const commerce: [string, string][] = [
    ['space.booking', 'booking'],
    ['space.memberships', 'memberships'],
    ['space.donations', 'donations'],
    ['space.enroll', 'enroll'],
    ['space.tickets', 'tickets'],
    ['space.checkin', 'checkin'],
  ]

  it.each(commerce)('opens %s inline via ?panel=%s (was a /settings/* deep link)', (id, panel) => {
    expect(panelHrefForSurface(id, slug)).toBe(`/spaces/${slug}?panel=${panel}`)
    expect(panelHrefForSurface(id, slug)).not.toBe(hrefForSurface(id, slug))
  })
})

// panelHrefForModule (the /manage console + rail module href): prefer the module's on-page panel, else its
// deepLink. P2 adds the six commerce modules to the panel map, so each opens inline.
describe('panelHrefForModule (module-first inline panel)', () => {
  const slug = 'demo'

  const commerceModules: [string, string][] = [
    ['space.booking', 'booking'],
    ['space.memberships', 'memberships'],
    ['space.donations', 'donations'],
    ['space.enroll', 'enroll'],
    ['space.tickets', 'tickets'],
    ['space.checkin', 'checkin'],
  ]

  it.each(commerceModules)('%s → ?panel=%s (not its /settings/* deepLink)', (moduleId, panel) => {
    const mod = spaceModuleById(moduleId)
    expect(mod).not.toBeNull()
    expect(panelHrefForModule(mod!, slug)).toBe(`/spaces/${slug}?panel=${panel}`)
  })

  it('falls through to the deepLink for a module with no panel (Insights)', () => {
    const insights = spaceModuleById('space.insights')
    expect(insights).not.toBeNull()
    expect(panelHrefForModule(insights!, slug)).toBe(`/spaces/${slug}/settings/qr#scans`)
  })
})
