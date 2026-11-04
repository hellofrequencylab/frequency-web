// BLD-102: one rail state machine drives both builder rails. The four modes live in lib/builder/rails.ts, the
// table test covers the five widths the spec names, the shell reads railModes() instead of width media queries,
// and an overlay hands focus back to its trigger when it closes.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const rails = read('lib/builder/rails.ts')
for (const m of ['hidden', 'strip', 'overlay', 'pinned']) if (!rails.includes(`'${m}'`)) bad.push(`rails.ts lacks the ${m} mode`)
if (!/BREAKPOINTS/.test(rails)) bad.push('rails.ts must read the shared breakpoints (BLD-002)')
const test = read('lib/builder/rails.test.ts')
for (const w of [1600, 1200, 900, 700, 390]) if (!test.includes(`[${w},`)) bad.push(`the table test lacks ${w}px`)
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/railModes\(/.test(shell)) bad.push('the shell must draw the rails from railModes()')
if (!/getElementById\(rails\.trigger\)\?\.focus\(\)/.test(shell)) bad.push('closing an overlay must hand focus back to its trigger')
if (/@media \(max-width/.test(read('components/builder/shell/builder-shell.module.css'))) bad.push('rail widths belong to rails.ts, not CSS media queries')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
