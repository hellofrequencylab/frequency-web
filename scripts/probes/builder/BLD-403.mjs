// BLD-403: the history scrubber is live. The staff, EDITOR_CANVAS-gated /pages/canvas route mounts it, fed by
// page_versions through staff-only server actions; moving it previews a version without writing; Restore puts
// the whole version or one section into the draft (pure, table-tested to equal the chosen version); and
// "Make this the live page" is the pointer swap.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))

const restore = read('lib/builder/history-restore.ts')
for (const fn of ['restoreWhole', 'restoreSection', 'sectionOutline']) if (!new RegExp(`export function ${fn}\\(`).test(restore)) bad.push(`history-restore must export ${fn}`)
if (!/from '@\/lib\/entity-blocks\/node-ops'/.test(restore)) bad.push('section restore must find nodes through node-ops')
if (/entityBlockById|sanitize/.test(restore)) bad.push('restore must not consult the registry or sanitize (unknown blocks stay byte for byte)')

const tests = read('lib/builder/history-restore.test.ts')
if (!/Restore produces a document equal to the chosen version/.test(tests) || !/it\.each\(CASES\)/.test(tests)) bad.push('the restore table test is missing')

const actions = read('app/(main)/edit/actions.ts')
for (const fn of ['listPageHistory', 'previewPageVersion']) {
  const body = actions.split(`export async function ${fn}(`)[1]?.split('\nexport ')[0] ?? ''
  if (!body) bad.push(`missing server action ${fn}`)
  else if (!/requireJanitor\(\)/.test(body) || !/envFlag\('EDITOR_CANVAS'\)/.test(body)) bad.push(`${fn} must be staff only and EDITOR_CANVAS gated`)
}

const panel = read('components/builder/history/history-panel.tsx')
if (!/<HistoryScrubber[^>]*onRestore=/.test(panel)) bad.push('the panel must give the scrubber a restore')
for (const call of ['previewPageVersion(', 'restoreWhole(', 'restoreSection(', 'revertPageToVersion(', 'publishPage(']) if (!panel.includes(call)) bad.push(`the panel never calls ${call}`)

const route = read('app/(main)/pages/canvas/page.tsx')
if (!/envFlag\('EDITOR_CANVAS'\)\) notFound\(\)/.test(route) || !/getJanitor\(\)\)\) notFound\(\)/.test(route)) bad.push('the canvas route must 404 when the flag is off or the viewer is not staff')
if (!/import\('@\/components\/builder\/history\/history-panel'\)/.test(route) || !/<HistoryPanel /.test(route) || !/listPageVersions\(/.test(route)) bad.push('the canvas route must mount the history panel fed by listPageVersions')

const scrubber = read('components/builder/history/history-scrubber.tsx')
if (/variant="secondary" disabled>Restore to draft/.test(scrubber)) bad.push('Restore to draft is still hard-disabled')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
