// PERF-010: photos in Space blocks load when they are near the screen, not all at once.
import { readFileSync } from 'node:fs'

const want = {
  'components/entity-blocks/content-block-view.tsx': 5,
  'components/entity-blocks/design-block-view.tsx': 1,
  'components/entity-blocks/space-canvas/space-canvas-block.tsx': 2,
}
const bad = []
for (const [file, min] of Object.entries(want)) {
  const n = (readFileSync(file, 'utf8').match(/loading="lazy"/g) ?? []).length
  if (n < min) bad.push(`${file}: ${n} lazy image(s), expected at least ${min}`)
}
if (bad.length) {
  console.error('PERF-010: ' + bad.join('; '))
  process.exit(1)
}
console.log('PERF-010: gallery, card, item and canvas photos in Space blocks are lazy')
