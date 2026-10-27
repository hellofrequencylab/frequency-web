import ts from 'typescript'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Detect executable platform-design branches rather than comments, display labels or
// the shared anonymous-feed access predicate. This checks route source, not rendered styling.
/** @param {string} source @returns {Array<{file: string, line: number, expression: string}>} */
export function memberDesignBranches(source, file = 'route.tsx') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  if (tree.parseDiagnostics.length) return tree.parseDiagnostics.map(error => ({ file, line: tree.getLineAndCharacterOfPosition(error.start ?? 0).line + 1, expression: `Parse error: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}` }))
  const designNames = new Set()
  const anonPredicates = new Set()
  function visit(node, fn) { fn(node); ts.forEachChild(node, child => visit(child, fn)) }
  visit(tree, node => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return
    const bindings = node.importClause?.namedBindings
    if (node.moduleSpecifier.text === '@/lib/theme/design' && !node.importClause?.isTypeOnly) {
      if (node.importClause?.name) designNames.add(node.importClause.name.text)
      if (bindings && ts.isNamespaceImport(bindings)) designNames.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (!binding.isTypeOnly) designNames.add(binding.name.text)
      }
    }
    if (node.moduleSpecifier.text === '@/lib/nav/anon-feed' && bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) if ((binding.propertyName ?? binding.name).text === 'isAnonShellFeed') anonPredicates.add(binding.name.text)
    }
  })
  visit(tree, node => {
    if (ts.isBindingElement(node) && (node.propertyName ?? node.name).getText(tree) === 'NEXT_PUBLIC_SITE_DESIGN' && ts.isIdentifier(node.name)) designNames.add(node.name.text)
  })
  function depends(node) {
    if (!node) return false
    // This shared predicate protects exactly the anonymous Feed route, not a visual variant.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && anonPredicates.has(node.expression.text)) return false
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments.some(arg => ts.isStringLiteral(arg) && arg.text === '@/lib/theme/design')) return true
    if (ts.isIdentifier(node) && designNames.has(node.text)) return true
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'NEXT_PUBLIC_SITE_DESIGN') return true
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'NEXT_PUBLIC_SITE_DESIGN') return true
    let found = false
    ts.forEachChild(node, child => { if (depends(child)) found = true })
    return found
  }
  // Follow aliases such as const isFrequency = SITE_DESIGN === 'frequency'.
  let changed = true
  while (changed) {
    changed = false
    visit(tree, node => {
      const derived = ts.isVariableDeclaration(node) ? node.initializer : ts.isFunctionDeclaration(node) ? node.body : undefined
      if (node.name && ts.isIdentifier(node.name) && !designNames.has(node.name.text) && derived && depends(derived)) {
        designNames.add(node.name.text); changed = true
      }
    })
  }
  const failures = []
  visit(tree, node => {
    let condition
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) condition = node.expression ?? node.condition
    if (ts.isSwitchStatement(node)) condition = node.expression
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) condition = node.left
    if (condition && depends(condition)) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree))
      failures.push({ file, line: line + 1, expression: condition.getText(tree) })
    }
  })
  return failures
}

/** @returns {{scanned: number, failures: Array<{file: string, line: number, expression: string}>}} */
export function memberDesignBranchReport(root = 'app/(main)') {
  const failures = []
  let scanned = 0
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(path) && !/\.(test|spec)\./.test(path)) {
        const source = readFileSync(path, 'utf8'); scanned++
        if (/lib\/theme\/design|NEXT_PUBLIC_SITE_DESIGN/.test(source)) failures.push(...memberDesignBranches(source, path))
      }
    }
  }
  walk(root)
  return { scanned, failures }
}
