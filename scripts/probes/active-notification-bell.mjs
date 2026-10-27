import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
/** @param {string} source */
export function bellReadOrdering(source) {
  const ast = /** @type {import('typescript').SourceFile & {parseDiagnostics?: readonly import('typescript').Diagnostic[]}} */ (ts.createSourceFile('bell.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  /** @type {import('typescript').Node | undefined} */
  let load
  /** @param {import('typescript').Node} node */
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'load' && node.initializer && ts.isCallExpression(node.initializer)) load = node.initializer.arguments[0]
    ts.forEachChild(node, find)
  }
  find(ast)
  if (!load || ast.parseDiagnostics?.length) return false
  /** @type {string[]} */
  const calls = []
  let failedReadReturns = false; let caught = false
  /** @param {import('typescript').Node} node */
  function inspect(node) {
    if (ts.isCallExpression(node) && ['getMyNotifications', 'markAllRead', 'setBellUnread'].includes(node.expression.getText(ast))) calls.push(node.expression.getText(ast))
    if (ts.isIfStatement(node) && node.expression.getText(ast) === "res.kind === 'error'") failedReadReturns = node.thenStatement.getText(ast).includes('return')
    if (ts.isCatchClause(node)) caught = true
    ts.forEachChild(node, inspect)
  }
  inspect(load)
  return calls.indexOf('getMyNotifications') === 0 && calls.indexOf('markAllRead') > 0 && calls.indexOf('setBellUnread') > calls.indexOf('markAllRead') && failedReadReturns && caught
}
if (invokedDirectly(import.meta.url)) {
  /** @param {string} file */
  const read = file => readFileSync(file, 'utf8')
  assert.ok(bellReadOrdering(read('components/frequency/members/shell/bell.tsx')), 'Bell must load before marking, preserve failed reads and handle transport errors')
  const actions = read('app/(main)/notifications/actions.ts')
  assert.ok(actions.includes("revalidatePath('/notifications')"))
  assert.ok(!/revalidatePath\(\s*['"]\/['"]\s*,\s*['"]layout['"]/.test(actions), 'Do not refetch the whole app on bell read')
  assert.match(read('lib/feed/load-feed.ts'), /export function readFeedRpc/)
  assert.match(read('lib/notifications-map.ts'), /UNREAD_COUNT_UNAVAILABLE/)
  console.log('Active bell preserves unavailable/error states and load-before-read ordering; feed/count discriminated loaders remain.')
}
