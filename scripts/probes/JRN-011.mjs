#!/usr/bin/env node
// JRN-011: the weekly phase notice reaches every enrolled member (not only the oldest 200), stops for a
// cancelled or completed Run and a Journey made private, and honours the in-app Practice setting
// (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const src = read('lib/journeys/drip-sends.ts')
if (!/\.range\(page \* limit/.test(src)) fails.push('the drip pass reads the same oldest `limit` enrolments every hour, so newer members are never reached')
if (!/select\('id, started_at, status'\)/.test(src) || !/endedRuns\.has\(enrollment\.run_id\)/.test(src)) fails.push('the drip pass keeps sending for cancelled or completed Runs')
if (!/plan\.visibility === 'private'/.test(src)) fails.push('the drip pass sends notices for a Journey made private (the link 404s)')
if (!/resolveSendGate\(enrollment\.profile_id, 'inapp'/.test(src)) fails.push('the drip pass ignores the member\'s in-app notification setting')

if (fails.length) {
  console.error(`JRN-011 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-011 ok: phase notices rotate through every enrolment and respect Runs, privacy and settings')
