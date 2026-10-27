import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
export const RETIRED_PRICING_COMPARISON = ['components/marketing/pricing-comparison.tsx', 'components/marketing/comparison-table.tsx', 'lib/pricing/comparison.ts']
/** @param {string} source */
export function activePricingMounted(source) {
  const ast = ts.createSourceFile('pricing.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let imported = false; let rendered = false
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@/components/frequency/site/pages/pricing/frequency-pricing') imported = true
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'FrequencyPricing') rendered = true
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return ast.parseDiagnostics.length === 0 && imported && rendered
}
if (process.argv[1]?.endsWith('/retired-pricing-comparison.mjs')) {
  for (const file of RETIRED_PRICING_COMPARISON) assert.equal(existsSync(file), false, `${file} is retired`)
  assert.ok(activePricingMounted(readFileSync('app/(marketing)/pricing/page.tsx', 'utf8')), 'Actual pricing route must retain its Frequency pricing body')
  console.log('Unused competitor-cost comparison chain is absent; actual Frequency pricing route remains mounted.')
}
