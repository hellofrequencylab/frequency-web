import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const ts = require('typescript')
const state = { system: true, memberships: ['A', 'A', 'B'], writes: [], reads: [] }
const stubs = {
  '@/lib/blocking': { isBlockedBetween: async () => false },
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    const filters = []; state.reads.push({ table, filters })
    const q = { select: () => q, eq: (k, v) => { filters.push([k, v]); return q }, limit: () => q,
      maybeSingle: async () => ({ data: state.system ? { id: 'SYSTEM' } : null }),
      then: resolve => Promise.resolve({ data: state.memberships.map(circle_id => ({ circle_id })) }).then(resolve),
      insert: async row => { state.writes.push(row); return { error: null } },
    }; return q
  } }) },
}
const file = 'lib/circles/social-fuel.ts'
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const loadedModule = { exports: {} }
new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Promise, Set, Map })(key => { assert.ok(Object.hasOwn(stubs, key), `Recognition must not import a model/provider or extra data reader: ${key}`); return stubs[key] }, loadedModule, loadedModule.exports)
const { celebrateInCircleFeed, deterministicCelebration } = loadedModule.exports
const ctx = { handle: 'member', kind: 'journey_finished', detail: 'Morning' }
assert.equal(await celebrateInCircleFeed('MEMBER', ctx), 2)
assert.equal(JSON.stringify(state.writes), JSON.stringify(['A', 'B'].map(scope_id => ({ author_id: 'SYSTEM', scope_id, visibility: 'group', post_type: 'system', body: deterministicCelebration(ctx) }))))
assert.equal(JSON.stringify(state.reads.find(r => r.table === 'memberships').filters), JSON.stringify([['profile_id', 'MEMBER'], ['status', 'active']]))
assert.equal(JSON.stringify(state.reads.find(r => r.table === 'profiles').filters), JSON.stringify([['is_system', true], ['is_active', true]]))
state.writes = []; state.system = false
assert.equal(await celebrateInCircleFeed('MEMBER', ctx), 0); assert.equal(state.writes.length, 0)
state.system = true; state.memberships = []
assert.equal(await celebrateInCircleFeed('MEMBER', ctx), 0); assert.equal(state.writes.length, 0)
console.log('ok: actual Circle recognition persists only human-written operational copy as SYSTEM to active member Circles; no model/provider dependency, member-authorship fallback or audience expansion (inert IO).')
