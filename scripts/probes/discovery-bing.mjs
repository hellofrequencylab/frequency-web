import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const ts = require('typescript'), cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const mod = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Number, Set, Map, URL, Buffer })(key => {
    if (key === 'server-only') return {}
    if (key === 'zod') return require('zod')
    if (key === '@/lib/net/pinned-fetch') return { fetchPinned: () => { throw new Error('No live requests in probe') } }
    if (key === '@/lib/sites/host') return { appOrigin: () => 'https://frequencylocal.com' }
    assert.ok(['./discovery-evidence', './discovery-provider-access'].includes(key), `Unexpected dependency ${key}`)
    return load(`lib/ai/${key.slice(2)}.ts`)
  }, mod, mod.exports)
  cache.set(file, mod.exports); return mod.exports
}
const { observeBingDiscovery } = load('lib/ai/discovery-bing.ts')
const now = new Date('2026-10-26T12:00:00Z'), property = 'https://owner.example/'
const period = { from: '2026-10-20T00:00:00Z', to: now.toISOString() }
let allowed = true, revoked = false, verified = true, calls = []
const consent = { id: 'grant', purpose: 'discovery_coaching', grantedAt: '2026-10-01T00:00:00Z', expiresAt: null, revokedAt: null }
const deps = {
  now: () => now,
  resolveAccess: async () => ({ spaceId: 'A', actorProfileId: 'owner', canEditProfile: allowed && !revoked, consent, authorizedPageUrls: [property] }),
  resolveConnection: async () => ({ provider: 'bing_webmaster', connectionId: 'conn', spaceId: 'A', actorProfileId: 'owner', consentId: 'grant', propertyUrl: property, propertyScope: 'dedicated_property', accessToken: 'PRIVATE_TOKEN', expiresAt: '2026-10-27T00:00:00Z', revokedAt: null, scopes: ['Webmaster.read'] }),
  request: async (url, options) => {
    calls.push(url)
    assert.equal(options.maxRedirects, 0); assert.equal(options.maxBytes, 1048576)
    assert.equal(new URL(url).host, 'ssl.bing.com'); assert.ok(!url.includes('PRIVATE_TOKEN'))
    const d = url.includes('GetUserSites') ? [{ Url: property, IsVerified: verified }] : [{ Date: `/Date(${Date.parse('2026-10-25T07:00:00Z')}-0700)/`, Clicks: 3, Impressions: 30 }]
    return { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ d })), finalUrl: url }
  },
}
let out = await observeBingDiscovery('A', period, deps)
assert.equal(out.status, 'completed'); assert.equal(calls.length, 2)
assert.equal(out.observations[0].observation.value, 3); assert.equal(out.observations[0].observation.collectionMethod, 'api_response')
assert.ok(!JSON.stringify(out).includes('PRIVATE_TOKEN'))
allowed = false; calls = []
out = await observeBingDiscovery('A', period, deps)
assert.equal(out.status, 'unavailable'); assert.equal(calls.length, 0, 'Permission must precede provider IO')
allowed = true; verified = false; calls = []
out = await observeBingDiscovery('A', period, deps)
assert.equal(out.reason, 'property_unverified'); assert.equal(calls.length, 1, 'Unverified property must not load statistics')
verified = true; calls = []
const request = deps.request
out = await observeBingDiscovery('A', period, { ...deps, request: async (...args) => { const result = await request(...args); revoked = true; return result } })
assert.equal(out.status, 'unavailable'); assert.equal(calls.length, 1, 'Revocation during provider IO must discard results')
console.log('ok: actual Bing adapter/common permission gate/evidence validator read only a verified bound property; permission, property and mid-flight revocation controls fail closed with inert IO')
