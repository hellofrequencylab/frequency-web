import path from 'node:path'
import ts from 'typescript'

export const RETIRED_MEMBER_SHELL = 'components/layout/app-shell.tsx'
/** Inspect real import/re-export/dynamic-import edges, never comments or historical prose.
 * @param {string} file
 * @param {string} source
 * @param {string[]} [retired]
 * @returns {Array<{file:string,line:number,specifier:string}>}
 */
export function retiredModuleEdges(file, source, retired = [RETIRED_MEMBER_SHELL]) {
  // Inspect each possible literal start independently: a regex, JSX token or template
  // elsewhere cannot make the scanner skip a later module specifier. Decoding with
  // TypeScript preserves escaped/unicode paths. Candidates still use the full AST.
  const basenames = retired.map(file => path.posix.basename(file).replace(/\.(tsx?|jsx?)$/, ''))
  // Without an escape, a decoded target basename must also exist verbatim.
  if (!source.includes('\\') && !basenames.some(name => source.includes(name))) return []
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source)
  let candidate = false
  for (const quote of source.matchAll(/['"`]/g)) {
    const end = source.indexOf(quote[0], quote.index + 1)
    const raw = source.slice(quote.index, end < 0 ? undefined : end + 1)
    if (!raw.includes('\\') && !basenames.some(name => raw.includes(name))) continue
    scanner.setTextPos(quote.index)
    const token = scanner.scan()
    if (token !== ts.SyntaxKind.StringLiteral && token !== ts.SyntaxKind.NoSubstitutionTemplateLiteral) continue
    const value = scanner.getTokenValue()
    if (basenames.some(name => value.includes(name))) { candidate = true; break }
  }
  if (!candidate) return []
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
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
      if (retired.some(file => target.replace(/\.(tsx?|jsx?)$/, '') === file.replace(/\.(tsx?|jsx?)$/, ''))) edges.push({ file, line: ast.getLineAndCharacterOfPosition(spec.getStart(ast)).line + 1, specifier: value })
    }
    ts.forEachChild(node, inspect)
  }
  inspect(ast)
  return edges
}

/** @param {string} file @param {string} source */
export function retiredShellEdges(file, source) { return retiredModuleEdges(file, source) }
