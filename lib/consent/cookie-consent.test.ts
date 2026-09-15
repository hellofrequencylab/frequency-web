// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  CONSENT_COOKIE,
  CONSENT_REGION_COOKIE,
  PRIOR_CONSENT_COUNTRIES,
  analyticsAllowed,
  cookiesToClearOnWithdrawal,
  gaBootstrapScript,
  parseConsentChoice,
  requiresPriorConsent,
  shouldAskForConsent,
  type ConsentChoice,
} from './cookie-consent'

// ── 🔴 THE ORDERING ARM (OWN-061). A SOURCE-SHAPE GUARD CANNOT CATCH THIS ───────────────────────
//
// The ruling says so out loud: "a banner that gates GA4 but lets the attribution cookie set on
// first paint is not consent, it is a banner ... the defect is ordering at runtime". A grep for
// "consent" in google-analytics.tsx passes whether or not the tag actually waits. So this file does
// not read the source. It EXECUTES the real head string — the exact bytes the root layout ships —
// in a real DOM, with a real `document.cookie`, and then asks the only question that matters:
//
//     did a script element pointing at googletagmanager.com get appended, or did it not?
//
// That is the same instrument lib/theme/mode.test.ts uses on the pre-paint bootstrap, and for the
// same reason: the string is the artifact, so the string is what gets run.
//
// The edge half of the same ordering arm (the `fq_attr` write in proxy.ts) is proved the same way
// in proxy-consent.test.ts, by running the real proxy and reading its Set-Cookie headers.

const GA_ID = 'G-TESTID0001'
const TAG_SELECTOR = 'script[src*="googletagmanager.com"]'

