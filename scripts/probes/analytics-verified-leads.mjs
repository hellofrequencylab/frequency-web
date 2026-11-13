import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function sourceModule(path, stubs, globals = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const loaded = { exports: {} }
  const resolve = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    throw new Error('Unexpected dependency: ' + name)
  }
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: path }).runInNewContext({ URLSearchParams, Date, ...globals })(resolve, loaded, loaded.exports)
  return loaded.exports
}
let reads = 0
let rejectTrack = false
const calls = []
const capture = sourceModule('lib/analytics/leads.ts', {
  'server-only': {},
  './ga-client-id': { readGaIdentity: async () => { reads++; return { clientId: '123.456', sessionId: '1695123456' } } },
  './track': { track: async (...args) => { calls.push(args); if (rejectTrack) throw new Error('Unavailable') } },
}).recordVerifiedLeadCapture
await capture('', 'event_rsvp')
assert.equal(calls.length, 0, 'No durable lead ID means no capture fact')
await capture('durable-lead', 'event_rsvp')
await capture('durable-lead', 'create_space')
assert.equal(calls[0][0], 'lead.captured')
assert.equal(calls[0][2], null, 'A lead is not presumed to be a signed-in profile')
assert.equal(calls[0][3].idempotencyKey, calls[1][3].idempotencyKey, 'Retries across capture doors share durable deduplication')
assert.deepEqual(Object.keys(calls[0][1]), ['source'])
assert.equal(calls[0][3].gaIdentity.clientId, '123.456')
const before = reads
await capture('webhook-lead', 'event_ticket', { gaIdentity: null })
assert.equal(reads, before, 'Explicit background null must not acquire a browser identity')
assert.equal(calls.at(-1)[3].gaIdentity, null)
rejectTrack = true
await capture('successful-save', 'beta_induction')
assert.equal(calls.length, 4, 'Telemetry outage must not reject the successful durable save')
console.log('Verified lead proof passed: durable-ID deduplication, no contact payload, background identity and failure isolation.')
