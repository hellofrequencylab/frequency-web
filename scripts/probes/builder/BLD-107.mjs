// BLD-107: under 600 the builder works from a bottom bar (Outline, Add, Tune, Vera) with 44px targets, and the
// outline and Tune open as bottom sheets carrying the same two layers as the side panel, so every Layer 1 and
// Layer 2 control is reachable at 390 wide (rails.ts opens either rail as an overlay below sm).
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const shell = read('components/builder/shell/builder-shell.tsx')
for (const label of ['Outline', 'Add', 'Tune', 'Vera']) if (!shell.includes(`<span>${label}</span>`)) bad.push(`the bottom bar lacks ${label}`)
if (!/width < BREAKPOINTS\.sm/.test(shell)) bad.push('the phone layout must key off the shared sm breakpoint')
const css = read('components/builder/shell/builder-shell.module.css')
if (!/\.bottomBar button \{[^}]*min-height: 44px/.test(css)) bad.push('bottom bar targets must be 44px')
if (!/\.root\[data-phone\] \.panel\[data-mode='overlay'\]/.test(css)) bad.push('Tune must open as a bottom sheet on phones')
if (!/overlay\/strip'/.test(read('lib/builder/rails.test.ts')) || !/\[390, 'hidden\/hidden', 'hidden\/hidden', 'overlay\/hidden'/.test(read('lib/builder/rails.test.ts'))) bad.push('the rails table must prove a rail opens at 390')
if (!/<TuneRail /.test(shell)) bad.push('the sheet must carry the Tune rail (both layers)')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
