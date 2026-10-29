#!/usr/bin/env node
// LIVE-1626: the Circle page puts its own column (About, How we do it, How we meet, Who's here) beside the
// feed, as the design's two-column layout does, and stacks it under the feed only when the body is narrow.
// Fails when the page goes back to a single stacked column at every width.
import { existsSync, readFileSync } from 'node:fs'

const css = existsSync('app/themes/frequency/members-circle.css') ? readFileSync('app/themes/frequency/members-circle.css', 'utf8') : ''
const bad = []
if (!/\.fqc\{[^}]*container-type:inline-size/.test(css)) bad.push('.fqc is not a size container')
if (!/@container \(min-width:\d+px\)\{[^}]*\.fqc-cols\{grid-template-columns:minmax\(0,1fr\) \d+px\}/.test(css)) bad.push('no two-column rule for .fqc-cols')
if (!/\.fqc-side\{[^}]*flex-direction:column/.test(css)) bad.push('.fqc-side is not its own column')

if (bad.length) {
  console.error('LIVE-1626: ' + bad.join('; '))
  process.exit(1)
}
console.log('circle two column: ok')
