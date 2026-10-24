import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/** Load actual pure/server code with explicit dependency recorders, no SDK or network fallback. */
export function loadProbeModule(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', code)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `${file}: unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

/** Execute an actual self-contained exported function without evaluating SDK imports. */
export function loadPureProbeExport(file, name) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const nodes = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
  assert.equal(nodes.length, 1, `${file}: expected one exported ${name}`)
  const code = ts.transpileModule(nodes[0].getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('exports', code)(exports)
  assert.equal(typeof exports[name], 'function')
  return exports[name]
}
