import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const file = 'lib/commerce/checkout.ts'
const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
function walk(node, action) { action(node); ts.forEachChild(node, child => walk(child, action)) }
function compile(source, names, values) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...names, code)(...values)
}
const create = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createCommerceCheckout')
const settle = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'recordCommerceOrderFromSession')
assert.ok(create?.body && settle?.body)
const statements = create.body.statements
const start = statements.findIndex(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'plainQty'))
assert.ok(start >= 0, 'Retain aggregated product stock validation')
const stock = statements.slice(start, start + 3)
assert.ok(ts.isForOfStatement(stock[1]) && ts.isForOfStatement(stock[2]))
const validate = compile(`return function(lines, products) { ${stock.map(n => n.getText(ast)).join('\n')} }`, [], [])
const product = stock => ({ id: 'product', stock })
const line = (qty, variant = null) => ({ product: product(10), qty, variant })
assert.deepEqual(validate([line(1)], [product(0)]), { error: 'This item is sold out.' })
assert.deepEqual(validate([line(1), line(1)], [product(1)]), { error: 'This item is sold out.' })
assert.equal(validate([line(1), line(1)], [product(2)]), undefined)
assert.equal(validate([line(50)], [product(null)]), undefined)
assert.equal(validate([line(3, { id: 'variant' })], [product(0)]), undefined)
let charge, inventory
const downstream = []
walk(create, n => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'stripe.checkout.sessions.create') charge = n })
walk(settle, n => {
  if (!ts.isCallExpression(n)) return
  if (n.expression.getText(ast) === 'runStep') {
    if (n.arguments[0]?.text === 'inventory') inventory = n
    if (['booking', 'journey', 'receipts'].includes(n.arguments[0]?.text)) downstream.push(n)
  }
  if (n.expression.getText(ast) === 'settleSplitOrderTransfers') downstream.push(n)
})
assert.ok(charge && stock[2].end < charge.pos, 'Refuse known shortages before charging')
assert.ok(inventory && ts.isAwaitExpression(inventory.parent), 'Await inventory before fulfillment')
assert.equal(downstream.length, 4)
for (const n of downstream) assert.ok(n.pos > inventory.end, 'Stock protection precedes transfers, access and receipts')
const work = inventory.arguments[1]
assert.ok(ts.isArrowFunction(work) && work.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword))
const row = { id: 'order', buyer_profile_id: 'buyer' }
function step(error, refund) {
  return compile(`return (${work.getText(ast)})`, ['db', 'row', 'refundOversoldOrder'], [() => ({ rpc: async (name, args) => {
    assert.equal(name, 'decrement_commerce_stock_atomic'); assert.deepEqual(args, { _order: 'order' }); return { error }
  } }), row, refund])
}
let refunds = 0
const refund = async (...args) => { assert.deepEqual(args, ['order', 'buyer']); refunds++ }
await step(null, refund)()
assert.equal(refunds, 0)
await assert.rejects(step({ message: 'storage unavailable' }, refund), /stock decrement failed/)
assert.equal(refunds, 0)
await assert.rejects(step({ message: 'out_of_stock' }, refund), /oversold order cannot be fulfilled/)
assert.equal(refunds, 1)
await assert.rejects(step({ message: 'out_of_stock' }, async () => { throw Error('refund unavailable') }), /refund unavailable/)
let release, entered, settled = false
const waiting = new Promise(resolve => { release = resolve })
const began = new Promise(resolve => { entered = resolve })
const pending = step({ message: 'out_of_stock' }, async () => { entered(); await waiting })().then(() => { settled = true; return null }, error => { settled = true; return error })
await began
await Promise.resolve(); await Promise.resolve()
try { assert.equal(settled, false, 'The inventory step must await the refund attempt') } finally { release() }
assert.match((await pending)?.message ?? '', /oversold order cannot be fulfilled/)
console.log('Actual precharge stock aggregation and awaited settlement inventory fragment reject shortages before fulfillment; synthetic dependencies only')
