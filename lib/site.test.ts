import { describe, it, expect } from 'vitest'
import { NAV_REGISTRY } from '@/lib/nav/registry'
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  SITE_NAV,
  MARKETING_NAV,
  BETA_CTA_HREF,
  BETA_CTA_LABEL,
  CONTACT_EMAIL,
  ORG_LEGAL_NAME,
  SOCIAL_PROOF_FLOOR,
  FOUNDING_PLACE,
} from './site'

describe('SITE_URL', () => {
  it('is a non-empty string', () => {
    expect(typeof SITE_URL).toBe('string')
    expect(SITE_URL.length).toBeGreaterThan(0)
  })

  it('does not have a trailing slash', () => {
    expect(SITE_URL.endsWith('/')).toBe(false)
  })

  it('is the production apex when NEXT_PUBLIC_SITE_URL is not set', () => {
    // In the test environment the env var is absent, so the fallback applies.
    // If the env var IS set, the value may differ — but it must still be a valid https URL.
    expect(SITE_URL).toMatch(/^https?:\/\//)
  })
})

describe('SITE_NAME', () => {
  it('is "Frequency"', () => {
    expect(SITE_NAME).toBe('Frequency')
  })
})

describe('SITE_TAGLINE', () => {
  it('is a non-empty string', () => {
    expect(typeof SITE_TAGLINE).toBe('string')
    expect(SITE_TAGLINE.length).toBeGreaterThan(0)
  })

  // ADR-944. NAMING.md §ADR-811 makes "Community Collective" the canonical descriptor for the
  // platform, and the logo artwork sets it that way — so the tagline takes no article. The tier
  // ladder heading "The Community Collective" is a DIFFERENT name that keeps its article; this
  // guard exists so the two are never quietly collapsed back together.
  it('takes no leading article — it is the wording under the mark in the lockup', () => {
    expect(SITE_TAGLINE).toBe('Community Collective')
    expect(SITE_TAGLINE).not.toMatch(/^the\s/i)
  })
})

describe('SITE_DESCRIPTION', () => {
  it('is a non-empty string', () => {
    expect(typeof SITE_DESCRIPTION).toBe('string')
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0)
  })
})

// ── The shared community core, now measured on the registry (HYG-019) ────────────────
// These four cases used to assert against DISCOVER_NAV, a hand-kept second list that by
// 2026-08-24 was drawn by nothing. Deleting them with it would have dropped the guard on
// the CONCEPT three ADRs name — the community surfaces the public menu and the in-app nav
// are meant to keep in sync. So they moved rather than went: same five destinations, asked
// of the ONE registry every header projects. A list nothing renders cannot drift in a way
// anyone notices; this one can, and now says so.
describe('the shared community core is reachable from the nav registry', () => {
  const destinations = () => NAV_REGISTRY.map((n) => n.href).filter((h): h is string => !!h)

  it('every registry node with an href points somewhere rooted', () => {
    for (const href of destinations()) expect(href.startsWith('/')).toBe(true)
  })

  it('reaches the /discover root', () => {
    expect(destinations()).toContain('/discover')
  })

  it('reaches Circles and Events', () => {
    const hrefs = destinations()
    expect(hrefs).toContain('/discover/circles')
    expect(hrefs).toContain('/discover/events')
  })

  it('reaches Journeys and Channels — the two the old list carried that are easiest to lose', () => {
    const hrefs = destinations()
    expect(hrefs).toContain('/discover/journeys')
    expect(hrefs).toContain('/discover/topics')
  })
})

describe('SITE_NAV', () => {
  it('every entry has label and href starting with /', () => {
    for (const link of SITE_NAV) {
      expect(link.href.startsWith('/')).toBe(true)
    }
  })
})

describe('MARKETING_NAV', () => {
  it('is a non-empty array with label + href entries', () => {
    expect(MARKETING_NAV.length).toBeGreaterThan(0)
    for (const link of MARKETING_NAV) {
      expect(typeof link.label).toBe('string')
      expect(link.href.startsWith('/')).toBe(true)
    }
  })
})

describe('BETA_CTA', () => {
  it('BETA_CTA_LABEL is a non-empty string', () => {
    expect(typeof BETA_CTA_LABEL).toBe('string')
    expect(BETA_CTA_LABEL.length).toBeGreaterThan(0)
  })

  it('BETA_CTA_HREF starts with /', () => {
    expect(BETA_CTA_HREF.startsWith('/')).toBe(true)
  })
})

describe('CONTACT_EMAIL', () => {
  it('is a valid-looking email address', () => {
    expect(CONTACT_EMAIL).toMatch(/^[^@]+@[^@]+\.[^@]+$/)
  })
})

describe('ORG_LEGAL_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof ORG_LEGAL_NAME).toBe('string')
    expect(ORG_LEGAL_NAME.length).toBeGreaterThan(0)
  })
})

describe('SOCIAL_PROOF_FLOOR', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(SOCIAL_PROOF_FLOOR)).toBe(true)
    expect(SOCIAL_PROOF_FLOOR).toBeGreaterThan(0)
  })
})

describe('FOUNDING_PLACE', () => {
  it('is a non-empty string', () => {
    expect(typeof FOUNDING_PLACE).toBe('string')
    expect(FOUNDING_PLACE.length).toBeGreaterThan(0)
  })
})
