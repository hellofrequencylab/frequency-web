import { beforeEach, describe, expect, it, vi } from 'vitest'

// The event door code (LIVE-945): one row per event, found before it is minted, with the NFC link stamped.

const h = vi.hoisted(() => ({
  existing: null as { slug: string } | null,
  inserted: [] as Record<string, unknown>[],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: h.existing }) }) }) }),
      }),
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row)
        return { select: () => ({ maybeSingle: async () => ({ data: { slug: row.slug }, error: null }) }) }
      },
    }),
  }),
}))

import { doorCodeFor, doorPurpose, ensureEventDoorCode } from './door-code'

beforeEach(() => {
  h.existing = null
  h.inserted.length = 0
})

describe('event door code', () => {
  it('reuses the event row when one exists', async () => {
    h.existing = { slug: 'abc1234' }
    const code = await ensureEventDoorCode('ev-1', 'Tuesday cowork', 'host-1')
    expect(code?.slug).toBe('abc1234')
    expect(h.inserted).toEqual([])
  })

  it('mints one per event with the purpose carrying the event id and no owner', async () => {
    const code = await ensureEventDoorCode('ev-1', 'Tuesday cowork', 'host-1')
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({ destination_type: 'event', event_id: 'ev-1', purpose: doorPurpose('ev-1'), created_by: 'host-1', active: true })
    expect(h.inserted[0]).not.toHaveProperty('owner_profile_id')
    expect(code?.slug).toHaveLength(7)
  })

  it('stamps the tag link with the nfc medium', () => {
    const code = doorCodeFor('abc1234')
    expect(code.url.endsWith('/q/abc1234')).toBe(true)
    expect(code.nfcUrl.endsWith('/q/abc1234?m=nfc')).toBe(true)
  })
})
