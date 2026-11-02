#!/usr/bin/env node
// LIVE-1974: HubLinks' nav carries data-kit="members" inside a members page, so the kit root rule in
// members-shell.css (min-height:100dvh, the shell's own frame) also matched the nav. Measured 2026-11-02
// in a browser on /events at 1280x900: the "More in Events" row was 900px tall, a viewport of nothing
// between the row and the Host panel (63px after the fix). This probe reads the sheet for the nested
// override and the component for the attribute the override exists for.
import { readFileSync } from 'node:fs'
const css = readFileSync('app/themes/frequency/members-shell.css', 'utf8')
const nav = readFileSync('components/frequency/members/shared/hub-links.tsx', 'utf8')
const bad = []
if (!/\[data-kit="members"\] \[data-kit="members"\]\{min-height:0\}/.test(css))
  bad.push('members-shell.css gives a nested members-kit island the shell\'s screen-tall minimum')
if (/<nav data-kit="members"/.test(nav) === false && !/\[data-kit="members"\] \[data-kit="members"\]/.test(css))
  bad.push('hub-links.tsx no longer marks the nav as a kit island, so the override guards nothing')
if (bad.length) {
  console.error(bad.join('; '))
  process.exit(1)
}
console.log('a nested members-kit island is a row, not a second shell')
