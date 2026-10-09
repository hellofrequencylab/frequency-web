import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PILOT, buildReadiness, inspectSchemaContracts, validateObservation } from './space-email-readiness.mjs'
const observation = { observedAt: '2026-10-08T12:00:00Z', provenance: 'controlled-fixture', spaceId: PILOT.spaceId, active: true, emailEnabled: true, contacts: 520, consentCounts: { subscribed: 0, unsubscribed: 0, unknown: 520 } }
const root = process.cwd()
const now = new Date('2026-10-08T13:00:00Z')
test('520 unknown contacts cannot become eligible marketing recipients', () => {
  const report = buildReadiness({ root, observation, now })
  assert.equal(report.marketingAudience.consentExcluded, 520)
  assert.equal(report.marketingAudience.consentGrantedUpperBound, 0)
  assert.equal(report.marketingAudience.eligibleRecipients, null)
  assert.equal(report.observation.freshQueryPerformed, false)
  assert.deepEqual(report.safety, { sendsPerformed: 0, databaseWritesPerformed: 0, consentChangesPerformed: 0, dnsChangesPerformed: 0 })
})
test('configuration presence never proves provider or mailbox verification and cannot expose keys', () => {
  const report = buildReadiness({ root, now, environment: { RESEND_API_KEY: 'SECRET-FIXTURE', EMAIL_FROM: 'private@example.org' } })
  assert.equal(report.provider.configurationPresence.RESEND_API_KEY, true)
  assert.equal(report.provider.domainVerification, 'not-observed')
  assert.equal(report.liveEvidence.deliveredTest, 'not-observed')
  assert.ok(!JSON.stringify(report).includes('SECRET-FIXTURE'))
  assert.ok(!JSON.stringify(report).includes('private@example.org'))
})
test('granted contacts remain only an upper bound until other policy checks run', () => {
  const report = buildReadiness({ root, now, observation: { ...observation, contacts: 10, consentCounts: { subscribed: 7, unsubscribed: 1, unknown: 2 } } })
  assert.equal(report.marketingAudience.consentExcluded, 3)
  assert.equal(report.marketingAudience.consentGrantedUpperBound, 7)
  assert.equal(report.marketingAudience.eligibleRecipients, null)
})
test('rejects observations with recipient-level data', () => {
  assert.throws(() => validateObservation({ ...observation, emails: ['private@example.org'] }), /only aggregate/)
  assert.throws(() => validateObservation({ ...observation, consentCounts: { ...observation.consentCounts, addresses: [] } }), /only aggregate/)
})
test('rejects wrong tenant, nonreconciling counts and unknown provenance', () => {
  assert.throws(() => validateObservation({ ...observation, spaceId: 'other-space' }), /pilot/)
  assert.throws(() => validateObservation({ ...observation, contacts: 521 }), /reconcile/)
  assert.throws(() => validateObservation({ ...observation, provenance: 'assumed' }), /provenance/)
})
test('rejects malformed and future observations', () => {
  assert.throws(() => validateObservation({ ...observation, observedAt: 'yesterday' }), /ISO/)
  assert.throws(() => buildReadiness({ root, now, observation: { ...observation, observedAt: '2026-10-09T12:00:00Z' } }), /future/)
  assert.throws(() => validateObservation({ ...observation, consentCounts: { subscribed: -1, unsubscribed: 1, unknown: 520 } }), /nonnegative/)
})
test('checks actual generated row columns, not unrelated occurrences', () => {
  const schema = readFileSync(path.join(root, 'lib/database.types.ts'), 'utf8')
  assert.ok(inspectSchemaContracts(schema).every(c => c.state === 'present'))
  const mutated = schema.replace(/(contacts: \{\s*Row: \{[\s\S]*?)consent_state: string/, '$1not_consent: string')
  assert.deepEqual(inspectSchemaContracts(mutated).find(c => c.table === 'contacts').missing, ['consent_state'])
})
test('default CLI records unknown observations and live-schema limitations', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/space-email-readiness.mjs', '--json'], { cwd: root, encoding: 'utf8' }))
  assert.equal(report.observation, null)
  assert.equal(report.schema.liveVerified, false)
  assert.match(report.source.commit, /^[a-f0-9]{40}$/)
})
test('CLI exits nonzero for broken local source rather than claiming ready', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'email-readiness-'))
  try {
    mkdirSync(path.join(tmp, 'lib'))
    writeFileSync(path.join(tmp, 'lib/database.types.ts'), '')
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/space-email-readiness.mjs'), '--json'], { cwd: tmp, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.ok(JSON.parse(result.stdout).schema.checks.every(c => c.state === 'missing'))
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
test('CLI refuses invalid evidence and unknown flags', () => {
  const result = spawnSync(process.execPath, ['scripts/space-email-readiness.mjs', '--send'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /refused/)
})

test('prior date-only aggregate retains honest precision', () => {
  const report = buildReadiness({ root, now, observation: { ...observation, observedAt: '2026-10-08', provenance: 'read-only-aggregate' } })
  assert.equal(report.observation.precision, 'date')
  assert.equal(report.observation.freshQueryPerformed, false)
  assert.equal(report.marketingAudience.consentExcluded, 520)
})
