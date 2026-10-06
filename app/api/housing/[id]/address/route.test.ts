import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/housing/[id]/address (SCAN-760): the only path that reveals an 'exact' street
// address, and only to a signed-in viewer of an active housing listing. The doubles are the
// edges: Supabase Auth and the two listing reads.

let cookieUser: { id: string } | null = null
let listing: Record<string, unknown> | null = null
let detail: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: cookieUser }, error: null }) },
  }),
}))

vi.mock('@/lib/listings', () => ({
  getListing: async () => listing,
}))

vi.mock('@/lib/listings/housing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/listings/housing')>()
  return { ...actual, getHousingDetail: async () => detail }
})

async function call(id = 'h-1') {
  const { GET } = await import('./route')
  const res = await GET(new Request(`https://frequencylocal.com/api/housing/${id}/address`), {
    params: Promise.resolve({ id }),
  })
  return { res, body: (await res.json()) as { addressLine: string | null } }
}

beforeEach(() => {
  cookieUser = { id: 'auth-1' }
  listing = { id: 'h-1', vertical: 'housing', status: 'active', city: 'Portland', neighborhood: 'Alberta' }
  detail = { listingId: 'h-1', addressPrecision: 'exact', addressLine: '123 NE Alberta St' }
})

describe('GET /api/housing/[id]/address', () => {
  it('returns the street address to a signed-in viewer when the host chose exact', async () => {
    const { res, body } = await call()
    expect(res.status).toBe(200)
    expect(body.addressLine).toBe('123 NE Alberta St')
    expect(res.headers.get('Cache-Control')).toBe('no-store, private')
  })

  it('returns null to an anonymous caller', async () => {
    cookieUser = null
    const { body } = await call()
    expect(body.addressLine).toBeNull()
  })

  it('returns null when the host chose a coarser precision', async () => {
    detail = { ...detail, addressPrecision: 'neighborhood' }
    const { body } = await call()
    expect(body.addressLine).toBeNull()
  })

  it('returns null for a listing that is not active housing', async () => {
    listing = { ...listing, status: 'closed' }
    expect((await call()).body.addressLine).toBeNull()
    listing = { ...listing, status: 'active', vertical: 'classifieds' }
    expect((await call()).body.addressLine).toBeNull()
    listing = null
    expect((await call()).body.addressLine).toBeNull()
  })

  it('never caches', async () => {
    const mod = await import('./route')
    expect(mod.dynamic).toBe('force-dynamic')
  })
})
