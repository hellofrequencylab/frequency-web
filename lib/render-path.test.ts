import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'

const state: { value: unknown; throws: boolean } = { value: null, throws: false }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.throws) throw new Error('down')
            return { data: state.value === null ? null : { value: state.value } }
          },
        }),
      }),
    }),
  }),
}))

import { RENDER_PATH_SURFACES, renderPathKey } from './render-path'
import { renderPathEnabled } from './platform-flags'

describe('render_path flags', () => {
  it('every surface key is seeded false by a migration', () => {
    const sql = readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
      .join('\n')
    for (const s of RENDER_PATH_SURFACES) expect(sql).toMatch(new RegExp(`\\('${renderPathKey(s)}',\\s*false\\)`))
  })

  it('is fail-closed: a missing row, a garbage value and a read error all mean the old path', async () => {
    state.value = null
    expect(await renderPathEnabled('site')).toBe(false)
    state.value = 'true'
    expect(await renderPathEnabled('email')).toBe(false)
    state.throws = true
    expect(await renderPathEnabled('spotlight')).toBe(false)
  })

  it('reads an explicit true', async () => {
    state.throws = false
    state.value = true
    expect(await renderPathEnabled('marketing')).toBe(true)
  })
})
