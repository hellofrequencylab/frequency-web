// Offline consequence probe: execute the actual card builder; mutation must expose missing-sample claims.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const file = 'components/admin/crm/email-best-practices.tsx'
const source = readFileSync(file, 'utf8')
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const builder = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'buildChecks')
const formatter = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'pct1'))
assert.ok(builder && formatter, 'actual health-card builder must exist')
const program = `${formatter.getText(ast)}\n${builder.getText(ast)}`
const run = text => {
  const context = {}
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.buildChecks
}
const empty = { sent: 0, delivered: 0, bounceRate: 0, complaintRate: 0, clickRate: 0, unsubscribeRate: 0 }
function acceptance(build) {
  const cards = build(empty)
  assert.equal(cards.length, 4)
  for (const card of cards) {
    assert.equal(card.grade, 'na')
    assert.equal(card.value, 'No data')
    assert.match(card.note, /needs recorded (sends|deliveries)/)
    assert.doesNotMatch(card.note, /below target|list is clean|not marking you as spam/)
  }
  const mixed = build({ ...empty, sent: 10, bounceRate: 1 })
  assert.equal(mixed[0].grade, 'watch')
  for (const card of mixed.slice(1)) assert.match(card.note, /needs recorded deliveries/)
  const measured = build({ ...empty, sent: 100, delivered: 100, clickRate: 0.03 })
  assert.ok(measured.every(card => card.grade === 'good'))
}
acceptance(run(program))
// Restore former note selection while preserving value/grade gates. Same acceptance must fail.
const ungated = program.replace(/!has(?:Sent|Delivery)\s*\?\s*'[^']*(?:people’s[^']*)?'\s*:/g, '')
assert.notEqual(ungated, program, 'negative control must alter actual notes')
assert.throws(() => acceptance(run(ungated)), 'missing-sample regression must fail acceptance')
console.log('SCAN-1154: actual health cards require recorded samples before measured advice; former ungated notes rejected')
