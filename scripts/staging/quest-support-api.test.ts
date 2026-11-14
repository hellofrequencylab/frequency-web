import { describe, expect, it, vi } from 'vitest'
import { runQuestSupportAcceptance } from './quest-support-api.mjs'
const localStatus = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'local-anon', SERVICE_ROLE_KEY: 'local-service' }
const env = { FREQUENCY_EPHEMERAL_ROOM_STAGING: '1' }

describe('Quest acceptance localhost and cleanup guards', () => {
  it('requires opt-in before any request or local CLI credential read', async () => {
    const requestImpl = vi.fn()
    await expect(runQuestSupportAcceptance({ env: {}, localStatus, requestImpl })).rejects.toThrow('Explicit ephemeral staging opt-in')
    expect(requestImpl).not.toHaveBeenCalled()
  })
  it.each(['https://127.0.0.1:54321', 'https://production.example', 'http://127.0.0.1.evil',
    'http://user:private-password@127.0.0.1:54321', 'http://localhost:54321/path',
    'http://localhost:54321/?key=secret', 'http://localhost:54321/#fragment', 'not-a-url'])('rejects unsafe endpoint %s before HTTP', async (url) => {
    const requestImpl = vi.fn()
    const error = await runQuestSupportAcceptance({ env, localStatus: { ...localStatus, API_URL: url }, requestImpl }).catch((value: Error) => value)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).not.toContain('private-password')
    expect(requestImpl).not.toHaveBeenCalled()
  })
  it('never substitutes hosted environment keys for missing local credentials', async () => {
    const requestImpl = vi.fn()
    await expect(runQuestSupportAcceptance({ env: { ...env, SUPABASE_SERVICE_ROLE_KEY: 'not-local' }, localStatus: { ...localStatus, SERVICE_ROLE_KEY: '' }, requestImpl })).rejects.toThrow('Locally generated distinct API keys')
    expect(requestImpl).not.toHaveBeenCalled()
  })
  it('deletes partial fixtures and Auth users after a staging API failure', async () => {
    const calls: Array<{ path: string; method: string }> = []
    let authIndex = 0
    const requestImpl = vi.fn(async (url: string, options: RequestInit) => {
      const endpoint = new URL(url)
      const path = endpoint.pathname
      const method = options.method ?? 'GET'
      calls.push({ path, method })
      expect(options.redirect).toBe('error')
      expect(options.signal).toBeTruthy()
      let data: unknown = []
      let status = 200
      if (path === '/rest/v1/pillars') data = [{ slug: 'mind', id: 'mind' }, { slug: 'body', id: 'body' }, { slug: 'spirit', id: 'spirit' }]
      else if (path === '/rest/v1/entities') data = [{ id: 'entity' }]
      else if (path === '/auth/v1/admin/users' && method === 'POST') data = { id: `auth-${++authIndex}` }
      else if (path === '/rest/v1/profiles') data = [{ id: `profile-${authIndex}` }]
      else if (path === '/auth/v1/token') data = { access_token: 'member-token' }
      else if (path === '/rest/v1/journey_plan_items' && method === 'POST') { status = 500; data = { message: 'provider body must not escape' } }
      return new Response(JSON.stringify(data), { status })
    })
    await expect(runQuestSupportAcceptance({ env, localStatus, requestImpl })).rejects.toThrow('provider body withheld')
    for (const path of ['/rest/v1/practice_logs', '/rest/v1/journey_plans', '/rest/v1/practices', '/rest/v1/spaces', '/auth/v1/admin/users/auth-1', '/auth/v1/admin/users/auth-2']) {
      expect(calls).toContainEqual({ path, method: 'DELETE' })
    }
  })
  it('continues cleanup after one deletion fails and reports only fixture categories', async () => {
    const deleted: string[] = []
    const requestImpl = vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname
      if (options.method === 'DELETE') { deleted.push(path); return new Response('{}', { status: path === '/rest/v1/practices' ? 500 : 200 }) }
      return new Response('{}', { status: 500 })
    })
    const error = await runQuestSupportAcceptance({ env, localStatus, requestImpl }).catch((value: Error) => value)
    expect(error.message).toContain('cleanup failed (practices)')
    expect(deleted).toEqual(['/rest/v1/practice_logs', '/rest/v1/journey_plans', '/rest/v1/practices', '/rest/v1/spaces'])
  })
})
