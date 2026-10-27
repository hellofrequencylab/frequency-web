import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it } from 'vitest'

function duplicateImports(source: string) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set<string>(), duplicates: string[] = []
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const clause = statement.importClause
    const local = clause.namedBindings
    const bindings = [...(clause.name ? [clause.name.text] : []), ...(local ? ts.isNamedImports(local) ? local.elements.map(e => e.name.text) : [local.name.text] : [])]
    for (const name of bindings) { if (names.has(name)) duplicates.push(name); names.add(name) }
  }
  return duplicates
}
it('detects duplicate local bindings while allowing distinct imports and aliases', () => {
  expect(duplicateImports("import { buttonClasses } from './button'; import { buttonClasses } from './button'" )).toEqual(['buttonClasses'])
  expect(duplicateImports("import { A as B } from './one'; import B from './two'" )).toEqual(['B'])
  expect(duplicateImports("import { A } from './one'; import { B } from './one'" )).toEqual([])
})
it('keeps actual application imports free of duplicate local bindings after concurrent merges', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(f => /^(app|components|lib)\//.test(f) && /\.tsx?$/.test(f))
  expect(files.length).toBeGreaterThan(1000)
  const problems = files.flatMap(file => duplicateImports(readFileSync(file, 'utf8')).map(name => `${file}: ${name}`))
  expect(problems).toEqual([])
})
