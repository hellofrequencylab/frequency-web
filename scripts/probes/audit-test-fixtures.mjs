import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
const fsBindings = Object.fromEntries(['mkdtempSync', 'mkdirSync', 'writeFileSync', 'copyFileSync', 'truncateSync', 'chmodSync', 'existsSync', 'readFileSync', 'rmSync'].map(name => [name, fs[name]]))

function declaration(file, name, bindings = {}, kind = 'function') {
  const source = fs.readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const node = ast.statements.find(statement => kind === 'function'
    ? ts.isFunctionDeclaration(statement) && statement.name?.text === name
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(ast) === name))
  assert.ok(node, `Actual declaration ${name} exists`)
  const code = ts.transpileModule(node.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(bindings), `${code};return ${name}`)(...Object.values(bindings))
}
async function cache() {
  let reads = 0
  const sourceFor = declaration('lib/cross-request-cache.test.ts', 'sourceFor', {
    sourceSnapshot: new Map(), sourceWithoutComments: () => { reads++; return 'source' }, stripImports: value => `stripped:${value}`,
  })
  assert.equal(sourceFor('same.ts'), 'source'); assert.equal(sourceFor('same.ts', { imports: true }), 'stripped:source')
  assert.equal(reads, 1, 'Repeated census queries must share one source snapshot')
  const fixtures = []
  const runScript = declaration('scripts/check-cache-budget-warn-only.test.ts', 'runScript', {
    ...fsBindings, tmpdir, join, fixtures,
    spawnSync: (command, args, options) => {
      assert.ok(options.cwd.startsWith(tmpdir()), 'Mutants must never measure/prune the shared checkout')
      assert.ok(options.timeout > 0 && options.timeout <= 15000)
      return spawnSync(command, args, options)
    },
  })
  try {
    const source = fs.readFileSync('scripts/check-cache-budget.mjs', 'utf8')
    const control = runScript(source)
    assert.equal(control.status, 0, `${control.stdout}${control.stderr}`)
    const breach = source.replace(/const NODE_MODULES_BUDGET_GIB = [\d.]+/, 'const NODE_MODULES_BUDGET_GIB = 0.01')
    assert.notEqual(breach, source, 'Floor mutation must apply')
    const failure = runScript(breach); assert.notEqual(failure.status, 0); assert.match(failure.stderr, /floor budget/)
    const warning = runScript(breach, ['--warn-only']); assert.equal(warning.status, 0)
  } finally { for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true }) }
}
async function preview() {
  const file = 'scripts/e2e-preview-gate.test.ts'
  const NOT_FOUND = declaration(file, 'NOT_FOUND', {}, 'variable')
  const FAKE_GH = declaration(file, 'FAKE_GH', { NOT_FOUND }, 'variable')
  const expect = value => ({ toBeGreaterThan: floor => assert.ok(value > floor) })
  const resolverScript = declaration(file, 'resolverScript', { wf: fs.readFileSync('.github/workflows/e2e.yml', 'utf8'), expect })
  let dir
  const runResolver = declaration(file, 'runResolver', {
    ...fsBindings, tmpdir, join, FAKE_GH, resolverScript,
    spawnSync: (command, args, options) => {
      dir = options.env.RUNNER_TEMP
      assert.equal(options.env.PATH.split(':')[0], join(dir, 'bin'))
      assert.ok(fs.existsSync(join(dir, 'bin', 'date')), 'Fixture must own GNU date emulation')
      assert.ok(options.timeout > 0 && options.timeout < 30000)
      return spawnSync(command, args, options)
    },
  })
  const result = runResolver([
    { m: 'rate_limit', r: [{ out: `0 ${Math.floor(Date.now() / 1000) + 3000}` }] },
    { m: 'deployments?', r: [{ code: 1, out: '{}', err: 'quota refused' }] },
  ])
  assert.equal(result.status, 1, result.log)
  assert.match(result.log, /quota is spent until \d\d:\d\d:\d\dZ/)
  assert.ok(!result.output.includes('ready=true'))
  assert.equal(fs.existsSync(dir), false, 'Fixture must remove its entire temporary directory')
}
assert.ok(['cache', 'preview'].includes(process.argv[2]), 'Choose cache or preview')
await ({ cache, preview })[process.argv[2]]()
console.log(`${process.argv[2]}: real fixture consequences verified without nesting a test runner`)