/** Clear every cookie jsdom currently holds, so each case starts from a real blank. */
function clearCookies(): void {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

/** Put the DOM into a scenario, then run the REAL head script against it. */
function runBootstrap(opts: { choice?: ConsentChoice; priorConsentRegion?: boolean }): {
  tagLoaded: boolean
  loader: (() => void) | undefined
} {
  clearCookies()
  document.head.querySelectorAll(TAG_SELECTOR).forEach((n) => n.remove())
  delete (window as { __fqGa?: unknown }).__fqGa
  ;(window as { dataLayer?: unknown }).dataLayer = undefined
  if (opts.choice) document.cookie = `${CONSENT_COOKIE}=${opts.choice}; path=/`
  if (opts.priorConsentRegion) document.cookie = `${CONSENT_REGION_COOKIE}=1; path=/`
  new Function(gaBootstrapScript(GA_ID))()
  return {
    tagLoaded: document.head.querySelector(TAG_SELECTOR) !== null,
    loader: (window as { __fqGa?: () => void }).__fqGa,
  }
}

beforeEach(clearCookies)
afterEach(() => {
  clearCookies()
  document.head.querySelectorAll(TAG_SELECTOR).forEach((n) => n.remove())
})

describe('the law', () => {
  it('an un-decided visitor OUTSIDE the prior-consent region is allowed, exactly as before OWN-061', () => {
    expect(analyticsAllowed({ choice: null, priorConsentRegion: false })).toBe(true)
    expect(shouldAskForConsent({ choice: null, priorConsentRegion: false })).toBe(false)
  })

  it('an un-decided visitor INSIDE it is not allowed, and is asked', () => {
    expect(analyticsAllowed({ choice: null, priorConsentRegion: true })).toBe(false)
    expect(shouldAskForConsent({ choice: null, priorConsentRegion: true })).toBe(true)
  })

  it('a recorded choice wins in both regions, and ends the asking', () => {
    for (const priorConsentRegion of [true, false]) {
      expect(analyticsAllowed({ choice: 'granted', priorConsentRegion })).toBe(true)
      expect(analyticsAllowed({ choice: 'denied', priorConsentRegion })).toBe(false)
      expect(shouldAskForConsent({ choice: 'granted', priorConsentRegion })).toBe(false)
      expect(shouldAskForConsent({ choice: 'denied', priorConsentRegion })).toBe(false)
    }
  })

  it('only the two literal values are a choice — a junk cookie is "not decided", never "granted"', () => {
    expect(parseConsentChoice('granted')).toBe('granted')
    expect(parseConsentChoice('denied')).toBe('denied')
    for (const junk of ['', 'true', '1', 'GRANTED', 'yes', null, undefined]) {
      expect(parseConsentChoice(junk)).toBeNull()
    }
  })
})

describe('the region', () => {
  it('covers the EU-27, the three non-EU EEA states and the UK', () => {
    expect(PRIOR_CONSENT_COUNTRIES).toHaveLength(31)
    for (const cc of ['DE', 'FR', 'IE', 'GB', 'NO', 'IS', 'LI']) {
      expect(requiresPriorConsent(cc), cc).toBe(true)
    }
  })

  it('does not cover the places the product actually lives, so their default is untouched', () => {
    for (const cc of ['US', 'CA', 'MX', 'AU', 'JP', 'BR']) {
      expect(requiresPriorConsent(cc), cc).toBe(false)
    }
  })

  it('an ABSENT country is outside the region — the header is missing in dev, never on the edge', () => {
    expect(requiresPriorConsent(null)).toBe(false)
    expect(requiresPriorConsent(undefined)).toBe(false)
    expect(requiresPriorConsent('')).toBe(false)
  })

  it('is case- and whitespace-insensitive, because a header is not a typed value', () => {
    expect(requiresPriorConsent('de')).toBe(true)
    expect(requiresPriorConsent(' gb ')).toBe(true)
  })
})

describe('🔴 the GA4 tag does not reach the wire before a choice is recorded', () => {
  it('EU/UK visitor, no choice: NOTHING is appended', () => {
    const { tagLoaded } = runBootstrap({ priorConsentRegion: true })
    expect(tagLoaded, 'gtag.js loaded for a visitor who was never asked').toBe(false)
  })

  it('EU/UK visitor who declined: NOTHING is appended', () => {
    const { tagLoaded } = runBootstrap({ priorConsentRegion: true, choice: 'denied' })
    expect(tagLoaded).toBe(false)
  })

  it('EU/UK visitor who allowed: the tag loads, configured exactly as ADR-048 requires', () => {
    const { tagLoaded } = runBootstrap({ priorConsentRegion: true, choice: 'granted' })
    expect(tagLoaded).toBe(true)
    const config = ((window as { dataLayer?: unknown[] }).dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
    const cfg = config.find((args) => args[0] === 'config')
    expect(cfg?.[1]).toBe(GA_ID)
    expect(cfg?.[2]).toMatchObject({
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
  })

  it('NO REGRESSION: a visitor outside the region with no choice still gets the tag', () => {
    const { tagLoaded } = runBootstrap({})
    expect(tagLoaded, 'the existing opt-out default was silently changed').toBe(true)
  })

  it('a visitor outside the region who declined gets nothing — declining works everywhere', () => {
    expect(runBootstrap({ choice: 'denied' }).tagLoaded).toBe(false)
  })

  it('agrees with analyticsAllowed across the whole matrix, so the string cannot drift from the law', () => {
    for (const priorConsentRegion of [true, false]) {
      for (const choice of ['granted', 'denied', undefined] as const) {
        const law = analyticsAllowed({ choice: choice ?? null, priorConsentRegion })
        const ran = runBootstrap({ choice, priorConsentRegion })
        expect(ran.tagLoaded, `head script disagrees with the law for ${choice}/${priorConsentRegion}`).toBe(law)
      }
    }
  })
})

describe('the loader is one function, defined once, callable twice', () => {
  it('is exposed even when the answer was no, so accepting later starts GA without a reload', () => {
    const { tagLoaded, loader } = runBootstrap({ priorConsentRegion: true })
    expect(tagLoaded).toBe(false)
    expect(typeof loader).toBe('function')
    loader!()
    expect(document.head.querySelector(TAG_SELECTOR)).not.toBeNull()
  })

  it('is idempotent — calling it again never appends a second tag', () => {
    const { loader } = runBootstrap({ priorConsentRegion: true })
    loader!()
    loader!()
    loader!()
    expect(document.head.querySelectorAll(TAG_SELECTOR)).toHaveLength(1)
  })

  it('honours the staff opt-out flag before the first config call', () => {
    localStorage.setItem('freq-ga-optout', '1')
    try {
      runBootstrap({ choice: 'granted' })
      expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]).toBe(true)
    } finally {
      localStorage.removeItem('freq-ga-optout')
      delete (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]
    }
  })
})

describe('withdrawal clears the storage the permission paid for', () => {
  it('names the attribution cookies and every GA cookie present', () => {
    const jar = '_ga=GA1.1.x; _ga_G12345=GS1.1.y; fq_attr=%7B%7D; fq_src=referral; sb-access-token=keepme'
    const cleared = cookiesToClearOnWithdrawal(jar)
    expect(cleared).toEqual(expect.arrayContaining(['fq_attr', 'fq_src', '_ga', '_ga_G12345']))
    expect(cleared, 'the session cookie is essential and must never be cleared').not.toContain('sb-access-token')
  })
})
