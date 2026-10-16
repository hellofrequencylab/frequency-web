// Fast backlog consequence; mounted engine suites still run independently in CI.
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'

const read = (file) => fs.readFileSync(file, 'utf8')
function evaluate(source, globals = {}) {
  const exports = {}
  const context = { exports, module: { exports }, ...globals }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context, { timeout: 1000 })
  return context.module.exports
}
const paintSource = read('lib/maps/pin-kinds.ts')
function checkPaint(source) {
  const { resolvePinPaint } = evaluate(source)
  for (const kind of ['event', 'place']) {
    assert.equal(resolvePinPaint({ kind }, true).token, '--design-map-pin')
    assert.equal(resolvePinPaint({ kind }, false).token, '--color-primary')
  }
  assert.equal(resolvePinPaint({ kind: 'circle', tone: 'primary' }, true).token, '--design-map-pin')
  for (const kind of ['circle', 'space', 'starter']) {
    assert.equal(resolvePinPaint({ kind }, true).token, resolvePinPaint({ kind }, false).token)
  }
  assert.equal(resolvePinPaint({ tone: 'secondary' }, true).token,
    resolvePinPaint({ tone: 'secondary' }, false).token)
}
checkPaint(paintSource)
const legacyPaint = paintSource.replace('return design &&', 'return false && design &&')
assert.notEqual(legacyPaint, paintSource)
assert.throws(() => checkPaint(legacyPaint), 'legacy action paint must fail this consequence')

const file = ts.createSourceFile('google-canvas.tsx', read('components/maps/google-canvas.tsx'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const node = file.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === 'tokenColor')
assert.ok(node, 'Google must retain its concrete scoped color resolver')
const tokenSource = ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, file)
function checkScope(source) {
  const root = {}; const container = {}; let accent = '#3a8c99'
  const { tokenColor } = evaluate(`${source}\nexports.tokenColor = tokenColor`, {
    document: { documentElement: root },
    getComputedStyle: (element) => ({ getPropertyValue: () => element === container ? accent : '#5b3fd0' }),
  })
  assert.equal(tokenColor(container, '--design-map-pin', 'fallback'), '#3a8c99')
  accent = '#8fe9ff'
  assert.equal(tokenColor(container, '--design-map-pin', 'fallback'), '#8fe9ff')
  accent = ''
  assert.equal(tokenColor(container, '--design-map-pin', 'fallback'), 'fallback')
}
checkScope(tokenSource)
const rootScoped = tokenSource.replace('getComputedStyle(container)', 'getComputedStyle(document.documentElement)')
assert.notEqual(rootScoped, tokenSource)
assert.throws(() => checkScope(rootScoped), 'root-only color lookup must fail this consequence')
assert.match(read('app/themes/frequency.css'), /--design-map-pin\s*:\s*var\(--fq-accent\)/)
console.log('SCAN-954 scoped map paint consequence passed; both regression controls rejected')
