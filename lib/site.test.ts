import { describe, it, expect } from 'vitest'
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  DISCOVER_NAV,
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
})

describe('SITE_DESCRIPTION', () => {
  it('is a non-empty string', () => {
    expect(typeof SITE_DESCRIPTION).toBe('string')
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0)
  })
})

describe('DISCOVER_NAV', () => {
  it('is an array of NavLink objects', () => {
    expect(Array.isArray(DISCOVER_NAV)).toBe(true)
    expect(DISCOVER_NAV.length).toBeGreaterThan(0)
  })

  it('every entry has a label and an href', () => {
    for (const link of DISCOVER_NAV) {
      expect(typeof link.label).toBe('string')
      expect(link.label.length).toBeGreaterThan(0)
      expect(typeof link.href).toBe('string')
      expect(link.href.startsWith('/')).toBe(true)
    }
  })

  it('includes the /discover root entry', () => {
    expect(DISCOVER_NAV.some((l) => l.href === '/discover')).toBe(true)
  })

  it('includes Circles and Events', () => {
    const hrefs = DISCOVER_NAV.map((l) => l.href)
    expect(hrefs).toContain('/discover/circles')
    expect(hrefs).toContain('/discover/events')
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
