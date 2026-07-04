import { describe, it, expect } from 'vitest'
import { bankForScope, type BankLink } from './rail-bank'

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
