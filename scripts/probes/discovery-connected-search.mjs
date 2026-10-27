// Actual crypto/state and runtime access gates, with inert dependencies; no provider/DB calls.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), ts = require('typescript')
const load = (file, dependencies, globals = {}) => {
  const loaded = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Buffer, URL, Date, process: { env: { DISCOVERY_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64') } }, ...globals })(key => key === 'server-only' ? {} : dependencies(key), loaded, loaded.exports)
  return loaded.exports
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
// Execute the actual callback with inert secret/provider IO. State diagnostics must not authorize.
let consumeCalls = 0
let callbackMode = 'reject'
const callbackCalls = []
const callback = load('app/api/integrations/discovery/[provider]/callback/route.ts', key => {
  if (key === 'next/server') return { NextResponse: { redirect: url => ({ headers: new Headers({ location: url }) }) } }
  if (key.includes('discovery-oauth-state')) return crypto
  if (key.includes('/host')) return { appOrigin: () => 'https://frequencylocal.com' }
  if (key.includes('connection-store')) return { consumeSearchConnection: async provider => { consumeCalls++; return callbackMode === 'reject' ? null : { binding: { ...binding, provider }, verifier: state.verifier } }, saveSearchConnection: () => { callbackCalls.push('save'); assert.equal(callbackMode, 'storage'); return false }, invalidateSearchConnection: () => { assert.notEqual(callbackMode, 'reject'); callbackCalls.push('invalidate'); return true } }
  if (key.includes('/oauth')) return { searchProvider: value => value === 'bing' ? 'bing_webmaster' : 'google_search_console', exchangeSearchCode: () => { assert.notEqual(callbackMode, 'reject'); callbackCalls.push('exchange'); return callbackMode === 'token' ? null : { accessToken: 'inert-access' } } }
  if (key.includes('discovery-access')) return { authorizeDiscoveryEditor: () => { assert.notEqual(callbackMode, 'reject'); return { actor: 'owner', space: { slug: 'owned' } } } }
  if (key.includes('discovery-search-runtime')) return { resolveSearchAccess: () => { assert.notEqual(callbackMode, 'reject'); return { actorProfileId: 'owner', consent: { id: 'grant' } } }, verifySearchConnection: () => { callbackCalls.push('verify'); assert.notEqual(callbackMode, 'token'); return callbackMode === 'property' ? { status: 'unavailable', reason: 'provider_auth_failed', providerStatus: 401 } : { status: 'verified' } } }
  throw Error(`Unexpected callback dependency: ${key}`)
})
for (const provider of ['google', 'bing']) {
  const call = query => callback.GET({ url: `https://frequencylocal.com/api/integrations/discovery/${provider}/callback?${query}` }, { params: Promise.resolve({ provider }) })
  const before = consumeCalls
  assert.equal((await call('code=inert&error=must-never-render')).headers.get('location'), 'https://frequencylocal.com/spaces/operating?search=missing_state')
  assert.equal((await call('state=invalid-sensitive-value&code=inert')).headers.get('location'), 'https://frequencylocal.com/spaces/operating?search=malformed_state')
  assert.equal((await call(`state=${state.state}&state=${state.state}`)).headers.get('location'), 'https://frequencylocal.com/spaces/operating?search=malformed_state')
  assert.equal((await call('error=invalid_scope&error_description=must-never-render')).headers.get('location'), 'https://frequencylocal.com/spaces/operating?search=provider_invalid_scope')
  assert.equal(consumeCalls, before)
  const rejected = await call(`state=${state.state}&code=inert&error=must-never-render`)
  assert.equal(rejected.headers.get('location'), 'https://frequencylocal.com/spaces/operating?search=rejected_state')
  assert.equal(consumeCalls, before + 1)
  assert.equal(rejected.headers.get('cache-control'), 'no-store')
  assert.equal(rejected.headers.get('referrer-policy'), 'no-referrer')
}
console.log('OAuth diagnostics: actual Google/Bing callback emits fixed state outcomes only and never exchanges without a valid consumed attempt (offline)')

// Actual OAuth serialization and response normalization; no provider HTTP request.
const oauth = load('lib/integrations/discovery/oauth.ts', key => {
  assert.equal(key, '@/lib/sites/host')
  return { appOrigin: () => 'https://frequencylocal.com' }
}, { AbortController, setTimeout, clearTimeout, URLSearchParams, process: { env: { BING_WEBMASTER_CLIENT_ID: 'inert-client', BING_WEBMASTER_CLIENT_SECRET: 'inert-secret', DISCOVERY_OAUTH_ENCRYPTION_KEY: 'configured-fixture' } } })
const authorization = new URL(oauth.searchAuthorizationUrl('bing_webmaster', state.state, state.challenge))
assert.equal(authorization.searchParams.get('scope'), 'webmaster.read')
assert.equal(authorization.searchParams.get('state'), state.state)
assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256')
const tokenReply = scope => async () => Response.json({ access_token: 'inert-access', token_type: 'Bearer', expires_in: 3600, scope })
for (const alias of ['Webmaster.read', 'webmaster.read', 'Read']) {
  const result = await oauth.exchangeSearchCode('bing_webmaster', 'inert-code', state.verifier, tokenReply(alias))
  assert.equal(JSON.stringify(result.scopes), JSON.stringify(['Webmaster.read']))
}
for (const invalid of ['Webmaster.manage', 'webmaster.manage', 'Read Manage', 'Read Read', 'prefix:Read', 'Read.suffix', 'Read,Manage', ['Read'], null]) {
  assert.equal(await oauth.exchangeSearchCode('bing_webmaster', 'inert-code', state.verifier, tokenReply(invalid)), null)
}
console.log('Bing scope: lowercase wire read, exact canonical aliases only, no mixed/manage/prefix/suffix acceptance (offline)')

for (const [mode, outcome, expected] of [
  ['token', 'token_exchange_failed', ['exchange', 'invalidate']],
  ['property', 'provider_auth_failed&provider_status=401', ['exchange', 'verify', 'invalidate']],
  ['storage', 'storage_failed', ['exchange', 'verify', 'save', 'invalidate']],
]) {
  callbackMode = mode; callbackCalls.length = 0
  const response = await callback.GET({ url: `https://frequencylocal.com/api/integrations/discovery/bing/callback?state=${state.state}&code=inert-code` }, { params: Promise.resolve({ provider: 'bing' }) })
  assert.equal(response.headers.get('location'), `https://frequencylocal.com/spaces/owned/settings/coach?search=${outcome}`)
  assert.deepEqual(callbackCalls, expected)
}
console.log('Callback stages: actual callback keeps token/property/storage failures distinct, never skips verification, and exposes only fixed stages/bounded HTTP status (offline)')
