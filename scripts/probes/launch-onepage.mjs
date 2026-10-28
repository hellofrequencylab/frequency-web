#!/usr/bin/env node
// VLS-09 (one page): the launch is ONE page. The Spotlight form and its live preview share a page with the stages still
// to come; saving changes keeps the person there; the way on goes to the person's own Space, never to a step page that
// does not exist. lib/launch/flow.test.ts pins the stage states and the answers read back; this reads the wiring.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const flow = read('components/launch/launch-flow.tsx')
const start = read('app/(main)/launch/step/spotlight/page.tsx')
const done = read('app/(main)/launch/step/[step]/published/page.tsx')

if (!/<iframe/.test(flow) || !/\/spotlight\?preview=1|\?preview=1/.test(flow)) bad.push('the page shows no live preview of the real Spotlight')
if (!/mu-steps/.test(flow)) bad.push('the page has no progress bar across the four stages')
for (const [name, src] of [['spotlight page', start], ['published page', done]]) {
  if (!/<DashboardTemplate[^>]*adminBar=\{false\}/.test(src)) bad.push(`the ${name} is not composed on a kit template without the admin bar`)
  if (!/LaunchFlow/.test(src)) bad.push(`the ${name} does not render the one launch page`)
  if (/launchStepHref\('space'\)|\/launch\/step\/space/.test(src)) bad.push(`the ${name} links to a step page that does not exist`)
  if (!/\/spaces\/\$\{encodeURIComponent\(/.test(src)) bad.push(`the ${name} does not send the person on to their own Space`)
}

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the launch is one page: form, live preview, the stages to come, and the way on goes to the person’s own Space')
