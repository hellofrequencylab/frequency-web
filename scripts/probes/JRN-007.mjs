#!/usr/bin/env node
// JRN-007: Journey settings saves, the Spark follow-up write, a Run's enrolment and a delete report a failure
// instead of saying "saved" or doing nothing (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const actions = read('app/(main)/journeys/actions.ts')
const bare = actions.match(/^\s*await admin\.from\('journey_plans'\)\.update\(/gm) ?? []
if (bare.length) fails.push(`${bare.length} journey_plans update(s) in app/(main)/journeys/actions.ts ignore the write error and return ok()`)
const create = read('app/(main)/journeys/create-actions.ts')
if (/^\s*await admin\s*\n?\s*\.from\('journey_plans'\)\s*\n?\s*\.update\(planUpdate/m.test(create)) fails.push('the Spark follow-up write (intro, outline, cover, meeting, tags) ignores its error')
const runs = read('lib/journeys/runs.ts')
if (/if \(rows\.length\) await db\(\)\.from\('journey_enrollments'\)\.insert\(rows\)/.test(runs)) fails.push('startRun reports a started Run when enrolling its members failed')
const settings = read('components/journey/v2/journey-settings.tsx')
if (!/setSaveError\(res\.error\)/.test(settings)) fails.push('the Journey settings save helper drops a refused or failed save')
const builder = read('components/journey/v2/journey-builder.tsx')
if (/await saveJourneyMeta\(planId, patch\)\s*\n\s*router\.refresh\(\)/.test(builder)) fails.push('the editor header drops a refused saveJourneyMeta')
const danger = read('components/journey/v2/journey-danger-zone.tsx')
if (!/isError\(r\)\) setError\(r\.error\)/.test(danger)) fails.push('the Danger zone shows nothing when a delete is refused')
const card = read('components/journeys/journey-manage-card.tsx')
if (/if \(!isError\(res\)\) router\.refresh\(\)/.test(card)) fails.push('the manage card shows nothing when a delete is refused')

if (fails.length) {
  console.error(`JRN-007 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-007 ok: Journey saves, Run starts and deletes report their failures')
