import { describe, expect, it } from 'vitest'
import {
  headerLogoSlot,
  isMenuHref,
  parseHeaderLogo,
  parseSiteMenu,
  readHeaderLogo,
  readSiteMenu,
  resolveSiteMenu,
  withSiteMenu,
  type MenuCatalogEntry,
  type SiteMenu,
} from './site-menu'

const spaceCatalog: MenuCatalogEntry[] = [
  { key: 'home', label: 'Home', href: '/spaces/dt' },
  { key: 'anchor:offerings', label: 'Offerings', href: '/spaces/dt#offerings' },
  { key: 'feature:calendar', label: 'Calendar', href: '/spaces/dt/calendar' },
  { key: 'feature:circles', label: 'Circles', href: '/spaces/dt/circles' },
  { key: 'page:about', label: 'About', href: '/spaces/dt/about' },
]

const menu = (items: SiteMenu['items'], known = ['feature:calendar', 'feature:circles', 'page:about']): SiteMenu => ({ v: 1, items, known })

describe('resolveSiteMenu', () => {
  it('keeps the automatic menu with no saved menu or on a Free plan', () => {
    expect(resolveSiteMenu(null, spaceCatalog, 'space', { canEdit: true })).toBeNull()
    const saved = menu([{ id: 'a', label: 'About', visibility: 'both', target: { kind: 'auto', key: 'page:about' } }])
    expect(resolveSiteMenu(saved, spaceCatalog, 'space', { canEdit: false })).toBeNull()
  })

  it('draws the saved order and labels, filtered by where each item shows', () => {
    const saved = menu([
      { id: 'c', label: 'Our calendar', visibility: 'both', target: { kind: 'auto', key: 'feature:calendar' } },
      { id: 'h', label: 'Home', visibility: 'both', target: { kind: 'auto', key: 'home' } },
      { id: 'w', label: 'Shop on Etsy', visibility: 'website', target: { kind: 'url', href: 'https://etsy.com/x' } },
      { id: 's', label: 'Circles', visibility: 'space', target: { kind: 'auto', key: 'feature:circles' } },
    ])
    const space = resolveSiteMenu(saved, spaceCatalog, 'space', { canEdit: true })!
    // About was on offer at save time and is not in the list, so the owner removed it: it stays out.
    expect(space.map((l) => l.label)).toEqual(['Our calendar', 'Home', 'Circles'])
    const site = resolveSiteMenu(saved, spaceCatalog, 'website', { canEdit: true })!
    expect(site.map((l) => l.label)).toEqual(['Our calendar', 'Home', 'Shop on Etsy'])
    expect(site[2]).toMatchObject({ href: 'https://etsy.com/x', external: true })
  })

  it('drops an item whose feature is off, and uses the fallback the platform offers', () => {
    const saved = menu([
      { id: 'r', label: 'Reviews', visibility: 'both', target: { kind: 'auto', key: 'feature:reviews' } },
      { id: 'c', label: 'Calendar', visibility: 'both', target: { kind: 'auto', key: 'feature:calendar' } },
    ])
    expect(resolveSiteMenu(saved, spaceCatalog, 'space', { canEdit: true })!.map((l) => l.label)).not.toContain('Reviews')
    const site = resolveSiteMenu(saved, [], 'website', { canEdit: true, fallbackHref: (k) => (k === 'feature:reviews' ? 'https://frequencylocal.com/spaces/dt/reviews' : null) })!
    expect(site.map((l) => l.label)).toEqual(['Reviews'])
  })

  it('adds a feature or page that appeared after the save to the end, but never re-adds one the owner removed', () => {
    const saved = menu([{ id: 'h', label: 'Home', visibility: 'both', target: { kind: 'auto', key: 'home' } }], ['feature:calendar', 'page:about'])
    const out = resolveSiteMenu(saved, spaceCatalog, 'space', { canEdit: true })!
    // Calendar and About were known (the owner removed them); Circles is new; anchors never auto-join.
    expect(out.map((l) => l.label)).toEqual(['Home', 'Circles'])
  })

  it('draws a dropdown as a mega panel and drops it when none of its links resolve', () => {
    const saved = menu([
      {
        id: 'd',
        label: 'Sessions',
        visibility: 'both',
        children: [
          { label: 'Calendar', desc: 'What is coming up', target: { kind: 'auto', key: 'feature:calendar' } },
          { label: 'Gone', target: { kind: 'auto', key: 'feature:shop' } },
        ],
        feature: { title: 'Book a call', target: { kind: 'url', href: 'https://cal.com/dt' }, img: 'https://img.test/a.jpg' },
      },
      { id: 'e', label: 'Empty', visibility: 'both', children: [{ label: 'Gone', target: { kind: 'auto', key: 'feature:shop' } }] },
    ])
    const [d, ...rest] = resolveSiteMenu(saved, spaceCatalog, 'space', { canEdit: true })!
    expect(d.label).toBe('Sessions')
    expect(d.mega?.links).toEqual([{ label: 'Calendar', desc: 'What is coming up', href: '/spaces/dt/calendar' }])
    expect(d.mega?.feature).toMatchObject({ title: 'Book a call', href: 'https://cal.com/dt', img: 'https://img.test/a.jpg' })
    expect(rest.map((l) => l.label)).not.toContain('Empty')
  })
})

