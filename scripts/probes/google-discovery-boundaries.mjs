// Execute actual provider/gate/normalizer code with inert HTTP and private broker fixtures.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const ts = require('typescript')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  const dep = key => {
    if (key === 'server-only') return {}
    if (!key.startsWith('.') && !key.startsWith('@/')) return require(key)
    const target = key.startsWith('@/') ? key.slice(2) : path.posix.join(path.posix.dirname(file), key)
    assert.ok(target.startsWith('lib/'), 'Unexpected local dependency')
    return load(target + '.ts')
  }
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ URL, Date, Buffer, AbortController, setTimeout, clearTimeout })(dep, mod, mod.exports)
  return mod.exports
}
const { observeGoogleSearchConsole, GOOGLE_SEARCH_READ_SCOPE } = load('lib/ai/discovery-google.ts')
const page = 'https://frequencylocal.com/spaces/probe'
const now = new Date('2026-10-26T18:00:00.000Z')
const consent = { id: 'grant', purpose: 'discovery_coaching', grantedAt: '2026-10-25T18:00:00.000Z', expiresAt: '2026-11-25T18:00:00.000Z', revokedAt: null }
let allowed = true
let calls = 0
let foreignRows = false
const connection = { provider: 'google_search_console', connectionId: 'conn', spaceId: 'space', actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:frequencylocal.com', propertyScope: 'page_urls', accessToken: 'fixture-secret', expiresAt: '2026-10-26T19:00:00.000Z', revokedAt: null, scopes: [GOOGLE_SEARCH_READ_SCOPE] }
const deps = {
  now: () => now,
  resolveAccess: async () => ({ spaceId: 'space', actorProfileId: 'owner', canEditProfile: allowed, consent, authorizedPageUrls: [page] }),
  resolveConnection: async () => connection,
  request: async (url, init) => {
    calls++
    assert.equal(new URL(url).hostname, 'www.googleapis.com')
    assert.equal(init.redirect, 'error')
    if (url.endsWith('/sites')) return Response.json({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] })
    const body = JSON.parse(init.body)
    assert.deepEqual(body.dimensions, ['page'])
    assert.deepEqual(body.dimensionFilterGroups, [{ groupType: 'and', filters: [{ dimension: 'page', operator: 'equals', expression: page }] }])
    return Response.json({ rows: [{ keys: [foreignRows ? 'https://frequencylocal.com/spaces/other' : page], clicks: 8, impressions: 40, ctr: .2, position: 4 }] })
  },
}
const run = () => observeGoogleSearchConsole('space', { startDate: '2026-10-20', endDate: '2026-10-24' }, deps)
const good = await run()
assert.equal(good.status, 'completed')
assert.ok(good.imported.observations.some(o => o.status === 'accepted'))
assert.equal(calls, 2)
assert.ok(!JSON.stringify(good).includes('fixture-secret'))
allowed = false; calls = 0
assert.equal((await run()).status, 'unavailable'); assert.equal(calls, 0)
allowed = true; consent.revokedAt = now.toISOString()
assert.equal((await run()).status, 'unavailable'); assert.equal(calls, 0)
consent.revokedAt = null; foreignRows = true
const foreign = await run()
assert.equal(foreign.status, 'completed'); assert.equal(foreign.imported.observations.length, 0)
console.log('Google exact-page/private-consent/no-secret boundaries PASS (offline; no provider request)')
