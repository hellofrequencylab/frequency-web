import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// The Space Loom budget (LIVE-567, ADR-1585). What matters, in order: a NULL size is unknown and
// never weighs zero, the cap follows the tier and the `loom.storage.large` key, the root Space is
// uncapped, a failed sum REFUSES (a quota that fails open is not a quota), and exactly-at-the-cap is
// allowed while one byte past it is not.

let pages: { data: unknown; error: { message: string } | null }[] = []
const ranges: [number, number][] = []
const filters: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      filters.push(`from:${table}`)
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`eq:${col}=${String(val)}`)
          return chain
        },
        not: (col: string, op: string, val: unknown) => {
          filters.push(`not:${col} ${op} ${String(val)}`)
          return chain
        },
        order: () => chain,
        range: (from: number, to: number) => {
          ranges.push([from, to])
          return Promise.resolve(pages.shift() ?? { data: [], error: null })
        },
      }
      return chain
    },
  }),
}))

import {
  LOOM_STORAGE_CAP_BYTES,
  LOOM_STORAGE_LARGE_BYTES,
  LOOM_STORAGE_LARGE_KEY,
  formatLoomBytes,
  loomBudgetVerdict,
  loomMeter,
  loomQuotaFor,
  loomStorageUsed,
  sumLoomBytes,
} from './quota'
import { BUSINESS_DEPTH_ENTITLEMENT_KEYS } from '@/lib/pricing/plans'

const GB = 1024 * 1024 * 1024

beforeEach(() => {
  pages = []
  ranges.length = 0
  filters.length = 0
})

describe('sumLoomBytes: the fold', () => {
  it('counts sizes and reports NULLs as unknown, never as zero', () => {
    expect(sumLoomBytes([{ bytes: 100 }, { bytes: null }, { bytes: 50 }, {}, { bytes: 0 }])).toEqual({
      bytes: 150,
      files: 3,
      unknown: 2,
    })
  })
  it('a negative or non-finite size is unknown too', () => {
    expect(sumLoomBytes([{ bytes: -5 }, { bytes: Number.NaN }, { bytes: Infinity }])).toEqual({
      bytes: 0,
      files: 0,
      unknown: 3,
    })
  })
  it('an empty Loom is zero with nothing unknown', () => {
    expect(sumLoomBytes([])).toEqual({ bytes: 0, files: 0, unknown: 0 })
  })
})

describe('loomQuotaFor: the cap', () => {
  it('follows the plan tier, and an unknown or missing plan reads as free', () => {
    expect(loomQuotaFor({ plan: 'free' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.free })
    expect(loomQuotaFor({ plan: 'business' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.business })
    expect(loomQuotaFor({ plan: 'nope' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.free })
    expect(loomQuotaFor(null)).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.free })
    // A legacy label narrows through asSpacePlan like every other plan read.
    expect(loomQuotaFor({ plan: 'collective' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.business })
  })
  it('the larger-library key raises a free Space, from the billing namespace or a hand-grant', () => {
    const billing = { plan: 'free', entitlements: { billing: { [LOOM_STORAGE_LARGE_KEY]: true } } }
    const hand = { plan: 'free', entitlements: { [LOOM_STORAGE_LARGE_KEY]: true } }
    expect(loomQuotaFor(billing)).toEqual({ capped: true, capBytes: LOOM_STORAGE_LARGE_BYTES })
    expect(loomQuotaFor(hand)).toEqual({ capped: true, capBytes: LOOM_STORAGE_LARGE_BYTES })
  })
  it('the key is default-deny: a non-true value or a hand revoke grants nothing', () => {
    expect(loomQuotaFor({ plan: 'free', entitlements: { [LOOM_STORAGE_LARGE_KEY]: 'yes' } })).toEqual({
      capped: true,
      capBytes: LOOM_STORAGE_CAP_BYTES.free,
    })
    const revoked = { plan: 'free', entitlements: { [LOOM_STORAGE_LARGE_KEY]: false, billing: { [LOOM_STORAGE_LARGE_KEY]: true } } }
    expect(loomQuotaFor(revoked)).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.free })
  })
  it('the key never lowers a tier cap', () => {
    const q = loomQuotaFor({ plan: 'independent', entitlements: { [LOOM_STORAGE_LARGE_KEY]: true } })
    expect(q).toEqual({ capped: true, capBytes: Math.max(LOOM_STORAGE_CAP_BYTES.independent, LOOM_STORAGE_LARGE_BYTES) })
  })
  it('the root Space has no cap', () => {
    expect(loomQuotaFor({ type: 'root', plan: 'free' })).toEqual({ capped: false })
  })
  it('a paid tier gets the larger library through its depth set', () => {
    expect(BUSINESS_DEPTH_ENTITLEMENT_KEYS).toContain(LOOM_STORAGE_LARGE_KEY)
    expect(LOOM_STORAGE_LARGE_BYTES).toBeGreaterThan(LOOM_STORAGE_CAP_BYTES.free)
  })
})

