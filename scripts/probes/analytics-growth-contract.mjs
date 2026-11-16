import assert from 'node:assert/strict'
import { growthSnapshotSchema, measuredRate, growthAiEvidence, campaignCsv } from '../../lib/analytics/growth.ts'
import { growthDashboardFixture } from '../../test/fixtures/growth-dashboard.ts'

const fixture = growthDashboardFixture()
assert.equal(growthSnapshotSchema.safeParse(fixture).success, true)
assert.equal(growthSnapshotSchema.safeParse({}).success, false)
assert.equal(measuredRate(0, 0), null)
assert.equal(measuredRate(0, 10), 0)
assert.equal(measuredRate(11, 10), null)
assert.equal(growthSnapshotSchema.safeParse({ ...fixture, repeatReturned: fixture.repeatEligible + 1 }).success, false)
assert.equal(typeof campaignCsv(fixture), 'string')
assert.ok(!JSON.stringify(growthAiEvidence(fixture)).includes('member@example.test'))
console.log('Growth contract passed: complete aggregates, valid denominators and bounded export/AI evidence.')
