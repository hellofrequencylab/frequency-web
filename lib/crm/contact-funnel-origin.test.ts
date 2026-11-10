import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyContactQuery, loadContactsRoster } from './contacts-roster'
import { searchContacts } from './person'

const { contacts, rootSpace } = vi.hoisted(() => ({ contacts: vi.fn(), rootSpace: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'contacts') throw new Error(`Unexpected read of ${table}`)
      return { select: () => ({ order: () => ({ limit: contacts }) }) }
    },
  }),
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: rootSpace }))
vi.mock('@/lib/crm/classification', () => ({ classifyContacts: async () => new Map() }))
vi.mock('@/lib/crm/upgrade-signal', () => ({ scoreUpgradeCandidates: async () => new Map() }))

const originMeta = {
  funnel: {
    persona: 'host',
    region: 'north-county-sd',
    area: 'encinitas',
    channel: 'movement',
    src: 'host_referrals',
    utm_source: 'flowweb',
    utm_medium: 'founder_email',
    utm_campaign: 'north_county',
    utm_content: 'draft_1',
    private_notes: 'Internal',
  },
  archetype: 'Private answer',
}

function contact(id: string, spaceId: string, source: string, meta: unknown) {
  return { id, space_id: spaceId, email: 'lead@example.test', profile_id: null, source, meta }
}

beforeEach(() => {
  contacts.mockReset()
  rootSpace.mockReset().mockResolvedValue('root')
})

describe('funnel origin in the platform Contacts roster', () => {
  it('shows allowlisted origin for a lead and filters by its source beside legacy sources', async () => {
    contacts.mockResolvedValue({
      data: [
        contact('invite', 'root', 'lead_flow', originMeta),
        contact('legacy', 'root', 'card_scan', {}),
        contact('same-source', 'root', 'local_groups', { lead_source: 'local_groups' }),
      ],
    })

    const { rows, facets } = await loadContactsRoster()
    expect(rows[0]).toMatchObject({
      profileId: null,
      status: 'lead',
      source: 'lead_flow',
      funnelOrigin: {
        region: 'North County San Diego',
        area: 'Encinitas and Leucadia',
        channel: 'movement',
        source: 'host_referrals',
        utmSource: 'flowweb',
        utmMedium: 'founder_email',
        utmCampaign: 'north_county',
        utmContent: 'draft_1',
      },
    })
    expect(Object.keys(rows[0].funnelOrigin!)).toHaveLength(8)
    expect(rows[0]).not.toHaveProperty('meta')
    expect(JSON.stringify(rows[0])).not.toMatch(/Private answer|Internal|"persona"/)
    expect(facets.find((facet) => facet.key === 'source')?.options).toEqual([
      { value: 'source:card_scan', label: 'Card scan' },
      { value: 'source:host_referrals', label: 'Host referrals' },
      { value: 'source:lead_flow', label: 'Lead flow' },
      { value: 'source:local_groups', label: 'Local groups' },
    ])
    expect(rows[2].badges.filter((value) => value === 'source:local_groups')).toHaveLength(1)
    expect(applyContactQuery(rows, { facets: { source: 'source:host_referrals' } }, 1, 10)
      .visible.map((row) => row.contactId)).toEqual(['invite'])
    expect(applyContactQuery(rows, { facets: { source: 'source:lead_flow' } }, 1, 10)
      .visible.map((row) => row.contactId)).toEqual(['invite'])
  })

  it('does not project attribution onto another Space or an unscoped reader with the same email', async () => {
    contacts.mockResolvedValue({
      data: [
        contact('invite', 'root', 'lead_flow', originMeta),
        contact('tenant', 'other-space', 'card_scan', originMeta),
      ],
    })

    const roster = await loadContactsRoster()
    expect(roster.rows[1]).toMatchObject({ source: 'card_scan', funnelOrigin: null })
    expect((await searchContacts(''))[0]).not.toHaveProperty('funnelOrigin')
    rootSpace.mockResolvedValue(null)
    expect((await loadContactsRoster()).rows[0]).toMatchObject({ source: 'lead_flow', funnelOrigin: null })
  })

  it('uses a known older lead source and drops malformed or private-only values', async () => {
    contacts.mockResolvedValue({
      data: [
        contact('older', 'root', 'lead_flow', {
          lead_source: 'local_groups',
          funnel: { src: 'unknown', channel: ['movement'], utm_campaign: '<script>', persona: 'host' },
        }),
        contact('private', 'root', 'lead_flow', { funnel: { persona: 'host' }, lead_source: '<bad>' }),
      ],
    })

    const { rows } = await loadContactsRoster()
    expect(rows[0]).toMatchObject({
      source: 'lead_flow',
      funnelOrigin: { source: 'local_groups', channel: null, utmCampaign: null },
    })
    expect(rows[1]).toMatchObject({ source: 'lead_flow', funnelOrigin: null })
  })
})
