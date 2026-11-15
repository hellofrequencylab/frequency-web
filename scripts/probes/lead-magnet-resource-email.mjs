import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function sourceModule(path, stubs) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const loaded = { exports: {} }
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: path }).runInNewContext({ URL, Date, process: { env: {} }, console })(name => {
    assert.ok(Object.hasOwn(stubs, name), 'Unexpected dependency: ' + name)
    return stubs[name]
  }, loaded, loaded.exports)
  return loaded.exports
}
let captured = true, claimed = true, suppressed = false
const queued = [], deliveries = []
const payload = { s: 'space', d: 'lead_magnet', r: 'https://example.com/guide.pdf', l: 'Guide' }
const action = sourceModule('app/(capture)/unlock/actions.ts', {
  'next/headers': { headers: async () => new Map() },
  '@/lib/rate-limit': { rateLimitOk: async () => true },
  '@/lib/crm/lead-links': { parseLeadLink: () => payload, isSafeHttpUrl: value => typeof value === 'string' && value.startsWith('https://') },
  '@/lib/crm/lead-capture': { captureLeadMagnet: async () => captured ? { contactId: 'contact', firstTouch: false } : null },
  '@/lib/crm/lead-magnet-resource-io': { sendLeadMagnetResource: async value => { deliveries.push(value); return 'queued' } },
})
const input = { token: 'signed', email: 'Reader@Example.com', name: 'Reader', phone: '', company: '' }
const result = await action.captureUnlock(input)
assert.equal(deliveries.length, 1, 'A valid resource request must queue an email even for an existing contact')
assert.equal(result.link.href, payload.r)
captured = false
await action.captureUnlock(input)
assert.equal(deliveries.length, 1, 'A failed capture cannot become a mail relay')
await action.captureUnlock({ ...input, company: 'bot' })
assert.equal(deliveries.length, 1, 'Honeypots must never email')
const io = sourceModule('lib/crm/lead-magnet-resource-io.ts', {
  'server-only': {}, 'node:crypto': require('node:crypto'),
  '@/lib/email': { enqueueEmail: async (email, options) => queued.push({ email, options }) },
  '@/lib/suppression': { isSuppressed: async () => suppressed },
  '@/lib/rate-limit': { claimOnce: async () => claimed },
  '@/lib/log': { log: { error() {} } },
  './lead-magnet-resource-email': { resourceEmailUrl: raw => raw?.startsWith('https://') ? raw : null, buildLeadMagnetResourceEmail: value => ({ to: value.to }) },
})
const request = { spaceId: 'space', email: 'Reader@Example.com', resourceUrl: payload.r, label: 'Guide', now: new Date('2026-11-14T12:30:00Z') }
await io.sendLeadMagnetResource(request)
assert.equal(queued.length, 1)
assert.equal(queued[0].options.lane, 'transactional')
assert.ok(!queued[0].options.dedupeKey.includes('reader@example.com'), 'Outbox keys must be opaque')
await io.sendLeadMagnetResource({ ...request, resourceUrl: 'https://example.com/another.pdf' })
assert.equal(queued[1].options.dedupeKey, queued[0].options.dedupeKey, 'Redis-free durable bound must cover different resources too')
suppressed = true
await io.sendLeadMagnetResource(request)
assert.equal(queued.length, 2, 'Suppressed recipients must not reach the queue')
suppressed = false; claimed = false
await io.sendLeadMagnetResource(request)
assert.equal(queued.length, 2, 'Already claimed requests must not reach the queue')
const suppressionReader = sourceModule('lib/suppression.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'unavailable' } }) }) }) }) },
})
assert.equal(await suppressionReader.isSuppressed('reader@example.com', 'space'), true, 'Suppression read errors must fail closed')
console.log('Lead magnet resource receipt: actual action wiring, capture/bot guards, transactional queue, suppression and opaque hourly dedupe PASS')
