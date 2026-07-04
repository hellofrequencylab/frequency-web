import { describe, it, expect } from 'vitest'
import { bankForScope, type BankLink } from './rail-bank'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'

// bankForScope returns the FIXED primary-area quick-links for a scope (ADR-515 uniform rail), merged
// with any `placement: 'bank'` surface links, de-duped by href, and NEVER a destructive/Danger link.

const hrefs = (links: BankLink[]) => links.map((l) => l.href)

describe('bankForScope', () => {
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

  it('event / hub / nexus / circle / practice → their manage console (≥1 link)', () => {
    expect(hrefs(bankForScope({ kind: 'event', id: 'x' }))).toEqual(['/events/x/manage'])
    expect(hrefs(bankForScope({ kind: 'hub', id: 'north' }))).toEqual(['/hubs/north/manage'])
    expect(hrefs(bankForScope({ kind: 'nexus', id: 'core' }))).toEqual(['/nexuses/core/manage'])
    expect(hrefs(bankForScope({ kind: 'circle', id: 'c1' }))).toEqual(['/circles/c1/manage'])
    expect(hrefs(bankForScope({ kind: 'practice', id: 'p1' }))).toEqual(['/practices/p1/manage'])
    expect(bankForScope({ kind: 'event', id: 'x' }).length).toBeGreaterThanOrEqual(1)
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

  it('null / unknown scope → [] gracefully', () => {
    expect(bankForScope(null)).toEqual([])
    expect(bankForScope({ kind: 'channel', id: 'c' })).toEqual([])
  })
})
