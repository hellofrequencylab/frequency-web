import { beforeEach, describe, expect, it, vi } from 'vitest'

// THE PER-SPACE BETA PRICE GRANT (ADR-1061). The checkout asks one question: does this Space get the
// founding rate. Anything unreadable must answer NO (list price), and a missing column must read as
// "unavailable", never as "not granted".

const m = vi.hoisted(() => ({
  read: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  readThrows: null as Error | null,
  writeError: null as { code?: string; message?: string } | null,
  patches: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (m.readThrows) throw m.readThrows
            return m.read
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        m.patches.push(patch)
        return { eq: async () => ({ error: m.writeError }) }
      },
    }),
  }),
}))

import { readSpaceBetaPriceGrant, setSpaceBetaPriceGrant, spaceHasBetaPriceGrant } from './space-beta-grant'

beforeEach(() => {
  m.read = { data: null, error: null }
  m.readThrows = null
  m.writeError = null
  m.patches = []
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'))
})

describe('readSpaceBetaPriceGrant', () => {
  it('reads a granted Space with its audit stamps', async () => {
    m.read = {
      data: { id: 's-1', beta_price_grant: true, beta_price_granted_at: '2026-08-20T00:00:00Z', beta_price_granted_by: 'staff-1' },
      error: null,
    }
    expect(await readSpaceBetaPriceGrant('s-1')).toEqual({
      kind: 'ok',
      grant: { granted: true, grantedAt: '2026-08-20T00:00:00Z', grantedBy: 'staff-1' },
    })
  })

  it('reads an ungranted Space as ok with granted false, not as unavailable', async () => {
    m.read = { data: { id: 's-1', beta_price_grant: false }, error: null }
    expect(await readSpaceBetaPriceGrant('s-1')).toEqual({
      kind: 'ok',
      grant: { granted: false, grantedAt: null, grantedBy: null },
    })
  })

  it('tells a missing column apart from a failed query', async () => {
    m.read = { data: null, error: { code: '42703', message: 'column does not exist' } }
    expect(await readSpaceBetaPriceGrant('s-1')).toMatchObject({ kind: 'unavailable', reason: 'not_deployed' })
    m.read = { data: null, error: { code: '500', message: 'boom' } }
    expect(await readSpaceBetaPriceGrant('s-1')).toMatchObject({ kind: 'unavailable', reason: 'error', message: 'boom' })
  })

  it('reports a missing id and a missing row as not_found, and never throws', async () => {
    expect(await readSpaceBetaPriceGrant(null)).toMatchObject({ kind: 'unavailable', reason: 'not_found' })
    expect(await readSpaceBetaPriceGrant('s-1')).toMatchObject({ kind: 'unavailable', reason: 'not_found' })
    m.readThrows = new Error('network down')
    expect(await readSpaceBetaPriceGrant('s-1')).toMatchObject({ kind: 'unavailable', reason: 'error', message: 'network down' })
  })
})

describe('spaceHasBetaPriceGrant', () => {
  it('is true only for a readable, granted Space', async () => {
    m.read = { data: { id: 's-1', beta_price_grant: true }, error: null }
    expect(await spaceHasBetaPriceGrant('s-1')).toBe(true)
  })

  it('fails safe to the list price on every unreadable answer', async () => {
    m.read = { data: { id: 's-1', beta_price_grant: false }, error: null }
    expect(await spaceHasBetaPriceGrant('s-1')).toBe(false)
    m.read = { data: null, error: { code: '42703' } }
    expect(await spaceHasBetaPriceGrant('s-1')).toBe(false)
    m.readThrows = new Error('down')
    expect(await spaceHasBetaPriceGrant('s-1')).toBe(false)
    expect(await spaceHasBetaPriceGrant(undefined)).toBe(false)
  })

  it('does not treat a truthy non-boolean as a grant', async () => {
    m.read = { data: { id: 's-1', beta_price_grant: 'true' }, error: null }
    expect(await spaceHasBetaPriceGrant('s-1')).toBe(false)
  })
})

describe('setSpaceBetaPriceGrant', () => {
  it('stamps who and when on a grant', async () => {
    expect(await setSpaceBetaPriceGrant('s-1', true, 'staff-1')).toEqual({ ok: true })
    expect(m.patches[0]).toEqual({
      beta_price_grant: true,
      beta_price_granted_at: '2026-10-26T12:00:00.000Z',
      beta_price_granted_by: 'staff-1',
    })
  })

  it('clears both stamps on a revoke', async () => {
    await setSpaceBetaPriceGrant('s-1', false, 'staff-1')
    expect(m.patches[0]).toEqual({ beta_price_grant: false, beta_price_granted_at: null, beta_price_granted_by: null })
  })

  it('refuses an empty id without writing, and explains a missing column', async () => {
    expect(await setSpaceBetaPriceGrant('', true, null)).toMatchObject({ ok: false })
    expect(m.patches).toEqual([])
    m.writeError = { code: '42703' }
    const res = await setSpaceBetaPriceGrant('s-1', true, null)
    expect(res).toMatchObject({ ok: false })
    expect((res as { error: string }).error).toMatch(/Apply migration/)
  })
})
