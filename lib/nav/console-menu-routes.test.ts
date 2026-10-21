import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ADMIN_NAV_SPECS, STUDIO_LEAVES } from './studio'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { spaceNavItems } from '@/components/frequency/admin/space-console'
import { isConsoleRoute } from './console-route'

// A console menu row must open inside its console. A row whose page is outside the console route rule is
// drawn by the member shell with the whole console nested inside it (the 2026-10-20 Pages regression).
const path = (href: string) => href.split(/[?#]/)[0]

describe('console menu rows open inside the console', () => {
  it('every operator menu row is a console route', () => {
    const byId = new Map(STUDIO_LEAVES.map((l) => [l.id, l]))
    const outside = ADMIN_NAV_SPECS.flatMap((s) => [s.href, ...(s.groups ?? []).flatMap((g) => g.leaves.map((r) => byId.get(r.leaf)!.href))]).filter((href) => !isConsoleRoute(path(href)))
    expect(outside).toEqual([])
  })
  it('every Space menu row and sidebar row is a console route', () => {
    const slug = 'royal-temple'
    const rows = [
      ...SPACE_MODULES.flatMap((m) => (m.deepLink ? [m.deepLink(slug)] : [])),
      ...spaceNavItems(slug, false).filter((i) => !i.external).flatMap((i) => [i.href, ...(i.match ?? [])]),
    ]
    // Reviews is the public profile tab the Space menu points an owner at, not a console page.
    const outside = rows.filter((href) => !isConsoleRoute(path(href)) && !href.endsWith('/reviews'))
    expect(outside).toEqual([])
  })
})
