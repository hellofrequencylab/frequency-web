// BLD-204: readiness. One model (lib/builder/readiness.ts) feeds the Publish ring and its count, the canvas tags and the
// Publish sheet. A page with sample: true content cannot publish without an explicit keep; a null number blocks
// publish outright; clicking the count steps through every item; editing a sample section makes it the owner's.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const model = read('lib/builder/readiness.ts')
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/export function canPublish/.test(model)) bad.push('lib/builder/readiness.ts: no canPublish gate')
if (!/export function sectionNullNumbers/.test(read('lib/sites/editor/publish-checks.ts'))) bad.push('publish-checks.ts: no null-number check')
if (!/<PublishRing /.test(shell)) bad.push('the builder does not draw the Publish ring')
if (!/<PublishSheet /.test(shell) || !/canPublish\(ready, keep\)/.test(shell)) bad.push('the builder does not publish through the readiness gate')
if (/void save\(true\)\}?>\{dirty \? 'Publish'/.test(shell)) bad.push('the top bar still publishes around the gate')
if (!/tags=\{/.test(shell) || !/tags\?: Record<string, string>/.test(read('components/sites/editor/canvas.tsx'))) bad.push('the canvas does not wear readiness tags')
if (!/Keep the sample words and publish/.test(read('components/builder/readiness/publish-sheet.tsx'))) bad.push('the Publish sheet has no explicit keep')
if (!bad.length) {
  const run = spawnSync('npx', ['vitest', 'run', 'lib/builder/readiness.test.ts'], { encoding: 'utf8' })
  if (run.status !== 0) bad.push(`lib/builder/readiness.test.ts fails:\n${(run.stdout + run.stderr).slice(-1500)}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('BLD-204: sample words publish only with a keep, a missing number holds Publish, the count steps through each item.')
