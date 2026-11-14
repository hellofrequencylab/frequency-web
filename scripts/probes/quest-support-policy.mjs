#!/usr/bin/env node
// LIVE-2291: prospective participation keeps earned identity and uses recorded support evidence.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
const { isJourneyFinished } = await import('../../lib/quest/completion.ts')
const MIND = '10000000-0000-4000-8000-000000000001'
const BODY = '10000000-0000-4000-8000-000000000002'
const policy = { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
  windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }
assert.equal(isJourneyFinished(14, true, false), false, 'Existing three-argument qualification keeps its published Expression requirement')
assert.equal(isJourneyFinished(14, true, false, policy), true, 'A recorded prospective policy lets a member finish without compulsory Expression')
assert.equal(isJourneyFinished(13, true, false, policy), false, 'Optional Expression does not invent practice days')
const { countRecordedSupportDays, parseCompletionPolicy } = await import('../../lib/quest/support-policy.ts')
assert.ok(parseCompletionPolicy(policy))
assert.equal(parseCompletionPolicy({ ...policy, expressionRequired: true }), null)
const logs = [
  { logged_for: '2026-11-03', pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 75 },
  { logged_for: '2026-11-03', support_evidence_version: 1, support_pillar_ids: [MIND, BODY] },
  { logged_for: '2026-11-04', practice: { domain_id: MIND } },
  { logged_for: '2026-11-05', pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 100 },
  { logged_for: '2026-11-29', support_evidence_version: 1, support_pillar_ids: [MIND] },
]
assert.equal(countRecordedSupportDays(logs, policy, '2026-11-28').distinctDays, 1,
  'Frozen positive secondary and multi-support evidence count a date once; current categories, zero shares and out-of-window acts cannot add days')
console.log('Prospective Quest policy preserves legacy qualification and counts immutable support days without extra rewards')
