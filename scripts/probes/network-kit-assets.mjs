// The Network Theme Kit's photos and placeholders are in the repo under public/sites/network-kit/photos,
// byte for byte as the design ships them (sha256 from docs/design-systems/network/inventory.json).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const inv = JSON.parse(readFileSync('docs/design-systems/network/inventory.json', 'utf8'))
const files = (Array.isArray(inv) ? inv : inv.files ?? []).filter((f) => /^assets\/images\/(photo|placeholder)-\d+\.(jpg|png)$/.test(f.path))
let bad = files.length === 19 ? 0 : 1
if (bad) console.error(`inventory lists ${files.length} images, expected 19`)
for (const f of files) {
  const p = `public/sites/network-kit/photos/${basename(f.path)}`
  if (!existsSync(p)) { console.error(`missing ${p}`); bad++; continue }
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex')
  if (sha !== f.sha256) { console.error(`${p}: sha256 differs from the design`); bad++ }
}
process.exit(bad ? 1 : 0)
