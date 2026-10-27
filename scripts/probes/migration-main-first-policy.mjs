#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateReadiness } from '../migration-pr-readiness.mjs'
const hash = 'a'.repeat(64)
const baseRows = Array.from({ length: 400 }, (_, i) => ({ version: String(20240101000000 + i), name: `existing_${i}`, sha256: hash }))
const added = { version: '20990101000000', name: 'reviewed_probe', sha256: hash }
const file = `supabase/migrations/${added.version}_${added.name}.sql`
const changes = [{ file, status: 'added', sha256: hash }]
const steps = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Real local service, anon and authenticated room API acceptance', 'Always destroy dispatched staging containers and volumes'].map(name => ({ name, conclusion: 'success' }))
const facts = { event: 'pull_request', repository: 'hellofrequencylab/frequency-web', sameRepository: true, baseBranch: 'main', baseSha: 'base', currentBase: 'base', headSha: 'head', currentHead: 'head', baseRows, headRows: [...baseRows, added], liveRows: baseRows.map(({ version, name }) => ({ version, name })), migrationChanges: changes, reviewedChanges: changes, staging: { id: 1, repository: 'hellofrequencylab/frequency-web', app: 'github-actions', event: 'workflow_dispatch', headSha: 'head', workflowPath: '.github/workflows/db-tests.yml', status: 'completed', conclusion: 'success', steps } }
const policy = { trustedMainSnapshot: true, baseSha: 'base', registrations: [{ file, sha256: hash }], reviewedChanges: changes }
assert.equal(evaluateReadiness(facts, policy).status, 'registered_pending_apply')
assert.equal(evaluateReadiness({ ...facts, event: 'push' }, policy).ok, false)
assert.equal(evaluateReadiness({ ...facts, liveRows: [...facts.liveRows, { version: '20990101000001', name: 'orphan' }] }, policy).ok, false)
const altered = structuredClone(facts); altered.headRows[0] = { ...altered.headRows[0], sha256: 'b'.repeat(64) }
assert.equal(evaluateReadiness(altered, policy).ok, false)
assert.equal(evaluateReadiness(facts, { ...policy, registrations: [] }).ok, false)
const noApi = structuredClone(facts); noApi.staging.steps.splice(3, 1)
assert.equal(evaluateReadiness(noApi, policy).ok, false)
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
assert.match(workflow, /node scripts\/verify-migration-readiness\.mjs/)
const isolated = readFileSync('.github/workflows/migration-readiness.yml', 'utf8')
assert.match(isolated, /pull_request_target:/)
assert.match(isolated, /persist-credentials: false/)
assert.ok(!isolated.includes('pnpm '))
assert.match(workflow, /\[ "\$guard" = migrations \] && \[ "\$GITHUB_EVENT_NAME" = pull_request \]/)
const manifest = JSON.parse(readFileSync('scripts/migration-readiness-policy.json', 'utf8'))
assert.equal(manifest.version, 1); assert.ok(Array.isArray(manifest.registrations))
console.log('Main-first PR readiness preserves strict main, history, live-set and staging refusals; approvals come from main.')