describe('parseSiteMenu', () => {
  it('drops unsafe links, bad keys and duplicate ids, and caps the list', () => {
    const parsed = parseSiteMenu({
      items: [
        { id: 'a', label: 'Bad', visibility: 'both', target: { kind: 'url', href: 'javascript:alert(1)' } },
        { id: 'b', label: 'Plain http', visibility: 'both', target: { kind: 'url', href: 'http://x.test' } },
        { id: 'c', label: 'Ok', visibility: 'nope', target: { kind: 'url', href: '/about' } },
        { id: 'c', label: 'Dup', visibility: 'both', target: { kind: 'url', href: '/x' } },
        { id: 'd', label: 'Key', visibility: 'space', target: { kind: 'auto', key: 'feature:Calendar!' } },
        ...Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: `L${i}`, visibility: 'both', target: { kind: 'url', href: '#x' } })),
      ],
      known: ['feature:shop', 'bogus', 5],
    })!
    expect(parsed.items[0]).toEqual({ id: 'c', label: 'Ok', visibility: 'both', target: { kind: 'url', href: '/about' } })
    expect(parsed.items.length).toBe(24)
    expect(parsed.known).toEqual(['feature:shop'])
  })

  it('round-trips through preferences without touching other keys', () => {
    const saved = menu([{ id: 'h', label: 'Home', visibility: 'both', target: { kind: 'auto', key: 'home' } }])
    const prefs = withSiteMenu({ theme: 'bold' }, saved)
    expect(prefs.theme).toBe('bold')
    expect(readSiteMenu(prefs)).toEqual(saved)
    expect(readSiteMenu(withSiteMenu(prefs, null))).toBeNull()
  })
})

describe('isMenuHref', () => {
  it('allows https, mailto, tel, site paths and anchors only', () => {
    for (const ok of ['https://a.test', 'mailto:hi@a.test', 'tel:+15555551234', '/about', '#faq']) expect(isMenuHref(ok)).toBe(true)
    for (const bad of ['http://a.test', 'javascript:alert(1)', '//evil.test', 'about us', 'data:text/html,x']) expect(isMenuHref(bad)).toBe(false)
  })
})

describe('the header logo', () => {
  it('defaults to the image beside the name', () => {
    expect(readHeaderLogo(null)).toEqual({ mode: 'image_name', logoUrl: null })
    expect(headerLogoSlot(readHeaderLogo(null), 'https://img.test/a.png')).toEqual({ image: 'https://img.test/a.png', shape: 'round', showName: true })
  })

  it('turns the image off, or shows an uploaded logo alone', () => {
    expect(headerLogoSlot({ mode: 'name', logoUrl: null }, 'https://img.test/a.png')).toEqual({ image: null, shape: null, showName: true })
    expect(headerLogoSlot({ mode: 'logo', logoUrl: 'https://img.test/w.svg' }, null)).toEqual({ image: 'https://img.test/w.svg', shape: 'logo', showName: false })
  })

  it('refuses logo mode without an upload, and unsafe image addresses', () => {
    expect(parseHeaderLogo({ mode: 'logo', logoUrl: null })).toBeNull()
    expect(parseHeaderLogo({ mode: 'logo', logoUrl: 'javascript:x' })).toBeNull()
    expect(parseHeaderLogo({ mode: 'name', logoUrl: '' })).toEqual({ mode: 'name', logoUrl: null })
  })
})
