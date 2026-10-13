import { describe, expect, it } from 'vitest'
import { FEED_HREF, FQ_NAV, FQ_SHORTCUTS, FQ_YOU_LINKS, MEMBER_HOME_HREF, areaFor, homeFeedItem } from './nav'

describe('homeFeedItem (owner, 2026-10-13)', () => {
  it('reads "Home" on the Feed and opens the public home page past the front door', () => {
    expect(homeFeedItem('/feed')).toEqual({ label: 'Home', href: MEMBER_HOME_HREF, icon: 'home' })
    expect(MEMBER_HOME_HREF).toBe('/?home')
  })

  it('reads "Feed" everywhere else and goes to the Feed', () => {
    for (const p of ['/circles', '/events', '/crew', '/settings', '/feedback', '/', '']) {
      expect(homeFeedItem(p)).toEqual({ label: 'Feed', href: FEED_HREF, icon: 'page' })
    }
  })
})

describe('the header sections', () => {
  it('has no Home section: the first item is the Feed / Home link', () => {
    expect(FQ_NAV.map((s) => s.key)).toEqual(['community', 'quest', 'you'])
  })

  it('keeps every row the retired Home menu offered reachable', () => {
    const menu = FQ_NAV.flatMap((s) => s.cols.flatMap((c) => c.items.map((i) => i.href)))
    for (const href of ['/nearby', '/journal', '/search', '/messages', '/codes']) {
      const elsewhere = [...FQ_SHORTCUTS, ...FQ_YOU_LINKS].some((i) => i.href === href)
      expect(menu.includes(href) || elsewhere, href).toBe(true)
    }
    // Phones have no rails, so the menu itself carries the rows the header has no icon for.
    for (const href of ['/nearby', '/journal', '/search', '/codes']) expect(menu, href).toContain(href)
  })

  it('maps the former Home routes onto the remaining areas', () => {
    expect(areaFor('/feed')).toBe('')
    expect(areaFor('/events/abc')).toBe('community')
    expect(areaFor('/nearby')).toBe('community')
    expect(areaFor('/journal')).toBe('you')
    expect(areaFor('/codes')).toBe('you')
    expect(areaFor('/crew/store')).toBe('you')
    expect(areaFor('/crew')).toBe('quest')
  })
})
