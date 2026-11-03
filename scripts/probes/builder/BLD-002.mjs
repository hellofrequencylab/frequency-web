// BLD-002: the five radius steps, the four shared breakpoints and the editor tokens exist, built from room tokens.
import fs from 'node:fs'
const css = fs.readFileSync('app/themes/frequency/editor-shell.css', 'utf8')
const bp = fs.readFileSync('lib/theme/breakpoints.ts', 'utf8')
const bad = []
for (const d of ['--r-1: 10px', '--r-2: 14px', '--r-3: 18px', '--r-4: 24px', '--r-5: 32px', '--r-pill:', '--r-control:', '--r-card:', '--r-panel:', '--r-media:']) if (!css.includes(d)) bad.push(d)
for (const n of ['--editor-canvas', '--editor-thumb', '--editor-ring', '--editor-select']) if (!new RegExp(`${n}: var\\(--fq-`).test(css)) bad.push(n)
if (!/sm: 600, md: 840, lg: 1200, xl: 1600/.test(bp)) bad.push('breakpoints 600/840/1200/1600')
if (bad.length) { console.error('missing: ' + bad.join(', ')); process.exit(1) }
