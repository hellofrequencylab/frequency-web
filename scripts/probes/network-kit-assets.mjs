// The Network Theme Kit's photos are in the repo under public/sites/network-kit/photos,
// byte for byte as the design ships them (sha256 from docs/design-systems/network/inventory.json).
// The seven placeholder PNGs (7.5 MB) were retired on the owner's word, 2026-11-02 (SCAN-1193): nothing renders them
// (the Designer kit's placeholder-0N keys resolve to dz-*.webp), so only the twelve photos are pinned now.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const inv = JSON.parse(readFileSync('docs/design-systems/network/inventory.json', 'utf8'))
const files = (Array.isArray(inv) ? inv : inv.files ?? []).filter((f) => /^assets\/images\/photo-\d+\.jpg$/.test(f.path))
let bad = files.length === 12 ? 0 : 1
if (bad) console.error(`inventory lists ${files.length} images, expected 12`)
for (const f of files) {
  const p = `public/sites/network-kit/photos/${basename(f.path)}`
  if (!existsSync(p)) { console.error(`missing ${p}`); bad++; continue }
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex')
  if (sha !== f.sha256) { console.error(`${p}: sha256 differs from the design`); bad++ }
}
process.exit(bad ? 1 : 0)
