import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'
import { FEATURE_DAILY_CAP_USD } from './budget'

/** Resolve only the real typed coaching builder, with statically known accounting inputs.
 * A similarly named local function or an opaque feature/tier cannot satisfy this inventory. */
function coachingFactoryFeatures(path: string, text: string): string[] {
  if (!text.includes('writingCoachingSpec') && !text.includes('\\u')) return []
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const imports = new Set<string>()
  const constants = new Map<string, string>()
  function stringValue(node: ts.Node | undefined): string | undefined {
    if (!node) return undefined
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isAsExpression(node) && node.type.getText(source) === 'const') return stringValue(node.expression)
    return undefined
  }
  function bindings(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === './writing-coaching') {
      const named = node.importClause?.namedBindings
      if (named && ts.isNamedImports(named)) for (const item of named.elements) {
        if ((item.propertyName ?? item.name).text === 'writingCoachingSpec') imports.add(item.name.text)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) && ts.isIdentifier(node.name)) {
      const value = stringValue(node.initializer)
      if (value !== undefined) constants.set(node.name.text, value)
    }
    ts.forEachChild(node, bindings)
  }
  bindings(source)
  const literal = (node: ts.Node | undefined) => stringValue(node) ?? (node && ts.isIdentifier(node) ? constants.get(node.text) : undefined)
  const features: string[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 'writingCoachingSpec' || imports.has(node.expression.text))) {
      if (!imports.has(node.expression.text)) throw new Error(`${path}: untrusted coaching factory`)
      const entity = literal(node.arguments[0]), feature = literal(node.arguments[1]), tier = literal(node.arguments[2])
      if (!entity || !['practice', 'journey'].includes(entity) || !feature || !tier || !['haiku', 'sonnet', 'opus'].includes(tier)) throw new Error(`${path}: opaque coaching accounting inputs`)
      features.push(feature)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return features
}

test('typed coaching inventory resolves trusted aliases/constants and refuses opaque or spoofed factories', () => {
  const imported = "import { writingCoachingSpec as coach } from './writing-coaching'; const FEATURE = 'practice-edit'; const TIER = 'opus' as const;"
  expect(coachingFactoryFeatures('fixture.ts', imported + "coach('practice', FEATURE, TIER)")).toEqual(['practice-edit'])
  expect(() => coachingFactoryFeatures('fixture.ts', imported + "coach('practice', input.feature, TIER)")).toThrow('opaque coaching accounting inputs')
  expect(() => coachingFactoryFeatures('fixture.ts', imported + "coach('practice', FEATURE, input.tier)")).toThrow('opaque coaching accounting inputs')
  expect(() => coachingFactoryFeatures('fixture.ts', imported.replace('const FEATURE', 'let FEATURE') + "coach('practice', FEATURE, TIER)")).toThrow('opaque coaching accounting inputs')
  expect(() => coachingFactoryFeatures('fixture.ts', imported.replace('as const', 'as unknown') + "coach('practice', FEATURE, TIER)")).toThrow('opaque coaching accounting inputs')
  expect(() => coachingFactoryFeatures('fixture.ts', "writingCoachingSpec('practice', 'practice-edit', 'opus')")).toThrow('untrusted coaching factory')
})

// Inventory the actual production syntax, including multiline and nested calls.
// The wrapper behavior tests separately prove admission and durable settlement.
test('every shipped paid completion caller supplies central attribution', () => {
  const failures: string[] = []
  let calls = 0
  let typedCoachingCallers = 0
  const labels = new Set<string>()
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      if (!/\.tsx?$/.test(path) || /\.(test|spec)\.tsx?$/.test(path) || path === 'lib/ai/complete.ts') continue
      const text = readFileSync(path, 'utf8')
      const coachingFeatures = coachingFactoryFeatures(path, text)
      typedCoachingCallers += coachingFeatures.length
      for (const feature of coachingFeatures) labels.add(feature)
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
              // Core wizard specs may use a literal declaration or the trusted typed builder.
              // Executable specs separately prove their metadata reaches central accounting.
              for (const file of ['practice-spark', 'circle-spark', 'journey-spark', 'events-ai']) {
                const declaration = readFileSync(`lib/ai/${file}.ts`, 'utf8')
                const keys = [...declaration.matchAll(/(?:const FEATURE = |feature: |eventSpark\()'([^']+)'/g)]
                const typed = coachingFactoryFeatures(`lib/ai/${file}.ts`, declaration)
                expect(keys.length + typed.length, `${file} lost its feature declarations`).toBeGreaterThan(0)
                for (const key of keys) labels.add(key[1])
                for (const feature of typed) labels.add(feature)
              }
            } else if (value && ts.isPropertyAccessExpression(value) && path === 'lib/ai/writing-coach.ts' && value.getText(source) === 'input.feature') {
              // Resolve every caller of this shared seam: no opaque or unknown feature is accepted.
              let delegated = 0
              function inventory(dir: string) {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                  const callerPath = join(dir, entry.name)
                  if (entry.isDirectory()) { inventory(callerPath); continue }
                  if (!/\.tsx?$/.test(callerPath) || /\.(test|spec)\.tsx?$/.test(callerPath)) continue
                  const callerText = readFileSync(callerPath, 'utf8')
                  if (!callerText.includes('writingCoach')) continue
                  const caller = ts.createSourceFile(callerPath, callerText, ts.ScriptTarget.Latest, true)
                  function inspect(node: ts.Node) {
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'writingCoach') {
                      delegated++
                      const options = node.arguments[0]
                      const label = options && ts.isObjectLiteralExpression(options) && options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(caller) === 'feature')
                      if (label && ts.isPropertyAssignment(label) && ts.isStringLiteral(label.initializer)) labels.add(label.initializer.text)
                      else failures.push(`${callerPath}: unreviewed coaching feature`)
                    }
                    ts.forEachChild(node, inspect)
                  }
                  inspect(caller)
                }
              }
              inventory('app'); inventory('lib')
              expect(delegated).toBeGreaterThanOrEqual(4)
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
  // A typed coaching caller is still an attributed paid path even when multiple paths share
  // one physical completion in Spark. Count only the trusted factory calls resolved above;
  // converting a generator into that seam must not make an accounted path disappear.
  expect(calls).toBeGreaterThan(0)
  expect(typedCoachingCallers).toBeGreaterThan(0)
  expect(calls + typedCoachingCallers).toBeGreaterThanOrEqual(46)
  expect(failures).toEqual([])
  expect(labels.size).toBeGreaterThanOrEqual(40)
  expect([...labels].filter(label => !Object.hasOwn(FEATURE_DAILY_CAP_USD, label))).toEqual([])
})
