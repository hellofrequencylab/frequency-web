import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { activeNav, hrefScore, itemBadge, type AdminNavItem } from './nav-model'
import { spaceNavItems } from './space-console'
import { adminNavItems } from './admin-console'
import type { ResolvedCategory, ResolvedItem } from '@/lib/menus/types'

const q = (s = '') => new URLSearchParams(s)

describe('hrefScore', () => {
  it('matches a path and anything beneath it, and prefers longer paths', () => {
    expect(hrefScore('/admin', '/admin/moderation', q())).toBeGreaterThan(-1)
    expect(hrefScore('/admin/moderation', '/admin/moderation', q())).toBeGreaterThan(hrefScore('/admin', '/admin/moderation', q()))
    expect(hrefScore('/admin/mod', '/admin/moderation', q())).toBe(-1)
  })
  it('requires an href query to match the URL', () => {
    expect(hrefScore('/s/manage?section=resonance', '/s/manage', q('section=resonance'))).toBeGreaterThan(hrefScore('/s/manage', '/s/manage', q('section=resonance')))
    expect(hrefScore('/s/manage?section=resonance', '/s/manage', q('section=marketing'))).toBe(-1)
  })
})

describe('the Space console sidebar', () => {
  const items = spaceNavItems('royal-temple', true)
  it('is the hub tabs in order, with the website editor door after Home', () => {
    expect(items.map((i) => i.key)).toEqual(['dashboard', 'editor', 'resonance', 'marketing', 'offerings', 'programs', 'settings'])
    expect(items.find((i) => i.key === 'editor')).toMatchObject({ external: true, href: '/spaces/royal-temple/manage/leadership/open?to=editor' })
  })
  it('drops the editor door for a staff preview', () => {
    expect(spaceNavItems('royal-temple', false).some((i) => i.key === 'editor')).toBe(false)
  })
  it('lights the tab a page belongs to, from the catalog deep links', () => {
    expect(activeNav(items, '/spaces/royal-temple/manage', q()).item?.key).toBe('dashboard')
    expect(activeNav(items, '/spaces/royal-temple/manage', q('section=offerings')).item?.key).toBe('offerings')
    expect(activeNav(items, '/spaces/royal-temple/crm/leads', q()).item?.key).toBe('resonance')
    expect(activeNav(items, '/spaces/royal-temple/settings/payments', q()).item?.key).toBe('offerings')
    expect(activeNav(items, '/spaces/royal-temple/manage/circles', q()).item?.key).toBe('programs')
  })
})

describe('the operator console sidebar', () => {
  const leaf = (id: string, label: string, href: string, minAccess: ResolvedItem['minAccess'] = 'host'): ResolvedItem => ({ id, label, href, position: 0, colSpan: 1, mode: 'active', roleModes: {}, minAccess })
  const categories: ResolvedCategory[] = [
    { id: 'c0', label: 'Overview', position: 0, colSpan: 1, minAccess: 'admin', items: [leaf('o', 'Overview', '/admin', 'admin')], children: [] },
    {
      id: 'c1', label: 'Community', position: 1, colSpan: 1, minAccess: 'host', items: [leaf('c', 'Community', '/admin/community')],
      children: [{ id: 'c1a', label: 'Trust', position: 0, colSpan: 1, items: [leaf('m', 'Moderation', '/admin/moderation'), leaf('s', 'Support', '/admin/support')], children: [] }],
    },
  ]
  it('projects each visible world, its pages beneath it, and the Moderation count', () => {
    const items = adminNavItems(categories, { viewerRole: 'host' }, 3)
    expect(items.map((i) => i.label)).toEqual(['Community'])
    const community = items[0] as AdminNavItem
    expect(community.children?.map((c) => [c.label, c.badge])).toEqual([['Moderation', 3], ['Support', undefined]])
    expect(itemBadge(community)).toBe(3)
    expect(activeNav(items, '/admin/moderation', q()).leaf?.label).toBe('Moderation')
  })
  it('shows a section by its reachable pages, not its own floor (ADR-1745)', () => {
    // A janitor-floored section holding one admin-gated tool (Platform holding Market): an admin who is
    // not a janitor still reaches the tool, so the section shows and lands on it.
    const platform: ResolvedCategory = {
      id: 'c2', label: 'Platform', position: 2, colSpan: 1, minAccess: 'janitor', items: [leaf('p', 'Platform', '/admin/operations', 'janitor')],
      children: [{ id: 'c2a', label: 'Commerce', position: 0, colSpan: 1, minAccess: 'janitor', items: [leaf('mk', 'Market', '/admin/marketplace', 'admin')], children: [] }],
    }
    const items = adminNavItems([platform], { viewerRole: 'admin' }, 0)
    expect(items.map((i) => [i.label, i.href])).toEqual([['Platform', '/admin/marketplace']])
  })
  it('shows no badge on an empty queue', () => {
    const items = adminNavItems(categories, { viewerRole: 'janitor' }, 0)
    expect(items.map((i) => i.label)).toEqual(['Overview', 'Community'])
    expect(itemBadge(items[1])).toBe(0)
  })
})
