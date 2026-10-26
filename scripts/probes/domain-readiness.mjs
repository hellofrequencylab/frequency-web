// LIVE-1337: execute the actual pure readiness and conditional activation functions with inert storage.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
function functions(path, names) {
  const source = readFileSync(path, 'utf8')
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const selected = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(tree))
  assert.equal(selected.length, names.length, `${path}: actual functions exist`)
  return ts.transpileModule(selected.join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}
let row = { id: 'a', domain: 'working.example', candidate: 'new.example' }
let patch
const createAdminClient = () => ({ from: () => ({ update: value => {
  const filters = []
  const query = {
    eq: (key, expected) => { filters.push([key, expected]); return query },
    is: (key, expected) => { filters.push([key, expected]); return query },
    select: () => query,
    maybeSingle: async () => {
      if (!filters.every(([key, expected]) => (key === 'preferences->siteDomainSetup->>domain' ? row.candidate : row[key]) === expected)) return { data: null, error: null }
      row.domain = value.domain
      return { data: { id: row.id }, error: null }
    },
  }
  return query
} }) })
const exports = {}
vm.runInNewContext(functions('lib/sites/domain-setup.ts', ['siteDomainReady']) + functions('lib/spaces/store.ts', ['stageSpaceDomain', 'activateSpaceDomain']), {
  exports, createAdminClient, patchSpacePreferences: async (id, next) => { patch = { id, next }; return true },
})
const ready = { attached: true, verified: true, dnsReady: true, secure: true }
assert.equal(exports.siteDomainReady(ready), true)
for (const key of Object.keys(ready)) assert.equal(exports.siteDomainReady({ ...ready, [key]: false }), false, `${key} required`)
assert.equal(exports.siteDomainReady({ ...ready, unchecked: true }), false)
assert.equal(await exports.stageSpaceDomain('a', 'new.example'), true)
assert.equal(row.domain, 'working.example', 'staging preserves active domain')
assert.equal(patch.next.siteDomainSetup.domain, 'new.example')
assert.equal(await exports.activateSpaceDomain('a', 'new.example', 'working.example'), 'ok')
row = { id: 'a', domain: 'working.example', candidate: 'different.example' }
assert.equal(await exports.activateSpaceDomain('a', 'new.example', 'working.example'), 'stale')
assert.equal(row.domain, 'working.example')
row.candidate = 'new.example'
assert.equal(await exports.activateSpaceDomain('foreign', 'new.example', 'working.example'), 'stale')
row.domain = 'concurrently-changed.example'
assert.equal(await exports.activateSpaceDomain('a', 'new.example', 'working.example'), 'stale')
assert.equal(row.domain, 'concurrently-changed.example')
console.log('LIVE-1337 actual readiness, staging and candidate/tenant/active-domain CAS consequences pass')
