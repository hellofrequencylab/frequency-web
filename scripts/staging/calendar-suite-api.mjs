// Isolated local Docker only. Never accepts a hosted project URL or external credentials.
// Real Auth + PostgREST acceptance for the calendar suite data model (20270346027000_calendar_suite_data_model.sql):
// the same calls the browser would make, as anon, as a Space owner and as a stranger.
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
const users = [], spaces = [], tasks = [], checks = []
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
    const email = `calendar-suite-${suffix}-${i}@example.invalid`
    const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
    assert.ok(user.id); users.push({ auth: user.id, email })
    let profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.id}&select=id`, service))
    if (!profiles.length) profiles = success(await request('/rest/v1/profiles', service, 'POST', { auth_user_id: user.id, display_name: 'Ephemeral calendar staging', handle: `calsuite_${suffix}_${i}`, is_active: true }))
    assert.equal(profiles.length, 1); users[i].profile = profiles[0].id
    const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email, password }))
    assert.ok(signed.access_token); users[i].token = signed.access_token
  }
  const [owner, stranger] = users
  let entities = success(await request('/rest/v1/entities?key=eq.labs&select=id&limit=1', service))
  if (!entities.length) entities = success(await request('/rest/v1/entities', service, 'POST', { key: 'labs', name: 'Labs', kind: 'for_profit' }))
  for (let i = 0; i < 2; i++) {
    const rows = success(await request('/rest/v1/spaces', service, 'POST', { slug: `calsuite-${suffix}-${i}`, name: `Calendar suite ${i}`, type: 'business', entity_id: entities[0].id, owner_profile_id: users[i].profile, status: 'active', visibility: 'network' }))
    spaces.push(rows[0].id)
  }
  const entry = (title, spaceId, profile) => ({ space_id: spaceId, kind: 'pencil', title, all_day: false, starts_at: '2027-01-05T02:00:00Z', ends_at: '2027-01-05T04:00:00Z', time_zone: 'America/Los_Angeles', blocks_time: false, visibility: 'team', created_by: profile })
  const mine = success(await request('/rest/v1/space_calendar_entries', service, 'POST', entry('Supper club', spaces[0], owner.profile)))[0].id
  const theirs = success(await request('/rest/v1/space_calendar_entries', service, 'POST', entry('Other supper', spaces[1], stranger.profile)))[0].id
  const plan = success(await request('/rest/v1/space_plans', service, 'POST', { space_id: spaces[0], title: 'Autumn retreat', stage: 'pencil' }))[0].id
  const task = success(await request('/rest/v1/crm_tasks', service, 'POST', { space_id: spaces[0], plan_id: plan, title: 'Book the hall' }))[0].id
  tasks.push(task)
  const comment = (over) => ({ space_id: spaces[0], author_profile_id: owner.profile, body: 'Doors at seven?', ...over })

  await check('Real anon HTTP calls reach neither the thread nor the record', async () => {
    for (const table of ['space_plan_comments', 'space_plan_activity']) refused(await request(`/rest/v1/${table}?select=id`, anon), ['42501'])
  })
  await check('The owner writes a comment and a change record under a standalone entry and reads them back', async () => {
    success(await request('/rest/v1/space_plan_comments', owner.token, 'POST', comment({ entry_id: mine })))
    success(await request('/rest/v1/space_plan_activity', owner.token, 'POST', { entry_id: mine, actor_profile_id: owner.profile, actor_space_id: spaces[0], kind: 'field', summary: 'Moved the start to 7 PM.' }))
    assert.equal(success(await request(`/rest/v1/space_plan_comments?entry_id=eq.${mine}&select=id`, owner.token)).length, 1)
    assert.equal(success(await request(`/rest/v1/space_plan_activity?entry_id=eq.${mine}&select=id`, owner.token)).length, 1)
  })
  await check('The owner cannot write under another Space\'s entry, from another Space, or in another person\'s name', async () => {
    refused(await request('/rest/v1/space_plan_comments', owner.token, 'POST', comment({ entry_id: theirs })), ['42501'])
    refused(await request('/rest/v1/space_plan_comments', owner.token, 'POST', comment({ entry_id: mine, space_id: spaces[1] })), ['42501'])
    refused(await request('/rest/v1/space_plan_comments', owner.token, 'POST', comment({ entry_id: mine, author_profile_id: stranger.profile })), ['42501'])
  })
  await check('A stranger reads nothing of the owner\'s entry and cannot write under it', async () => {
    assert.deepEqual(success(await request(`/rest/v1/space_plan_comments?entry_id=eq.${mine}&select=id`, stranger.token)), [])
    assert.deepEqual(success(await request(`/rest/v1/space_plan_activity?entry_id=eq.${mine}&select=id`, stranger.token)), [])
    refused(await request('/rest/v1/space_plan_comments', stranger.token, 'POST', comment({ entry_id: mine, space_id: spaces[1], author_profile_id: stranger.profile })), ['42501'])
  })
  await check('Exactly one subject: both, neither, and an entry comment naming a to-do are refused by the schema', async () => {
    const both = { actor_space_id: spaces[0], kind: 'field', summary: 'both', plan_id: plan, entry_id: mine }
    refused(await request('/rest/v1/space_plan_activity', service, 'POST', both), ['23514'])
    refused(await request('/rest/v1/space_plan_activity', service, 'POST', { actor_space_id: spaces[0], kind: 'field', summary: 'neither' }), ['23514'])
    refused(await request('/rest/v1/space_plan_comments', service, 'POST', comment({ entry_id: mine, task_id: task })), ['23514'])
  })
  await check('A comment is a record: nobody edits or deletes it on the session client', async () => {
    const id = success(await request(`/rest/v1/space_plan_comments?entry_id=eq.${mine}&select=id`, owner.token))[0].id
    // No UPDATE or DELETE policy: either no row is touched (200 with nothing) or the grant refuses first (42501).
    for (const [method, body] of [['PATCH', { body: 'rewritten' }], ['DELETE', undefined]]) {
      const res = await request(`/rest/v1/space_plan_comments?id=eq.${id}`, owner.token, method, body)
      if (res.ok) assert.deepEqual(res.data, []); else refused(res, ['42501'])
    }
    assert.equal(success(await request(`/rest/v1/space_plan_comments?id=eq.${id}&select=body`, service))[0].body, 'Doors at seven?')
  })
  await check('To-do phase, estimate and start time take valid values and refuse the rest', async () => {
    const ok = success(await request(`/rest/v1/crm_tasks?id=eq.${task}`, service, 'PATCH', { phase: 'day_of', est_minutes: 90, start_minute: 600 }))
    assert.equal(ok[0].phase, 'day_of'); assert.equal(ok[0].est_minutes, 90); assert.equal(ok[0].start_minute, 600)
    refused(await request(`/rest/v1/crm_tasks?id=eq.${task}`, service, 'PATCH', { phase: 'someday' }), ['23514'])
    refused(await request(`/rest/v1/crm_tasks?id=eq.${task}`, service, 'PATCH', { est_minutes: -1 }), ['23514'])
    refused(await request(`/rest/v1/crm_tasks?id=eq.${task}`, service, 'PATCH', { start_minute: 1440 }), ['23514'])
  })
  await check('A Plan takes a hold date and releases it', async () => {
    assert.equal(success(await request(`/rest/v1/space_plans?id=eq.${plan}`, owner.token, 'PATCH', { hold_until: '2026-11-04' }))[0].hold_until, '2026-11-04')
    assert.equal(success(await request(`/rest/v1/space_plans?id=eq.${plan}`, owner.token, 'PATCH', { hold_until: null }))[0].hold_until, null)
  })
  await check('Deleting the entry deletes its thread and its record', async () => {
    success(await request(`/rest/v1/space_calendar_entries?id=eq.${mine}`, service, 'DELETE'))
    assert.deepEqual(success(await request(`/rest/v1/space_plan_comments?entry_id=eq.${mine}&select=id`, service)), [])
    assert.deepEqual(success(await request(`/rest/v1/space_plan_activity?entry_id=eq.${mine}&select=id`, service)), [])
  })
  console.log(JSON.stringify({ status: 'PASS', level: 'Ephemeral local Supabase full migration schema and real PostgREST/Auth HTTP; no hosted project', checks }))
} finally {
  for (const id of tasks) success(await request(`/rest/v1/crm_tasks?id=eq.${id}`, service, 'DELETE'))
  for (const id of spaces) success(await request(`/rest/v1/spaces?id=eq.${id}`, service, 'DELETE'))
  for (const user of users) { success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.auth}`, service, 'DELETE')); success(await request(`/auth/v1/admin/users/${user.auth}`, service, 'DELETE')) }
  console.log('Ephemeral calendar suite fixtures removed; no email/provider send requested')
}
