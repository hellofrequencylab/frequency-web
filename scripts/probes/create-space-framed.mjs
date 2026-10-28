// The Create a Space wizard sits in the page's own layout (a card with a step list and a summary), not the
// narrow Spark column floating under the heading, and says which kit is picked. Fails while the wizard still
// renders the standard Spark column or has no kit banner.
import { readFileSync } from 'node:fs'

// The wizard and the shared create-flow engine it renders through (LIVE-1733 moved the frame into the engine).
const wizard =
  readFileSync('app/(main)/spaces/new/create-space-wizard.tsx', 'utf8') + readFileSync('components/spaces/create-flow/create-flow.tsx', 'utf8')
const shell = readFileSync('components/studio/spark/spark-shell.tsx', 'utf8')
const problems = []
if (!/<SparkShell[\s\S]*?\bbare\b/.test(wizard)) problems.push('wizard does not use the bare Spark layout')
if (!wizard.includes('kit is picked')) problems.push('no kit-is-picked banner')
if (!wizard.includes('Your space so far')) problems.push('no summary card')
if (!/bare\?: boolean/.test(shell)) problems.push('SparkShell has no bare prop')
if (problems.length) {
  console.error(problems.join('; '))
  process.exit(1)
}
console.log('ok: Create a Space has its own frame, kit banner and summary')
