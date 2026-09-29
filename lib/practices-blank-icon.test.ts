import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-648 — A BLANK ICON MUST NOT FAIL THE WHOLE PRACTICE SAVE.
//
// `practices.icon` is NOT NULL (default 'sparkles'). The practice builder's "Use default" button
// saves `{ icon: '', header_image: null }`, and updatePractice turned the blank icon into a null,
// so the database rejected the update and the author saw "Could not save": the icon did not reset
// and the header image did not clear either.
//
// The mocked database below enforces the column's NOT NULL the way Postgres does: an update that
// writes `icon: null` returns an error and no row. The tests drive the REAL updatePractice and
// assert on both consequences: the payload never carries a null icon, and the save returns a row.

let row: Record<string, unknown>
let updatePayload: Record<string, unknown> | null = null

function builder() {
  let mode: 'read' | 'write' = 'read'
  let payload: Record<string, unknown> | null = null
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    update(p: Record<string, unknown>) {
      mode = 'write'
      payload = p
      updatePayload = p
      return api
    },
    async maybeSingle() {
      if (mode === 'read') return { data: { ...row }, error: null }
      if (payload && 'icon' in payload && payload.icon == null)
        return { data: null, error: { code: '23502', message: 'null value in column "icon" violates not-null constraint' } }
      return { data: { ...row, ...payload }, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))
vi.mock('@/lib/practices/embeddings', () => ({ embedPractice: async () => {} }))

const { updatePractice } = await import('./practices')

beforeEach(() => {
  updatePayload = null
  row = { id: 'p-1', title: 'Box Breathing', slug: 'box-breathing', is_public: false, icon: 'wind', header_image: 'https://x/y.jpg' }
})

describe('updatePractice never writes a null icon (LIVE-648)', () => {
  it('"Use default" (blank icon + cleared header image) saves, resetting the icon to sparkles', async () => {
    const saved = await updatePractice('p-1', { icon: '', header_image: null })
    expect(updatePayload?.icon).toBe('sparkles')
    expect(updatePayload?.header_image).toBeNull()
    expect(saved).not.toBeNull()
    expect(saved?.icon).toBe('sparkles')
  })

  it('a whitespace-only or null icon also falls back to the column default', async () => {
    await updatePractice('p-1', { icon: '   ' })
    expect(updatePayload?.icon).toBe('sparkles')
    const saved = await updatePractice('p-1', { icon: null })
    expect(updatePayload?.icon).toBe('sparkles')
    expect(saved).not.toBeNull()
  })

  it('a chosen icon is written as chosen', async () => {
    await updatePractice('p-1', { icon: ' leaf ' })
    expect(updatePayload?.icon).toBe('leaf')
  })

  it('a patch without an icon leaves the icon alone', async () => {
    await updatePractice('p-1', { summary: 'Four counts in, four out' })
    expect(updatePayload).not.toHaveProperty('icon')
  })
})
