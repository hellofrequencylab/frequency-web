#!/usr/bin/env node
// PERF-005: /events took seconds to load because every database call crossed the country. Production
// functions ran in iad1 (Washington, D.C.) while the database lives in us-west-2 (Oregon); Supabase's
// edge log put the origin time of a one-row lookup at 80 to 130 ms on 2026-11-17, and the /events
// loader made about ten of them in series. Checks the consequence in source:
//   1. vercel.json pins the functions to pdx1 (Portland), the Vercel region beside us-west-2.
//   2. The /events loader reuses the request-cached identity instead of its own auth.getUser() call.
//   3. Its settings wave starts before the viewer reads, and memberships + circle names are one read.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const vercel = JSON.parse(read('vercel.json'))
if (!Array.isArray(vercel.regions) || vercel.regions.length !== 1 || vercel.regions[0] !== 'pdx1') {
  fails.push('vercel.json does not pin functions to pdx1 (next to the us-west-2 database)')
}

const loader = read('app/(main)/events/index-data.ts')
const body = loader.slice(loader.indexOf('export async function getEventsIndexData'))
if (/auth\.getUser\(\)/.test(body.replace(/\/\/.*$/gm, ''))) fails.push('the /events loader still makes its own auth.getUser() round trip')
if (!/getCachedViewerProfile\(\)/.test(body)) fails.push('the /events loader does not reuse the request-cached viewer profile')
const settingsAt = body.indexOf('const settingsP = Promise.all(')
const viewerAt = body.indexOf('await getCachedViewerProfile()')
if (settingsAt < 0 || viewerAt < 0 || settingsAt > viewerAt) fails.push('the settings wave does not start before the viewer reads')
if (!/circle:circles!memberships_circle_id_fkey/.test(body)) fails.push('memberships and circle names are still two reads in series')

if (fails.length) {
  console.error(`PERF-005 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('PERF-005 ok: functions run beside the database and the /events loader drops its serial viewer round trips')
