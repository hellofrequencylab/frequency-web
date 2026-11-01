import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute both actual profile transforms with the same actual year helper.
// A host-local getter is forbidden here so a UTC runner cannot hide the regression.
class HostDate extends Date { getFullYear() { throw new Error('Membership year depends on host timezone') } }
function load(path, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', 'Date', 'process', output)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports, HostDate, { env: {} })
  return exports
}
const year = load('lib/spotlight/member-year.ts')
const schema = load('lib/spotlight/blocks/schema.ts')
const adapter = load('lib/entity-blocks/member-adapter.ts', { '@/lib/spotlight/member-year': year, '@/lib/spotlight/blocks/schema': schema })
const bridge = load('lib/spotlight/puck/resolve.ts', {
  '@/lib/spotlight/member-year': year,
  '@/lib/spotlight/puck/convert': {},
  '@/lib/page-editor/templates/linktree': {},
})
for (const [input, expected] of [['2024-01-01T00:00:00Z', 2024], ['2023-12-31T23:30:00-02:00', 2024], ['2024-01-01T00:30:00+02:00', 2023], [null, null], ['invalid', null]]) {
  const data = { profile: { created_at: input }, totalZaps: 0, topFriends: [], guestbook: [], layout: { blocks: [] } }
  assert.equal(adapter.resolveMemberBlockData(data).stats.joinedYear, expected)
  assert.equal(bridge.spotlightRenderMeta(data).stats.joinedYear, expected)
}
console.log('Member grid and Spotlight bridge publish the same UTC membership year; malformed dates publish no year.')
