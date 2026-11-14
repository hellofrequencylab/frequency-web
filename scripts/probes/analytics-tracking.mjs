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
const sanitize = sourceModule('lib/analytics/sanitize.ts', {})
const consent = sourceModule('lib/consent/cookie-consent.ts', { '@/lib/analytics/sanitize': sanitize })
assert.equal(consent.analyticsAllowed({ choice: null, priorConsentRegion: true }), false)
assert.equal(consent.analyticsAllowed({ choice: 'denied', priorConsentRegion: false }), false)
assert.equal(consent.analyticsAllowed({ choice: 'granted', priorConsentRegion: true }), true)
const query = sanitize.pixelSafeAttributionQuery('?utm_source=email&utm_medium=email&utm_campaign=123&utm_term=private@example.test&email=private@example.test&token=secret')
assert.equal(query, '?utm_source=email&utm_medium=email&utm_campaign=123')
assert.equal(sanitize.pixelSafeAttributionQuery('?utm_source=private@example.test&utm_medium=email&utm_campaign=private-topic'), '')
assert.equal(sanitize.pixelSafeTitle('/journeys/private-topic', 'Private account'), 'Frequency')
let allowed = true
let jar = { fq_consent: 'granted', _ga: 'GA1.1.123.456' }
const identity = sourceModule('lib/analytics/ga-client-id.ts', {
  './audience': { currentViewerAllowsAnalytics: async () => allowed },
  'next/headers': { cookies: async () => ({ get: (name) => jar[name] === undefined ? undefined : { value: jar[name] } }) },
  '@/lib/consent/cookie-consent': consent,
}, { process: { env: {} } })
assert.equal((await identity.readGaIdentity()).clientId, '123.456')
allowed = false
assert.equal(await identity.readGaIdentity(), null, 'Real staff/account exclusion must prevent browser identity')
allowed = true; jar.fq_consent = 'denied'
assert.equal(await identity.readGaIdentity(), null, 'Browser withdrawal must prevent identity even with existing GA cookie')
jar = { fq_ask: '1', _ga: 'GA1.1.123.456' }
assert.equal(await identity.readGaIdentity(), null, 'Prior-consent visitor without grant must stay untracked')
assert.equal(identity.parseGaClientId('profile-uuid'), null)
assert.equal(identity.parseGaSessionId('GS2.1.s1695123456$o1$g1'), '1695123456')
console.log('Tracking proof passed: browser/account consent, browser identity and private query/title boundaries.')
