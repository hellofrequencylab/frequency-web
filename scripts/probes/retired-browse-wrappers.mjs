import { invokedDirectly } from '../lib/invoked-directly.mjs'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { RETIRED_BROWSE_WRAPPERS, BROWSE_REPLACEMENTS } from '../lib/retired-browse-wrappers.mjs'
/** @param {string} source @param {string} symbol @param {string} [file] */
export function replacementMounted(source, symbol, file = 'route.tsx') {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  if (ast.parseDiagnostics.length) return false
  let imported = false; let rendered = false
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) imported ||= node.importClause.namedBindings.elements.some(item => item.name.text === symbol && !item.isTypeOnly)
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === symbol) rendered = true
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return imported && rendered
}
/** @param {string} source */
export function withheldPriceForwarded(source) {
  const ast = ts.createSourceFile('card.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let direct = false; let conditional = false
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'price' && node.initializer && ts.isElementAccessExpression(node.initializer)) direct ||= node.initializer.expression.getText(ast) === 'priceLabels' && node.initializer.argumentExpression.getText(ast) === 'e.id'
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) conditional ||= node.expression.left.getText(ast) === 'price' && node.expression.right.getText(ast).includes('ev-price')
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return ast.parseDiagnostics.length === 0 && direct && conditional
}
if (invokedDirectly(import.meta.url)) {
  assert.ok(withheldPriceForwarded(readFileSync('components/frequency/members/events/event-card.tsx', 'utf8')), 'Active Frequency card must forward and conditionally render withheld prices')
  for (const file of RETIRED_BROWSE_WRAPPERS) assert.equal(existsSync(file), false, `${file} is retired`)
  for (const { route, symbol } of BROWSE_REPLACEMENTS) assert.ok(replacementMounted(readFileSync(route, 'utf8'), symbol, route), `${route} must import and render ${symbol}`)
  console.log('Retired internal browse wrappers are absent; actual routes import and render their Frequency replacements.')
}
