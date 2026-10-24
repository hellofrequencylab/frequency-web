import assert from 'node:assert/strict'
import { loadProbeModule as load } from '../lib/probe-module.mjs'

async function drafts() {
  const local = load('components/studio/spark/draft/draft-store.ts')
  const safe = load('lib/auth/safe-next.ts')
  const state = { error: null, rows: [], calls: [], owner: 'owner', revalidated: [] }
  const client = { from(table) {
    assert.equal(table, 'studio_draft')
    const chain = (op, payload) => {
      const call = { op, payload, filters: [] }; state.calls.push(call)
      const q = {
        eq(key, value) { call.filters.push([key, value]); return q },
        gte() { return q }, order() { return q }, limit() { return q }, in() { return q }, select() { return q },
        maybeSingle: async () => ({ data: state.rows[0] ?? null, error: null }),
        then: resolve => Promise.resolve({ data: state.rows, error: state.error?.op === op ? { message: 'rejected' } : null }).then(resolve),
      }
      return q
    }
    return { upsert: payload => chain('upsert', payload), delete: () => chain('delete'), select: () => chain('select') }
  } }
  const store = load('lib/studio/draft-store.ts', { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => client }, '@/lib/auth/safe-next': safe, '@/components/studio/spark/draft/draft-store': local })
  state.error = { op: 'upsert' }
  assert.equal(await store.saveStagedDraft('owner', 'scope', { step: 1, values: { title: 'Words' } }), false)
  assert.deepEqual(state.calls.map(c => c.op), ['upsert'], 'Rejected save must not prune')
  state.error = { op: 'delete' }
  assert.equal(await store.saveStagedDraft('owner', 'scope', { step: 1, values: {} }), false)
  const actions = load('app/(main)/drafts/actions.ts', {
    'next/cache': { revalidatePath: path => state.revalidated.push(path) },
    '@/lib/ai/vera/create-entity': {}, '@/lib/auth': { getMyProfileId: async () => state.owner },
    '@/lib/studio/draft-store': store, '@/app/(main)/events/scan/actions': {},
  })
  assert.equal(await actions.binUnfinishedDraftAction('scope'), false)
  assert.deepEqual(state.revalidated, [])
  state.error = null
  assert.equal(await actions.binUnfinishedDraftAction('scope'), true)
  assert.deepEqual(state.revalidated, ['/drafts'])
  for (const route of ['/\\example.invalid', '/\t/example.invalid', '/\n/example.invalid']) {
    assert.notEqual(new URL(route, 'https://example.test').origin, 'https://example.test')
    state.calls.length = 0; state.rows = []
    assert.equal(await store.saveStagedDraft('owner', 'scope', { step: 1, values: { title: 'Words' }, route }), true)
    assert.equal(state.calls[0].payload.route, null)
    state.rows = [{ scope: 'scope', step: 1, answers: { title: 'Words' }, version: local.DRAFT_VERSION, route, updated_at: new Date().toISOString() }]
    assert.equal((await store.loadStagedDraft('owner', 'scope')).route, null)
    assert.equal((await store.listStagedDrafts('owner'))[0].route, null)
    assert.ok(state.calls.filter(c => c.op === 'select').every(c => c.filters.some(([key, value]) => key === 'profile_id' && value === 'owner')))
  }
}

async function outbox() {
  const state = { jobs: [], errors: [], updates: [] }
  const client = {
    rpc: async name => { assert.equal(name, 'claim_outbox_jobs'); return { data: state.jobs, error: null } },
    from: table => { assert.equal(table, 'notification_queue'); return { update: patch => ({ eq: async () => {
      state.updates.push(patch); const error = state.errors.shift() ?? null
      if (error instanceof Error) throw error
      return { error }
    } }) } },
  }
  const queue = load('lib/queue/outbox.ts', { '@/lib/supabase/admin': { createAdminClient: () => client }, '@/lib/queue/terminal-error': load('lib/queue/terminal-error.ts'), '@/lib/observability/slos': load('lib/observability/slos.ts') })
  const job = extra => ({ id: 'job', kind: 'push', payload: {}, attempts: 0, max_attempts: 5, created_at: new Date().toISOString(), ...extra })
  for (const mode of ['returned-ack', 'thrown-ack', 'retry', 'dead-letter', 'deferral', 'parking']) {
    state.updates = []; let calls = 0
    state.jobs = mode === 'parking' ? [job({ id: 'one', payload: { __lane: 'bulk' } }), job({ id: 'two', payload: { __lane: 'bulk' } })] : [job({ attempts: mode === 'dead-letter' ? 4 : 0 })]
    state.errors = mode === 'parking' ? [null, { message: 'write rejected' }] : [mode === 'thrown-ack' ? new Error('write rejected') : { message: 'write rejected' }]
    const handler = async () => {
      calls++
      if (mode === 'parking') throw new Error('[email] send failed: {"statusCode":429,"message":"You have reached your daily email sending quota.","name":"daily_quota_exceeded"}')
      if (mode === 'deferral') throw { statusCode: 429, message: 'rate limit exceeded' }
      if (mode === 'retry' || mode === 'dead-letter') throw new Error('provider unavailable')
    }
    await assert.rejects(queue.processQueue({ push: handler }), /write rejected/)
    assert.equal(calls, 1)
    if (mode.endsWith('ack')) assert.deepEqual(state.updates.map(p => p.status), ['done'], 'Acknowledgement failure must not retry the successful handler')
  }
}

async function dates() {
  const d = load('lib/events/datetime.ts')
  for (const day of ['2026-02-30', '2026-02-29', '2100-02-29', '2026-04-31']) {
    assert.equal(d.dateToWallClockIso(day), null)
    assert.equal(d.wallClockToIso(`${day}T19:00`), null)
    assert.equal(d.eventStartInputToIso(`${day}T19:00:00+02:00`), null)
  }
  assert.equal(d.wallClockToIso('2026-06-26T24:00'), null)
  assert.equal(d.dateToWallClockIso('2000-02-29'), '2000-02-29T00:00:00.000Z')
  assert.equal(d.eventStartInputToIso('2028-02-29T00:30:00.125+0200'), '2028-02-28T22:30:00.125Z')
}
const cases = { drafts, outbox, dates }
assert.ok(Object.hasOwn(cases, process.argv[2]), 'Choose drafts, outbox or dates')
await cases[process.argv[2]]()
console.log(`${process.argv[2]}: actual repair consequence checks passed without a nested test runner`)
