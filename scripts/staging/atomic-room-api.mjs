// Isolated local Docker only. Never accepts a hosted project URL or external credentials.
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
const users = [], rooms = [], checks = []
const password = randomBytes(24).toString('base64url')
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { throw new Error(`Non-JSON local API response (${response.status})`) }
  return { status: response.status, ok: response.ok, data }
}
async function rpc(name, token, body) { return request('/rest/v1/rpc/' + name, token, 'POST', body) }
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
function success(response) { assert.ok(response.ok, `Local API status ${response.status}, code ${response.data?.code ?? 'unavailable'}`); return response.data }
const args = (actor, room, target) => ({ _actor_id: actor, _room_id: room, _target_id: target })
try {
  for (let i = 0; i < 3; i++) {
    const email = `atomic-room-${suffix}-${i}@example.invalid`
    const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
    assert.ok(user.id); users.push({ auth: user.id, email })
    let profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.id}&select=id`, service))
    if (!profiles.length) profiles = success(await request('/rest/v1/profiles', service, 'POST', { auth_user_id: user.id, display_name: 'Ephemeral room staging', handle: `room_${suffix}_${i}`, is_active: true }))
    assert.equal(profiles.length, 1); users[i].profile = profiles[0].id
  }
  const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email: users[0].email, password }))
  assert.ok(signed.access_token)
  await check('Real anon and authenticated HTTP calls cannot execute service-only create', async () => {
    for (const token of [anon, signed.access_token]) {
      const result = await rpc('room_create_atomic', token, { _actor_id: users[0].profile, _name: 'Denied', _description: null, _visibility: 'public' })
      assert.ok([401, 403, 404].includes(result.status)); assert.ok(['42501', 'PGRST202'].includes(result.data?.code))
    }
  })
  const actor = users[0].profile, member = users[1].profile, outsider = users[2].profile
  let room
  await check('Service HTTP creation returns UUID and creator admin membership', async () => {
    room = success(await rpc('room_create_atomic', service, { _actor_id: actor, _name: `  Staging ${suffix}  `, _description: '  Notes  ', _visibility: 'private' })); assert.match(room, /^[0-9a-f-]{36}$/); rooms.push(room)
    const rows = success(await request(`/rest/v1/room_members?room_id=eq.${room}&profile_id=eq.${actor}&select=is_admin`, service)); assert.equal(rows.length, 1); assert.equal(rows[0].is_admin, true)
    const rowsRoom = success(await request(`/rest/v1/rooms?id=eq.${room}&select=name,description,visibility`, service)); assert.deepEqual(rowsRoom[0], { name: `Staging ${suffix}`, description: 'Notes', visibility: 'private' })
  })
  success(await request('/rest/v1/room_members', service, 'POST', { room_id: room, profile_id: member, is_admin: false }))
  await check('Real anon and authenticated HTTP cannot execute either member RPC', async () => {
    for (const token of [anon, signed.access_token]) for (const [name, body] of [['room_set_member_admin_atomic', { ...args(actor, room, member), _is_admin: true }], ['room_remove_member_atomic', args(actor, room, member)]]) {
      const result = await rpc(name, token, body); assert.ok([401, 403, 404].includes(result.status)); assert.ok(['42501', 'PGRST202'].includes(result.data?.code))
    }
  })
  await check('Service transport still refuses unrelated actor and ordinary member authority', async () => {
    for (const caller of [outsider, member]) { const r = await rpc('room_set_member_admin_atomic', service, { ...args(caller, room, member), _is_admin: true }); assert.equal(r.data?.code, '42501'); assert.equal(r.ok, false) }
  })
  await check('Service promote/demote acknowledges true and stale former admin is rejected', async () => {
    assert.equal(success(await rpc('room_set_member_admin_atomic', service, { ...args(actor, room, member), _is_admin: true })), true)
    assert.equal(success(await rpc('room_set_member_admin_atomic', service, { ...args(actor, room, actor), _is_admin: false })), true)
    const stale = await rpc('room_set_member_admin_atomic', service, { ...args(actor, room, member), _is_admin: false }); assert.equal(stale.data?.code, '42501')
  })
  await check('Service last-admin demotion and leave are refused; ordinary self-leave succeeds', async () => {
    const demote = await rpc('room_set_member_admin_atomic', service, { ...args(member, room, member), _is_admin: false }); assert.equal(demote.data?.code, '23514')
    const leave = await rpc('room_remove_member_atomic', service, args(member, room, member)); assert.equal(leave.data?.code, '23514')
    assert.equal(success(await rpc('room_remove_member_atomic', service, args(actor, room, actor))), true)
    const left = success(await request(`/rest/v1/room_members?room_id=eq.${room}&select=profile_id,is_admin`, service)); assert.deepEqual(left, [{ profile_id: member, is_admin: true }])
  })
  console.log(JSON.stringify({ status: 'PASS', level: 'Ephemeral local Supabase full migration schema and real PostgREST/Auth HTTP; no hosted project', checks }))
} finally {
  for (const room of rooms) success(await request(`/rest/v1/rooms?id=eq.${room}`, service, 'DELETE'))
  for (const user of users) { success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.auth}`, service, 'DELETE')); success(await request(`/auth/v1/admin/users/${user.auth}`, service, 'DELETE')) }
  console.log('Ephemeral room/user fixtures removed; no email/provider send requested')
}
