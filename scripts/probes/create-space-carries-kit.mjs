// A /themes page that sends someone to Create a Space names the kit (`?kit=`), so the builder opens on the kit
// they were looking at. The links go through createSpaceHref (lib/create-space/href.ts), which carries only the
// kits the builder offers. Fails while a kit page builds the link by hand or leaves the kit off.
import { readFileSync } from 'node:fs'

const files = [
  ['components/frequency/site/pages/themes/frequency-midnight.tsx', /createSpaceHref\('midnight'\)/],
  ['components/frequency/site/pages/themes/frequency-designer.tsx', /createSpaceHref\('designer'\)/],
  ['components/frequency/site/pages/themes/frequency-network.tsx', /createSpaceHref\('network-kit'\)/],
  ['components/frequency/site/pages/themes/frequency-theme-kit.tsx', /createSpaceHref\(theme\)/],
]
const bad = files.filter(([f, re]) => !re.test(readFileSync(f, 'utf8'))).map(([f]) => f)
if (bad.length) {
  console.error(`Create a Space links do not carry the kit: ${bad.join(', ')}`)
  process.exit(1)
}
console.log('ok: kit pages send the kit to Create a Space')
