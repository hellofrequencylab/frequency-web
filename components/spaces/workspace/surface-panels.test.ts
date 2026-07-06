import { describe, it, expect } from 'vitest'
import { SURFACE_PANELS, PANEL_SURFACE_TO_ID, isPanelId } from './surface-panels'

// The inline-panel registry (Stage D1 → modular menu P2, ADR-545). This PURE module is the single source
// of the panel id → { label, fullHref } map + the rail's space surface id → panel id translation. P2 adds
// the six independent commerce service panels (Booking / Memberships / Donations / Enrollment / Tickets /
// Check in) alongside the D1–D5 panels, so the seven commerce services all open INLINE like Members.

describe('SURFACE_PANELS — the inline commerce service panels (P2)', () => {
  const slug = 'demo'

  // Panel id → the member-facing label (from the module catalog) it must show, and the /settings/* route
  // its "Open full page" link targets.
  const commerce: [string, string, string][] = [
    ['booking', 'Booking', `/spaces/${slug}/settings/offerings#availability`],
    ['memberships', 'Memberships', `/spaces/${slug}/settings/offerings#memberships`],
    ['donations', 'Donations', `/spaces/${slug}/settings/offerings#donations`],
    ['enroll', 'Enrollment', `/spaces/${slug}/settings/enroll`],
    ['tickets', 'Tickets', `/spaces/${slug}/settings/offerings#tickets`],
    ['checkin', 'Check in', `/spaces/${slug}/settings/offerings#checkin`],
  ]

  it.each(commerce)('%s panel → label "%s", full page %s', (id, label, fullHref) => {
    const panel = SURFACE_PANELS[id]
    expect(panel).toBeDefined()
    expect(panel.label).toBe(label)
    expect(panel.fullHref(slug)).toBe(fullHref)
    // These are narrow managers, not the wide CRM board — never bounded.
    expect(panel.bounded).toBeFalsy()
    expect(isPanelId(id)).toBe(true)
  })

  it('maps each commerce SURFACE id to its panel id so the rail opens it inline', () => {
    expect(PANEL_SURFACE_TO_ID['space.booking']).toBe('booking')
    expect(PANEL_SURFACE_TO_ID['space.memberships']).toBe('memberships')
    expect(PANEL_SURFACE_TO_ID['space.donations']).toBe('donations')
    expect(PANEL_SURFACE_TO_ID['space.enroll']).toBe('enroll')
    expect(PANEL_SURFACE_TO_ID['space.tickets']).toBe('tickets')
    expect(PANEL_SURFACE_TO_ID['space.checkin']).toBe('checkin')
  })

  it('every PANEL_SURFACE_TO_ID target is a real panel id', () => {
    for (const panelId of Object.values(PANEL_SURFACE_TO_ID)) {
      expect(isPanelId(panelId)).toBe(true)
    }
  })

  it('rejects an unknown id', () => {
    expect(isPanelId('space.nope')).toBe(false)
    expect(isPanelId(undefined)).toBe(false)
  })
})
