// Execute the actual private save action and uncached direct-editor resolver with inert IO.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const action = readFileSync('app/(main)/spaces/[slug]/settings/coach/actions.ts', 'utf8')
const access = readFileSync('lib/spaces/discovery-access.ts', 'utf8')
function functionText(source, name) {
  const ast = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(fn, `missing actual ${name}`)
  return fn.getText(ast).replace(/^export /, '')
}
const original = `${functionText(access, 'authorizeDiscoveryEditor')}\n${functionText(action, 'saveSpaceCoachProfile')}`
async function exercise(source) {
  const state = { actor: 'staff', role: null, status: 'active', writes: [] }
  const context = {
    getMyProfileId: async () => state.actor,
    getSpaceById: async id => ({ id, slug: id, ownerProfileId: `owner-${id}` }),
    readSpaceMembershipFresh: async id => id === 'space-A' && state.role ? { role: state.role, status: state.status } : null,
    atLeastSpaceRole: role => ['editor', 'moderator', 'admin'].includes(role),
    validateSpaceCoachProfile: () => null, parseSpaceCoachProfile: value => value ?? {},
    writeSpaceCoachProfile: async (id, value) => { state.writes.push({ id, value }); return true },
    revalidatePath: () => {}, ok: data => ({ data }), fail: error => ({ error }),
  }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const actor of ['staff', 'network-admin', 'foreign-owner']) {
    state.actor = actor
    assert.ok((await context.saveSpaceCoachProfile('space-A', { voice: 'poison' })).error)
    assert.ok((await context.saveSpaceCoachProfile('space-A', null)).error)
  }
  assert.equal(state.writes.length, 0, 'non-direct content authority cannot write private state')
  state.actor = 'direct-editor'; state.role = 'editor'
  assert.ok((await context.saveSpaceCoachProfile('space-A', { voice: 'human' })).data)
  assert.ok((await context.saveSpaceCoachProfile('space-B', null)).error)
  state.status = 'suspended'
  assert.ok((await context.saveSpaceCoachProfile('space-A', null)).error)
  assert.equal(state.writes.length, 1)
  state.actor = 'owner-space-A'
  assert.ok((await context.saveSpaceCoachProfile('space-A', null)).data)
  assert.equal(state.writes.length, 2)
}
await exercise(original)
// The old general capability allows staff/network content edits; restore that authority at this seam.
const bypass = original.replace('const editor = await authorizeDiscoveryEditor(spaceId)', 'const editor = { actor: "staff", space: await getSpaceById(spaceId) }')
assert.notEqual(bypass, original, 'control must change the real private action gate')
await assert.rejects(exercise(bypass), 'inherited content authority must fail private-write acceptance')
console.log('SEC-013: actual private action rejects staff/network/foreign/revoked writes; direct owner/editor retained; general-authority bypass rejected')
