import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ user: true, reads: [] as string[] }))
function query(session: boolean, table: string) {
  fixture.reads.push(`${session ? 'session' : 'admin'}:${table}`)
  if (!session && table === 'circles') throw new Error('Circle discovery must not bypass RLS')
  const q = { select: () => q, or: () => q, eq: () => q, neq: () => q, order: () => q, limit: async () => ({ data: table === 'circles' ? [{ id: 'public-circle', name: 'Visible Circle', slug: 'visible', image_url: null }] : [] }) }
  return q
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: fixture.user ? { id: 'outsider' } : null } }) }, from: (table: string) => query(true, table) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => query(false, table) }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true, clientIp: () => 'test', tooMany: vi.fn() }))
import { GET } from './route'
beforeEach(() => { fixture.user = true; fixture.reads.length = 0 })
it('uses session policy-filtered Circle rows, never the privileged Circle client', async () => {
  const response = await GET(new Request('https://example.com/api/search-scopes?q=ci'))
  expect(await response.json()).toEqual({ spaces: [], circles: [{ id: 'public-circle', name: 'Visible Circle', slug: 'visible', image_url: null }] })
  expect(fixture.reads).toEqual(['admin:spaces', 'session:circles'])
})
it('rejects signed-out discovery before reading either table', async () => {
  fixture.user = false
  const response = await GET(new Request('https://example.com/api/search-scopes?q=ci'))
  expect(response.status).toBe(401)
  expect(fixture.reads).toEqual([])
})
