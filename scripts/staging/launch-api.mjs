// Isolated local Docker only. Never accepts a hosted project URL or external credentials.
// Real Auth + PostgREST acceptance for the Vera guided launch tables (20270346026000_vera_launch.sql):
// the same calls the browser would make, as anon, as the owner and as a stranger.
import { execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
if (process.env.FREQUENCY_EPHEMERAL_ROOM_STAGING !== '1') throw new Error('Explicit ephemeral staging opt-in required')
let status
try { status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) } catch { throw new Error('Unable to read local staging status; captured credentials are withheld') }
const base = status.API_URL
const url = new URL(base)
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'Only local Supabase API is permitted')
const anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY
assert.ok(anon && service, 'Locally generated API keys required')
const users = [], launches = [], checks = []
const password = randomBytes(24).toString('base64url')
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { throw new Error(`Non-JSON local API response (${response.status})`) }
  return { status: response.status, ok: response.ok, data }
}
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
function success(response) { assert.ok(response.ok, `Local API status ${response.status}, code ${response.data?.code ?? 'unavailable'}`); return response.data }
function refused(response, codes) { assert.equal(response.ok, false); assert.ok(codes.includes(response.data?.code), `Expected ${codes.join('/')}, got status ${response.status} code ${response.data?.code ?? 'unavailable'}`) }
try {
  for (let i = 0; i < 2; i++) {
    const email = `vera-launch-${suffix}-${i}@example.invalid`
    const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
    assert.ok(user.id); users.push({ auth: user.id, email })
    let profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.id}&select=id`, service))
    if (!profiles.length) profiles = success(await request('/rest/v1/profiles', service, 'POST', { auth_user_id: user.id, display_name: 'Ephemeral launch staging', handle: `launch_${suffix}_${i}`, is_active: true }))
    assert.equal(profiles.length, 1); users[i].profile = profiles[0].id
    const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email, password }))
    assert.ok(signed.access_token); users[i].token = signed.access_token
  }
  const [owner, stranger] = users
  let launch
  await check('Real anon HTTP calls reach no Launch table', async () => {
    for (const table of ['space_launch', 'launch_sources', 'launch_facts', 'launch_list_attestations', 'launch_email_log']) refused(await request(`/rest/v1/${table}?select=id`, anon), ['42501'])
  })
  await check('An owner starts a launch and cannot start a second active one', async () => {
    const rows = success(await request('/rest/v1/space_launch', owner.token, 'POST', { owner_id: owner.profile, niche: 'coaches', intents: ['events'] }))
    assert.equal(rows.length, 1); launch = rows[0].id; launches.push(launch)
    assert.equal(rows[0].current_step, 'spotlight'); assert.equal(rows[0].stage, 'found')
    refused(await request('/rest/v1/space_launch', owner.token, 'POST', { owner_id: owner.profile }), ['23505'])
  })
  await check('An owner cannot start a launch in someone else\'s name', async () => {
    refused(await request('/rest/v1/space_launch', owner.token, 'POST', { owner_id: stranger.profile }), ['42501'])
  })
  await check('A stranger reads nothing of the owner\'s launch', async () => {
    assert.deepEqual(success(await request(`/rest/v1/space_launch?id=eq.${launch}&select=id`, stranger.token)), [])
  })
  await check('Save and resume: the owner reloads the cursor and the published step', async () => {
    success(await request(`/rest/v1/space_launch?id=eq.${launch}`, owner.token, 'PATCH', { steps: { spotlight: { state: 'published' } }, stage: 'gather', current_step: 'space' }))
    const rows = success(await request(`/rest/v1/space_launch?owner_id=eq.${owner.profile}&cancelled_at=is.null&completed_at=is.null&select=current_step,steps`, owner.token))
    assert.equal(rows.length, 1); assert.equal(rows[0].current_step, 'space'); assert.equal(rows[0].steps.spotlight.state, 'published')
  })
  await check('Double confirm: cancelling without a request is refused, a request alone leaves it active', async () => {
    refused(await request(`/rest/v1/space_launch?id=eq.${launch}`, owner.token, 'PATCH', { cancelled_at: new Date().toISOString() }), ['23514'])
    const requested = success(await request(`/rest/v1/space_launch?id=eq.${launch}`, owner.token, 'PATCH', { cancel_requested_at: new Date().toISOString() }))
    assert.equal(requested[0].cancelled_at, null)
  })
  let source
  await check('Sources and cited facts: an owner adds them, an uncited fact is refused, a stranger cannot plant one', async () => {
    const sources = success(await request('/rest/v1/launch_sources', owner.token, 'POST', { launch_id: launch, kind: 'outline', label: 'Studio outline.pdf', size_bytes: 1200, char_count: 900 }))
    source = sources[0].id
    success(await request('/rest/v1/launch_facts', owner.token, 'POST', { launch_id: launch, source_id: source, slot: 'tagline', value: 'Slow mornings', snippet: 'Slow mornings, every Tuesday.', origin: 'Studio outline.pdf, page 1' }))
    refused(await request('/rest/v1/launch_facts', owner.token, 'POST', { launch_id: launch, source_id: source, slot: 'tagline', value: 'Made up', snippet: '', origin: 'Studio outline.pdf' }), ['23514'])
    refused(await request('/rest/v1/launch_sources', stranger.token, 'POST', { launch_id: launch, kind: 'website', label: 'https://example.com' }), ['42501'])
  })
  await check('A stranger reads no source, fact or attestation', async () => {
    for (const table of ['launch_sources', 'launch_facts', 'launch_list_attestations']) assert.deepEqual(success(await request(`/rest/v1/${table}?select=id`, stranger.token)), [])
  })
  await check('A consent attestation can be added and never edited or deleted', async () => {
    success(await request('/rest/v1/launch_list_attestations', owner.token, 'POST', { launch_id: launch, source_id: source, wording_version: 'v1', answer: 'confirmed' }))
    refused(await request(`/rest/v1/launch_list_attestations?launch_id=eq.${launch}`, owner.token, 'PATCH', { answer: 'declined' }), ['42501'])
    refused(await request(`/rest/v1/launch_list_attestations?launch_id=eq.${launch}`, owner.token, 'DELETE'), ['42501'])
  })
  await check('Removing a source removes its facts and keeps its consent evidence', async () => {
    success(await request(`/rest/v1/launch_sources?id=eq.${source}`, owner.token, 'DELETE'))
    assert.deepEqual(success(await request(`/rest/v1/launch_facts?source_id=eq.${source}&select=id`, owner.token)), [])
    const kept = success(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}&select=answer,wording_version,source_id,source_ref,launch_id`, service))
    assert.equal(kept.length, 1); assert.equal(kept[0].source_id, null); assert.equal(kept[0].source_ref, source); assert.equal(kept[0].launch_id, launch); assert.equal(kept[0].answer, 'confirmed')
  })
  await check('Consent evidence: a source from another launch is refused, no role can edit or delete it, service role included', async () => {
    const other = success(await request('/rest/v1/space_launch', stranger.token, 'POST', { owner_id: stranger.profile }))[0].id; launches.push(other)
    const foreign = success(await request('/rest/v1/launch_sources', stranger.token, 'POST', { launch_id: other, kind: 'website', label: 'https://example.com' }))[0].id
    refused(await request('/rest/v1/launch_list_attestations', owner.token, 'POST', { launch_id: launch, source_id: foreign, wording_version: 'v1', answer: 'confirmed' }), ['23514'])
    refused(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}`, service, 'PATCH', { answer: 'declined' }), ['42501'])
    refused(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}`, service, 'DELETE'), ['42501'])
    refused(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}`, anon, 'DELETE'), ['42501'])
  })
  await check('The reminder log is service-only and sends once per launch and trigger', async () => {
    refused(await request('/rest/v1/launch_email_log?select=id', owner.token), ['42501'])
    refused(await request('/rest/v1/launch_email_log', owner.token, 'POST', { launch_id: launch, trigger_kind: 'resume_1' }), ['42501'])
    success(await request('/rest/v1/launch_email_log', service, 'POST', { launch_id: launch, trigger_kind: 'resume_1' }))
    refused(await request('/rest/v1/launch_email_log', service, 'POST', { launch_id: launch, trigger_kind: 'resume_1' }), ['23505'])
  })
  await check('Deleting a launch keeps its consent evidence, detached, unreadable by its former owner', async () => {
    success(await request(`/rest/v1/space_launch?id=eq.${launch}`, service, 'DELETE'))
    const kept = success(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}&select=answer,wording_version,attested_at,launch_id,launch_ref`, service))
    assert.equal(kept.length, 1); assert.equal(kept[0].launch_id, null); assert.equal(kept[0].launch_ref, launch); assert.ok(kept[0].attested_at)
    assert.deepEqual(success(await request(`/rest/v1/launch_list_attestations?launch_ref=eq.${launch}&select=id`, owner.token)), [])
  })
  console.log(JSON.stringify({ status: 'PASS', level: 'Ephemeral local Supabase full migration schema and real PostgREST/Auth HTTP; no hosted project', checks }))
} finally {
  for (const id of launches) success(await request(`/rest/v1/space_launch?id=eq.${id}`, service, 'DELETE'))
  for (const user of users) { success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.auth}`, service, 'DELETE')); success(await request(`/auth/v1/admin/users/${user.auth}`, service, 'DELETE')) }
  console.log('Ephemeral launch/user fixtures removed; no email/provider send requested')
}
