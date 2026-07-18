import { describe, it, expect } from 'vitest'
import {
  sectionForModule,
  isSettingsModule,
  asHubSection,
  hubSearchItems,
  SPACE_HUB_SECTIONS,
  SPACE_HUB_SECTION_LABEL,
} from './space-hub'
import { SPACE_MODULES, spaceModuleById } from './space-modules'

// ADR-785: the four-category Manage hub + the header-level Profile & Settings surface. Every module maps to
// exactly one section OR is explicitly excluded (the Page module) — nothing is orphaned.

describe('sectionForModule (the hub IA)', () => {
  it('assigns every catalog module to a section or explicitly excludes it (no orphan)', () => {
    const KNOWN = new Set(['resonance', 'marketing', 'offerings', 'programs', 'settings'])
    const EXCLUDED = new Set(['space.layout']) // Page editing lives on the admin rail now, not the hub
    for (const m of SPACE_MODULES) {
      const section = sectionForModule(m)
      if (EXCLUDED.has(m.id)) {
        expect(section, `${m.id} should be excluded from the hub`).toBeNull()
      } else {
        expect(KNOWN.has(section as string), `${m.id} landed in unknown section ${section}`).toBe(true)
      }
    }
  })

  it('routes the CRM relationship + inbox cluster to Resonance', () => {
    for (const id of ['space.crm', 'space.inbox', 'space.leads', 'space.doors', 'space.shared']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('resonance')
    }
  })

  it('routes the reach + growth surfaces to Marketing (Audience + Reach combined)', () => {
    for (const id of ['space.comms', 'space.marketing', 'space.emailstyle', 'space.reach', 'space.insights', 'space.automation']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('marketing')
    }
  })

  it('routes the commerce surfaces to Offerings & Money', () => {
    for (const id of ['space.booking', 'space.memberships', 'space.donations', 'space.enroll', 'space.tickets', 'space.checkin', 'space.services']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('offerings')
    }
  })

  it('routes the practitioner content to Content & Programs', () => {
    for (const id of ['space.practices', 'space.journeys', 'space.airwaves']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('programs')
    }
  })

  it('puts identity + Team + Reviews + Plan & Billing + Danger on the Profile & Settings tab', () => {
    for (const id of ['space.basics', 'space.people', 'space.reviews', 'space.billing', 'space.danger']) {
      expect(isSettingsModule(spaceModuleById(id)!), `${id} belongs to Profile & Settings`).toBe(true)
    }
    // Profile & Settings is a real hub tab (ADR-788) so Plan & Billing is reachable in one tap.
    expect(SPACE_HUB_SECTIONS.some((s) => s.key === 'settings')).toBe(true)
    expect(SPACE_HUB_SECTIONS[SPACE_HUB_SECTIONS.length - 1].key).toBe('settings') // trails the browse tabs
  })
})

describe('asHubSection', () => {
  it('defaults to Resonance and validates the section param', () => {
    expect(asHubSection(undefined)).toBe('resonance')
    expect(asHubSection('bogus')).toBe('resonance')
    expect(asHubSection('marketing')).toBe('marketing')
    expect(asHubSection('settings')).toBe('settings') // Profile & Settings is a real tab now (ADR-788)
  })
})

describe('hubSearchItems', () => {
  const items = hubSearchItems('demo')

  it('surfaces a labelled, in-space, sectioned item for every non-excluded module except Danger', () => {
    expect(items.length).toBeGreaterThan(10)
    for (const it of items) {
      expect(it.label).toBeTruthy()
      expect(it.href).toMatch(/^\/spaces\/demo[/?]/)
      expect(Object.values(SPACE_HUB_SECTION_LABEL)).toContain(it.section)
    }
    const labels = items.map((i) => i.label)
    expect(labels).toContain('CRM')
    expect(labels).toContain('Email')
    expect(labels).not.toContain('Danger zone') // not a search destination
    expect(labels).not.toContain('Page') // excluded from the hub
  })
})
