import assert from 'node:assert/strict'
import { loadProbeModule } from '../lib/probe-module.mjs'

const { eventInstant } = loadProbeModule('lib/time/zone.ts', { 'tz-lookup': () => 'America/Los_Angeles' })
// Expected instants independently measured with PostgreSQL AT TIME ZONE.
for (const [wall, zone, expected] of [
  ['2026-03-08T02:30:00Z', 'America/Los_Angeles', '2026-03-08T10:30:00.000Z'],
  ['2026-11-01T01:30:00Z', 'America/Los_Angeles', '2026-11-01T09:30:00.000Z'],
  ['2026-03-08T02:30:00Z', 'America/New_York', '2026-03-08T07:30:00.000Z'],
  ['2026-11-01T01:30:00Z', 'America/New_York', '2026-11-01T06:30:00.000Z'],
  ['2011-12-30T00:00:00Z', 'Pacific/Apia', '2011-12-30T10:00:00.000Z'],
  ['2026-06-26T19:00:00Z', 'America/Los_Angeles', '2026-06-27T02:00:00.000Z'],
]) assert.equal(eventInstant(wall, zone)?.toISOString(), expected, `${wall} in ${zone}`)
console.log('Actual event conversion agrees with PostgreSQL gap, fold, skipped-day and ordinary-time fixtures')
