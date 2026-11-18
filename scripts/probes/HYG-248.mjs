#!/usr/bin/env node
// HYG-248: the history fetch that arms check:shipped-ids survives a transient remote failure.
// On 2026-11-18 the step failed twice on main when the remote's pack-objects died, and main went
// red on a sound tree. Passes while the step retries the fetch and still fails when every try fails.
import { readFileSync } from 'node:fs'

const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const start = yml.indexOf('- name: Fetch base history for check:shipped-ids')
const end = yml.indexOf('- name:', start + 10)
const step = start === -1 ? '' : yml.slice(start, end === -1 ? undefined : end)

const problems = []
if (!step) problems.push('the "Fetch base history for check:shipped-ids" step is missing from ci.yml')
else {
  if (!/for attempt in 1 2 3/.test(step)) problems.push('the history fetch is not retried')
  if (!/return 1/.test(step)) problems.push('the retry never fails the step, so a real fetch failure would be swallowed')
  const bare = step.split('\n').filter((l) => /^\s*git fetch /.test(l))
  if (bare.length) problems.push(`a fetch still runs outside the retry: ${bare[0].trim()}`)
}

if (problems.length) {
  console.error(`HYG-248 FAIL\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('HYG-248 ok: the shipped-ids history fetch retries three times and still fails closed')
