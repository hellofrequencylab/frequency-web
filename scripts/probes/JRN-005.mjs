#!/usr/bin/env node
// JRN-005: a Journey cannot go live without a real name and a phase with a step in it, whichever publish
// door is used, and a refused publish says why (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const actions = read('app/(main)/journeys/actions.ts')
const at = actions.indexOf('export async function setJourneyVisibility(')
const body = at < 0 ? '' : actions.slice(at, actions.indexOf('\nexport ', at + 10))
if (!/checkJourneyReadyToPublish\(planId\)/.test(body)) fails.push('setJourneyVisibility publishes without the server-side ready check (an empty draft can go live)')
const ready = read('lib/journeys/publish-ready.ts')
if (!/readyToPublish\(checks\)/.test(ready)) fails.push('lib/journeys/publish-ready.ts does not run the guide\'s readyCheck/readyToPublish')
const settings = read('components/journey/v2/journey-settings.tsx')
if (!/setPublishError\(res\.error\)/.test(settings)) fails.push('the settings publish control reverts a refused publish without saying why')
const author = read('components/journey/v2/learn/journey-author-actions.tsx')
if (!/isError\(res\)\) setNote\(res\.error\)/.test(author)) fails.push('the learn-page Publish button ignores a refused publish')

if (fails.length) {
  console.error(`JRN-005 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-005 ok: every publish door runs the ready check on the server and shows a refusal')
