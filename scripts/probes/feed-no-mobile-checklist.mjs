// SCAN-1279: the Feed shows no Get started checklist on a phone (owner, 2026-11-19), and the
// desktop right rail still carries the box. Reads the shipped CSS and the rail source.
import { readFileSync } from 'node:fs'

const bad = []
const css = readFileSync('app/themes/frequency/members-shell.css', 'utf8')
const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
const hide = /\[data-design="frequency"\] \[data-kit="members"\] \.fqm-gs-inline\{[^}]*display:none/
// The hide rule must sit at the top level, not inside a width query that leaves phones out.
const topLevel = flat.split('\n').filter((l) => !l.trim().startsWith('@media'))
if (!topLevel.some((l) => hide.test(l))) bad.push('the Feed inline Get started is not hidden at phone width')
if (/\.fqm-gs-inline\{[^}]*display:(?!none)/.test(flat)) bad.push('a rule shows the Feed inline Get started again')
const rail = readFileSync('components/frequency/members/shell/right-rail.tsx', 'utf8')
if (!/<GetStartedPanel /.test(rail)) bad.push('the desktop right rail lost its Get started box')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ No Get started checklist in the Feed on a phone; the desktop rail keeps it')
