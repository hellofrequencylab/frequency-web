import { describe, it, expect } from 'vitest'
import { bankForScope, type BankLink } from './rail-bank'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'

// bankForScope returns the FIXED primary-area quick-links for a scope (ADR-515 uniform rail), merged
// with any `placement: 'bank'` surface links, de-duped by href, and NEVER a destructive/Danger link.

const hrefs = (links: BankLink[]) => links.map((l) => l.href)

describe('bankForScope', () => {
  // The console/settings routes are SLUG-keyed, but scope.id carries the entity's DB id (slug≠id detail
  // contract). The 4th arg is the URL slug from the live path; the base console links must use it, while
  // the DB-id-keyed circle create quick-actions keep scope.id. This is the fix for the /circles/<uuid>/
  // manage 404 the bank would otherwise produce.
  it('uses the URL slug for console links but scope.id for the id-keyed circle create actions', () => {
    const dbId = '11111111-2222-3333-4444-555555555555'
    const slug = 'morning-sit'
    const bank = bankForScope({ kind: 'circle', id: dbId }, {}, [], slug)
    const h = hrefs(bank)
    expect(h).toContain(`/circles/${slug}/manage`) // console → SLUG (not the uuid)
    expect(h).not.toContain(`/circles/${dbId}/manage`)
    expect(h).toContain(`/events/new?circle=${dbId}`) // create → DB id (create form matches circle.id)
    expect(h).toContain(`/broadcast?compose=true&scope=${dbId}`)
  })

  it('slug-keys the console for event / hub / nexus / practice too (4th-arg slug over scope.id)', () => {
    const dbId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const slug = 'gathering'
    for (const [kind, section] of [['event', 'events'], ['hub', 'hubs'], ['nexus', 'nexuses'], ['practice', 'practices']] as const) {
      const bank = bankForScope({ kind, id: dbId }, {}, [], slug)
      expect(hrefs(bank).some((x) => x === `/${section}/${slug}/manage`)).toBe(true)
      expect(hrefs(bank).some((x) => x.includes(dbId))).toBe(false)
    }
  })

  it('space → manage console + the primary paid workspaces (CRM · Insights · Billing)', () => {
    const bank = bankForScope({ kind: 'space', id: 'sunrise' })
    expect(bank.length).toBeGreaterThanOrEqual(1)
    expect(hrefs(bank)).toContain('/spaces/sunrise/manage')
    expect(hrefs(bank)).toContain('/spaces/sunrise/crm') // hrefForSurface('space.engage.crm')
    expect(hrefs(bank)).toContain('/spaces/sunrise/settings/billing')
    expect(bank.every((l) => !!l.label && l.icon != null && !!l.href)).toBe(true)
  })

  it('space bank absorbs the Phase 3 back-office surfaces (CRM · Email · QR · Insights · Billing)', () => {
    // ADR-515 Phase 3: CRM / Email / QR codes / Insights / Billing are `placement: 'bank'` Space surfaces
    // now, so the panel resolves each to its href via hrefForSurface and merges them as extras (exactly as
    // it does here). CRM / Insights / Billing dedupe against the fixed base bank; Email + QR are new.
    // Insights currently shares the QR page (/settings/qr — no standalone insights route yet), so the two
    // collapse to ONE button by the href de-dupe.
    const slug = 'sunrise'
    const icon = bankForScope({ kind: 'global' })[0].icon
    const bankSurfaceIds = ['space.engage.crm', 'space.comms', 'space.reach', 'space.insights', 'space.billing']
    const extras: BankLink[] = bankSurfaceIds.map((id) => ({ label: id, icon, href: hrefForSurface(id, slug)! }))

    const bank = bankForScope({ kind: 'space', id: slug }, {}, extras)
    const h = hrefs(bank)
    expect(h).toContain(`/spaces/${slug}/manage`) // the console (base)
    expect(h).toContain(`/spaces/${slug}/crm`) // CRM
    expect(h).toContain(`/spaces/${slug}/settings/email`) // Email
    expect(h).toContain(`/spaces/${slug}/settings/qr`) // QR codes (Insights shares this page)
    expect(h).toContain(`/spaces/${slug}/settings/billing`) // Billing
    // Every href is unique (QR + Insights collapse to one), and Danger is never admitted.
    expect(new Set(h).size).toBe(h.length)
    expect(bank.every((l) => !/danger|delete/i.test(l.href))).toBe(true)
  })

  it('space with no slug → empty (fail-safe, no dead buttons)', () => {
    expect(bankForScope({ kind: 'space' })).toEqual([])
  })

  it('personal / global → All settings + Billing; operator links only for staff', () => {
    const member = bankForScope({ kind: 'global' })
    expect(member.length).toBeGreaterThanOrEqual(1)
    expect(hrefs(member)).toEqual(['/settings', '/settings/billing'])

    const staff = bankForScope({ kind: 'global' }, { isStaff: true })
    expect(hrefs(staff)).toContain('/admin')
    expect(hrefs(staff)).toContain('/admin/crm')
    expect(hrefs(staff)).toContain('/admin/insights')
  })

  it('a person profile scope resolves the personal bank too', () => {
    expect(hrefs(bankForScope({ kind: 'profile', id: 'me' }))).toContain('/settings')
  })

  it('personal / global bank absorbs the moved account surfaces (ADR-515 Phase 2)', () => {
    // Appearance / Notifications / Connections / Account and privacy are `placement: 'bank'` now, so the
    // panel resolves each to its /settings/* href and merges it as an extra. The base Billing dedupes.
    const icon = bankForScope({ kind: 'global' })[0].icon
    const extras: BankLink[] = [
      { label: 'Appearance', icon, href: '/settings/appearance' },
      { label: 'Notifications', icon, href: '/settings/notifications' },
      { label: 'Connections and location', icon, href: '/settings/connections' },
      { label: 'Account and privacy', icon, href: '/settings/account' },
      { label: 'Plan and billing', icon, href: '/settings/billing' }, // dupes the base Billing link
    ]
    const bank = bankForScope({ kind: 'global' }, {}, extras)
    const h = hrefs(bank)
    expect(h).toContain('/settings/appearance')
    expect(h).toContain('/settings/notifications')
    expect(h).toContain('/settings/connections')
    expect(h).toContain('/settings/account')
    // The base All settings + Billing stay, and the duplicate Billing extra collapses to one.
    expect(h).toContain('/settings')
    expect(h.filter((x) => x === '/settings/billing')).toHaveLength(1)
  })

  it('hub / nexus / practice → their manage console (1 link)', () => {
    expect(hrefs(bankForScope({ kind: 'hub', id: 'north' }))).toEqual(['/hubs/north/manage'])
    expect(hrefs(bankForScope({ kind: 'nexus', id: 'core' }))).toEqual(['/nexuses/core/manage'])
    expect(hrefs(bankForScope({ kind: 'practice', id: 'p1' }))).toEqual(['/practices/p1/manage'])
  })

  it('circle → manage console + the host create quick-actions (New event · New announcement) (ADR-515 Phase 4)', () => {
    // The two create hrefs mirror CircleHostMenu exactly (same circle id the scope carries). Insights
    // stays INLINE (a circle has no standalone insights page), so it is NOT a bank link.
    const bank = bankForScope({ kind: 'circle', id: 'c1' })
    expect(hrefs(bank)).toEqual([
      '/circles/c1/manage',
      '/events/new?circle=c1',
      '/broadcast?compose=true&scope=c1',
    ])
    expect(bank.map((l) => l.label)).toEqual(['Manage console', 'New event', 'New announcement'])
    // None of the create/nav quick-actions is a destructive href.
    expect(bank.every((l) => !/danger|delete/i.test(l.href))).toBe(true)
  })

  it('event → the host Manage dashboard (the console that carries roster/approvals/analytics) (ADR-515 Phase 4)', () => {
    const bank = bankForScope({ kind: 'event', id: 'x' })
    expect(hrefs(bank)).toEqual(['/events/x/manage'])
    expect(bank[0].label).toBe('Manage dashboard')
    expect(bank.length).toBeGreaterThanOrEqual(1)
  })

  it('merges placement:"bank" extras and de-dupes by href', () => {
    const extra: BankLink[] = [
      { label: 'Reports', icon: bankForScope({ kind: 'global' })[0].icon, href: '/spaces/sunrise/reports' },
      // A duplicate of a base link collapses to one.
      { label: 'Console again', icon: bankForScope({ kind: 'global' })[0].icon, href: '/spaces/sunrise/manage' },
    ]
    const bank = bankForScope({ kind: 'space', id: 'sunrise' }, {}, extra)
    expect(hrefs(bank)).toContain('/spaces/sunrise/reports')
    expect(hrefs(bank).filter((h) => h === '/spaces/sunrise/manage')).toHaveLength(1)
  })

  it('NEVER admits a destructive / Danger href, even from extras', () => {
    const extra: BankLink[] = [
      { label: 'Danger zone', icon: bankForScope({ kind: 'global' })[0].icon, href: '/spaces/sunrise/settings/danger' },
      { label: 'Delete', icon: bankForScope({ kind: 'global' })[0].icon, href: '/spaces/sunrise/delete' },
    ]
    const bank = bankForScope({ kind: 'space', id: 'sunrise' }, {}, extra)
    expect(bank.every((l) => !/danger|delete/i.test(l.href))).toBe(true)
  })

  it('channel → the operator /admin channels area + Moderation, staff-only (ADR-515 Phase 5)', () => {
    // A channel is operator-curated (no per-channel owner console), so its bank leans on the /admin hub.
    // A non-staff viewer never reaches the channel rail, so a null viewer yields [] (fail-safe).
    expect(bankForScope({ kind: 'channel', id: 'c' })).toEqual([])
    const staff = bankForScope({ kind: 'channel', id: 'c' }, { isStaff: true })
    expect(hrefs(staff)).toEqual(['/admin/channels', '/admin/moderation'])
    expect(staff.map((l) => l.label)).toEqual(['Channels', 'Moderation'])
    // Navigation only — no destructive href.
    expect(staff.every((l) => !/danger|delete/i.test(l.href))).toBe(true)
  })

  it('journey → the full-page builder, slug-keyed, no danger href (ADR-515 Phase 6)', () => {
    // A Journey's console IS its builder (/journeys/<slug>/edit), so the bank links there. Slug-keyed:
    // the console link uses the 4th-arg URL slug over scope.id (the slug≠id detail contract).
    const dbId = 'abababab-cdcd-efef-0000-111122223333'
    const slug = 'sleep-reset'
    const bank = bankForScope({ kind: 'journey', id: dbId }, {}, [], slug)
    expect(hrefs(bank)).toEqual([`/journeys/${slug}/edit`])
    expect(bank[0].label).toBe('Open builder')
    expect(hrefs(bank).some((x) => x.includes(dbId))).toBe(false)
    // Falls back to scope.id when no path slug is supplied.
    expect(hrefs(bankForScope({ kind: 'journey', id: 'j1' }))).toEqual(['/journeys/j1/edit'])
    // Navigation only — the builder is not a destructive href.
    expect(bank.every((l) => !/danger|delete/i.test(l.href))).toBe(true)
  })

  it('null / unknown scope → [] gracefully', () => {
    expect(bankForScope(null)).toEqual([])
  })
})
