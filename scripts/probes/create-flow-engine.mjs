// Create a Space renders through ONE shared step engine (components/spaces/create-flow), with a framed and a
// stacked layout and Name and Look as embeddable steps, so the launch flow can be the same builder in another skin.
// Fails while the wizard still carries its own step list or the steps are not separate bodies.
import { existsSync, readFileSync } from 'node:fs'

const problems = []
for (const f of ['create-flow.tsx', 'name-step.tsx', 'look-step.tsx', 'choice-tile.tsx']) {
  if (!existsSync(`components/spaces/create-flow/${f}`)) problems.push(`missing ${f}`)
}
if (!problems.length) {
  const engine = readFileSync('components/spaces/create-flow/create-flow.tsx', 'utf8')
  const wizard = readFileSync('app/(main)/spaces/new/create-space-wizard.tsx', 'utf8')
  if (!/layout\?: 'framed' \| 'stacked'|layout = 'framed'/.test(engine) || !engine.includes("'stacked'")) problems.push('engine has no framed and stacked layouts')
  if (!wizard.includes('<CreateFlow')) problems.push('wizard does not render through CreateFlow')
  if (/aria-label="Steps"/.test(wizard)) problems.push('wizard still draws its own step list')
  if (!wizard.includes('<NameStep') || !wizard.includes('<LookStep')) problems.push('Name and Look are not embeddable step bodies')
}
if (problems.length) {
  console.error(problems.join('; '))
  process.exit(1)
}
console.log('ok: Create a Space renders through the shared CreateFlow engine')
