import assert from 'node:assert/strict'
import { loadProbeModule } from '../lib/probe-module.mjs'

const paging = loadProbeModule('lib/messaging/audience-pages.ts')
const people = Array.from({ length: 1205 }, (_, i) => ({ id: String(i).padStart(8, '0'), display_name: `Fixture ${i}`, auth_user_id: `auth-${i}`, is_active: true, is_demo: false }))
const profileRows = [...people, { id: 'zz-demo', display_name: 'Demo', auth_user_id: 'auth-demo', is_active: true, is_demo: true }, { id: 'zz-inactive', display_name: 'Inactive', auth_user_id: 'auth-inactive', is_active: false, is_demo: false }]
let scheduled, sent = [], logs = [], failPage = false, failDetails = false, refused = false, writes = 0, allowEmail = false
const emails = []
function profiles(rows = profileRows) {
  const filters = []; let limit = 1000, after = null, columns
  const q = {
    select: value => { columns = value; return q },
    eq: (key, value) => { filters.push(row => row[key] === value); return q },
    in: (key, values) => { assert.ok(values.length <= 100, 'Bound profile-id query size'); filters.push(row => values.includes(row[key])); return q },
    order: key => { assert.equal(key, 'id'); return q },
    limit: value => { limit = value; return q },
    gt: (key, value) => { assert.equal(key, 'id'); after = value; return q },
    maybeSingle: async () => ({ data: { display_name: 'Fixture author' }, error: null }),
    then: (yes, no) => Promise.resolve((failPage && after) || (failDetails && columns.includes('auth_user_id'))
      ? { data: null, error: { message: 'synthetic later read failure' } }
      : { data: rows.filter(row => filters.every(filter => filter(row)) && (!after || row.id > after)).sort((a, b) => a.id < b.id ? -1 : 1).slice(0, Math.min(limit, 1000)), error: null }).then(yes, no),
  }
  return q
}
const admin = {
  from: table => {
    if (table === 'profiles') return profiles()
    assert.equal(table, 'dispatches')
    const q = { insert: () => { writes++; return q }, select: () => q, single: async () => ({ data: { id: 'fixture-dispatch' }, error: null }) }
    return q
  },
  auth: { admin: { getUserById: async id => ({ data: { user: { email: `${id}@fixture.invalid` } } }) } },
}
const action = loadProbeModule('app/(main)/nearby/actions.ts', {
  'next/cache': { revalidatePath: () => {} }, 'next/server': { after: work => { scheduled = work } },
  '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/auth': { getCallerProfile: async () => ({ id: 'author', community_role: 'host' }) },
  '@/lib/email': { sendDispatchNotificationEmail: async params => { assert.ok(allowEmail, 'Email remains suppressed outside the explicit synthetic case'); emails.push(params) } },
  '@/lib/comms/send-gate': { resolveSendGate: async () => ({ allowed: allowEmail, reason: 'pref_off' }) },
  '@/lib/push': { sendPushToProfile: async id => { sent.push(id); return 0 } },
  '@/lib/core/roles': { atLeastRole: () => true },
  '@/lib/messaging/place-tree': { resolvePlaceTreeProfileIds: async () => people.map(person => person.id) },
  '@/lib/messaging/audience-pages': paging,
  '@/lib/messaging/dispatch-log': { logDispatchRecipients: async rows => { logs.push(...rows) } },
  '@/lib/messaging/broadcast-scope': { assertCanBroadcastTo: async () => { if (refused) throw Error('scope refused') } },
}).createAndPublishDispatch
async function run(scope) {
  scheduled = undefined; sent = []; logs = []
  const form = new FormData(); form.set('title', 'Fixture dispatch'); form.set('body', 'Synthetic audience verification'); form.set('audience_scope', scope); form.set('audience_id', 'fixture-scope')
  await action(form)
  assert.equal(typeof scheduled, 'function', 'Register the fanout with the platform')
  await scheduled()
}
for (const scope of ['global', 'circle']) {
  await run(scope)
  assert.equal(new Set(sent).size, 1205, `${scope}: every selected profile reaches the synthetic send gate`)
  assert.equal(sent.length, 1205); assert.equal(logs.length, 2410)
}
// Hydration permits an absent name; the email template requires a string greeting.
const firstName = people[0].display_name
people[0].display_name = null
allowEmail = true
try {
  await run('global')
  assert.equal(emails.length, 1205)
  assert.equal(emails.find(email => email.recipientProfileId === people[0].id).recipientName, 'there')
  assert.equal(emails.find(email => email.recipientProfileId === people[1].id).recipientName, people[1].display_name)
} finally { people[0].display_name = firstName; allowEmail = false }
const memberships = people.flatMap(person => [
  { id: `a-${person.id}`, circle_id: 'fixture-circle', profile_id: person.id, status: 'active' },
  { id: `b-${person.id}`, circle_id: `a-circle-${person.id}`, profile_id: person.id, status: 'active' },
  { id: `c-${person.id}`, circle_id: `b-circle-${person.id}`, profile_id: person.id, status: 'active' },
])
const circles = people.flatMap(person => [{ id: `a-circle-${person.id}`, hub_id: 'fixture-hub' }, { id: `b-circle-${person.id}`, hub_id: `hub-${person.id}` }])
const hubs = people.map(person => ({ id: `hub-${person.id}`, nexus_id: 'fixture-nexus' }))
const place = loadProbeModule('lib/messaging/place-tree.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    assert.ok(['memberships', 'circles', 'hubs'].includes(table))
    return profiles(table === 'memberships' ? memberships : table === 'circles' ? circles : hubs)
  } }) }, './audience-pages': paging,
})
for (const [type, id] of [['circle', 'fixture-circle'], ['hub', 'fixture-hub'], ['nexus', 'fixture-nexus']]) {
  assert.equal((await place.resolvePlaceTreeProfileIds({ type, id })).length, 1205, `The actual ${type} audience must page every layer`)
}
// The action logs background errors; capture only synthetic diagnostics, never send anything.
const originalError = console.error; const errors = []
console.error = (...args) => { errors.push(String(args[0])) }
try {
  failPage = true; await run('global'); assert.equal(sent.length, 0); assert.equal(logs.length, 0)
  failPage = false; failDetails = true; await run('circle'); assert.equal(sent.length, 0); assert.equal(logs.length, 0)
} finally { console.error = originalError; failDetails = false }
assert.equal(errors.length, 2)
refused = true; const before = writes
await assert.rejects(run('global'), /scope refused/); assert.equal(writes, before)
console.log('Actual Dispatch action reaches all 1205 synthetic global/scoped recipients, preserves scope gate and registers background work; read failures send nothing. No database/provider calls.')
