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
    if (!(error instanceof Error)) throw new Error('Expected an unsafe endpoint refusal')
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
    if (!(error instanceof Error)) throw new Error('Expected a fixture cleanup refusal')
    expect(error.message).toContain('cleanup failed (practices)')
    expect(deleted).toEqual(['/rest/v1/practice_logs', '/rest/v1/journey_plans', '/rest/v1/practices', '/rest/v1/spaces'])
  })
})

function fullAcceptanceFixture({ omitFourth = false, leakFourth = false } = {}) {
  const pillars = ['mind', 'body', 'spirit', 'expression'].map((slug, index) => ({
    slug, id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  }))
  const logs = new Map<string, Record<string, unknown>>()
  const enrollments = new Map<string, Record<string, unknown>>()
  const insertedLogs: Array<{ id: string; supports: string[] }> = []
  const ownerReads: string[][] = []
  const privateReads: Array<{ supports: number; token: string }> = []
  const deletedLogFilters: string[] = []
  let authIndex = 0
  let practice: Record<string, unknown> = {}
  let plan: Record<string, unknown> = {}
  let planPillar = ''
  const requestImpl = vi.fn(async (url: string, options: RequestInit) => {
    const endpoint = new URL(url)
    const path = endpoint.pathname
    const method = options.method ?? 'GET'
    const token = new Headers(options.headers).get('Authorization')?.replace('Bearer ', '') ?? ''
    const payload = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {}
    const id = endpoint.searchParams.get('id')?.replace(/^eq\./, '') ?? ''
    let data: unknown = []
    let status = 200
    expect(options.redirect).toBe('error')
    expect(options.signal).toBeTruthy()
    if (path === '/rest/v1/pillars') {
      data = endpoint.searchParams.get('slug') === 'eq.expression' ? pillars.slice(3) : pillars.slice(0, 3)
    } else if (path === '/rest/v1/entities') data = [{ id: 'entity' }]
    else if (path === '/auth/v1/admin/users' && method === 'POST') data = { id: `auth-${++authIndex}` }
    else if (path.startsWith('/auth/v1/admin/users/') && method === 'DELETE') data = {}
    else if (path === '/auth/v1/token') data = { access_token: `member-token-${authIndex}` }
    else if (path === '/rest/v1/profiles') {
      data = endpoint.searchParams.has('auth_user_id') ? [{ id: `profile-${authIndex}` }]
        : [{ lifetime_zaps: 0, current_season_zaps: 0, amplitude: 0 }]
    } else if (path === '/rest/v1/spaces') data = []
    else if (path === '/rest/v1/practices') {
      if (method === 'POST') practice = { ...payload }
      else if (method === 'PATCH') practice = { ...practice, ...payload }
      else if (method === 'DELETE') practice = {}
      else throw new Error(`Unexpected practice method ${method}`)
    } else if (path === '/rest/v1/journey_plans') {
      if (method === 'POST') plan = { ...payload }
      else if (method === 'PATCH') plan = { ...plan, ...payload }
      else if (method === 'DELETE') { plan = {}; enrollments.clear() }
      else throw new Error(`Unexpected plan method ${method}`)
    } else if (path === '/rest/v1/journey_plan_items' && method === 'POST') planPillar = String(payload.domain_id)
    else if (path === '/rest/v1/journey_enrollments') {
      if (method === 'POST' && token !== localStatus.SERVICE_ROLE_KEY) status = 403
      else if (method === 'POST') {
        enrollments.set(String(payload.id), { ...payload, completion_policy: plan.official ? {
          version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
          windowStart: String(plan.window_starts_at).slice(0, 10), windowEnd: String(plan.window_ends_at).slice(0, 10), pillarIds: [planPillar],
        } : null })
      } else if (method === 'GET') data = [enrollments.get(id)]
      else if (method === 'PATCH') {
        const row = enrollments.get(id)!
        if (payload.started_at && row.completion_policy) status = 403
        else enrollments.set(id, { ...row, ...(payload.completed_at ? { completed_at: payload.completed_at } : {}) })
      } else throw new Error(`Unexpected enrollment method ${method}`)
    } else if (path === '/rest/v1/practice_logs') {
      if (method === 'POST' && token !== localStatus.SERVICE_ROLE_KEY) status = 403
      else if (method === 'POST') {
        const focus = practice.focus_details as Record<string, unknown> | undefined
        let supports = pillars.filter(p => p.id === practice.domain_id || p.id === practice.secondary_domain_id || focus?.[p.id]).map(p => p.id).sort()
        if (omitFourth && supports.length === 4) supports = supports.slice(0, 3)
        logs.set(String(payload.id), { ...payload, support_pillar_ids: supports, support_evidence_version: 1 })
        insertedLogs.push({ id: String(payload.id), supports: [...supports] })
      } else if (method === 'PATCH') {
        const row = logs.get(id)!
        logs.set(id, { ...row, completed: payload.completed, zaps_awarded: payload.zaps_awarded })
      } else if (method === 'GET') {
        const row = logs.get(id)
        if (token === localStatus.SERVICE_ROLE_KEY) data = row ? [row] : []
        else if (token === 'member-token-2') {
          data = row ? [row] : []
          ownerReads.push([...(row?.support_pillar_ids as string[] ?? [])])
        } else {
          const supports = row?.support_pillar_ids as string[] ?? []
          privateReads.push({ supports: supports.length, token })
          data = leakFourth && supports.length === 4 ? [row] : []
        }
      } else if (method === 'DELETE') {
        const filter = endpoint.searchParams.get('id') ?? ''
        deletedLogFilters.push(filter)
        if (filter.startsWith('in.(') && filter.endsWith(')')) {
          for (const target of filter.slice(4, -1).split(',')) logs.delete(target)
        } else logs.delete(id)
      } else throw new Error(`Unexpected log method ${method}`)
    } else throw new Error(`Unexpected local fixture request ${method} ${path}`)
    return new Response(JSON.stringify(data), { status })
  })
  return { requestImpl, logs, insertedLogs, ownerReads, privateReads, deletedLogFilters }
}

