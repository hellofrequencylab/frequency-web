// Registration capability probe only. Synthetic staging facts below are NOT actual CI evidence,
// readiness, permission to merge, or permission to apply production SQL.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { evaluateReadiness } from '../migration-pr-readiness.mjs'
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const document = JSON.parse(readFileSync('scripts/migration-readiness-policy.json', 'utf8'))
assert.equal(document.version, 1)
const matches = document.registrations.filter(entry => entry.pullRequest === 4982)
assert.equal(matches.length, 1, 'Exactly one main-side reviewed Quest support registration is required')
const registration = matches[0]
const file = 'supabase/migrations/20270346050500_quest_support_policy.sql'
const sqlHash = 'ec30f6f342bbd51ed693e15b16c7b2da79b4eded6f59a8ec03d7e2c249efe491'
const apiStep = 'Real local service, anon and authenticated Quest support API acceptance'
const analyticsStep = 'Real local service, anon and authenticated analytics experiment API acceptance'
const requiredSteps = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', analyticsStep, apiStep, 'Always destroy dispatched staging containers and volumes']
assert.deepEqual(registration.migrations, [{ file, sha256: sqlHash }])
assert.equal(registration.reviewedChanges.length, 28)
assert.equal(hash(registration.reviewedChanges), '3c16f9ac699913424480132ffc398a41e6b02b2bcd53a246a7f229dbc34118ed', 'The complete reviewed source, harness, tests and file modes must remain frozen')
assert.equal(registration.workflowPath, '.github/workflows/db-tests.yml')
assert.equal(registration.workflowSha256, '4e99ec7b957aa27b26e79941ed0d7f39a614bb7b7cb397b362b070900053fb03')
assert.equal(registration.expiresAt, '2026-11-21T23:59:59Z')
assert.equal(registration.apiAcceptanceStep, apiStep)
assert.deepEqual(registration.requiredSteps, requiredSteps)

// Exercise the real decision kernel using the actual registered source inventory and explicit
// synthetic identities/staging success. The collector must independently obtain real facts.
const baseRows = Array.from({ length: 400 }, (_, i) => ({ version: String(20240101000000 + i), name: `existing_${i}`, sha256: 'a'.repeat(64) }))
// Explicit synthetic future base: analytics50000 already applied and merged.
baseRows.push({ version: '20270346050000', name: 'analytics_experiments', sha256: 'ebefee10a1e936f2e7516ecd6a70fb1242ce0638bedf517522ecbdfb6cb894bb' })
const added = { version: '20270346050500', name: 'quest_support_policy', sha256: sqlHash }
const facts = {
  event: 'pull_request', repository: 'hellofrequencylab/frequency-web', sameRepository: true, baseBranch: 'main',
  baseSha: 'synthetic-base', currentBase: 'synthetic-base', headSha: 'synthetic-head', currentHead: 'synthetic-head',
  baseRows, headRows: [...baseRows, added], liveRows: baseRows.map(({ version, name }) => ({ version, name })),
  migrationChanges: registration.reviewedChanges.filter(change => change.file === file), reviewedChanges: registration.reviewedChanges,
  staging: { id: 1, repository: 'hellofrequencylab/frequency-web', app: 'github-actions', event: 'workflow_dispatch', headSha: 'synthetic-head', workflowPath: registration.workflowPath, status: 'completed', conclusion: 'success', steps: requiredSteps.map(name => ({ name, conclusion: 'success' })) },
}
const policy = { trustedMainSnapshot: true, baseSha: facts.baseSha, registrations: registration.migrations, reviewedChanges: registration.reviewedChanges, requiredSteps: registration.requiredSteps }
assert.deepEqual(evaluateReadiness(facts, policy), { ok: true, status: 'registered_pending_apply', pending: ['20270346050500'], mainRemainsStrict: true })
for (const required of requiredSteps) {
  const missing = structuredClone(facts)
  missing.staging.steps = missing.staging.steps.filter(step => step.name !== required)
  assert.equal(evaluateReadiness(missing, policy).ok, false, `Missing ${required} cannot inherit approval`)
}
const changedMode = structuredClone(facts)
changedMode.reviewedChanges[0].headMode = '100755'
assert.equal(evaluateReadiness(changedMode, policy).ok, false)
const extraFile = structuredClone(facts)
extraFile.reviewedChanges.push({ ...extraFile.reviewedChanges[0], file: 'unexpected-source.mjs' })
assert.equal(evaluateReadiness(extraFile, policy).ok, false)
const missingAnalytics = structuredClone(facts)
missingAnalytics.liveRows = missingAnalytics.liveRows.filter(row => row.version !== '20270346050000')
assert.equal(evaluateReadiness(missingAnalytics, policy).ok, false)
const noApi = structuredClone(facts)
noApi.staging.steps = noApi.staging.steps.filter(step => step.name !== apiStep)
assert.equal(evaluateReadiness(noApi, policy).ok, false, 'Missing real API success cannot inherit approval')
const altered = structuredClone(facts)
altered.reviewedChanges[0].sha256 = 'b'.repeat(64)
assert.equal(evaluateReadiness(altered, policy).ok, false, 'Altered source cannot inherit approval')
assert.equal(evaluateReadiness({ ...facts, currentHead: 'moved-head' }, policy).ok, false)
assert.equal(evaluateReadiness({ ...facts, liveRows: [...facts.liveRows, { version: '20990101000000', name: 'orphan' }] }, policy).ok, false)
console.log('Reviewed Quest support registration capability passed using synthetic facts only; actual exact-head staging and production authorization remain separate.')
