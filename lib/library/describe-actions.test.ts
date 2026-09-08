import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeBlurhash } from './blurhash'

// HYG-021 / ADR-1254 — describing a SERVER-GENERATED asset from the browser, one round-trip later.
//
// The three properties that matter, because the values arrive from a client:
//   1. it FILLS A HOLE and never repaints — a row that already has a blurhash is left alone,
//   2. it writes when the column is null,
//   3. junk is dropped, not stored (the same validation the upload path runs).
// Plus the wiring: the two generation paths that have a client actually call the shared path.

const caller = { id: 'person-1', webRole: 'member' as string | null }
let profile: { id: string; webRole: string | null } | null = caller

const target = vi.fn()
const backfill = vi.fn()
const capabilities = vi.fn()

vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => profile }))
vi.mock('./store', () => ({
  getLibraryDescriptorTarget: (...a: unknown[]) => target(...a),
  backfillLibraryAssetDescriptor: (...a: unknown[]) => backfill(...a),
}))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async (id: string) => ({ id }) }))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: (...a: unknown[]) => capabilities(...a),
}))

const { describeLibraryAssetAction } = await import('./describe-actions')

/** A structurally valid blurhash, made by the encoder rather than typed by hand. */
const HASH = encodeBlurhash(new Uint8ClampedArray(8 * 8 * 4).fill(120), 8, 8) as string

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function row(over: Record<string, unknown> = {}) {
  return {
    spaceId: 'space-1',
    createdBy: caller.id,
    kind: 'image',
    hasBlurhash: false,
    hasColors: false,
    ...over,
  }
}

beforeEach(() => {
  profile = caller
  target.mockReset().mockResolvedValue(row())
  backfill.mockReset().mockResolvedValue(['blurhash', 'colors'])
  capabilities.mockReset().mockResolvedValue({ canEditProfile: false })
})

describe('describeLibraryAssetAction', () => {
  it('writes the descriptor when the columns are null', async () => {
    const res = await describeLibraryAssetAction('asset-1', form({ blurhash: HASH, colors: '#aabbcc,#112233' }))
    expect(res).toEqual({ ok: true, written: ['blurhash', 'colors'] })
    expect(backfill).toHaveBeenCalledWith('asset-1', { blurhash: HASH, colors: ['#aabbcc', '#112233'] })
  })

  it('refuses to overwrite a descriptor the row already carries', async () => {
    target.mockResolvedValue(row({ hasBlurhash: true, hasColors: true }))
    const res = await describeLibraryAssetAction('asset-1', form({ blurhash: HASH, colors: '#aabbcc' }))
    expect(res).toEqual({ ok: true, written: [] })
    expect(backfill).not.toHaveBeenCalled()
  })

  it('leaves the half that is already set and fills only the other', async () => {
    target.mockResolvedValue(row({ hasBlurhash: true }))
    backfill.mockResolvedValue(['colors'])
    await describeLibraryAssetAction('asset-1', form({ blurhash: HASH, colors: '#aabbcc' }))
    expect(backfill).toHaveBeenCalledWith('asset-1', { blurhash: null, colors: ['#aabbcc'] })
  })

  it('rejects a malformed blurhash rather than storing it', async () => {
    const res = await describeLibraryAssetAction('asset-1', form({ blurhash: 'not a blurhash!!' }))
    expect(res).toEqual({ error: 'Nothing to describe.' })
    expect(backfill).not.toHaveBeenCalled()
  })

  it('drops a malformed blurhash but still writes valid colours', async () => {
    backfill.mockResolvedValue(['colors'])
    await describeLibraryAssetAction('asset-1', form({ blurhash: '$$$', colors: '#aabbcc,red' }))
    expect(backfill).toHaveBeenCalledWith('asset-1', { blurhash: null, colors: ['#aabbcc'] })
  })

  it('needs a signed-in caller', async () => {
    profile = null
    expect(await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))).toEqual({ error: 'Sign in first.' })
    expect(backfill).not.toHaveBeenCalled()
  })

  it('refuses a caller who neither made the asset nor runs its Space', async () => {
    target.mockResolvedValue(row({ createdBy: 'somebody-else' }))
    const res = await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))
    expect(res).toEqual({ error: 'You cannot change that asset.' })
    expect(backfill).not.toHaveBeenCalled()
  })

  it("admits an operator of the asset's Space, and a janitor", async () => {
    target.mockResolvedValue(row({ createdBy: 'somebody-else' }))
    capabilities.mockResolvedValue({ canEditProfile: true })
    expect(await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))).toEqual({
      ok: true,
      written: ['blurhash', 'colors'],
    })

    // A Recraft row carries no created_by at all; the Loom Studio is janitor-gated, so that is the
    // authority it rides in on.
    capabilities.mockResolvedValue({ canEditProfile: false })
    target.mockResolvedValue(row({ createdBy: null }))
    profile = { id: caller.id, webRole: 'janitor' }
    expect(await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))).toEqual({
      ok: true,
      written: ['blurhash', 'colors'],
    })
  })

  it('only describes images', async () => {
    target.mockResolvedValue(row({ kind: 'element' }))
    expect(await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))).toEqual({
      error: 'That asset does not take a placeholder.',
    })
    expect(backfill).not.toHaveBeenCalled()
  })

  it('says so when the asset does not exist', async () => {
    target.mockResolvedValue(null)
    expect(await describeLibraryAssetAction('asset-1', form({ blurhash: HASH }))).toEqual({
      error: 'We could not find that asset.',
    })
  })
})

// ── Wiring guard (the house archetype: unwiring this is SILENT — a placeholder nobody sees) ──────
describe('the two generation paths describe what they made', () => {
  const studio = readFileSync('app/(main)/admin/library/create-studio.tsx', 'utf8')
  const spark = readFileSync('components/studio/spark/use-spark-offers.ts', 'utf8')
  const shared = readFileSync('lib/library/describe-generated.ts', 'utf8')

  it('the Loom Studio describes the assets a generation returned, exactly once', () => {
    expect(studio).toContain("from '@/lib/library/describe-generated'")
    expect(studio.match(/describeGeneratedAssets\(/g)).toHaveLength(1)
    expect(studio).toContain('await describeGeneratedAssets(res.assets)')
  })

  it('the Spark cover offer describes the cover it applied, exactly once and after applying', () => {
    expect(spark).toContain("from '@/lib/library/describe-generated'")
    expect(spark.match(/describeGeneratedAsset\(/g)).toHaveLength(1)
    expect(spark.indexOf('onApply(res.data, active)')).toBeLessThan(
      spark.indexOf('describeGeneratedAsset(res.data.assetId'),
    )
  })

  it('both go through ONE shared path, which decodes in the browser and posts the result', () => {
    expect(shared).toContain("'use client'")
    expect(shared).toContain('describeImageUrl(url)')
    expect(shared).toContain('describeLibraryAssetAction(assetId, form)')
  })
})
