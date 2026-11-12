import { describe, it, expect } from 'vitest'
import { readAllPages } from './campaigns'

// PostgREST answers at most 1,000 rows a request, so an unranged read of a 10,000 person audience
// silently resolved to its first 1,000 and the send reported success.

const table = Array.from({ length: 2_450 }, (_, i) => ({ id: i }))
const page = async (from: number, to: number) => ({ data: table.slice(from, Math.min(to, from + 999) + 1), error: null })

describe('readAllPages', () => {
  it('reads every row of an audience larger than one response', async () => {
    const rows = await readAllPages(page)
    expect(rows).toHaveLength(2_450)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_450)
  })

  it('stops after a short page, including an exact multiple of the page size', async () => {
    let calls = 0
    const exact = Array.from({ length: 2_000 }, (_, i) => ({ id: i }))
    const rows = await readAllPages(async (from, to) => {
      calls++
      return { data: exact.slice(from, to + 1), error: null }
    })
    expect(rows).toHaveLength(2_000)
    expect(calls).toBe(3)
  })

  it('a read error stops the send instead of shrinking the audience', async () => {
    await expect(
      readAllPages(async (from) => (from === 0 ? { data: table.slice(0, 1_000), error: null } : { data: null, error: { message: 'timeout' } })),
    ).rejects.toThrow('Could not read the audience: timeout')
  })
})
