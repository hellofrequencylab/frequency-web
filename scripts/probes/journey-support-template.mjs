#!/usr/bin/env node
// LIVE-2290: new Journey shapes offer one anchor and optional overlapping supports.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { personalJourneyRows, masterWeekRows, masterOnboardingRows, masterCloseRows } = await import('../../lib/journeys/support-template.ts')
const ids = { mind: 'm', body: 'b', spirit: 's', expression: 'e' }
const personal = personalJourneyRows(ids)
const practices = personal.filter((row) => row.block_type === 'practice')
assert.equal(practices.filter((row) => row.settings?.anchor === true).length, 1)
assert.equal(practices.find((row) => row.settings?.anchor === true).domain_id, null)
assert.equal(practices.filter((row) => row.required === true).length, 1)
assert.deepEqual(practices.filter((row) => row.settings?.anchor !== true).map((row) => [row.domain_id, row.required]), [['m', false], ['b', false], ['s', false]])
for (const rows of [personal, masterWeekRows(ids), masterCloseRows(ids)]) {
  const expression = rows.find((row) => row.domain_id === ids.expression)
  assert.ok(expression)
  assert.equal(expression.required, false)
  assert.match(expression.body, /private/i)
}
assert.equal(personal.find((row) => row.settings?.extra_credit)?.settings.bonus_zaps, 25)
assert.equal(masterWeekRows(ids).find((row) => row.settings?.extra_credit)?.settings.bonus_zaps, 10)
assert.equal(masterCloseRows(ids).find((row) => row.settings?.extra_credit)?.settings.bonus_zaps, 25)
assert.equal(masterOnboardingRows(ids).filter((row) => row.settings?.anchor === true).length, 1)
const editor = readFileSync('app/(main)/journeys/[slug]/edit/actions.ts', 'utf8')
assert.match(editor, /personalJourneyRows\(pillarIds\)/)
assert.ok(!editor.includes('...PILLAR_SLOTS.map('))
const builder = readFileSync('components/journey/v2/journey-builder.tsx', 'utf8')
assert.ok(!builder.includes('Vera fills a balanced four-Pillar week'))
console.log('Journey support template: one anchor, optional supports/private expression, preserved bonus amounts and actual entry wiring pass')
