// Disposable localhost Auth/PostgREST acceptance only. No hosted endpoint, production key
// fallback, provider sends, rewards, or migration application are performed here.
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export async function runQuestSupportAcceptance({ env = process.env, localStatus, requestImpl = globalThis.fetch } = {}) {
  if (env.FREQUENCY_EPHEMERAL_ROOM_STAGING !== '1') throw new Error('Explicit ephemeral staging opt-in required')
  let status = localStatus
  if (!status) {
    try { status = JSON.parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, maxBuffer: 1_048_576 })) }
    catch { throw new Error('Unable to read disposable staging status; credentials are withheld') }
  }
  let endpoint
  try { endpoint = new URL(status.API_URL) } catch { throw new Error('Invalid local API URL; its value is withheld') }
  assert.ok(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname), 'Only loopback HTTP Supabase is permitted')
  assert.ok(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/', 'Local URL must not contain credentials or extra routing')
  const anon = status.ANON_KEY; const service = status.SERVICE_ROLE_KEY
  assert.ok(typeof anon === 'string' && anon && typeof service === 'string' && service && anon !== service, 'Locally generated distinct API keys required')
  const base = endpoint.origin
  const ids = { space: randomUUID(), practice: randomUUID(), plan: randomUUID(), legacy: randomUUID(), enrolled: randomUUID(), log: randomUUID() }
  const users = []; const checks = []
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const password = randomBytes(24).toString('base64url')
  async function request(path, token, method = 'GET', body) {
    const response = await requestImpl(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { apikey: token === service ? service : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    let data
    try { const raw = await response.text(); data = raw ? JSON.parse(raw) : null } catch { throw new Error(`Non-JSON local response (${response.status})`) }
    return { ok: response.ok, status: response.status, data }
  }
  function success(response) { assert.ok(response.ok, `Local request failed (${response.status}); provider body withheld`); return response.data }
  async function check(name, action) { await action(); checks.push(name); console.log('PASS ' + name) }
  const getPolicy = async (id) => success(await request(`/rest/v1/journey_enrollments?id=eq.${id}&select=completion_policy`, service))[0]?.completion_policy
  const getLog = async () => success(await request(`/rest/v1/practice_logs?id=eq.${ids.log}&select=support_pillar_ids,support_evidence_version,completed,zaps_awarded`, service))[0]
  try {
    const pillars = success(await request('/rest/v1/pillars?slug=in.(mind,body,spirit)&select=id,slug', service))
    const bySlug = new Map(pillars.map((row) => [row.slug, row.id]))
    assert.equal(bySlug.size, 3, 'Canonical staging pillars required')
    const mind = bySlug.get('mind'); const body = bySlug.get('body'); const spirit = bySlug.get('spirit')
    const entities = success(await request('/rest/v1/entities?key=eq.labs&select=id&limit=1', service))
    assert.equal(entities.length, 1, 'Seeded staging entity required')
    for (let index = 0; index < 2; index++) {
      const email = `quest-support-${suffix}-${index}@example.invalid`
      const user = success(await request('/auth/v1/admin/users', service, 'POST', { email, password, email_confirm: true }))
      assert.ok(user.id); users.push({ auth: user.id })
      const profiles = success(await request(`/rest/v1/profiles?auth_user_id=eq.${user.id}&select=id`, service))
      assert.equal(profiles.length, 1, 'Auth signup trigger must create one profile')
      users[index].profile = profiles[0].id
      const signed = success(await request('/auth/v1/token?grant_type=password', anon, 'POST', { email, password }))
      assert.ok(signed.access_token); users[index].token = signed.access_token
    }
    const [legacy, member] = users
    success(await request('/rest/v1/spaces', service, 'POST', { id: ids.space, slug: `quest-support-${suffix}`, name: 'Disposable support fixture', type: 'business', entity_id: entities[0].id, owner_profile_id: legacy.profile, status: 'active', visibility: 'network', plan: 'business' }))
    success(await request('/rest/v1/practices', service, 'POST', { id: ids.practice, title: 'Disposable support practice', created_by: legacy.profile, space_id: ids.space, domain_id: body, secondary_domain_id: mind, primary_pct: 75, focus_details: { [spirit]: { instructions: '', timing: '' } } }))
    success(await request('/rest/v1/journey_plans', service, 'POST', { id: ids.plan, slug: `quest-support-${suffix}`, title: 'Disposable support journey', author_id: legacy.profile, space_id: ids.space, official: false, ranked_eligible: true, visibility: 'private', window_starts_at: '2026-11-01T00:00:00Z', window_ends_at: '2026-11-28T23:59:00Z' }))
    success(await request('/rest/v1/journey_plan_items', service, 'POST', { plan_id: ids.plan, practice_id: ids.practice, domain_id: mind, block_type: 'practice' }))
    await check('Real anonymous and member callers cannot forge participation or private evidence', async () => {
      for (const token of [anon, member.token]) {
        for (const [table, payload] of [
          ['journey_enrollments', { profile_id: member.profile, plan_id: ids.plan, completion_policy: { version: 2 } }],
          ['practice_logs', { profile_id: member.profile, practice_id: ids.practice, logged_for: '2026-11-01', support_pillar_ids: [mind], support_evidence_version: 1 }],
        ]) assert.equal((await request('/rest/v1/' + table, token, 'POST', payload)).ok, false)
      }
    })
    let recorded
    await check('Only a new eligible official enrollment receives the real prospective contract', async () => {
      success(await request('/rest/v1/journey_enrollments', service, 'POST', { id: ids.legacy, profile_id: legacy.profile, plan_id: ids.plan }))
      assert.equal(await getPolicy(ids.legacy), null)
      success(await request(`/rest/v1/journey_plans?id=eq.${ids.plan}`, service, 'PATCH', { official: true }))
      success(await request('/rest/v1/journey_enrollments', service, 'POST', { id: ids.enrolled, profile_id: member.profile, plan_id: ids.plan, completion_policy: { version: 99 } }))
      recorded = await getPolicy(ids.enrolled)
      assert.deepEqual(recorded, { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1, windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [mind] })
    })
    await check('Plan edits, client policy payloads and completion stamps cannot rewrite contracts', async () => {
      success(await request(`/rest/v1/journey_plans?id=eq.${ids.plan}`, service, 'PATCH', { window_starts_at: '2026-12-01T00:00:00Z', window_ends_at: '2026-12-28T23:59:00Z' }))
      success(await request(`/rest/v1/journey_enrollments?id=eq.${ids.enrolled}`, service, 'PATCH', { completion_policy: { version: 99 }, completed_at: new Date().toISOString() }))
      assert.deepEqual(await getPolicy(ids.enrolled), recorded)
      success(await request(`/rest/v1/journey_enrollments?id=eq.${ids.legacy}`, service, 'PATCH', { completion_policy: recorded }))
      assert.equal(await getPolicy(ids.legacy), null)
      assert.equal((await request(`/rest/v1/journey_enrollments?id=eq.${ids.enrolled}`, service, 'PATCH', { started_at: '2026-12-01T00:00:00Z' })).ok, false)
    })
    const wallet = async () => success(await request(`/rest/v1/profiles?id=eq.${member.profile}&select=lifetime_zaps,current_season_zaps,amplitude`, service))[0]
    const beforeWallet = await wallet()
    const expectedSupports = [mind, body, spirit].sort()
    await check('First partial log records actual multi-support evidence instead of caller claims', async () => {
      success(await request('/rest/v1/practice_logs', service, 'POST', { id: ids.log, profile_id: member.profile, practice_id: ids.practice, logged_for: '2026-11-01', completed: false, zaps_awarded: 1, support_pillar_ids: [ids.plan], support_evidence_version: 99 }))
      assert.deepEqual((await getLog()).support_pillar_ids, expectedSupports)
      assert.equal((await getLog()).support_evidence_version, 1)
    })
    await check('A real owner reads frozen evidence while anonymous and other members are refused', async () => {
      const owned = success(await request(`/rest/v1/practice_logs?id=eq.${ids.log}&select=support_pillar_ids,support_evidence_version`, member.token))
      assert.equal(owned.length, 1, 'Actual authenticated owner must read its exact log')
      assert.deepEqual(owned[0].support_pillar_ids, expectedSupports)
      assert.equal(owned[0].support_evidence_version, 1)
      for (const token of [anon, legacy.token]) {
        const response = await request(`/rest/v1/practice_logs?id=eq.${ids.log}&select=support_pillar_ids,support_evidence_version`, token)
        if (response.ok) assert.deepEqual(response.data, [], 'Private evidence must not escape its member scope')
        else assert.ok([401, 403].includes(response.status), 'Read must be refused by the actual privilege boundary')
      }
    })
    await check('Reclassification and timer completion preserve support without changing the wallet', async () => {
      success(await request(`/rest/v1/practices?id=eq.${ids.practice}`, service, 'PATCH', { domain_id: spirit, secondary_domain_id: null, focus_details: {} }))
      success(await request(`/rest/v1/practice_logs?id=eq.${ids.log}`, service, 'PATCH', { completed: true, zaps_awarded: 12, support_pillar_ids: [], support_evidence_version: 1 }))
      const log = await getLog()
      assert.deepEqual(log.support_pillar_ids, expectedSupports); assert.equal(log.completed, true); assert.equal(log.zaps_awarded, 12)
      assert.deepEqual(await wallet(), beforeWallet, 'Support bookkeeping must not award currency')
    })
    await check('Deleting a practice does not erase its recorded support evidence', async () => {
      success(await request(`/rest/v1/practices?id=eq.${ids.practice}`, service, 'DELETE'))
      assert.deepEqual((await getLog()).support_pillar_ids, expectedSupports)
    })
    return { status: 'PASS', evidence: 'Disposable full-schema Supabase Auth/PostgREST HTTP only', checks }
  } finally {
    const failures = []
    for (const [table, id] of [['practice_logs', ids.log], ['journey_plans', ids.plan], ['practices', ids.practice], ['spaces', ids.space]]) {
      try { success(await request(`/rest/v1/${table}?id=eq.${id}`, service, 'DELETE')) } catch { failures.push(table) }
    }
    for (const user of users) {
      try { success(await request(`/auth/v1/admin/users/${user.auth}`, service, 'DELETE')) } catch { failures.push('auth-user') }
    }
    if (failures.length) throw new Error(`Disposable fixture cleanup failed (${failures.join(', ')}); unconditional staging container cleanup is still required`)
    console.log('Disposable Quest fixtures removed; no hosted provider or send requested')
  }
}

if (invokedDirectly(import.meta.url)) {
  try { console.log(JSON.stringify(await runQuestSupportAcceptance())) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Disposable acceptance failed'); process.exitCode = 1 }
}
