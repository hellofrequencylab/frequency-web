#!/usr/bin/env node
// LIVE-2288: support filters include mixed practices before database paging, without broadening other predicates.
import '../probe-ts.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyPracticePillarFilter, practiceSupportsPillar, practiceSupportIds } from '../../lib/practices/support-filter.ts'

const mind = '11111111-1111-4111-8111-111111111111'
const body = '22222222-2222-4222-8222-222222222222'
const spirit = '33333333-3333-4333-8333-333333333333'
const mixed = { domain_id: body, secondary_domain_id: spirit, focus_details: { [body]: {}, [mind]: {}, [spirit]: {} } }
assert.equal(practiceSupportsPillar(mixed, mind), true, 'A non-primary authored support must remain discoverable')
assert.equal(practiceSupportsPillar(mixed, spirit), true, 'A secondary support must remain discoverable')
assert.equal(practiceSupportsPillar({ ...mixed, focus_details: { [mind]: null }, secondary_domain_id: null }, mind), false)
assert.deepEqual(new Set(practiceSupportIds(mixed)), new Set([body, spirit, mind]))

const calls = []
const query = {
  eq(field, value) { calls.push(['eq', field, value]); return this },
  or(value) { calls.push(['or', value]); return this },
}
assert.equal(applyPracticePillarFilter(query, mind), query)
assert.deepEqual(calls, [['or', `domain_id.eq.${mind},secondary_domain_id.eq.${mind},focus_details.cs.{"${mind}":{}}`]])
calls.length = 0
applyPracticePillarFilter(query, 'bad),is_public.eq.false')
assert.deepEqual(calls, [['eq', 'domain_id', 'bad),is_public.eq.false']], 'Unvalidated identifiers must remain bound values, never filter grammar')

const source = readFileSync('lib/practices.ts', 'utf8')
const publicSearch = source.slice(source.indexOf('export async function searchLibraryPractices'), source.indexOf('export interface AdminPracticeSearchOpts'))
assert.ok(publicSearch.indexOf('applyPracticePillarFilter(q, opts.pillarId)') < publicSearch.indexOf('await q.range(') && publicSearch.includes('applyPracticePillarFilter(q, opts.pillarId)'), 'Public supports filter must run before database pagination')
const adminFilters = source.slice(source.indexOf('async function applyAdminFilters'), source.indexOf('export async function searchAdminPractices'))
assert.ok(adminFilters.includes('applyPracticePillarFilter(q, opts.pillarId)'), 'Admin rows/count/bulk must share the same supports predicate')
console.log('practice support discovery: mixed focuses, unique supports, bound invalid identifiers and pre-page public/admin filtering pass')
