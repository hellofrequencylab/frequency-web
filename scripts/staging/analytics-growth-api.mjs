// Disposable localhost Auth/PostgREST acceptance only. Credentials come from the local CLI,
// never process environment project URLs or production keys. No provider sends or rollout flags.
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { growthSnapshotSchema } from '../../lib/analytics/growth.ts'

if (process.env.FREQUENCY_EPHEMERAL_ROOM_STAGING !== '1') throw new Error('Explicit ephemeral staging opt-in required')
let status
try {
  status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
} catch { throw new Error('Unable to read local staging status; captured credentials are withheld') }
let endpoint
try { endpoint = new URL(status.API_URL) } catch { throw new Error('Local staging API URL is invalid; captured credentials are withheld') }
assert.ok(['127.0.0.1', 'localhost'].includes(endpoint.hostname) && endpoint.protocol === 'http:', 'Only local Supabase API is permitted')
assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/', 'Local API URL must be a plain localhost origin')
const base = endpoint.origin
const anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY
assert.ok(anon && service, 'Locally generated API keys required')
const checks = []
const suffix = randomUUID().replaceAll('-', '')
const email = `analytics-growth-${suffix}@example.invalid`
const password = randomBytes(24).toString('base64url')
let ownedUser = null
let ownedProfile = null

async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const raw = await response.text()
  let data
  try { data = raw ? JSON.parse(raw) : null } catch { throw new Error(`Non-JSON local API response (${response.status})`) }
  return { status: response.status, ok: response.ok, data }
}
function success(response) {
  assert.ok(response.ok, `Local API status ${response.status}, code ${response.data?.code ?? 'unavailable'}`)
  return response.data
}
const snapshot = async (args = {}, token = service) => request('/rest/v1/rpc/analytics_growth_snapshot', token, 'POST', args)
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
function valid(response) {
  const result = growthSnapshotSchema.safeParse(success(response))
  assert.ok(result.success, 'Local RPC must satisfy the complete application aggregate contract')
  return result.data
}
try {
  const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
  assert.match(user.id, /^[0-9a-f-]{36}$/i); ownedUser = user.id
  const profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${ownedUser}&select=id`, service))
  assert.equal(profiles.length, 1, 'Actual auth signup trigger must create one profile')
  ownedProfile = profiles[0].id
  const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email, password }))
  assert.ok(signed.access_token, 'Real authenticated access token is required')
  await check('Anonymous and real signed-in Members cannot execute platform-wide growth reporting', async () => {
    for (const token of [anon, signed.access_token]) {
      const response = await snapshot({}, token)
      assert.equal(response.ok, false)
      assert.equal(response.data?.code, '42501', 'Database privilege boundary must refuse the caller')
    }
  })
  await check('Local service role reads complete aggregate schema without raw fixture identities', async () => {
    const data = valid(await snapshot())
    assert.equal(data.windowDays, 30)
    const serialized = JSON.stringify(data)
    for (const identity of [ownedUser, ownedProfile, email, password, signed.access_token]) assert.ok(!serialized.includes(identity), 'Aggregate output must not contain fixture identities or secrets')
  })
  await check('PostgREST preserves minimum, maximum and null-default reporting windows', async () => {
    assert.equal(valid(await snapshot({ _days: -4 })).windowDays, 1)
    assert.equal(valid(await snapshot({ _days: 900 })).windowDays, 90)
    assert.equal(valid(await snapshot({ _days: null })).windowDays, 30)
  })
  console.log(JSON.stringify({ status: 'PASS', level: 'Disposable local Supabase real Auth/PostgREST HTTP; no hosted project', checks }))
} finally {
  const failures = []
  if (ownedProfile) {
    try { success(await request(`/rest/v1/profiles?id=eq.${ownedProfile}`, service, 'DELETE')) } catch { failures.push('profile') }
  }
  if (ownedUser) {
    try { success(await request(`/auth/v1/admin/users/${ownedUser}`, service, 'DELETE')) } catch { failures.push('user') }
  }
  if (failures.length) throw new Error(`Local fixture cleanup failed (${failures.join(', ')}); unconditional workflow container cleanup must still run`)
  console.log('Local growth profile and user fixtures removed; no provider send requested')
}
