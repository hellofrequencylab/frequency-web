// Actual crypto/state and runtime access gates, with inert dependencies; no provider/DB calls.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), ts = require('typescript')
const load = (file, dependencies, globals = {}) => {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Buffer, URL, Date, process: { env: { DISCOVERY_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64') } }, ...globals })(key => key === 'server-only' ? {} : dependencies(key), module, module.exports)
  return module.exports
}
const crypto = load('lib/ai/discovery-oauth-state.ts', key => require(key))
const binding = { spaceId: 'space', provider: 'google_search_console', connectionId: '00000000-0000-4000-8000-000000000001', revision: 1, actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:example.com', propertyScope: 'page_urls' }
const sealed = crypto.sealSearchSecret(binding, 'tokens', { accessToken: 'inert-fixture' })
assert.ok(sealed && !sealed.includes('inert-fixture'))
assert.equal(crypto.openSearchSecret(binding, 'tokens', sealed).accessToken, 'inert-fixture')
for (const field of ['spaceId', 'provider', 'connectionId', 'actorProfileId', 'consentId', 'propertyUrl', 'propertyScope']) assert.equal(crypto.openSearchSecret({ ...binding, [field]: 'different' }, 'tokens', sealed), null)
assert.equal(crypto.openSearchSecret(binding, 'pending', sealed), null)
const state = crypto.newSearchOAuthState(binding.connectionId)
assert.equal(crypto.parseSearchOAuthState(state.state).nonceHash, state.nonceHash)
assert.equal(crypto.parseSearchOAuthState(state.state + 'x'), null)
let permitted = false, consent = false, reads = 0, privateReads = 0
const editor = { actor: 'owner', space: { slug: 'owned', preferences: {}, domain: null, parentId: null, ownerProfileId: 'owner' } }
const runtime = load('lib/ai/discovery-search-runtime.ts', key => {
  if (key.includes('discovery-access')) return { authorizeDiscoveryEditor: async () => permitted ? editor : null }
  if (key.includes('private-state')) return { loadSpaceDiscoveryConsent: async () => { reads++; return { available: true, consent: { id: 'grant' } } } }
  if (key.includes('discovery-consent')) return { discoveryConsentActive: () => consent }
  if (key.includes('/website')) return { readWebsitePublished: () => null }
  if (key.includes('site-domain')) return { liveSiteDomain: async () => null }
  if (key.includes('/host')) return { appOrigin: () => 'https://frequencylocal.com' }
  if (key.includes('connection-store')) return { loadSearchConnection: async () => { privateReads++; return null } }
  return {}
})
assert.equal(await runtime.resolveSearchAccess('space'), null); assert.equal(reads, 0)
permitted = true
assert.equal((await runtime.reviewSearchSignals('space', 'google_search_console')).status, 'unavailable'); assert.equal(privateReads, 0)
consent = true
assert.deepEqual(Array.from((await runtime.resolveSearchAccess('space')).authorizedPageUrls), ['https://frequencylocal.com/spaces/owned'])
assert.equal(await runtime.searchPropertyAllowed('space', 'bing_webmaster', 'https://frequencylocal.com/'), null)
assert.equal(await runtime.searchPropertyAllowed('space', 'google_search_console', 'https://foreign.example/'), null)
console.log('Connected search: real sealed-state isolation, malformed-state denial, permission/consent ordering and property scope (offline)')
