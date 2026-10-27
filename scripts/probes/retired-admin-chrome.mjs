import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

for (const file of ['components/admin/admin-auto-back-link.tsx', 'components/admin/admin-sub-nav.tsx']) assert.equal(existsSync(file), false, `${file} is retired`)
const file = 'app/(main)/admin/layout.tsx'
const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
assert.equal(ast.parseDiagnostics.length, 0)
assert.ok(ast.statements.some(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@/components/frequency/admin/admin-console'), 'Actual admin entry must retain Frequency console')
console.log('Retired internal admin chrome is absent; actual admin route retains the Frequency console.')
