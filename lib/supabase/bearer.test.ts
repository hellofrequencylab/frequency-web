import { describe, expect, it, vi } from 'vitest'

// LIVE-716: inside a verified scope, the no-argument `auth.getUser()` that cookie-era lib code
// calls answers with the verified user instead of "no session". A call with a token still asks Auth.

const askAuth = vi.fn(async (jwt?: string) => ({ data: { user: { id: `auth:${jwt}` } }, error: null }))

vi.mock('server-only', () => ({}))
vi.mock('./env', () => ({ supabaseUrl: () => 'https://x.supabase.co', supabaseAnonKey: () => 'anon' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: askAuth } }) }))

describe('createBearerClient', () => {
  it('answers a no-argument getUser with the verified user', async () => {
    const { createBearerClient } = await import('./bearer')
    const client = createBearerClient('tok', { id: 'u-1' } as never)
    expect((await client.auth.getUser()).data.user).toEqual({ id: 'u-1' })
    expect(askAuth).not.toHaveBeenCalled()
    expect((await client.auth.getUser('other')).data.user).toEqual({ id: 'auth:other' })
  })

  it('leaves getUser alone without a verified user', async () => {
    const { createBearerClient } = await import('./bearer')
    askAuth.mockClear()
    await createBearerClient('tok').auth.getUser('tok')
    expect(askAuth).toHaveBeenCalledWith('tok')
  })
})
