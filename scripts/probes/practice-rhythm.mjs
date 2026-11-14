#!/usr/bin/env node
// LIVE-2289: recent practice days are descriptive, immutable and never invented from missing data.
import assert from 'node:assert/strict'
import { practiceWindow, computePracticeRhythm } from '../../lib/frequency-rhythm.ts'
const window = practiceWindow(new Date('2026-11-14T02:00:00Z'), 'America/Los_Angeles')
assert.equal(window.start, '2026-10-24')
assert.equal(window.end, '2026-11-13')
const pillars = new Map([['m', 'mind'], ['b', 'body'], ['s', 'spirit'], ['e', 'expression']])
const row = { id: 'a', logged_for: '2026-11-13', pillar_id: 'b', secondary_pillar_id: 'm', primary_pct: 75, practice: { domain_id: 'e', secondary_domain_id: null, primary_pct: 100 } }
const first = computePracticeRhythm([row, { ...row, id: 'b' }], pillars, window)
assert.deepEqual(first.days, { mind: 1, body: 1, spirit: 0, expression: 0 })
assert.equal(first.activeDays, 1)
assert.equal(first.coverage.frozenLogs, 2)
const deleted = computePracticeRhythm([{ ...row, practice: null }], pillars, window)
assert.deepEqual(deleted.days, first.days)
const zeroSecondary = computePracticeRhythm([{ ...row, primary_pct: 100 }], pillars, window)
assert.equal(zeroSecondary.days.mind, 0)
const outside = computePracticeRhythm([{ ...row, logged_for: '2026-11-14' }, { ...row, id: 'old', logged_for: '2026-10-23' }], pillars, window)
assert.equal(outside.activeDays, 0)
assert.equal(outside.state, 'empty')
const estimated = computePracticeRhythm([{ ...row, pillar_id: null }], pillars, window)
assert.equal(estimated.coverage.estimatedLogs, 1)
assert.equal(estimated.days.expression, 1)
assert.equal(estimated.days.spirit, 0)
const partial = computePracticeRhythm([row], pillars, window, false)
assert.equal(partial.state, 'partial')
assert.equal(partial.complete, false)
console.log('practice rhythm: frozen overlapping days, exact local window, explicit partial data and no invented supports pass')
