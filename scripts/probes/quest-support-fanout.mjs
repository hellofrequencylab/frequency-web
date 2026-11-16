#!/usr/bin/env node
// LIVE-2291: a recorded V2 enrollment is considered independently of today's primary category.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readRecordedCompletionPlanIds } from '../../lib/quest/support-completion-candidates.ts'

const mind = '11111111-1111-4111-8111-111111111111'
const plan = '22222222-2222-4222-8222-222222222222'
const policy = { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
  windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [mind] }
const rows = [{ id: 'a', plan_id: plan, completion_policy: policy }, { id: 'b', plan_id: plan, completion_policy: policy }]
const calls = []
const client = { from(table) {
  assert.equal(table, 'journey_enrollments')
  let cursor = ''
  const query = {
    select: () => query,
    eq(field, value) { calls.push([field, value]); return query },
    not(field, operator, value) { assert.deepEqual([field, operator, value], ['completion_policy', 'is', null]); return query },
    order(field) { assert.equal(field, 'id'); return query }, limit: () => query,
    gt(field, value) { assert.equal(field, 'id'); cursor = value; return query },
    then(resolve) { return Promise.resolve({ data: rows.filter((row) => row.id > cursor).slice(0, 1), error: null }).then(resolve) },
  }
  return query
} }
assert.deepEqual(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14'), { available: true, planIds: [plan] })
assert.equal(calls.length, 3, 'A capped short page is not proof of the end; finish only on an empty page')
assert.ok(calls.every(([field, value]) => field === 'profile_id' && value === 'owner'))
assert.deepEqual(await readRecordedCompletionPlanIds(client, 'owner', '2026-12-01'), { available: true, planIds: [] })

const source = readFileSync('lib/practices.ts', 'utf8')
assert.ok(source.includes('readRecordedCompletionPlanIds(db(), profileId, day)'), 'The actual logger must use its resolved log day and recorded policy candidates')
assert.ok(source.includes('checkedJourneyIds.has(planId)'), 'Legacy and recorded candidates must be deduplicated before the same completion evaluator')
assert.ok(source.includes("log.warn('practice.recorded_support_completion_unavailable'"), 'A fail-safe must report that it fired without private payloads')
console.log('recorded Quest fan-out: owner scope, policy window, provider cap, plan dedup and actual logger wiring pass')
