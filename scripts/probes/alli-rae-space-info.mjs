// The Alli Rae Space page is filled from her site: the seed prints the business info, eight services, five FAQ rows and a layout
// that shows the filled blocks and hides the empty ones (LIVE-1928).
import { execFileSync } from 'node:child_process'

let bad = 0
const fail = (m) => {
  console.error(`alli-rae space info: ${m}`)
  bad++
}
const sql = execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/seed-alli-rae-space-info.mts'], { encoding: 'utf8' })
if ((sql.match(/\(sid, '/g) ?? []).length !== 5) fail('the seed does not write five FAQ rows')
for (const key of ['"address"', '"hours"', '"phone"', '"email"', '"socials"', '"about"', '"offerings"', '"profileLayout"'.slice(1, -1)]) if (!sql.includes(key)) fail(`the seed has no ${key}`)
if ((sql.match(/"priceModel":"contact"/g) ?? []).length !== 8) fail('the seed does not list eight services')
if (!sql.includes('cover_image_url') || !sql.includes('brand_logo_url')) fail('the seed sets no cover or logo')
process.exit(bad ? 1 : 0)
