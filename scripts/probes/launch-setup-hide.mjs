#!/usr/bin/env node
// LIVE-1915: Finish setup can be hidden, only through two server-checked steps, and Settings brings it back.
//
// Fails when the sheet loses the two-step hide, when the box loader stops honouring the hidden choice, or when
// Settings loses the way back.
import { readFileSync } from 'node:fs'

const bad = []
const sheet = readFileSync('components/frequency/members/shell/launch-box.tsx', 'utf8')
if (!sheet.includes('askHideSetupAction') || !sheet.includes('confirmHideSetupAction')) bad.push('the Finish setup sheet lost its two-step hide')
const io = readFileSync('lib/launch/setup-hidden-io.ts', 'utf8')
if (!io.includes('hideAskIsFresh')) bad.push('confirming a hide no longer checks that the first step happened')
if (!readFileSync('lib/launch/box.ts', 'utf8').includes('loadSetupHidden')) bad.push('the box loader no longer honours a hidden Finish setup')
if (!readFileSync('app/(main)/settings/account/section.tsx', 'utf8').includes('showSetupFromSettings')) bad.push('Settings lost the way to bring Finish setup back')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('finish setup hide: ok')
