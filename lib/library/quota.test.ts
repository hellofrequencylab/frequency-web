import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// The Space Loom budget (LIVE-567, ADR-1585). What matters, in order: a NULL size is unknown and
// never weighs zero, the cap follows the plan tier, the root Space is uncapped, a failed sum REFUSES (a quota that fails open is not a quota), and exactly-at-the-cap is
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

// The owning Space loomAdmits reads (LIVE-629). A throw here stands for a failed Space read.
let ownerSpace: { id: string; type?: string; plan?: string } | null | 'throw' = null
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => {
    if (ownerSpace === 'throw') throw new Error('boom')
    return ownerSpace
  },
}))

import {
  LOOM_STORAGE_CAP_BYTES,
  formatLoomBytes,
  loomAdmits,
  loomBudgetVerdict,
  loomMeter,
  loomQuotaFor,
  loomStorageUsed,
  sumLoomBytes,
} from './quota'
import { SPACE_PLANS } from '@/lib/pricing/plans'

const GB = 1024 * 1024 * 1024

beforeEach(() => {
  ownerSpace = null
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
    expect(loomQuotaFor({ plan: 'pro' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.business })
    // Collective is its own plan again (ADR-1709) and holds the larger shared library.
    expect(loomQuotaFor({ plan: 'collective' })).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.collective })
  })
  it('an entitlements blob changes nothing: the larger-library key is deferred to the owner', () => {
    const granted = { plan: 'free', entitlements: { 'loom.storage.large': true } }
    expect(loomQuotaFor(granted)).toEqual({ capped: true, capBytes: LOOM_STORAGE_CAP_BYTES.free })
  })
  it('the root Space has no cap', () => {
    expect(loomQuotaFor({ type: 'root', plan: 'free' })).toEqual({ capped: false })
  })
  it('every tier has a cap, and a paid tier holds more than free', () => {
    for (const plan of SPACE_PLANS) expect(LOOM_STORAGE_CAP_BYTES[plan]).toBeGreaterThan(0)
    expect(LOOM_STORAGE_CAP_BYTES.business).toBeGreaterThan(LOOM_STORAGE_CAP_BYTES.free)
    expect(LOOM_STORAGE_CAP_BYTES.nonprofit).toBeGreaterThan(LOOM_STORAGE_CAP_BYTES.free)
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

describe('loomAdmits: the one gate every Space write asks (LIVE-629, ADR-1602)', () => {
  it('under the cap: admitted, after reading the owning Space and its sum', async () => {
    ownerSpace = { id: 'space-1', type: 'business', plan: 'free' }
    pages = [{ data: [{ bytes: 100 }], error: null }]
    expect(await loomAdmits('space-1', 100)).toEqual({ ok: true })
    expect(filters).toContain('eq:space_id=space-1')
  })
  it('past the cap: refused, naming used and cap', async () => {
    ownerSpace = { id: 'space-1', type: 'business', plan: 'free' }
    pages = [{ data: [{ bytes: GB }], error: null }]
    const v = await loomAdmits('space-1', 1)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toContain('1 GB of 1 GB used')
  })
  it('a failed sum refuses', async () => {
    ownerSpace = { id: 'space-1', type: 'business', plan: 'free' }
    pages = [{ data: null, error: { message: 'boom' } }]
    const v = await loomAdmits('space-1', 1)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.error).toMatch(/Could not check/)
  })
  it('a missing or unreadable Space refuses, and so does no id', async () => {
    ownerSpace = null
    expect((await loomAdmits('space-1', 1)).ok).toBe(false)
    ownerSpace = 'throw'
    expect((await loomAdmits('space-1', 1)).ok).toBe(false)
    expect((await loomAdmits('', 1)).ok).toBe(false)
  })
  it('the root Space is uncapped and never reads the sum', async () => {
    ownerSpace = { id: 'root', type: 'root', plan: 'free' }
    pages = [{ data: null, error: { message: 'would refuse if read' } }]
    expect(await loomAdmits('root', 50 * GB)).toEqual({ ok: true })
    expect(ranges).toEqual([])
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
    const picker = strip(readFileSync('lib/loom/picker-actions.ts', 'utf8'))
    expect(picker).toMatch(/return uploadAuthorizedLoomImage\(spaceId, caller\.id, formData\)/)
    const src = strip(readFileSync('lib/loom/authorized-image-upload.ts', 'utf8'))
    const start = src.indexOf('export async function uploadAuthorizedLoomImage(')
    const body = src.slice(start, src.indexOf('\n}', start))
    const dedupe = body.indexOf('findLibraryAssetBySha256(')
    const gate = body.indexOf('loomAdmits(')
    const store = body.indexOf('.upload(')
    expect(dedupe).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(dedupe)
    expect(store).toBeGreaterThan(gate)
    // The refusal is a returned error, never a throw.
    expect(body).toMatch(/if \(!verdict\.ok\) return \{ error: verdict\.error \}/)
  })
  it('every Space write door asks the same gate before storage, and none re-assembles it (LIVE-629)', () => {
    const doors: [string, string][] = [
      ['lib/loom/authorized-image-upload.ts', 'export async function uploadAuthorizedLoomImage('],
      ['lib/page-editor/loom-field-actions.ts', 'export async function uploadToLoom('],
      ['lib/loom/cover-actions.ts', 'export async function generateEntityCoverAction('],
    ]
    for (const [file, head] of doors) {
      const src = strip(readFileSync(file, 'utf8'))
      const start = src.indexOf(head)
      expect(start, file).toBeGreaterThan(-1)
      // '\n}\n' is the function's own close (the cover's input type closes on '\n}):').
      const body = src.slice(start, src.indexOf('\n}\n', start))
      const gate = body.indexOf('loomAdmits(')
      expect(gate, file).toBeGreaterThan(-1)
      expect(body.indexOf('.upload('), file).toBeGreaterThan(gate)
      expect(body, file).not.toMatch(/loomBudgetVerdict\(/)
    }
  })
  it('the Space Loom Studio shows the meter', () => {
    const src = readFileSync('components/spaces/loom/space-loom-studio.tsx', 'utf8')
    expect(src).toMatch(/data-loom-quota/)
    expect(src).toMatch(/loomQuotaMeter\(/)
  })
})
