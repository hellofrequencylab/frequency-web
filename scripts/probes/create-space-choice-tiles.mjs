// The Setup, Name (visibility) and Look steps of Create a Space use the same selectable tile as the Goals step,
// each with its one-line hint, and the Look step marks the kit the visitor arrived with. Fails while any of
// them is still a row of small pill chips.
import { readFileSync } from 'node:fs'

// The wizard plus the embeddable steps it renders (LIVE-1733 moved ChoiceTile and the Look step out of it).
const wizard = ['app/(main)/spaces/new/create-space-wizard.tsx', 'components/spaces/create-flow/choice-tile.tsx', 'components/spaces/create-flow/look-step.tsx']
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
const problems = []
if (!wizard.includes('function ChoiceTile')) problems.push('no ChoiceTile')
if (/className=\{[^}]*'chip on'/.test(wizard) || /className="chips /.test(wizard)) problems.push('a step still renders pill chips')
if (!wizard.includes("'Your kit'")) problems.push('the Look step does not mark the arriving kit')
if (problems.length) {
  console.error(problems.join('; '))
  process.exit(1)
}
console.log('ok: Setup, visibility and Look use choice tiles')
