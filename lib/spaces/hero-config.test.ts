import { describe, it, expect } from 'vitest'
import {
  HERO_FIELDS,
  heroHeightClass,
  readHeroConfig,
  sanitizeHeroConfig,
  nextHeroPreferences,
  heroCtaToPreference,
  heroCtaFromPreference,
  resolveHero,
} from './hero-config'

// THE EDITABLE TOP-PAGE HERO contract. The schema must expose the required primitives; the normalizer must be
// tolerant (junk -> defaults, sparse blob); the sanitizer must drop out-of-enum + oversized values; the CTA
// bridge must round-trip through the header-cta model; and the resolver must be total (always a heading + CTA)
// and honor operator overrides atop the Space defaults.

const BASE = '/spaces/river-yoga'

const RESOLVE_DEFAULTS = {
  base: BASE,
  brandName: 'River Yoga',
  tagline: 'Slow, breath-led yoga by the river.',
  defaultCtaLabel: 'Book now',
}

describe('HERO_FIELDS schema', () => {
  it('declares the five sub-item controls with the shared primitive field types', () => {
    const byKey = Object.fromEntries(HERO_FIELDS.map((f) => [f.key, f]))
    expect(byKey.height?.type).toBe('height')
    expect(byKey.buttonOrientation?.type).toBe('buttonOrientation')
    expect(byKey.eyebrow?.type).toBe('text')
    expect(byKey.heading?.type).toBe('text')
    expect(byKey.tagline?.type).toBe('textarea')
    // The CTA (button field pattern): label + link.
    expect(byKey.ctaLabel?.type).toBe('text')
    expect(byKey.ctaUrl?.type).toBe('url')
  })
})

describe('heroHeightClass', () => {
  it('maps each height to a responsive utility (no hardcoded hex, token spacing)', () => {
    expect(heroHeightClass('short')).toContain('h-')
    expect(heroHeightClass('medium')).toBe('h-72 sm:h-[22rem]')
    expect(heroHeightClass('tall')).toContain('h-')
    expect(heroHeightClass('short')).not.toBe(heroHeightClass('tall'))
  })
})

describe('readHeroConfig', () => {
  it('returns an empty config for junk / a missing node (defaults stand)', () => {
    expect(readHeroConfig(null)).toEqual({})
    expect(readHeroConfig({})).toEqual({})
    expect(readHeroConfig({ hero: 'nope' })).toEqual({})
    expect(readHeroConfig([1, 2])).toEqual({})
  })
  it('keeps valid overrides and drops the enum defaults (sparse)', () => {
    expect(readHeroConfig({ hero: { height: 'tall', buttonOrientation: 'stacked' } })).toEqual({
      height: 'tall',
      buttonOrientation: 'stacked',
    })
    // The declared defaults are dropped so the blob stays sparse.
    expect(readHeroConfig({ hero: { height: 'medium', buttonOrientation: 'row' } })).toEqual({})
  })
  it('drops out-of-enum values and trims / bounds text', () => {
    expect(readHeroConfig({ hero: { height: 'huge' } })).toEqual({})
    expect(readHeroConfig({ hero: { eyebrow: '  New  ' } })).toEqual({ eyebrow: 'New' })
    const long = 'x'.repeat(1000)
    const out = readHeroConfig({ hero: { tagline: long } })
    expect((out.tagline ?? '').length).toBeLessThanOrEqual(400)
  })
})

describe('sanitizeHeroConfig', () => {
  it('validates the wire and returns null when nothing survives', () => {
    expect(sanitizeHeroConfig({ height: 'nope', junk: 1 })).toBeNull()
    expect(sanitizeHeroConfig({ height: 'tall' })).toEqual({ height: 'tall' })
    expect(sanitizeHeroConfig(null)).toBeNull()
  })
})

describe('nextHeroPreferences', () => {
  it('writes only the hero node, preserving every other key', () => {
    const next = nextHeroPreferences({ headerCta: { kind: 'function', function: 'book' }, coverScrim: 'blend' }, {
      height: 'tall',
    })
    expect(next).toEqual({
      headerCta: { kind: 'function', function: 'book' },
      coverScrim: 'blend',
      hero: { height: 'tall' },
    })
  })
  it('clears the hero node for an empty / null config', () => {
    expect(nextHeroPreferences({ hero: { height: 'tall' }, coverScrim: 'shade' }, null)).toEqual({
      coverScrim: 'shade',
    })
    expect(nextHeroPreferences({ hero: { height: 'tall' } }, {})).toEqual({})
  })
})

describe('hero CTA bridge (reuses the header-cta model, item 5)', () => {
  it('a label + url becomes a custom override', () => {
    expect(heroCtaToPreference('Visit shop', 'https://shop.example.com')).toEqual({
      kind: 'custom',
      url: 'https://shop.example.com',
      label: 'Visit shop',
    })
  })
  it('a label alone tweaks the default surface label via a function override', () => {
    expect(heroCtaToPreference('Reserve', '')).toEqual({ kind: 'function', function: 'book', label: 'Reserve' })
  })
  it('blank clears the override (default CTA)', () => {
    expect(heroCtaToPreference('', '')).toBeNull()
  })
  it('round-trips a stored preference back to the editor fields', () => {
    expect(heroCtaFromPreference({ kind: 'custom', url: '/x', label: 'Go' })).toEqual({ label: 'Go', url: '/x' })
    expect(heroCtaFromPreference({ kind: 'function', function: 'book', label: 'Reserve' })).toEqual({
      label: 'Reserve',
      url: '',
    })
    expect(heroCtaFromPreference(null)).toEqual({ label: '', url: '' })
  })
})

describe('resolveHero', () => {
  it('is total: falls back to Space defaults for an empty config', () => {
    const hero = resolveHero({ config: {}, preferences: {}, ...RESOLVE_DEFAULTS })
    expect(hero.height).toBe('medium')
    expect(hero.buttonOrientation).toBe('row')
    expect(hero.eyebrow).toBeNull()
    expect(hero.heading).toBe('River Yoga')
    expect(hero.tagline).toBe('Slow, breath-led yoga by the river.')
    expect(hero.cta).toMatchObject({ label: 'Book now', href: `${BASE}/book`, external: false, show: true })
  })
  it('honors operator overrides atop the defaults', () => {
    const hero = resolveHero({
      config: { height: 'tall', buttonOrientation: 'stacked', eyebrow: 'Now open', heading: 'The Studio', tagline: 'Come breathe.' },
      preferences: {},
      ...RESOLVE_DEFAULTS,
    })
    expect(hero.height).toBe('tall')
    expect(hero.buttonOrientation).toBe('stacked')
    expect(hero.eyebrow).toBe('Now open')
    expect(hero.heading).toBe('The Studio')
    expect(hero.tagline).toBe('Come breathe.')
  })
  it('resolves the CTA off the existing preferences.headerCta node (relocation preserves the source)', () => {
    const hero = resolveHero({
      config: {},
      preferences: { headerCta: { kind: 'custom', url: 'https://x.example.com', label: 'Shop' } },
      ...RESOLVE_DEFAULTS,
    })
    expect(hero.cta).toMatchObject({ label: 'Shop', href: 'https://x.example.com', external: true, show: true })
  })
})
