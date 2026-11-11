import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc }) }))

import { loadScanPlacement } from './claim-store'
import { resolvePlacement } from './placement'

const placement = {
  id: 'placement-1',
  hunt_id: 'hunt-1',
  slug: 'scan-abc',
  medium: 'qr',
  revoked_at: null,
}
const hunt = { id: 'hunt-1', slug: 'north-county', visibility: 'unlisted', status: 'live' }

function mockDatabase(rows: Record<string, Record<string, unknown>[]>) {
  from.mockImplementation((table: string) => {
    let matches = rows[table] ?? []
    const query = {
      select: () => query,
      eq(column: string, value: unknown) {
        matches = matches.filter((row) => row[column] === value)
        return query
      },
      in(column: string, values: unknown[]) {
        matches = matches.filter((row) => values.includes(row[column]))
        return query
      },
      maybeSingle: async () => ({ data: matches.length === 1 ? matches[0] : null }),
    }
    return query
  })
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  mockDatabase({ hunt_placements: [placement], hunts: [hunt] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  from.mockReset()
  rpc.mockReset()
})

describe('printed Hunt placement lookup', () => {
  it.each(['qr', 'nfc'])('reads a %s code by slug without crediting progress', async (medium) => {
    mockDatabase({ hunt_placements: [{ ...placement, medium }], hunts: [hunt] })
    expect(await loadScanPlacement({ code: placement.slug })).toEqual({
      id: placement.id, huntId: hunt.id, revokedAt: null, huntSlug: hunt.slug,
    })
    expect(await loadScanPlacement({ code: placement.id })).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['HUNTS_ENABLED', 'HUNTS_CLAIMS_ENABLED'])('does not read a code with %s off', async (flag) => {
    vi.stubEnv(flag, '')
    expect(await loadScanPlacement({ code: placement.slug })).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects malformed codes before looking them up', async () => {
    for (const code of ['short', 'SCAN-ABC', 'scan/abc', 'a'.repeat(81)]) {
      expect(await loadScanPlacement({ code })).toBeNull()
    }
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...hunt, visibility: 'private' }, placement],
    [{ ...hunt, status: 'draft' }, placement],
    [{ ...hunt, id: 'different-hunt' }, placement],
    [hunt, { ...placement, medium: 'staff' }],
  ])('does not disclose a private or inactive Hunt, or a staff placement', async (huntRow, placementRow) => {
    mockDatabase({ hunt_placements: [placementRow], hunts: [huntRow] })
    expect(await loadScanPlacement({ code: placement.slug })).toBeNull()
  })

  it('passes revocation to the resolver and returns no claim path', async () => {
    mockDatabase({ hunt_placements: [{ ...placement, revoked_at: '2026-11-10T00:00:00Z' }], hunts: [hunt] })
    const scanned = await loadScanPlacement({ code: placement.slug })
    expect(resolvePlacement({
      placement: scanned, requestHost: 'frequencylocal.com', canonicalHost: 'frequencylocal.com',
      path: '/play/north-county/at/scan-abc', userAgent: 'Mozilla/5.0',
    })).toEqual({ kind: 'refuse', reason: 'revoked' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
