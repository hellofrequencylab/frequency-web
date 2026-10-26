import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readBacklogView } from '../lib/ledger.mjs'
const ids = ['HYG-173', 'HYG-174', 'LIVE-1306', 'LIVE-1307', 'LIVE-1308', 'SCAN-1035', 'SCAN-1036', 'SCAN-1038']
const rows = new Map(readBacklogView().doc.entries.map(row => [row.id, row]))
for (const id of ids) {
  const row = rows.get(id)
  assert.equal(row?.status, 'done', `${id}: repair must remain verified`)
  assert.equal(row.verify.kind, 'cmd')
  assert.ok(row.verify.cmd.startsWith('node '))
  assert.ok(!/\b(?:vitest|jest|playwright)\b/.test(row.verify.cmd), `${id}: nested suite runner`)
  assert.ok(existsSync(row.verify.cmd.split(/\s+/)[1]), `${id}: consequence entrypoint must exist`)
}
console.log('Eight audit repair probes retain executable consequences without nested suite runners; CI retains the comprehensive test cases.')
