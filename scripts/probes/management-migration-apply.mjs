// HYG-225: the production workflow can plan with existing Management API credentials,
// while dry-run remains incapable of submitting SQL mutations.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createQueryBackend, executeApplyPlan, PRODUCTION_PROJECT } from '../apply-reviewed-migration.mjs'
const workflow = readFileSync('.github/workflows/apply-migration.yml', 'utf8')
assert.ok(workflow.includes('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}'), 'The sanctioned apply workflow must wire its existing Management API credential')
assert.ok(workflow.includes('node scripts/apply-reviewed-migration.mjs --dry-run'))
assert.ok(workflow.includes('node scripts/apply-reviewed-migration.mjs --apply'))
let requests = 0
const backend = createQueryBackend({ SUPABASE_PROJECT_REF: PRODUCTION_PROJECT, SUPABASE_ACCESS_TOKEN: 'synthetic-probe-token' }, { fetcher: async () => { requests++; throw Error('Probe must not contact a provider') } })
assert.equal(backend.kind, 'management-api')
const report = await executeApplyPlan({ pr: 7, head: 'c'.repeat(40), base: 'b'.repeat(40), plan: [{ action: 'apply', file: 'supabase/migrations/20270101000000_fixture.sql', sha256: 'a'.repeat(64) }] }, { query: backend.query })
assert.equal(report.dryRun, true)
assert.equal(requests, 0, 'Default dry-run must never submit a query')
console.log('Main-owned migration apply supports the canonical Management API fallback; default dry-run submits no SQL')
