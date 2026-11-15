import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const env = {}
function load(path, stubs) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const loaded = { exports: {} }
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: path }).runInNewContext({ URL, Date, console, process: { env } })(name => {
    assert.ok(Object.hasOwn(stubs, name), 'Unexpected dependency: ' + name)
    return stubs[name]
  }, loaded, loaded.exports)
  return loaded.exports
}
const flag = 'LEAD_MAGNET_RESOURCE_EMAIL_ENABLED'
const environment = load('lib/env/string.ts', {})
const policy = existsSync('lib/crm/lead-magnet-resource-policy.ts')
  ? load('lib/crm/lead-magnet-resource-policy.ts', { '@/lib/env/string': environment })
  : { resourceReceiptEmailEnabled: () => false, shouldHoldResourceReceipt: () => false }
const enqueued = []
let suppressionReads = 0
const sender = load('lib/crm/lead-magnet-resource-io.ts', {
  'server-only': {}, 'node:crypto': require('node:crypto'),
  '@/lib/email': { enqueueEmail: async (...args) => enqueued.push(args) },
  '@/lib/suppression': { isSuppressed: async () => { suppressionReads++; return false } },
  '@/lib/rate-limit': { claimOnce: async () => true },
  '@/lib/log': { log: { error() {} } },
  './lead-magnet-resource-policy': policy,
  './lead-magnet-resource-email': { resourceEmailUrl: value => value, buildLeadMagnetResourceEmail: value => value },
})
const request = { spaceId: 'space', email: 'reader@example.com', resourceUrl: 'https://example.com/guide.pdf' }
await sender.sendLeadMagnetResource(request)
assert.equal(enqueued.length, 0, 'Default-off resource rollout must not queue mail')
assert.equal(suppressionReads, 0, 'Off path must not consume delivery IO')
env[flag] = '1'
await sender.sendLeadMagnetResource(request)
assert.equal(enqueued.length, 1, 'Explicit enabled path must retain resource delivery')
delete env[flag]
const canonical = 'lead_magnet_resource:' + 'a'.repeat(64) + ':12345'
const jobs = [
  { id: 'resource', kind: 'email', dedupe_key: canonical, payload: {}, attempts: 4, max_attempts: 5, status: 'pending' },
  { id: 'other', kind: 'email', dedupe_key: 'contact_ack:space:reader:12345', payload: {}, attempts: 0, max_attempts: 5, status: 'pending' },
  { id: 'push', kind: 'push', dedupe_key: canonical, payload: {}, attempts: 0, max_attempts: 5, status: 'pending' },
]
const patches = [], delivered = []
const db = {
  rpc: async () => ({ data: jobs.filter(job => job.status === 'pending').map(job => ({ ...job })), error: null }),
  from: () => ({ update: patch => ({ eq: async (_field, id) => { patches.push({ id, ...patch }); Object.assign(jobs.find(job => job.id === id), patch); return { error: null } } }) }),
}
const queue = load('lib/queue/outbox.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/queue/terminal-error': { TerminalQueueError: class extends Error {} },
  '@/lib/observability/slos': { getSlo() {}, meetsSlo() {} },
  '@/lib/crm/lead-magnet-resource-policy': policy,
})
const handlers = { email: async (_payload, context) => delivered.push(context.queueJobId), push: async () => delivered.push('push') }
const held = await queue.processQueue(handlers)
assert.equal(delivered.includes('resource'), false, 'Already queued resource must not bypass off')
assert.equal(delivered.includes('other'), true, 'Other email behavior must remain unchanged')
assert.equal(delivered.includes('push'), true, 'Other job kinds must remain unchanged')
assert.equal(held.deferred, 1)
assert.equal(jobs[0].status, 'pending')
assert.equal(jobs[0].attempts, 4, 'Holding cannot burn the last attempt')
assert.ok(Date.parse(jobs[0].run_after) > Date.now(), 'Pending hold must release the processing claim into a future window')
assert.equal(patches.some(patch => patch.id === 'resource' && 'attempts' in patch), false)
env[flag] = 'on'
await queue.processQueue(handlers)
assert.equal(delivered.filter(id => id === 'resource').length, 1, 'An enabled later replay must still deliver')
assert.equal(jobs[0].status, 'done')
assert.equal(jobs[0].attempts, 5)
console.log('Resource rollout: default-off enqueue, pending drain hold, unspent attempts, unrelated sends and enabled replay PASS')
