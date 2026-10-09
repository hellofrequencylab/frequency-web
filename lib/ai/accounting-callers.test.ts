import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'
import { FEATURE_DAILY_CAP_USD } from './budget'

// Inventory the actual production syntax, including multiline and nested calls.
// The wrapper behavior tests separately prove admission and durable settlement.
test('every shipped paid completion caller supplies central attribution', () => {
  const failures: string[] = []
  let calls = 0
  const labels = new Set<string>()
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
      const constants = new Map<string, string>()
      function collect(node: ts.Node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) constants.set(node.name.text, node.initializer.text)
        ts.forEachChild(node, collect)
      }
      collect(source)
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['completeRaw', 'completeText', 'runToolLoop'].includes(node.expression.text)) {
          calls++
          const params = node.arguments[0]
          const context = params && ts.isObjectLiteralExpression(params) && params.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'accounting')
          if (context && ts.isPropertyAssignment(context) && ts.isObjectLiteralExpression(context.initializer)) {
            const feature = context.initializer.properties.find(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText(source) === 'feature')
            const value = feature && (ts.isPropertyAssignment(feature) ? feature.initializer : ts.isShorthandPropertyAssignment(feature) ? feature.name : null)
            if (value && ts.isStringLiteral(value)) labels.add(value.text)
            else if (value && ts.isIdentifier(value) && constants.has(value.text)) labels.add(constants.get(value.text)!)
            else if (value && ts.isPropertyAccessExpression(value) && ['lib/ai/connections-ai.ts', 'lib/ai/quality-gate.ts'].includes(path)) {
              // These two private shared seams receive only same-module feature standards/options.
              for (const [name, label] of constants) if (name.endsWith("FEATURE")) labels.add(label)
              function options(node: ts.Node) {
                if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'feature' && ts.isStringLiteral(node.initializer)) labels.add(node.initializer.text)
                ts.forEachChild(node, options)
              }
              options(source)
            } else if (value && ts.isPropertyAccessExpression(value) && path === 'lib/ai/spark.ts' && value.getText(source) === 'spec.feature') {
              // All shipped Spark specs are declared by these four modules; their executable tests
              // additionally verify each exported spec's accounting metadata reaches the wrapper.
              for (const file of ['practice-spark', 'circle-spark', 'journey-spark', 'events-ai']) {
                const declaration = readFileSync(`lib/ai/${file}.ts`, 'utf8')
                const keys = [...declaration.matchAll(/(?:const FEATURE = |feature: |eventSpark\()'([^']+)'/g)]
                expect(keys.length, `${file} lost its feature declarations`).toBeGreaterThan(0)
                for (const key of keys) labels.add(key[1])
              }
            } else failures.push(`${path}: unreviewed dynamic feature ${value?.getText(source)}`)
          }
          if (!context || !ts.isPropertyAssignment(context) || !ts.isObjectLiteralExpression(context.initializer) || !context.initializer.properties.some(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText(source) === 'feature')) failures.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  walk('app'); walk('lib')
  expect(calls).toBeGreaterThanOrEqual(46)
  expect(failures).toEqual([])
  expect(labels.size).toBeGreaterThanOrEqual(40)
  expect([...labels].filter(label => !Object.hasOwn(FEATURE_DAILY_CAP_USD, label))).toEqual([])
})
