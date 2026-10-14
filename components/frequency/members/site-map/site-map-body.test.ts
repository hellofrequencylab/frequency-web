import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FQ_NAV, FQ_SHORTCUTS, FQ_SITE_LINKS, FQ_YOU_LINKS, FEED_HREF } from '@/components/frequency/members/shell/nav'
import { SITE_MAP, canSeeLink, siteMapFor, websiteLinks } from './site-map-body'

// The member site map is never shorter than the header: every mega menu row, left-rail shortcut,
// You-tab link and website link has a place on /site-map, and every link on it is a real route.
// (components/frequency/members/shell/nav-coverage.test.ts holds the same line against the live DAWN
// chrome, and checks the map's gates against the menus'.)

const mapped = new Set(SITE_MAP.flatMap((c) => c.links.map((l) => l.href)))

/** The viewer's own profile is `{profile}` in the menu; the map links /profile, which resolves it. */
const resolve = (href: string) => (href === '{profile}' ? '/profile' : href)

describe('the Frequency site map', () => {
  it('lists every page the member header and rails offer', () => {
    const menu = [
      FEED_HREF,
      ...FQ_NAV.flatMap((s) => s.cols.flatMap((c) => c.items.map((i) => i.href))),
      ...FQ_SHORTCUTS.map((i) => i.href),
      ...FQ_YOU_LINKS.map((i) => i.href),
    ]
      .map(resolve)
      // The website's home is listed with the website, under the member columns.
      .filter((h) => !FQ_SITE_LINKS.some((l) => l.href === h))
    const missing = [...new Set(menu)].filter((h) => !mapped.has(h))
    expect(missing).toEqual([])
  })

  it('carries the mega menu site row on the Frequency website row', () => {
    const site = websiteLinks('frequency').map((l) => l.href)
    for (const l of FQ_SITE_LINKS) expect(site).toContain(l.href)
  })

  it('points every member link at a page that exists', () => {
    const root = process.cwd()
    const missing = [...mapped].filter((href) => {
      const seg = href.replace(/^\//, '').split(/[?#]/)[0]
      return !['(main)', '(marketing)', '(help)'].some((g) => existsSync(join(root, 'app', g, seg, 'page.tsx')))
    })
    expect(missing).toEqual([])
  })
})

describe('the site map is gated like the menus', () => {
  const hrefs = (cols: ReturnType<typeof siteMapFor>) => cols.flatMap((c) => c.links.map((l) => l.href))

  it('a member sees no Admin column and no host-only row', () => {
    const cols = siteMapFor({ role: 'member', staffRole: null })
    expect(cols.map((c) => c.area)).not.toContain('Admin')
    expect(hrefs(cols)).not.toContain('/market/manage')
    expect(hrefs(cols)).toContain('/messages')
  })

  it('a janitor sees every Admin row the rail declares', () => {
    const admin = SITE_MAP.find((c) => c.area === 'Admin')!
    expect(admin.links.length).toBeGreaterThan(5)
    const cols = siteMapFor({ role: 'janitor', staffRole: null })
    expect(cols.find((c) => c.area === 'Admin')?.links.length).toBe(admin.links.length)
  })

  it('a visitor preview sees only the ungated links', () => {
    expect(canSeeLink({ label: 'x', href: '/messages', gate: { minAccess: 'member' } }, { role: null, staffRole: null })).toBe(false)
    expect(canSeeLink({ label: 'x', href: '/feed' }, { role: null, staffRole: null })).toBe(true)
  })
})
