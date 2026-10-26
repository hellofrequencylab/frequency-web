import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadProbeModule } from '../lib/probe-module.mjs'

const roles = loadProbeModule('lib/core/roles.ts')
const matrix = loadProbeModule('lib/core/access-matrix.ts', { './roles': roles })
const entitlement = loadProbeModule('lib/core/entitlement.ts', { './access-matrix': matrix })
const plans = loadProbeModule('lib/pricing/plans.ts')
const keys = loadProbeModule('lib/billing/pricing-keys.ts', { '@/lib/core/entitlement': entitlement, '@/lib/pricing/plans': plans })
assert.equal(keys.asCatalogItemKey('operator_seat'), null, 'The retired placeholder must never be offered again')
assert.equal(keys.CATALOG_ITEM_KEYS.includes('operator_seat'), false)
assert.equal(keys.catalogItems().some(item => item.key === 'operator_seat'), false)
assert.equal(keys.allCatalogPriceKeys().some(key => key.startsWith('operator_seat_')), false)
for (const key of ['operator_seat_month', 'operator_seat_year', 'operator_seat_month_list', 'operator_seat_year_list']) assert.ok(keys.RETIRED_CATALOG_KEYS.includes(key), 'Preserve historical price references')
const file = 'app/(main)/admin/pricing/actions.ts'
const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
assert.equal(ast.statements.some(n => ts.isFunctionDeclaration(n) && n.name?.text === 'setOperatorSeatActive'), false, 'Do not restore the retired activation action')
const sync = readFileSync('lib/billing/pricing-products.ts', 'utf8')
const tree = ts.createSourceFile('sync.ts', sync, ts.ScriptTarget.Latest, true)
let activeLoop = false
function walk(node) {
  if (ts.isForOfStatement(node) && node.expression.getText(tree) === 'catalogItems()') activeLoop = true
  ts.forEachChild(node, walk)
}
walk(tree)
assert.ok(activeLoop, 'Catalog sync must walk the guarded active list')
console.log('Actual catalog excludes retired operator seats, preserves all four historical keys, and has no activation action; no provider calls')
