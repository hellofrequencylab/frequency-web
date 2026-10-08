import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

// Inventory the actual production syntax, including multiline and nested calls.
// The wrapper behavior tests separately prove admission and durable settlement.
test('every shipped paid completion caller supplies central attribution', () => {
  const failures: string[] = []
  let calls = 0
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!/\.tsx?$/.test(path) || /\.(test|spec)\.tsx?$/.test(path) || path === 'lib/ai/complete.ts') continue
      const text = readFileSync(path, 'utf8')
      // Parsing thousands of unrelated modules can exceed the suite's timeout. This prefilter
      // cannot skip a matching identifier: escaped Unicode names still receive full AST parsing.
      if (!['completeRaw', 'completeText', 'runToolLoop', '\\u'].some(token => text.includes(token))) continue
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['completeRaw', 'completeText', 'runToolLoop'].includes(node.expression.text)) {
          calls++
          const params = node.arguments[0]
          const context = params && ts.isObjectLiteralExpression(params) && params.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'accounting')
          if (!context || !ts.isPropertyAssignment(context) || !ts.isObjectLiteralExpression(context.initializer) || !context.initializer.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'feature')) failures.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  walk('app'); walk('lib')
  expect(calls).toBeGreaterThanOrEqual(46)
  expect(failures).toEqual([])
})
