// Explicit disposable local Supabase only. No hosted URL, external credentials, provider sends,
// rollout flags, or production experiment rows are accepted or touched by this exercise.
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

if (process.env.FREQUENCY_EPHEMERAL_ROOM_STAGING !== '1') throw new Error('Explicit ephemeral staging opt-in required')
let status
try {
  status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
} catch { throw new Error('Unable to read local staging status; captured credentials are withheld') }
const base = status.API_URL
const endpoint = new URL(base)
assert.ok(['127.0.0.1', 'localhost'].includes(endpoint.hostname) && endpoint.protocol === 'http:', 'Only local Supabase API is permitted')
const anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY
assert.ok(anon && service, 'Locally generated API keys required')
const users = [], checks = []
const key = 'upcoming-next-step'
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const password = randomBytes(24).toString('base64url')
let ownedPilot = null

async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
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
function refused(response, codes = ['42501']) {
  assert.equal(response.ok, false)
  assert.ok(codes.includes(response.data?.code), `Expected ${codes.join('/')}, got status ${response.status} code ${response.data?.code ?? 'unavailable'}`)
}
const rpc = async (name, args, token = service) => request('/rest/v1/rpc/' + name, token, 'POST', args)
const rows = async () => success(await request(`/rest/v1/analytics_experiment_assignments?experiment_id=eq.${ownedPilot}&select=profile_id,variant,assigned_at,exposed_at,converted_at`, service))
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }

