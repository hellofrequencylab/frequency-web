// The marketing /create-a-space page matches its Claude Design handoff: every sentence of the prototype is in the
// repo and the design-system baseline is empty. Fails while any section of the design is not yet built.
import { readFileSync } from 'node:fs'

const base = JSON.parse(readFileSync('docs/design-systems/create-a-space/baseline.json', 'utf8'))
if (base.ids.length) {
  console.error(`${base.ids.length} known gap(s) between the design and the page remain in docs/design-systems/create-a-space/baseline.json`)
  process.exit(1)
}
console.log('ok: the page matches the design, baseline empty')
