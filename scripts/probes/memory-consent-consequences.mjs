import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

/** Representative actual-source consequences; all storage is inert. Full focused tests remain separate. */
export async function memoryConsentConsequences(root, overrides = {}) {
  const require = createRequire(path.join(root, 'package.json'))
  const ts = require('typescript')
  const allowed = new Set(['lib/ai/memory.ts', 'lib/consent/consent.ts', 'lib/consent/scopes.ts'])
  const cache = new Map(), closure = {}
  const state = { consent: new Map([['yes', true], ['no', false]]), error: false, thrown: false, revokeAfterRead: false, reads: [], writes: [] }
  const contexts = ['yes', 'no'].map(profile_id => ({ profile_id, summary: 'Inert remembered detail', facts: { interests: ['Walking'] }, milestones: {}, interaction_count: 1, last_summarized_at: null }))
  const client = { from(table) {
    assert.ok(['consent_records', 'ai_member_context'].includes(table))
    let id
    const q = {
      select() { return q }, eq(key, value) { if (key === 'profile_id') id = value; return q }, order() { return q }, limit() { return q },
      async maybeSingle() {
        if (table === 'consent_records') {
          if (state.thrown) throw Error('Inert consent read failure')
          return { data: state.consent.has(id) ? { granted: state.consent.get(id) } : null, error: state.error ? { message: 'Inert returned error' } : null }
        }
        state.reads.push(id)
        if (state.revokeAfterRead) state.consent.set(id, false)
        return { data: contexts.find(row => row.profile_id === id) ?? null, error: null }
      },
      upsert(value) { state.writes.push({ kind: 'upsert', value }); return Promise.resolve({ error: null }) },
      update(value) { state.writes.push({ kind: 'update', value }); return q },
      then(resolve) { return Promise.resolve({ data: contexts, error: null }).then(resolve) },
    }
    return q
  } }
  function load(file) {
    assert.ok(allowed.has(file), `Unreviewed source import: ${file}`)
    if (cache.has(file)) return cache.get(file).exports
    const source = overrides[file] ?? fs.readFileSync(path.join(root, file), 'utf8')
    closure[file] = createHash('sha256').update(source).digest('hex')
    const loadedModule = { exports: {} }; cache.set(file, loadedModule)
    const localRequire = specifier => {
      if (specifier === 'server-only') return {}
      if (specifier === '@/lib/supabase/admin') return { createAdminClient: () => client }
      const resolved = specifier.startsWith('@/') ? specifier.slice(2) + '.ts' : path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) + '.ts'
      return load(resolved)
    }
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Promise, Map, Set })(localRequire, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  const memory = load('lib/ai/memory.ts'), { hasConsent } = load('lib/consent/consent.ts')
  let cases = 0
  assert.equal(await memory.getMemberContext('no'), null); assert.equal(state.reads.length, 0); cases++
  assert.equal((await memory.getMemberContext('yes')).summary, 'Inert remembered detail'); cases++
  state.reads = []; await memory.rememberFacts('no', { goals: ['Do not save'] }); assert.equal(state.reads.length, 0); assert.equal(state.writes.length, 0); cases++
  await memory.rememberFacts('yes', { goals: ['A new goal'] }); assert.equal(state.writes.length, 1); assert.equal(state.writes[0].value.profile_id, 'yes'); cases++
  state.writes = []; state.revokeAfterRead = true; await memory.rememberFacts('yes', { goals: ['Do not save after revocation'] }); assert.equal(state.writes.length, 0); cases++
  state.revokeAfterRead = false; state.consent.set('yes', true)
  assert.deepEqual(Array.from(await memory.claimMembersDueForSummary(20), row => row.profileId), ['yes']); cases++
  state.writes = []; state.consent.set('yes', false); await memory.writeDigest('yes', { summary: 'Do not update', facts: {} }); assert.equal(state.writes.length, 0); assert.equal(contexts.length, 2); cases++
  assert.equal(await hasConsent('absent', 'ai_memory'), true); cases++
  state.error = true; assert.equal(await hasConsent('absent', 'ai_memory'), false); assert.equal(await memory.getMemberContext('yes'), null); cases++
  state.error = false; state.thrown = true; assert.equal(await hasConsent('yes', 'ai_memory'), false); cases++
  return { cases, closure, scope: 'Ten representative actual-source persistent-memory/consent cases with inert storage. No provider, private browser or live database execution. Current conversation/profile preservation and compressor tests remain separately mandatory.' }
}
if (invokedDirectly(import.meta.url)) console.log(await memoryConsentConsequences(process.cwd()))
