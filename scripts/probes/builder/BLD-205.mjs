// BLD-205: Update to new layouts in the builder. LIVE-1860's per-page conversion is surfaced from the outline and ⌘K:
// each convertible section is shown beside its role version, the owner picks which, and the pick lands as one edit
// (one undo step). A legacy page renders identically before the action and after undo (lib/builder/legacy.test.ts).
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/upgradeDocument\(/.test(read('lib/builder/legacy.ts'))) bad.push('lib/builder/legacy.ts: does not convert through LIVE-1860\'s legacy map')
if (!/<UpdateLayoutsSheet /.test(shell)) bad.push('the builder does not open the Update to new layouts sheet')
if (!/data-action="update-layouts"/.test(shell) || !/'update-layouts':/.test(read('lib/builder/commands.ts'))) bad.push('no way to reach Update to new layouts from the outline and ⌘K')
if (!/editDoc\(\(doc\) => applyLegacy\(doc, ids\)\)/.test(shell)) bad.push('the update is not one edit (one undo step)')
if (!/before.*after|preview\(active\.before/.test(read('components/builder/legacy/update-layouts-sheet.tsx'))) bad.push('the sheet does not preview before and after')
if (!bad.length) {
  const run = spawnSync('npx', ['vitest', 'run', 'lib/builder/legacy.test.ts'], { encoding: 'utf8' })
  if (run.status !== 0) bad.push(`lib/builder/legacy.test.ts fails:\n${(run.stdout + run.stderr).slice(-1500)}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('BLD-205: Update to new layouts previews each section, applies as one undo step, and undo restores the page exactly.')
