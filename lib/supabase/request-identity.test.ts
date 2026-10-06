import { describe, expect, it, vi } from 'vitest'

// LIVE-717: inside a verified bearer scope the two identity seams answer as the bearer caller,
// and outside it they are the cookie path, untouched.

const bearerClient = { kind: 'bearer' }
const cookieClient = { kind: 'cookie', auth: { getUser: async () => ({ data: { user: { id: 'cookie-user' } } }) } }

vi.mock('@supabase/ssr', () => ({ createServerClient: () => cookieClient }))
vi.mock('./bearer', () => ({ createBearerClient: (token: string) => ({ ...bearerClient, token }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], get: () => ({ value: 'host' }), set: () => {} }) }))
vi.mock('./env', () => ({ supabaseUrl: () => 'https://x.supabase.co', supabaseAnonKey: () => 'anon' }))

describe('the bearer request scope', () => {
  it('createClient is the bearer client inside the scope and the cookie client outside it', async () => {
    const { createClient } = await import('./server')
    const { runAsBearer } = await import('./request-identity')
    expect(await createClient()).toBe(cookieClient)
    const inside = await runAsBearer({ token: 'tok', user: { id: 'u-1' } as never }, () => createClient())
    expect(inside).toEqual({ kind: 'bearer', token: 'tok' })
  })

  it('does not leak across concurrent calls', async () => {
    const { runAsBearer, bearerIdentity } = await import('./request-identity')
    const [a, b, outside] = await Promise.all([
      runAsBearer({ token: 'a', user: { id: 'a' } as never }, async () => {
        await new Promise((r) => setTimeout(r, 5))
        return bearerIdentity()?.token
      }),
      runAsBearer({ token: 'b', user: { id: 'b' } as never }, async () => bearerIdentity()?.token),
      Promise.resolve(bearerIdentity()),
    ])
    expect([a, b, outside]).toEqual(['a', 'b', null])
  })

  it('view-as never applies to a bearer caller', async () => {
    const { readViewAsTarget } = await import('@/lib/view-as')
    const { runAsBearer } = await import('./request-identity')
    expect(await readViewAsTarget()).toBe('host')
    expect(await runAsBearer({ token: 't', user: { id: 'u' } as never }, () => readViewAsTarget())).toBeNull()
  })
})
