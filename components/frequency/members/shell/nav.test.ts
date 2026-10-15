import { describe, expect, it } from 'vitest'
import { NAV_AREAS } from '@/lib/nav-areas'
import {
  FEED_HREF,
  FQ_ACCOUNT_MENU,
  FQ_NAV,
  FQ_SHORTCUTS,
  FQ_WORK_MENU,
  FQ_YOU_LINKS,
  HUB_LINKS,
  MEMBER_HOME_HREF,
  areaFor,
  groupRows,
  homeFeedItem,
  hubLinks,
  menuGateOpen,
} from './nav'

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
    // Search and Messages are the header's own icons; the rest are menu rows or shortcuts, and the
    // phone drawer draws the shortcuts too.
    for (const href of ['/nearby', '/journal', '/codes']) {
      const elsewhere = [...FQ_SHORTCUTS, ...FQ_YOU_LINKS].some((i) => i.href === href)
      expect(menu.includes(href) || elsewhere, href).toBe(true)
    }
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

describe('the avatar menu, the work menu and the hubs', () => {
  const member = { navAccess: { 'admin-home': 'none', lead: 'none', 'admin-crm': 'none' }, operatesSpaces: false, host: false }

  it('a member never sees an admin or host row; each gate opens its row', () => {
    const hrefs = groupRows(FQ_WORK_MENU, member, '/people/me').flatMap((g) => g.rows.map((r) => r.href))
    expect(hrefs).not.toContain('/admin')
    expect(hrefs).not.toContain('/lead')
    expect(hrefs).not.toContain('/spaces/operating')
    expect(hrefs).toContain('/events/new')
    expect(menuGateOpen({ gate: 'operatesSpaces' }, { ...member, operatesSpaces: true })).toBe(true)
    expect(menuGateOpen({ navKey: 'admin-home' }, { ...member, navAccess: { 'admin-home': 'full' } })).toBe(true)
    expect(hubLinks('/marketplace', member).map((l) => l.href)).not.toContain('/market/manage')
    expect(hubLinks('/marketplace', { ...member, host: true }).map((l) => l.href)).toContain('/market/manage')
    expect(hubLinks('/admin', member).map((l) => l.href)).not.toContain('/admin/crm')
  })

  it("the admin hub's children are the rail's Admin section, less the console's front door", () => {
    const admin = NAV_AREAS.filter((a) => a.section === 'Admin' && a.href !== '/admin' && a.href !== '/lead')
    expect(HUB_LINKS['/admin']!.map((l) => [l.navKey, l.href])).toEqual(admin.map((a) => [a.key, a.href]))
  })

  it('groups keep first-seen order and drop a repeated href', () => {
    const groups = groupRows(
      [{ group: 'Account', label: 'Settings again', href: '/settings', icon: 'settings' }, ...FQ_ACCOUNT_MENU],
      member,
      '/people/me',
    )
    const rows = groups.flatMap((g) => g.rows)
    expect(rows.filter((r) => r.href === '/settings')).toHaveLength(1)
    expect(rows[0]!.label).toBe('Settings again')
    expect(rows.some((r) => r.href === '/people/me')).toBe(true)
    expect(rows.some((r) => r.action === 'bug')).toBe(true)
  })
})

describe('the member gate (SCAN-912)', () => {
  const visitor = { navAccess: Object.fromEntries(NAV_AREAS.map((a) => [a.key, 'read'])), operatesSpaces: false, host: false }
  it('keeps New event and Drafts off the Events hub for a signed-out visitor', () => {
    const hrefs = hubLinks('/events', { ...visitor, signedIn: false }).map((l) => l.href)
    expect(hrefs).not.toContain('/events/new')
    expect(hrefs).not.toContain('/drafts')
    expect(hrefs).toContain('/events/calendar')
  })
  it('still shows them to a member (signedIn absent or true)', () => {
    expect(hubLinks('/events', visitor).map((l) => l.href)).toContain('/events/new')
    expect(hubLinks('/events', { ...visitor, signedIn: true }).map((l) => l.href)).toContain('/drafts')
  })
  it('drops every create row from the work menu for a signed-out viewer', () => {
    const rows = groupRows(FQ_WORK_MENU, { ...visitor, signedIn: false }, '/join').flatMap((g) => g.rows)
    expect(rows.some((r) => r.href === '/events/new' || r.href === '/circles/new' || r.href === '/market/sell')).toBe(false)
  })
})
