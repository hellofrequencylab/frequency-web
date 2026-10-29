// The Temple Theme Kit's art is in the repo under public/sites/temple-kit, byte for byte as the design ships it.
// Usage: node scripts/probes/temple-kit-assets.mjs photos glyphs textures   (any subset; counts below)
import { existsSync, readdirSync } from 'node:fs'

const WANT = { photos: [14, /\.jpg$/], glyphs: [10, /\.svg$/], textures: [24, /\.svg$/] }
const kinds = process.argv.slice(2)
let bad = 0
for (const k of kinds.length ? kinds : Object.keys(WANT)) {
  const dir = `public/sites/temple-kit/${k}`
  const [n, re] = WANT[k]
  const found = existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).length : 0
  if (found !== n) {
    console.error(`${dir}: ${found} of ${n} files`)
    bad++
  }
}
process.exit(bad ? 1 : 0)
