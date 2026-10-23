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
