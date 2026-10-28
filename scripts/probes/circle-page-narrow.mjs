#!/usr/bin/env node
// LIVE-1580: the Circle page is laid out for the column the shell really leaves it.
//
// The member shell keeps the right rail on every page (page-chrome.ts), so under 1448px the page body is
// 420 to 720px wide, not the design's 1240px. The narrow rules (a cover scrim that keeps the tags readable,
// four tabs that fit, no icon crowding) therefore key on the viewport range where the rails sit, not on a
// phone width. Fails when the sheet goes back to a 720px phone-only breakpoint or loses the narrow block.
import { readFileSync } from 'node:fs'

const bad = []
const css = readFileSync('app/themes/frequency/members-circle.css', 'utf8')
if (!/@media \(max-width:1447px\)\{[^@]*\.fqc-tab\{/.test(css)) bad.push('members-circle.css has no narrow block at 1447px that sizes the tabs')
if (/@media \(max-width:720px\)\{[^@]*\.fqc-/.test(css)) bad.push('members-circle.css sizes the Circle page at a 720px phone breakpoint again')
if (!/@media \(max-width:1447px\)\{[^@]*\.fqc-cover::before/.test(css)) bad.push('the narrow block lost the stronger cover scrim')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('circle page narrow: ok')
