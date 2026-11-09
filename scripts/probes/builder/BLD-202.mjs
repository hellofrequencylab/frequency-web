// BLD-202: + opens "What should this part do?" with the roles by intent; only roles legal for the page kind and surface are
// offered; the preview uses the Space's own rows when present; picking inserts at the chosen place as one undo step.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const bad = []
const need = (file, re, why) => { const src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; if (!re.test(src)) bad.push(`${file}: ${why}`) }
need('components/builder/add/add-sheet.tsx', /What should this part do\?/, 'no Add sheet asking what the part should do')
need('lib/builder/add.ts', /derivePickerGroups\(config, doc, 'website'/, 'Add does not read the website palette (page kind)')
need('lib/builder/add.ts', /surfaces\[opts\.surface\] === 'hide'/, 'Add does not respect the surface')
need('components/builder/shell/builder-shell.tsx', /onInsert=\{openAdd\}/, 'the canvas + does not open Add')
need('components/builder/shell/builder-shell.tsx', /rolePreviewMetadata\(/, 'the preview does not choose Space rows or the sample')
need('components/builder/shell/builder-shell.tsx', /editDoc\(\(\) => result\.doc\)/, 'insert is not one edit')
if (!bad.length) {
  const run = spawnSync('npx', ['vitest', 'run', 'lib/builder/add.test.ts'], { encoding: 'utf8' })
  if (run.status !== 0) bad.push(`lib/builder/add.test.ts fails:\n${(run.stdout + run.stderr).slice(-1500)}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('BLD-202: Add by intent offers only legal roles, previews with Space rows or the sample, and inserts in one step.')
