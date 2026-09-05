import { describe, it, expect, vi } from 'vitest'

// Finding R2 (2026-09-04): refreshResonanceDensityCells collapsed every failure into { cells: 0 },
// which is also what a successful rollup over an empty table returns. The SQL function had been
// failing with sqlstate 21000 ("DELETE requires a WHERE clause", PostgREST's safeupdate preload)
// on every nightly run since 2026-08-22 and the cron logged it as an ordinary info line. These
// tests pin the wiring: a resolved { error } (supabase-js does not throw on a DB error) and a
// thrown error BOTH come back as `error`, and a success carries the function's row count and no
// `error` key at all. Network-free: the admin client is a fake with just `rpc`.

const rpc = vi.hoisted(() => ({
  impl: (async () => ({ data: null, error: null })) as (fn: string) => Promise<{
    data: number | null
    error: unknown
  }>,
  calls: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string) => {
      rpc.calls.push(fn)
      return rpc.impl(fn)
    },
  }),
}))

import { refreshResonanceDensityCells } from './density'

describe('refreshResonanceDensityCells', () => {
  it('calls the rollup RPC by name and returns its row count on success, with no error key', async () => {
    rpc.calls.length = 0
    rpc.impl = async () => ({ data: 42, error: null })
    const out = await refreshResonanceDensityCells()
    expect(rpc.calls).toEqual(['refresh_resonance_density_cells'])
    expect(out).toEqual({ cells: 42 })
    expect('error' in out).toBe(false)
  })

  it('surfaces a resolved PostgREST error (the safeupdate 21000) instead of swallowing it', async () => {
    rpc.impl = async () => ({
      data: null,
      error: { code: '21000', message: 'DELETE requires a WHERE clause', details: null, hint: null },
    })
    const out = await refreshResonanceDensityCells()
    expect(out.cells).toBe(0)
    expect(out.error).toContain('DELETE requires a WHERE clause')
    expect(out.error).toContain('21000')
  })

  it('surfaces a thrown error (a missing function or a network failure) the same way', async () => {
    rpc.impl = async () => {
      throw new Error('fetch failed')
    }
    const out = await refreshResonanceDensityCells()
    expect(out).toEqual({ cells: 0, error: 'fetch failed' })
  })

  it('never returns a bare { cells: 0 } for a failure, even when the error carries no message', async () => {
    rpc.impl = async () => ({ data: null, error: {} })
    const out = await refreshResonanceDensityCells()
    expect(out.cells).toBe(0)
    expect(typeof out.error).toBe('string')
    expect(out.error!.length).toBeGreaterThan(0)
  })

  it('treats a non-numeric success payload as zero rows, and still no error', async () => {
    rpc.impl = async () => ({ data: null, error: null })
    expect(await refreshResonanceDensityCells()).toEqual({ cells: 0 })
  })
})