async function runFullFixture(fixture: ReturnType<typeof fullAcceptanceFixture>) {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  try { return await runQuestSupportAcceptance({ env, localStatus, requestImpl: fixture.requestImpl }) }
  finally { output.mockRestore() }
}

describe('Quest four-focus acceptance preserves earlier evidence and cleanup', () => {
  it('runs all eight checks with distinct three- and four-support logs and owner-only reads', async () => {
    const fixture = fullAcceptanceFixture()
    const result = await runFullFixture(fixture)
    expect(result.status).toBe('PASS')
    expect(result.checks).toHaveLength(8)
    expect(result.checks).toContain('A new four-focus log freezes all four supports with owner-only access and unchanged rewards')
    expect(fixture.insertedLogs.map(log => log.supports.length)).toEqual([3, 4])
    expect(fixture.ownerReads.map(supports => supports.length)).toEqual([3, 4])
    expect(fixture.privateReads.map(read => read.supports)).toEqual([3, 3, 4, 4])
    expect(fixture.deletedLogFilters).toEqual([`in.(${fixture.insertedLogs.map(log => log.id).join(',')})`])
    expect(fixture.logs.size).toBe(0)
  })
  it('fails on a missing fourth snapshot and still removes both log fixtures', async () => {
    const fixture = fullAcceptanceFixture({ omitFourth: true })
    await expect(runFullFixture(fixture)).rejects.toThrow()
    expect(fixture.insertedLogs).toHaveLength(2)
    expect(fixture.deletedLogFilters).toEqual([`in.(${fixture.insertedLogs.map(log => log.id).join(',')})`])
    expect(fixture.logs.size).toBe(0)
  })
  it('fails when four-focus evidence escapes its owner scope and still cleans both logs', async () => {
    const fixture = fullAcceptanceFixture({ leakFourth: true })
    await expect(runFullFixture(fixture)).rejects.toThrow('Four-focus evidence must stay within its owner scope')
    expect(fixture.insertedLogs.map(log => log.supports.length)).toEqual([3, 4])
    expect(fixture.logs.size).toBe(0)
  })
})
