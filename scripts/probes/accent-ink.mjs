#!/usr/bin/env node
// LIVE-961 (ADR-1791): the solid violet accent is off every Frequency surface.
//
// Fails when #5B3FD0 or #4A31B8 returns to app/, components/ or lib/ outside tests and the two lines
// that define the hue token (the export mirror in core.css and the iridescent-sweep comment), when
// core.css stops binding the Commons action or link role to the ink, when the site kit's .btn stops
// drawing the --fq-pa pastel pill, or when palette.frequency.primary leaves the ink.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const bad = []
const hits = execSync("grep -rniE '#(5B3FD0|4A31B8)' --include=*.css --include=*.ts --include=*.tsx app components lib || true")
  .toString()
  .split('\n')
  .filter((l) => l && !/\.test\.(ts|tsx):/.test(l) && !/--fq-x-violet-deep:#5B3FD0/.test(l) && !/iridescent-sweep-deep/.test(l))
if (hits.length) bad.push(`the solid violet is back in:\n  ${hits.join('\n  ')}`)

const core = readFileSync('app/themes/frequency/core.css', 'utf8')
if (!core.includes('--fq-action-primary:var(--fq-ink)')) bad.push('core.css no longer binds the Commons action role to the ink')
if (!core.includes('--fq-text-link:var(--fq-ink)')) bad.push('core.css no longer binds the Commons link role to the ink')

const kit = readFileSync('app/themes/frequency/kit-site.css', 'utf8')
if (!/\[data-kit="site"\] \.btn\{[^}]*background:var\(--fq-pa\)/.test(kit)) bad.push('the site kit .btn no longer draws the --fq-pa pastel pill')

const pal = readFileSync('lib/theme/palette.ts', 'utf8').split('frequency: {')[1] ?? ''
if (!pal.includes("primary: '#1E1B18'")) bad.push('palette.frequency.primary is not the ink')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('accent-ink: the violet accent is gone; buttons are the pastel pill, links and focus are ink')
