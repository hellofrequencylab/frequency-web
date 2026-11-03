#!/usr/bin/env node
// LIVE-2062: Nocturne's four surface cards (Website, Space, Spotlight, Email) take their accessible name from the text
// people see. A fixed aria-label that left the visible words out failed WCAG 2.5.3 (label in name).
import { readFileSync } from 'node:fs'

const s = readFileSync('components/frequency/site/pages/themes/frequency-midnight.tsx', 'utf8')
if (/aria-label=\{`Preview the \$\{label/.test(s)) {
  console.error('Nocturne surface cards still carry a fixed "Preview the ..." aria-label')
  process.exit(1)
}
console.log('nocturne-surface-cards-name: ok')
