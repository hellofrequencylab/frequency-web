import { describe, it, expect, beforeEach, vi } from 'vitest'

// setPersona release (SCAN-761): releasing the member's last Business or Organization program
// takes their directory listing down with it. Releasing one while the other is still live, or
// releasing a program that carries no listing, leaves the partners table alone.

const h = vi.hoisted(() => {
  const state = { ops: [] as unknown[][], hidden: [] as string[], lost: false }
  const admin = {
    from(table: string) {
      const c: Record<string, unknown> = {}
      for (const m of ['upsert', 'update', 'eq']) {
        c[m] = (...args: unknown[]) => {
          state.ops.push([`${table}.${m}`, ...args])
          return c
        }
      }
      c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: null }))
      return c
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'me' }) }))
vi.mock('@/lib/partners/unpublish', () => ({
  listingProgramLost: async () => h.state.lost,
  hidePartnerListing: async (id: string) => {
    h.state.hidden.push(id)
    return { slugs: ['blue-cafe'] }
  },
}))

import { setPersona } from './actions'

beforeEach(() => {
  h.state.ops = []
  h.state.hidden = []
  h.state.lost = false
})

describe('setPersona release', () => {
  it('suspends the persona and takes the listing down when it was the last listing program', async () => {
    h.state.lost = true
    expect(await setPersona('business', false)).toEqual({ data: undefined })
    expect(h.state.ops[0]).toEqual(['profile_personas.update', { state: 'suspended' }])
    expect(h.state.hidden).toEqual(['me'])
  })

  it('leaves the listing up while another listing program is still live', async () => {
    expect(await setPersona('business', false)).toEqual({ data: undefined })
    expect(h.state.hidden).toEqual([])
  })

  it('never hides on a claim', async () => {
    h.state.lost = true
    expect(await setPersona('business', true)).toEqual({ data: undefined })
    expect(h.state.ops[0][0]).toBe('profile_personas.upsert')
    expect(h.state.hidden).toEqual([])
  })
})
