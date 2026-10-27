import path from 'node:path'
import ts from 'typescript'

export const RETIRED_MEMBER_SHELL = 'components/layout/app-shell.tsx'
/** Inspect real import/re-export/dynamic-import edges, never comments or historical prose.
 * @param {string} file
 * @param {string} source
 * @returns {Array<{file:string,line:number,specifier:string}>}
 */
export function retiredShellEdges(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) throw new Error(`Cannot parse ${file}`)
  /** @type {Array<{file:string,line:number,specifier:string}>} */
  const edges = []
  /** @param {import('typescript').Node} node */
  function inspect(node) {
    let spec
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) spec = node.moduleSpecifier
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) spec = node.arguments[0]
    if (spec && ts.isStringLiteralLike(spec)) {
      const value = spec.text
      const target = value.startsWith('@/') ? value.slice(2) : value.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), value)) : ''
      if (target.replace(/\.(tsx?|jsx?)$/, '') === RETIRED_MEMBER_SHELL.replace(/\.tsx$/, '')) edges.push({ file, line: ast.getLineAndCharacterOfPosition(spec.getStart(ast)).line + 1, specifier: value })
    }
    ts.forEachChild(node, inspect)
  }
  inspect(ast)
  return edges
}