describe('loomBudgetVerdict: the refusal', () => {
  const quota = { capped: true as const, capBytes: 1 * GB }
  it('allows exactly at the cap and refuses one byte past it, naming used and cap', () => {
    const used = { ok: true as const, bytes: GB - 100, files: 3, unknown: 0 }
    expect(loomBudgetVerdict(quota, used, 100)).toEqual({ ok: true })
    const refused = loomBudgetVerdict(quota, used, 101)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.error).toContain('1 GB of 1 GB used')
      expect(refused.error).not.toMatch(/—/) // no em dash in product copy
    }
  })
  it('a failed sum refuses (deny on the unknown)', () => {
    const v = loomBudgetVerdict(quota, { ok: false }, 1)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toMatch(/Could not check/)
  })
  it('an uncapped Loom never asks', () => {
    expect(loomBudgetVerdict({ capped: false }, { ok: false }, 10 * GB)).toEqual({ ok: true })
  })
})

describe('loomStorageUsed: the sum', () => {
  it('reads only the Space file-backed rows and pages until a short page', async () => {
    pages = [
      { data: Array.from({ length: 1000 }, () => ({ bytes: 10 })), error: null },
      { data: [{ bytes: 5 }, { bytes: null }], error: null },
    ]
    expect(await loomStorageUsed('space-1')).toEqual({ ok: true, bytes: 10005, files: 1001, unknown: 1 })
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(filters).toContain('from:library_assets')
    expect(filters).toContain('eq:space_id=space-1')
    expect(filters).toContain('not:storage_path is null')
  })
  it('a failed page is a failed sum, not a partial one', async () => {
    pages = [
      { data: Array.from({ length: 1000 }, () => ({ bytes: 10 })), error: null },
      { data: null, error: { message: 'boom' } },
    ]
    expect(await loomStorageUsed('space-1')).toEqual({ ok: false })
  })
  it('no Space id is a failed sum', async () => {
    expect(await loomStorageUsed('')).toEqual({ ok: false })
  })
})

describe('the meter and the words', () => {
  it('formats bytes the way a person reads them', () => {
    expect(formatLoomBytes(0)).toBe('0 MB')
    expect(formatLoomBytes(2048)).toBe('2 KB')
    expect(formatLoomBytes(12.4 * 1024 * 1024)).toBe('12.4 MB')
    expect(formatLoomBytes(10 * GB)).toBe('10 GB')
    expect(formatLoomBytes(GB - 100)).toBe('1 GB')
    expect(formatLoomBytes(1500 * 1024 * 1024)).toBe('1.5 GB')
  })
  it('reads used, cap, percent and the unknown count; a failed read is words, not a number', () => {
    const q = { capped: true as const, capBytes: 1 * GB }
    expect(loomMeter(q, { ok: true, bytes: GB / 2, files: 4, unknown: 2 })).toEqual({
      read: true,
      used: '512 MB',
      cap: '1 GB',
      percent: 50,
      unknown: 2,
    })
    expect(loomMeter(q, { ok: false })).toEqual({ read: false, used: null, cap: '1 GB', percent: null, unknown: 0 })
    expect(loomMeter({ capped: false }, { ok: true, bytes: 0, files: 0, unknown: 0 }).percent).toBeNull()
  })
})

describe('the wiring', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  it('the Space upload door reads the budget after the dedupe and before storage', () => {
    const src = strip(readFileSync('lib/loom/picker-actions.ts', 'utf8'))
    const start = src.indexOf('export async function uploadLoomImage(')
    const body = src.slice(start, src.indexOf('\n}', start))
    const dedupe = body.indexOf('findLibraryAssetBySha256(')
    const quota = body.indexOf('loomQuotaFor(')
    const sum = body.indexOf('loomStorageUsed(')
    const store = body.indexOf('.upload(')
    expect(dedupe).toBeGreaterThan(-1)
    expect(quota).toBeGreaterThan(dedupe)
    expect(sum).toBeGreaterThan(quota)
    expect(store).toBeGreaterThan(sum)
    // The refusal is a returned error, never a throw.
    expect(body).toMatch(/if \(!verdict\.ok\) return \{ error: verdict\.error \}/)
  })
  it('the Space Loom Studio shows the meter', () => {
    const src = readFileSync('components/spaces/loom/space-loom-studio.tsx', 'utf8')
    expect(src).toMatch(/data-loom-quota/)
    expect(src).toMatch(/loomQuotaMeter\(/)
  })
})
