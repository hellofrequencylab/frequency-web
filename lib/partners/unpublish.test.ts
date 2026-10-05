import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-761: the one write that takes a partner listing out of the directory. Pins: it hides every
// listing the profile owns (status 'inactive', the column's own vocabulary), pauses the offers
// that hang on them, revalidates both the app-shell and the canonical public pages, and is a
// no-op (not an error) for a member who never published.

const h = vi.hoisted(() => {
  const state = {
    ops: [] as unknown[][],
    rows: [{ id: 'p1', slug: 'blue-cafe' }] as { id: string; slug: string }[],
    personas: ['business'] as string[],
  }
  const admin = {
    from(table: string) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'update', 'eq', 'in']) {
        c[m] = (...args: unknown[]) => {
          state.ops.push([`${table}.${m}`, ...args])
          return c
        }
      }
      c.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: table === 'partners' ? state.rows : null, error: null }))
      return c
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/personas', () => ({ getActivePersonas: async () => h.state.personas }))

import { revalidatePath } from 'next/cache'
import { hidePartnerListing, listingProgramLost } from './unpublish'

beforeEach(() => {
  h.state.ops = []
  h.state.rows = [{ id: 'p1', slug: 'blue-cafe' }]
  h.state.personas = ['business']
  vi.mocked(revalidatePath).mockClear()
})

describe('hidePartnerListing', () => {
  it('sets the owner listings inactive, pauses their offers and revalidates every public page', async () => {
    expect(await hidePartnerListing('me')).toEqual({ slugs: ['blue-cafe'] })
    expect(h.state.ops).toEqual([
      ['partners.select', 'id, slug'],
      ['partners.eq', 'contact_profile_id', 'me'],
      ['partners.update', { status: 'inactive' }],
      ['partners.in', 'id', ['p1']],
      ['partner_offers.update', { active: false }],
      ['partner_offers.in', 'partner_id', ['p1']],
    ])
    for (const path of ['/partners', '/partners/listing', '/discover/partners', '/partners/blue-cafe', '/discover/partners/blue-cafe']) {
      expect(revalidatePath).toHaveBeenCalledWith(path)
    }
  })

  it('writes nothing for a member with no listing', async () => {
    h.state.rows = []
    expect(await hidePartnerListing('me')).toEqual({ slugs: [] })
    expect(h.state.ops.some((o) => String(o[0]).endsWith('.update'))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('listingProgramLost', () => {
  it('is only a Business or Organization question', async () => {
    h.state.personas = []
    expect(await listingProgramLost('collaborator', 'me')).toBe(false)
    expect(await listingProgramLost('practitioner', 'me')).toBe(false)
  })

  it('is true once neither listing program is live, false while the other still is', async () => {
    h.state.personas = []
    expect(await listingProgramLost('business', 'me')).toBe(true)
    h.state.personas = ['organization']
    expect(await listingProgramLost('business', 'me')).toBe(false)
    h.state.personas = ['business']
    expect(await listingProgramLost('organization', 'me')).toBe(false)
  })
})
