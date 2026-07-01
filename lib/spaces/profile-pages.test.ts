import { describe, it, expect } from 'vitest'
import {
  defaultProfilePages,
  readProfilePages,
  isValidPageSlug,
  isReservedSlug,
  slugifyLabel,
  readPageDoc,
  resolveSpacePageDoc,
  hasPage,
  withPageDoc,
  addPage,
  renamePage,
  removePage,
  reorderPages,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from './profile-pages'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'

const DOC = generateDefaultSpacePage('Willow') // a known-renderable doc

describe('slug validation', () => {
  it('accepts url-safe kebab custom slugs, rejects reserved + malformed', () => {
    expect(isValidPageSlug('classes')).toBe(true)
    expect(isValidPageSlug('about-us')).toBe(true)
    expect(isValidPageSlug('Classes')).toBe(true) // normalized to lowercase
    expect(isValidPageSlug('')).toBe(false)
    expect(isValidPageSlug('has space')).toBe(false)
    expect(isValidPageSlug('trailing-')).toBe(false)
    // reserved: home + owner-route segments + the reserved /book action page
    for (const r of ['home', 'manage', 'settings', 'crm', 'edit-page', 'book']) {
      expect(isReservedSlug(r)).toBe(true)
      expect(isValidPageSlug(r)).toBe(false)
    }
  })

  it('slugifies a human label to a url-safe slug', () => {
    expect(slugifyLabel('Classes & Workshops')).toBe('classes-workshops')
    expect(slugifyLabel('  About Us!  ')).toBe('about-us')
    expect(slugifyLabel('***')).toBe('')
  })
})

describe('readProfilePages', () => {
  it('defaults to just the required Home index for a malformed / empty blob', () => {
    expect(readProfilePages(undefined)).toEqual(defaultProfilePages())
    expect(readProfilePages({})).toEqual(defaultProfilePages())
    expect(readProfilePages({ pages: 'nope' })).toEqual(defaultProfilePages())
    expect(defaultProfilePages()).toEqual([{ slug: 'home', label: 'Home', system: true }])
  })

  it('keeps valid custom pages, pins Home first, drops reserved/invalid/dupes', () => {
    const pages = readProfilePages({
      pages: [
        { slug: 'classes', label: 'Classes' },
        { slug: 'manage', label: 'Sneaky' }, // reserved -> dropped
        { slug: 'classes', label: 'Dupe' }, // dup -> dropped
        { slug: 'about', label: 'About' },
      ],
    })
    expect(pages[0]).toEqual({ slug: 'home', label: 'Home', system: true })
    expect(pages.map((p) => p.slug)).toEqual(['home', 'classes', 'about'])
  })

  it('honors a customized Home label and caps the nav length', () => {
    expect(readProfilePages({ pages: [{ slug: 'home', label: 'Start' }] })[0].label).toBe('Start')
    const many = Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}`, label: `P${i}` }))
    expect(readProfilePages({ pages: many }).length).toBe(MAX_PROFILE_PAGES)
  })
})

describe('readPageDoc + resolveSpacePageDoc', () => {
  it('reads pageDocs[slug] when valid', () => {
    expect(readPageDoc({ pageDocs: { classes: DOC } }, 'classes')).toEqual(DOC)
    expect(readPageDoc({ pageDocs: { classes: { bogus: true } } }, 'classes')).toBeNull()
  })

  it('falls back to the legacy preferences.puck for Home (lazy migration)', () => {
    expect(readPageDoc({ puck: DOC }, HOME_SLUG)).toEqual(DOC)
    // non-home never reads the legacy single doc
    expect(readPageDoc({ puck: DOC }, 'classes')).toBeNull()
    // an explicit pageDocs.home wins over legacy puck
    const other = generateDefaultSpacePage('Other')
    expect(readPageDoc({ puck: DOC, pageDocs: { home: other } }, HOME_SLUG)).toEqual(other)
  })

  it('resolves to the universal default when nothing is stored', () => {
    const resolved = resolveSpacePageDoc({}, 'Willow', 'classes')
    expect(resolved).toEqual(generateDefaultSpacePage('Willow'))
  })
})

describe('pure mutators keep pages + pageDocs consistent', () => {
  it('addPage validates + caps + dedupes, and is immutable', () => {
    const prefs = {}
    const next = addPage(prefs, 'Classes', 'Classes') // slug normalized
    expect(readProfilePages(next).map((p) => p.slug)).toEqual(['home', 'classes'])
    expect(prefs).toEqual({}) // input untouched
    // reserved / invalid / duplicate are no-ops
    expect(readProfilePages(addPage(next, 'manage', 'x')).map((p) => p.slug)).toEqual(['home', 'classes'])
    expect(readProfilePages(addPage(next, 'classes', 'again')).map((p) => p.slug)).toEqual(['home', 'classes'])
  })

  it('renamePage relabels (including Home), removePage drops a custom page + its doc but never Home', () => {
    let prefs: unknown = addPage({}, 'classes', 'Classes')
    prefs = withPageDoc(prefs, 'classes', DOC)
    prefs = renamePage(prefs, 'home', 'Start')
    expect(readProfilePages(prefs)[0].label).toBe('Start')
    prefs = renamePage(prefs, 'classes', 'Our Classes')
    expect(readProfilePages(prefs).find((p) => p.slug === 'classes')!.label).toBe('Our Classes')
    // removing home is a no-op
    expect(readProfilePages(removePage(prefs, 'home')).map((p) => p.slug)).toContain('home')
    // removing a custom page drops the page AND its stored doc
    const removed = removePage(prefs, 'classes')
    expect(hasPage(removed, 'classes')).toBe(false)
    expect(readPageDoc(removed, 'classes')).toBeNull()
  })

  it('reorderPages pins Home first and preserves omitted pages after the listed ones', () => {
    let prefs: unknown = addPage(addPage(addPage({}, 'a', 'A'), 'b', 'B'), 'c', 'C')
    prefs = reorderPages(prefs, ['c', 'a']) // b omitted
    expect(readProfilePages(prefs).map((p) => p.slug)).toEqual(['home', 'c', 'a', 'b'])
    // home can never be moved off the front
    prefs = reorderPages(prefs, ['home', 'b'])
    expect(readProfilePages(prefs)[0].slug).toBe('home')
  })
})
