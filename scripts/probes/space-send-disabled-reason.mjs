#!/usr/bin/env node
// LIVE-2316: a disabled Send now in the Space email send panel says why.
//
// Fails when components/spaces/marketing/space-send-panel.tsx disables Send now on an empty audience
// with no reason beside the button, or when the reason is not tied to the button for screen readers.
import { readFileSync } from 'node:fs'

const bad = []
const src = readFileSync('components/spaces/marketing/space-send-panel.tsx', 'utf8')

if (!src.includes('disabled={pending || count === 0}')) bad.push('Send now no longer disables on an empty audience (re-check this probe)')
if (!/\{count === 0 && !pending && \(\s*<p id="space-send-now-reason"/.test(src))
  bad.push('no reason line shows beside a disabled Send now')
if (!/No one in this audience can get marketing email yet\.\s+Imported contacts need to be confirmed\s+as subscribers\./.test(src))
  bad.push('the reason line does not say why the audience is empty')
if (!src.includes("aria-describedby={count === 0 ? 'space-send-now-reason' : undefined}"))
  bad.push('the reason is not tied to the button with aria-describedby')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('LIVE-2316 ok: a disabled Send now shows its reason')
