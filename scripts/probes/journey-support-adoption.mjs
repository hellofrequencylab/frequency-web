#!/usr/bin/env node
// LIVE-2290: optional support suggestions stay optional through participation and conversion.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
const { computeLegTargets } = await import('../../lib/journeys/leg-targets.ts')
const { toPortable, fromPortable } = await import('../../lib/journeys/portable.ts')
const phase = { id: 'phase', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Week', required: true, est_minutes: null, practice_id: null }
const practice = (id, required, settings) => ({ id, parent_id: 'phase', block_type: 'practice', sort_order: 1, title: id, required, est_minutes: null, practice_id: id, settings })
const suggested = practice('suggested', false, { support_suggestion: true })
const anchor = practice('anchor', true, { anchor: true })
const legacy = practice('legacy-optional', false, null)
assert.deepEqual(computeLegTargets([phase, anchor, suggested, legacy], null, 0).targetIds, ['anchor', 'legacy-optional'])
const promoted = { ...suggested, settings: { support_suggestion: true, anchor: true } }
assert.deepEqual(computeLegTargets([phase, promoted], null, 0).anchorIds, ['suggested'])
const plan = { title: 'A rhythm', summary: null, drip_interval_days: 7 }
const portable = toPortable(plan, [phase, suggested])
const rebuilt = fromPortable(portable).blocks.map((row) => ({ id: row.tempId, parent_id: row.parentTempId, block_type: row.blockType, sort_order: row.sortOrder, title: row.title, required: row.required, est_minutes: row.estMinutes, practice_id: row.blockType === 'practice' ? 'newly-linked' : null, settings: row.settings }))
assert.deepEqual(computeLegTargets(rebuilt, null, 0).targetIds, [])
assert.ok(!JSON.stringify(portable).includes('practice_id'))
const promotedPortable = toPortable(plan, [phase, promoted])
assert.ok(!JSON.stringify(promotedPortable).includes('supportSuggestion'))
console.log('Journey support participation: optional suggestions are not automatic commitments; legacy/anchor and portable meaning remain intact')
