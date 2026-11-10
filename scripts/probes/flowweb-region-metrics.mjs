#!/usr/bin/env node
// LIVE-2235: an admin can download each FlowWeb region's numbers as the CSV FlowWeb's metrics upload takes.
//
// Fails when the CSV header drifts from FlowWeb's (territory_id,hosts_active_28d,events_next_14d,
// sub_areas_covered_14d,wam), when a region goes missing from the rows, when a sub-area with 4 Channels in
// the next 14 days stops counting as covered, when the staff-gated download route is gone or loses its
// gate, or when a failed read would be served as a CSV instead of an error.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-region-metrics.mjs
import { existsSync, readFileSync } from 'node:fs'

const { computeRegionMetrics, regionMetricsCsv } = await import('../../lib/onboarding/region-metrics.ts')

const bad = []
const now = new Date('2026-11-10T12:00:00Z')
const soon = new Date(now.getTime() + 86_400_000).toISOString()
const events = ['movement', 'meditation', 'creative', 'food'].map((channel, i) => ({ startsAt: soon, hostId: `h${i}`, city: 'Temecula', channel }))
const rows = computeRegionMetrics({ now, events, hostAreas: new Map(), weeklyMembers: [{ city: 'Irvine', chosenArea: null }] })
const csv = regionMetricsCsv(rows).trim().split('\n')
if (csv[0] !== 'territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam') bad.push(`CSV header drifted: ${csv[0]}`)
const byId = Object.fromEntries(csv.slice(1).map((l) => [l.split(',')[0], l]))
for (const id of ['north-county-sd', 'orange-county', 'inland-north', 'san-diego']) if (!byId[id]) bad.push(`region ${id} is missing`)
if (byId['inland-north'] !== 'inland-north,4,4,1,0') bad.push(`Temecula's four Channels did not count as one covered sub-area: ${byId['inland-north']}`)
if (byId['orange-county'] !== 'orange-county,0,0,0,1') bad.push(`an Irvine member did not count in Orange County: ${byId['orange-county']}`)

const route = 'app/(main)/admin/growth/flowweb-metrics/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else {
  const src = readFileSync(route, 'utf8')
  if (!/await requireAdmin\(/.test(src)) bad.push('the download route lost its staff gate')
  if (!/status: 500/.test(src)) bad.push('a failed read no longer answers 500')
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('flowweb-region-metrics: the staff download writes the CSV FlowWeb uploads, with coverage and weekly members counted')
