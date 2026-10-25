import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Evaluate actual reader/classifier bodies with a scripted public RPC, no SDK/network fallback.
function declarations(file, names) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const selected = source.statements.filter(node =>
    (node.name && names.includes(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(source)))))
  assert.equal(selected.length, names.length, `${file}: required reader/classifier declaration missing`)
  return selected.map(node => node.getText(source)).join('\n')
}
const source = declarations('lib/discover.ts', ['TRANSIENT_RE', 'TRANSIENT_STATUS', 'isTransientDiscoverStatus', 'isTransientDiscoverError']) + '\n' +
  declarations('app/sitemap.ts', ['getOrganizerRoutes', 'SitemapTransientReadError', 'isTransientRead', 'describeError', 'failSection'])
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
let answer = { data: [], error: null, status: 200 }
const logs = []
const reader = new Function('exports', 'createPublicClient', 'SITE_URL', 'console', code + '\nreturn getOrganizerRoutes')({}, () => ({ rpc: async (name, args) => {
  assert.equal(name, 'public_organizer_handles')
  assert.deepEqual(args, { _limit: 500 })
  if (answer instanceof Error) throw answer
  return answer
} }), 'https://fixture.invalid', { error: (...args) => logs.push(args) })
assert.deepEqual(await reader(), [])
assert.equal(logs.length, 0)
answer = { data: [{ handle: 'host', next_starts: null }], error: null, status: 200 }
assert.equal((await reader())[0].url, 'https://fixture.invalid/discover/events/organizer/host')
for (const response of [{ data: null, error: { code: '', message: 'edge unavailable' }, status: 503 }, new TypeError('fetch failed')]) {
  answer = response
  logs.length = 0
  await assert.rejects(reader(), { name: 'SitemapTransientReadError' })
  assert.equal(logs.length, 1)
  assert.match(logs[0][0], /organizers read failed on TRANSPORT/)
}
for (const status of [403, 503]) {
  answer = { data: null, error: { code: '42501', message: 'permission denied' }, status }
  logs.length = 0
  assert.deepEqual(await reader(), [])
  assert.equal(logs.length, 1)
  assert.doesNotMatch(logs[0][0], /TRANSPORT/)
}
console.log('Actual organizer reader preserves public RPC/cap, rejects transport regeneration, and logs deterministic/healthy-empty outcomes correctly.')
