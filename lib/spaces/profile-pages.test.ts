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
  withoutPageDoc,
  addPage,
  renamePage,
  removePage,
  reorderPages,
  planAddPage,
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

describe('withoutPageDoc (per-page reset)', () => {
  it('drops a page doc, keeps the page + other docs, and is immutable', () => {
    let prefs: unknown = addPage({}, 'classes', 'Classes')
    prefs = withPageDoc(prefs, 'classes', DOC)
    prefs = withPageDoc(prefs, 'home', DOC)
    const before = JSON.parse(JSON.stringify(prefs))
    const next = withoutPageDoc(prefs, 'classes')
    // the page stays in the nav, only its stored doc is dropped
    expect(hasPage(next, 'classes')).toBe(true)
    expect(readPageDoc(next, 'classes')).toBeNull()
    // a sibling page's doc is untouched
    expect(readPageDoc(next, 'home')).toEqual(DOC)
    // input untouched
    expect(prefs).toEqual(before)
  })

  it('resetting Home also clears the legacy single doc so it never revives', () => {
    // a pre-model Space stored one doc at preferences.puck; readPageDoc('home') falls back to it
    const legacy = { puck: DOC }
    expect(readPageDoc(legacy, HOME_SLUG)).toEqual(DOC)
    const next = withoutPageDoc(legacy, HOME_SLUG)
    expect(readPageDoc(next, HOME_SLUG)).toBeNull()
  })

  it('is a safe no-op clone when the page had no stored doc', () => {
    const prefs = addPage({}, 'classes', 'Classes')
    expect(readPageDoc(withoutPageDoc(prefs, 'classes'), 'classes')).toBeNull()
    expect(hasPage(withoutPageDoc(prefs, 'classes'), 'classes')).toBe(true)
  })
})

describe('planAddPage (nav-manager create guardrails)', () => {
  it('derives + returns the slug for a valid new label', () => {
    const plan = planAddPage({}, '  Our Classes  ')
    expect(plan).toEqual({ ok: true, slug: 'our-classes', label: 'Our Classes' })
  })

  it('rejects each guardrail with a distinct reason, in order', () => {
    expect(planAddPage({}, '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(planAddPage({}, '***')).toEqual({ ok: false, reason: 'unsluggable' })
    expect(planAddPage({}, 'Manage')).toEqual({ ok: false, reason: 'reserved' })
    expect(planAddPage({}, 'Book')).toEqual({ ok: false, reason: 'reserved' })
    // a duplicate of an existing custom page
    const withClasses = addPage({}, 'classes', 'Classes')
    expect(planAddPage(withClasses, 'Classes')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('reports the cap once the nav is full (Home + customs = MAX_PROFILE_PAGES)', () => {
    let prefs: unknown = {}
    for (let i = 0; i < MAX_PROFILE_PAGES - 1; i++) prefs = addPage(prefs, `p${i}`, `P${i}`)
    expect(readProfilePages(prefs).length).toBe(MAX_PROFILE_PAGES)
    expect(planAddPage(prefs, 'One More')).toEqual({ ok: false, reason: 'cap' })
    // a lower cap override reports the cap earlier (the panel warns at its own limit)
    expect(planAddPage(addPage({}, 'a', 'A'), 'B', 2)).toEqual({ ok: false, reason: 'cap' })
  })

  it('LOCKED when the Space lacks the paid multi-page upsell (entitled=false), whatever the name', () => {
    // The multi-page profile is a paid upsell; an unentitled Space gets only its one home page. The lock
    // is checked first, so even a valid label reports `locked` (the operator sees the upsell, not a name error).
    expect(planAddPage({}, 'Our Classes', MAX_PROFILE_PAGES, false)).toEqual({ ok: false, reason: 'locked' })
    expect(planAddPage({}, '   ', MAX_PROFILE_PAGES, false)).toEqual({ ok: false, reason: 'locked' })
    // addPage is a no-op for an unentitled Space (defense in depth): only Home remains.
    expect(readProfilePages(addPage({}, 'classes', 'Classes', false)).map((p) => p.slug)).toEqual(['home'])
    // Entitled (the default) keeps the existing behavior: the page is planned + added.
    expect(planAddPage({}, 'Our Classes').ok).toBe(true)
    expect(readProfilePages(addPage({}, 'classes', 'Classes')).map((p) => p.slug)).toEqual(['home', 'classes'])
  })
})
