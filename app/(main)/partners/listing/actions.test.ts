import { describe, it, expect, beforeEach, vi } from 'vitest'

// saveOffer (scan2 L9-04) is the only writer of partner_offers. These pin: the persona gate, the
// validation coming from lib/partners/offers, the insert being stamped with the CALLER's partner
// id, and an edit being scoped to (id, partner_id) so a foreign offer id is refused.

const h = vi.hoisted(() => {
  const state = {
    ops: [] as unknown[][],
    partner: { id: 'partner-1', slug: 'blue-cafe' } as { id: string; slug: string } | null,
    updated: { id: 'offer-9' } as { id: string } | null,
  }
  const admin = {
    from(table: string) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'insert', 'update', 'eq', 'order', 'limit']) {
        c[m] = (...args: unknown[]) => {
          state.ops.push([`${table}.${m}`, ...args])
          return c
        }
      }
      c.maybeSingle = async () => {
        if (table === 'partners') return { data: state.partner, error: null }
        if (table === 'partner_offers') return { data: state.updated, error: null }
        return { data: null, error: null }
      }
      c.single = async () => ({ data: { id: 'offer-new' }, error: null })
      return c
    },
  }
  return { state, admin }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
vi.mock('@/lib/personas', () => ({ getActivePersonas: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getActivePersonas } from '@/lib/personas'
import { saveOffer } from './actions'

const VALID = { title: 'Free refill', description: 'Any hot drink.', terms: 'Show your code.', validUntil: '2026-12-31', active: true }

describe('saveOffer', () => {
  beforeEach(() => {
    h.state.ops = []
    h.state.partner = { id: 'partner-1', slug: 'blue-cafe' }
    h.state.updated = { id: 'offer-9' }
    vi.mocked(getCallerProfile).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(getActivePersonas).mockResolvedValue(['business'] as never)
    vi.mocked(revalidatePath).mockClear()
  })

  it('refuses a signed-out caller and a caller without a partner program', async () => {
    vi.mocked(getCallerProfile).mockResolvedValue(null as never)
    expect(await saveOffer(VALID)).toEqual({ error: 'Sign in first.' })

    vi.mocked(getCallerProfile).mockResolvedValue({ id: 'me' } as never)
    vi.mocked(getActivePersonas).mockResolvedValue(['creator'] as never)
    expect(await saveOffer(VALID)).toMatchObject({ error: expect.stringContaining('Business or Organization') })
    expect(h.state.ops).toEqual([])
  })

  it('validates before touching the database', async () => {
    expect(await saveOffer({ ...VALID, title: '  ' })).toEqual({ error: 'An offer needs a title.' })
    expect(await saveOffer({ ...VALID, validUntil: 'never' })).toMatchObject({ error: expect.stringContaining('real date') })
    expect(h.state.ops).toEqual([])
  })

  it('needs a listing to hang the offer on', async () => {
    h.state.partner = null
    expect(await saveOffer(VALID)).toMatchObject({ error: expect.stringContaining('Publish your listing first') })
    expect(h.state.ops.some((o) => o[0] === 'partner_offers.insert')).toBe(false)
  })

  it('inserts a new offer stamped with the caller partner id and revalidates the public pages', async () => {
    const r = await saveOffer(VALID)
    expect(r).toEqual({ data: { id: 'offer-new' } })
    const insert = h.state.ops.find((o) => o[0] === 'partner_offers.insert')
    expect(insert?.[1]).toEqual({
      title: 'Free refill',
      description: 'Any hot drink.',
      member_terms: 'Show your code.',
      valid_until: '2026-12-31T23:59:59.999Z',
      active: true,
      partner_id: 'partner-1',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/partners/blue-cafe')
    expect(revalidatePath).toHaveBeenCalledWith('/partners/listing')
  })

  it('scopes an edit to the caller partner and refuses a foreign offer id', async () => {
    const r = await saveOffer({ ...VALID, id: 'offer-9', active: false })
    expect(r).toEqual({ data: { id: 'offer-9' } })
    const update = h.state.ops.find((o) => o[0] === 'partner_offers.update')
    expect(update?.[1]).toMatchObject({ active: false, title: 'Free refill' })
    expect(update?.[1]).not.toHaveProperty('partner_id')
    const eqs = h.state.ops.filter((o) => o[0] === 'partner_offers.eq').map((o) => o.slice(1))
    expect(eqs).toEqual([['id', 'offer-9'], ['partner_id', 'partner-1']])

    h.state.updated = null
    expect(await saveOffer({ ...VALID, id: 'someone-elses' })).toEqual({ error: 'That offer is not on your listing.' })
  })
})
