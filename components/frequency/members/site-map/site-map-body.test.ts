import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FQ_NAV, FQ_SHORTCUTS, FQ_SITE_LINKS, FQ_YOU_LINKS, FEED_HREF } from '@/components/frequency/members/shell/nav'
import { FQ_SITE_MAP } from './site-map-body'

// The member site map is never shorter than the header: every mega menu row, left-rail shortcut,
// You-tab link and website link has a place on /site-map, and every link on it is a real route.

const mapped = new Set(FQ_SITE_MAP.flatMap((c) => c.links.map((l) => l.href)))

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

  it('points every member link at a page that exists', () => {
    const root = process.cwd()
    const missing = [...mapped].filter((href) => {
      const seg = href.replace(/^\//, '').split('?')[0]
      return !['(main)', '(marketing)', '(help)'].some((g) => existsSync(join(root, 'app', g, seg, 'page.tsx')))
    })
    expect(missing).toEqual([])
  })
})
