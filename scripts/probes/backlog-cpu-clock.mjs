import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const file = 'scripts/backlog-contract.test.ts'
const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
const meter = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'childCpuMs')
assert.ok(meter, 'Keep the reaped-child CPU measurement')
const meterCode = ts.transpileModule(meter.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
// Linux proc_pid_stat(5): fields 16/17 are cutime/cstime in clock ticks.
// https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html
const fields = Array(45).fill('0')
fields[0] = 'S'; fields[13] = '120'; fields[14] = '80'
const stat = `7 (test (nested)) ${fields.join(' ')}`
function clock(platform, hz, contents = stat) {
  const read = path => { assert.equal(path, '/proc/self/stat'); return contents }
  const exec = () => { if (hz === null) throw Error('no getconf'); return String(hz) }
  return new Function('readFileSync', 'execFileSync', 'process', meterCode + '\nreturn childCpuMs;')(read, exec, { platform })()
}
assert.equal(clock('linux', 100), 2000)
assert.equal(clock('linux', 250), 800)
assert.equal(clock('linux', null), 2000)
assert.equal(clock('darwin', 100), null, 'Never substitute wall time on a host without proc CPU counters')
assert.equal(clock('linux', 100, 'unreadable stat fields'), null)

let sweep
function walk(node, action) { action(node); ts.forEachChild(node, child => walk(child, action)) }
walk(ast, node => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'it' && node.arguments[0]?.text === 'the full --probes=all sweep is green, and stays inside its cost budget') sweep = node
})
assert.ok(sweep, 'The full-sweep cost contract must remain executable')
const options = sweep.arguments[1]
assert.ok(ts.isObjectLiteralExpression(options))
for (const property of options.properties) {
  if (!ts.isPropertyAssignment(property)) continue
  if (['skip', 'todo', 'only'].includes(property.name.getText(ast))) assert.notEqual(property.initializer.kind, ts.SyntaxKind.TrueKeyword)
  if (property.name.getText(ast) === 'timeout') assert.ok(Number(property.initializer.getText(ast).replace(/_/g, '')) <= 90_000)
}
const body = sweep.arguments.at(-1)
const constants = new Map()
let totalCpuAssertion = false, probeCpuAssertion = false
walk(body, node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) constants.set(node.name.text, node.initializer)
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'toBeLessThan') return
  const call = node.expression.expression
  if (!ts.isCallExpression(call) || call.expression.getText(ast) !== 'expect') return
  const measured = call.arguments[0]?.getText(ast), ceiling = node.arguments[0]?.getText(ast)
  if (measured === 'worstProbeMs' && ceiling === 'PER_PROBE_CEILING_MS') probeCpuAssertion = true
  if (measured !== 'guardCpuMs' || ceiling !== 'budget') return
  let parent = node.parent
  while (parent && !ts.isIfStatement(parent)) parent = parent.parent
  assert.ok(parent?.elseStatement && parent.expression.getText(ast).replace(/\s/g, '') === 'guardCpuMs===null')
  assert.ok(node.pos >= parent.elseStatement.pos && node.end <= parent.elseStatement.end)
  totalCpuAssertion = true
})
for (const name of ['cpuBefore', 'cpuAfter']) assert.equal(constants.get(name)?.getText(ast), 'childCpuMs()')
assert.ok(ts.isConditionalExpression(constants.get('guardCpuMs')))
assert.equal(constants.get('guardCpuMs').whenFalse.getText(ast), 'cpuAfter - cpuBefore')
assert.ok(totalCpuAssertion && probeCpuAssertion, 'Both CPU consequence ceilings must still be asserted')
for (const [name, expected] of [['PER_PROBE_CEILING_MS', 4500], ['BASE_CPU_MS', 2000], ['PER_PROBE_ALLOWANCE_MS', 180]]) assert.equal(Number(constants.get(name)?.getText(ast).replace(/_/g, '')), expected, name)
console.log('Actual proc CPU parser and budget assertions measure reaped CPU; non-Linux stays indeterminate and ceilings are unchanged')