try {
  // Refuse to mutate an experiment this process did not create, even on the disposable stack.
  assert.deepEqual(success(await request(`/rest/v1/analytics_experiments?key=eq.${key}&select=id`, service)), [], 'Fresh staging must not contain an existing pilot')
  for (let i = 0; i < 2; i++) {
    const email = `analytics-experiment-${suffix}-${i}@example.invalid`
    const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
    assert.ok(user.id); users.push({ auth: user.id })
    const profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.id}&select=id`, service))
    assert.equal(profiles.length, 1, 'Actual auth signup trigger must create one profile')
    users[i].profile = profiles[0].id
    const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email, password }))
    assert.ok(signed.access_token); users[i].token = signed.access_token
  }
  const [member, other] = users
  const assignment = () => rpc('analytics_experiment_assign', { _key: key, _profile: member.profile })
  await check('Real anonymous and authenticated callers cannot read private pilot or assignment tables', async () => {
    for (const token of [anon, member.token]) for (const table of ['analytics_experiments', 'analytics_experiment_assignments']) refused(await request(`/rest/v1/${table}?select=*`, token))
  })
  await check('Draft creation never allocates traffic and the service catalog rejects invented variants', async () => {
    assert.equal(success(await assignment()), null)
    refused(await rpc('analytics_experiment_manage', { _key: 'invented', _command: 'draft', _actor: member.profile }), ['P0001'])
    ownedPilot = success(await rpc('analytics_experiment_manage', { _key: key, _command: 'draft', _actor: member.profile }))
    assert.match(ownedPilot, /^[0-9a-f-]{36}$/i)
    assert.equal(success(await assignment()), null)
  })
  await check('Anonymous and authenticated clients cannot bypass RPC boundaries with direct table writes', async () => {
    for (const token of [anon, member.token]) {
      refused(await request('/rest/v1/analytics_experiments', token, 'POST', { key, primary_event: 'event.rsvp' }))
      refused(await request(`/rest/v1/analytics_experiments?id=eq.${ownedPilot}`, token, 'PATCH', { status: 'running' }))
      refused(await request('/rest/v1/analytics_experiment_assignments', token, 'POST', { experiment_id: ownedPilot, profile_id: member.profile, variant: 'treatment' }))
    }
  })
  await check('Every client-callable experiment RPC refuses both anonymous and authenticated callers', async () => {
    const calls = [
      ['analytics_experiment_manage', { _key: key, _command: 'start', _actor: member.profile }],
      ['analytics_experiment_assign', { _key: key, _profile: member.profile }],
      ['analytics_experiment_expose', { _experiment: ownedPilot, _profile: member.profile }],
      ['analytics_experiment_outcome', { _event: 'event.rsvp', _profile: member.profile }],
      ['analytics_experiment_results', {}],
      ['analytics_experiment_purge', { _cutoff: new Date(Date.now() - 180 * 86_400_000).toISOString() }],
    ]
    for (const token of [anon, member.token]) for (const [name, args] of calls) refused(await rpc(name, args, token))
  })
  let assigned
  await check('An explicitly started local pilot assigns stably without recording an exposure', async () => {
    success(await rpc('analytics_experiment_manage', { _key: key, _command: 'start', _actor: member.profile }))
    assigned = success(await assignment())
    assert.equal(assigned.id, ownedPilot)
    assert.ok(['control', 'treatment'].includes(assigned.variant))
    assert.deepEqual(success(await assignment()), assigned)
    const actual = await rows(); assert.equal(actual.length, 1); assert.equal(actual[0].exposed_at, null)
    success(await rpc('analytics_experiment_outcome', { _event: 'event.rsvp', _profile: member.profile }))
    assert.equal((await rows())[0].converted_at, null, 'No conversion without exposure')
  })
  await check('Exposure is idempotent and only the configured authoritative outcome converts', async () => {
    success(await rpc('analytics_experiment_expose', { _experiment: ownedPilot, _profile: member.profile }))
    const exposure = (await rows())[0].exposed_at; assert.ok(exposure)
    success(await rpc('analytics_experiment_expose', { _experiment: ownedPilot, _profile: member.profile }))
    assert.equal((await rows())[0].exposed_at, exposure)
    success(await rpc('analytics_experiment_outcome', { _event: 'nav.page_view', _profile: member.profile }))
    assert.equal((await rows())[0].converted_at, null)
    success(await rpc('analytics_experiment_outcome', { _event: 'event.rsvp', _profile: member.profile }))
    assert.ok((await rows())[0].converted_at)
  })
  await check('Aggregate results retain incomplete follow-up and reveal no member identities', async () => {
    const result = success(await rpc('analytics_experiment_results', {}))
    assert.equal(result.length, 1)
    assert.equal(result[0][assigned.variant].pending, 1)
    assert.equal(result[0][assigned.variant].eligible, 0)
    assert.ok(!JSON.stringify(result).includes(member.profile))
  })
  await check('Pausing blocks new enrollment while retaining previously exposed follow-up', async () => {
    success(await rpc('analytics_experiment_manage', { _key: key, _command: 'pause', _actor: member.profile }))
    assert.deepEqual(success(await assignment()), assigned)
    assert.equal(success(await rpc('analytics_experiment_assign', { _key: key, _profile: other.profile })), null)
    refused(await rpc('analytics_experiment_manage', { _key: key, _command: 'finish', _actor: member.profile }), ['P0001'])
  })
  await check('Retention rejects premature cutoffs, reports exact counts and preserves only anonymous attrition', async () => {
    refused(await rpc('analytics_experiment_purge', { _cutoff: new Date().toISOString() }), ['P0001'])
    const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString()
    assert.equal(Number(success(await rpc('analytics_experiment_purge', { _cutoff: cutoff }))), 0)
    success(await request(`/rest/v1/analytics_experiment_assignments?experiment_id=eq.${ownedPilot}&profile_id=eq.${member.profile}`, service, 'PATCH', { assigned_at: new Date(Date.now() - 181 * 86_400_000).toISOString() }))
    assert.equal(Number(success(await rpc('analytics_experiment_purge', { _cutoff: cutoff }))), 1)
    assert.deepEqual(await rows(), [])
    const result = success(await rpc('analytics_experiment_results', {}))[0]
    assert.equal(result[assigned.variant].excluded, 1)
  })
  await check('A real authenticated consent withdrawal deletes membership and retains anonymous attrition', async () => {
    success(await rpc('analytics_experiment_manage', { _key: key, _command: 'start', _actor: member.profile }))
    success(await assignment())
    success(await rpc('analytics_experiment_expose', { _experiment: ownedPilot, _profile: member.profile }))
    success(await request('/rest/v1/consent_records', member.token, 'POST', { profile_id: member.profile, scope: 'analytics', granted: false }))
    assert.deepEqual(await rows(), [])
    const result = success(await rpc('analytics_experiment_results', {}))[0]
    assert.equal(result[assigned.variant].excluded, 2)
  })
  console.log(JSON.stringify({ status: 'PASS', level: 'Disposable local Supabase full migration schema and real Auth/PostgREST HTTP; no hosted project', checks }))
} finally {
  const cleanupFailures = []
  if (ownedPilot) {
    try { success(await request(`/rest/v1/analytics_experiments?id=eq.${ownedPilot}`, service, 'DELETE')) } catch { cleanupFailures.push('pilot') }
  }
  for (const user of users) {
    try { success(await request(`/auth/v1/admin/users/${user.auth}`, service, 'DELETE')) } catch { cleanupFailures.push('user') }
  }
  if (cleanupFailures.length) throw new Error(`Local fixture cleanup failed (${cleanupFailures.join(', ')}); unconditional workflow container cleanup must still run`)
  console.log('Local experiment and user fixtures removed; no provider send requested')
}
