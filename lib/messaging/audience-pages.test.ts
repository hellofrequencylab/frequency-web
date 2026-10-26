import { describe, expect, it } from 'vitest'
import { AUDIENCE_PAGE_SIZE, AUDIENCE_ROW_LIMIT, readAudiencePages } from './audience-pages'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(8, '0') }))
const page = (data: { id: string }[]) => async (after: string | null) => ({ data: data.filter(row => after === null || row.id > after).slice(0, AUDIENCE_PAGE_SIZE), error: null })

describe('bounded complete audience reads', () => {
  it('reads all pages, including an exact page boundary', async () => {
    expect(await readAudiencePages(page(rows(1205)))).toHaveLength(1205)
    expect(await readAudiencePages(page(rows(1000)))).toHaveLength(1000)
    expect(await readAudiencePages(page([]))).toEqual([])
  })
  it('discards the partial result on a later page error', async () => {
    await expect(readAudiencePages(async after => after ? { data: null, error: { message: 'unavailable' } } : { data: rows(500), error: null })).rejects.toThrow('complete audience')
  })
  it('refuses a stalled cursor rather than looping or duplicating recipients', async () => {
    await expect(readAudiencePages(async () => ({ data: rows(500), error: null }))).rejects.toThrow('cursor')
  })
  it('keeps the existing 20,000-row bound explicit instead of silently clipping', async () => {
    expect(await readAudiencePages(page(rows(AUDIENCE_ROW_LIMIT)))).toHaveLength(AUDIENCE_ROW_LIMIT)
    await expect(readAudiencePages(page(rows(AUDIENCE_ROW_LIMIT + 1)))).rejects.toThrow('bounded read limit')
  })
})
