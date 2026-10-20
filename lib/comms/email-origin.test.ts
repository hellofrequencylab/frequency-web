import { describe, it, expect, vi } from 'vitest'

const rows = vi.hoisted(() => ({ byTable: {} as Record<string, unknown> }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows.byTable[table] ?? null }) }) }),
    }),
  }),
}))

import { resolveEmailOrigin } from './email-brand'

describe('resolveEmailOrigin', () => {
  it('a Circle thread links to the Circle', async () => {
    rows.byTable = { circles: { slug: 'sunrise', name: 'Sunrise Circle' } }
    expect(await resolveEmailOrigin({ scopeKind: 'circle', scopeId: 'c1' })).toEqual({
      label: 'Sunrise Circle',
      url: 'https://frequencylocal.com/circles/sunrise',
    })
  })

  it('a Journey thread links to the Journey', async () => {
    rows.byTable = { journey_plans: { slug: 'first-light', title: 'First Light' } }
    expect((await resolveEmailOrigin({ scopeKind: 'journey', scopeId: 'j1' }))?.url).toBe(
      'https://frequencylocal.com/journeys/first-light',
    )
  })

  it('an unscoped message links to the sender profile', async () => {
    rows.byTable = { profiles: { handle: 'dana', display_name: 'Dana Lee' } }
    expect(await resolveEmailOrigin({ ownerProfileId: 'p1' })).toEqual({
      label: 'Dana Lee',
      url: 'https://frequencylocal.com/people/dana',
    })
  })

  it('a missing row or an unmapped scope kind yields null so the footer falls back to the Space', async () => {
    rows.byTable = {}
    expect(await resolveEmailOrigin({ scopeKind: 'circle', scopeId: 'gone' })).toBeNull()
    expect(await resolveEmailOrigin({ scopeKind: 'booking', scopeId: 'b1', ownerProfileId: 'p1' })).toBeNull()
  })
})
