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
const matches = document.registrations.filter(entry => entry.pullRequest === 4930)
assert.equal(matches.length, 1, 'Exactly one main-side reviewed experiment registration is required')
const registration = matches[0]
const file = 'supabase/migrations/20270346046500_analytics_experiments.sql'
const sqlHash = 'ebefee10a1e936f2e7516ecd6a70fb1242ce0638bedf517522ecbdfb6cb894bb'
const apiStep = 'Real local service, anon and authenticated analytics experiment API acceptance'
const requiredSteps = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', apiStep, 'Always destroy dispatched staging containers and volumes']
assert.deepEqual(registration.migrations, [{ file, sha256: sqlHash }])
assert.equal(registration.reviewedChanges.length, 32)
assert.equal(hash(registration.reviewedChanges), '537c22c3d9153e2c6ee93ae23e16c8f395f634cc8ef14ef9b3ad3e63e83bfba6', 'The complete reviewed source, harness, tests and file modes must remain frozen')
assert.equal(registration.workflowPath, '.github/workflows/db-tests.yml')
assert.equal(registration.workflowSha256, '522262e06e8c2928e73aaf8528faae02a7d3a74116fbe85995df9c3ae3cc6b18')
assert.equal(registration.expiresAt, '2026-11-21T23:59:59Z')
assert.equal(registration.apiAcceptanceStep, apiStep)
assert.deepEqual(registration.requiredSteps, requiredSteps)

// Exercise the real decision kernel using the actual registered source inventory and explicit
// synthetic identities/staging success. The collector must independently obtain real facts.
const baseRows = Array.from({ length: 400 }, (_, i) => ({ version: String(20240101000000 + i), name: `existing_${i}`, sha256: 'a'.repeat(64) }))
const added = { version: '20270346046500', name: 'analytics_experiments', sha256: sqlHash }
const facts = {
  event: 'pull_request', repository: 'hellofrequencylab/frequency-web', sameRepository: true, baseBranch: 'main',
  baseSha: 'synthetic-base', currentBase: 'synthetic-base', headSha: 'synthetic-head', currentHead: 'synthetic-head',
  baseRows, headRows: [...baseRows, added], liveRows: baseRows.map(({ version, name }) => ({ version, name })),
  migrationChanges: registration.reviewedChanges.filter(change => change.file === file), reviewedChanges: registration.reviewedChanges,
  staging: { id: 1, repository: 'hellofrequencylab/frequency-web', app: 'github-actions', event: 'workflow_dispatch', headSha: 'synthetic-head', workflowPath: registration.workflowPath, status: 'completed', conclusion: 'success', steps: requiredSteps.map(name => ({ name, conclusion: 'success' })) },
}
const policy = { trustedMainSnapshot: true, baseSha: facts.baseSha, registrations: registration.migrations, reviewedChanges: registration.reviewedChanges, requiredSteps: registration.requiredSteps }
assert.equal(evaluateReadiness(facts, policy).status, 'registered_pending_apply')
const noApi = structuredClone(facts)
noApi.staging.steps = noApi.staging.steps.filter(step => step.name !== apiStep)
assert.equal(evaluateReadiness(noApi, policy).ok, false, 'Missing real API success cannot inherit approval')
const altered = structuredClone(facts)
altered.reviewedChanges[0].sha256 = 'b'.repeat(64)
assert.equal(evaluateReadiness(altered, policy).ok, false, 'Altered source cannot inherit approval')
assert.equal(evaluateReadiness({ ...facts, currentHead: 'moved-head' }, policy).ok, false)
assert.equal(evaluateReadiness({ ...facts, liveRows: [...facts.liveRows, { version: '20990101000000', name: 'orphan' }] }, policy).ok, false)
console.log('Reviewed experiment registration capability passed using synthetic facts only; actual exact-head staging and production authorization remain separate.')
