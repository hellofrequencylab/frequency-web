import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Bounded actual-source consequences with inert IO. No provider, database or nested test runner.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
function harness(stubs) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const resolve = (key) => {
      if (Object.hasOwn(stubs, key)) return stubs[key]
      if (key === 'server-only') return {}
      const relative = key.startsWith('@/') ? key.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), key))
      assert.ok(relative.startsWith('lib/') || relative.startsWith('app/'), `Unexpected dependency ${relative}`)
      return load(relative + '.ts')
    }
    new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Promise, Map, Set, Object, JSON, Number, URL })(resolve, mod, mod.exports)
    return mod.exports
  }
  return load
}
const state = { allowed: false, consent: null, aggregateReads: 0, writes: 0 }
const load = harness({
  'node:crypto': { randomUUID: () => 'new-grant' },
  'next/cache': { revalidatePath() {} },
  '@/lib/auth': { getMyProfileId: async () => 'editor-A' },
  './store': { getSpaceById: async id => ({ id, slug: 'makers' }) },
  '@/lib/spaces/store': { getSpaceById: async id => ({ id, slug: 'makers' }) },
  react: { cache: fn => fn },
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    assert.equal(table, 'space_members'); const filters = {};
    const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query }, maybeSingle: async () => ({ data: state.allowed && filters.space_id === 'space-A' ? { id: 'member', space_id: filters.space_id, profile_id: filters.profile_id, role: 'editor', status: 'active', invited_by: null, created_at: '2026-10-01T00:00:00Z' } : null, error: null }) }; return query;
  } }) },
  '@/lib/spaces/private-state': {
    loadSpaceDiscoveryConsent: async () => ({ available: true, consent: state.consent }),
    writeSpaceDiscoveryConsent: async (_id, consent) => { state.writes++; state.consent = consent; return true },
    loadSpaceCoachProfile: async () => ({ available: true, profile: { audience: 'Neighbours', voice: 'Plain words' } }),
  },
  '@/lib/spaces/analytics': { getSpaceProfileEvidence: async () => { state.aggregateReads++; const through = new Date(); return { windowDays: 30, observedFrom: new Date(through.getTime()-30*86400000).toISOString(), observedThrough: through.toISOString(), profileViews: 8, ctaClicks: 1 } } },
  '@/lib/sites/host': { appOrigin: () => 'https://frequencylocal.com' },
  zod: require('zod'),
})
const actions = load('app/(main)/spaces/[slug]/settings/coach/discovery-actions.ts')
assert.equal((await actions.reviewSpaceDiscovery('space-A')).reason, 'permission_denied')
assert.equal(state.aggregateReads, 0)
state.allowed = true
assert.equal((await actions.reviewSpaceDiscovery('space-A')).reason, 'consent_required')
assert.equal(state.aggregateReads, 0)
assert.equal((await actions.setSpaceDiscoveryConsent('space-B', true)).error !== undefined, true)
assert.equal(state.writes, 0)
const granted = await actions.setSpaceDiscoveryConsent('space-A', true)
assert.equal(granted.data.purpose, 'discovery_coaching')
const result = await actions.reviewSpaceDiscovery('space-A', 'bookings')
assert.equal(result.status, 'completed')
assert.equal(result.coaching.ownerContext.goal, 'bookings')
assert.ok(result.coaching.recommendations.length > 0)
assert.ok(result.coaching.recommendations.every(task => task.evidence.scope.spaceId === 'space-A' && task.basis === 'limited measurement'))
await actions.setSpaceDiscoveryConsent('space-A', false)
const reads = state.aggregateReads
assert.equal((await actions.reviewSpaceDiscovery('space-A')).reason, 'consent_required')
assert.equal(state.aggregateReads, reads)
console.log('ok: actual owner actions require fresh tenant permission and explicit consent; review stays aggregate and revocation blocks later reads (inert IO).')
