// BLD-203: layout chips from the role variants with their sketch; a chip with unmet needs says why and points at the
// field; picking pins (variant + variantSet), unpinning restores the theme default through roleVariant(); roleVariant
// priority holds (owner, theme, role default) and every variant renders non-empty with sample content on every theme.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
if (!/variantSet: true/.test(read('lib/builder/variants.ts'))) bad.push('lib/builder/variants.ts: picking does not pin')
if (!/roleVariant\(/.test(read('lib/builder/variants.ts'))) bad.push('lib/builder/variants.ts: does not decide through roleVariant()')
if (!/<LayoutChips /.test(read('components/builder/shell/builder-shell.tsx'))) bad.push('the builder does not draw the Layout chips')
if (!/role="switch"/.test(read('components/builder/canvas/variants/layout-chips.tsx'))) bad.push('no "Keep this layout" switch')
if (!bad.length) {
  const run = spawnSync('npx', ['vitest', 'run', 'lib/builder/variants.test.ts'], { encoding: 'utf8' })
  if (run.status !== 0) bad.push(`lib/builder/variants.test.ts fails:\n${(run.stdout + run.stderr).slice(-1500)}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('BLD-203: layout chips pin and unpin through roleVariant(); every variant renders on every theme.')
