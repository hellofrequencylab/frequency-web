import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
// Inspect the actual registered literal, not comments or a stale total-tool count.
const source = ts.createSourceFile('space-modules.ts', fs.readFileSync('lib/admin/modules/space-modules.ts', 'utf8'), ts.ScriptTarget.Latest, true)
let catalog
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'SPACE_MODULES') catalog = node.initializer
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(catalog && ts.isArrayLiteralExpression(catalog), 'Space catalog must be an explicit array')
const rows = catalog.elements.map(node => {
  assert.ok(ts.isObjectLiteralExpression(node), 'Every tool must declare its metadata')
  const fields = Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source), p.initializer]))
  assert.ok(fields.id && ts.isStringLiteral(fields.id), 'Every tool has a literal id')
  if (fields.parent) assert.ok(ts.isStringLiteral(fields.parent), 'Parent must be a declared catalog id')
  return { id: fields.id.text, parent: fields.parent?.text, fields }
})
const byId = new Map(rows.map(row => [row.id, row]))
assert.equal(byId.size, rows.length, 'Module ids must be unique')
const boxes = ['space.basics', 'space.people', 'space.content', 'space.offerings', 'space.reach'].sort()
assert.deepEqual(rows.filter(row => !row.parent).map(row => row.id).sort(), boxes)
for (const row of rows) {
  if (!row.parent) continue
  assert.ok(byId.has(row.parent), `${row.id} parent exists`)
  assert.ok(!byId.get(row.parent).parent, `${row.id} belongs directly to one of the five boxes`)
}
const coach = byId.get('space.coach')
assert.equal(coach?.parent, 'space.basics')
assert.ok(coach.fields.deepLink.getText(source).includes('/settings/coach'), 'Coach menu links to protected settings')
console.log(`${rows.length} unique tools retained in five valid boxes; coach preferences nested under Your page.`)
