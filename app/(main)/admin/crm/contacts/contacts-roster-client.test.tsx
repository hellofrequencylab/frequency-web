// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { ContactRosterRow } from '@/lib/crm/contacts-roster-core'
import { ContactsRosterClient } from './contacts-roster-client'

vi.mock('../relationship-actions', () => ({ assignRelationship: vi.fn(), removeRelationship: vi.fn() }))
vi.mock('./actions', () => ({ bulkSetContactConsent: vi.fn(), setContactConsent: vi.fn() }))

it('opens the CRM detail drawer for a lead with no member profile', () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const row: ContactRosterRow = {
    contactId: 'lead',
    displayName: 'Example Host',
    email: 'lead@example.test',
    handle: null,
    profileId: null,
    avatarUrl: null,
    status: 'lead',
    consentState: 'unknown',
    source: 'lead_flow',
    funnelOrigin: {
      region: 'North County San Diego',
      area: 'Encinitas and Leucadia',
      channel: 'movement',
      source: 'host_referrals',
      utmSource: 'flowweb',
      utmMedium: null,
      utmCampaign: 'north_county',
      utmContent: 'draft_1',
    },
    communityRole: null,
    isBusiness: false,
    activeThisWeek: false,
    spacesOwned: 0,
    spaces: [],
    relationshipKinds: [],
    upgradeScore: 0,
    upgradeCandidate: false,
    upgradeReasons: [],
    createdAt: null,
    badges: ['status:lead', 'source:lead_flow', 'source:host_referrals'],
    sortValues: {},
  }

  try {
    act(() => root.render(<ContactsRosterClient rows={[row]} facets={[]} sortOptions={[]} />))
    expect(container.querySelector('a[href^="/people/"]')).toBeNull()
    expect(container.textContent).toContain('From Lead flow')
    expect(container.textContent).toContain('Invite source Host referrals')
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!
    expect(trigger.textContent).toBe('Funnel origin for Example Host')
    act(() => trigger.click())

    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.querySelector('h2')?.textContent).toBe('Funnel origin')
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id)
    expect([...dialog.querySelectorAll('dt')].map((el) => el.textContent)).toEqual([
      'Region', 'Area', 'Channel', 'Source', 'UTM source', 'UTM campaign', 'UTM content',
    ])
    expect([...dialog.querySelectorAll('dd')].map((el) => el.textContent)).toEqual([
      'North County San Diego', 'Encinitas and Leucadia', 'Movement', 'Host referrals', 'flowweb', 'north_county', 'draft_1',
    ])
    const close = [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Close')!
    act(() => close.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
