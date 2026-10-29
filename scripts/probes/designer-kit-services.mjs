// The Designer Theme Kit's Services page: every profile kit carries a `services` page of the Space's own offers, and
// the kit's own links can point at it. Fails on main (no services page, no ~/services route).
import { readFileSync } from 'node:fs'

const src = readFileSync('lib/sites/kits/designer-profile-variants.ts', 'utf8')
let bad = 0
const fail = (m) => {
  console.error(`designer-kit services: ${m}`)
  bad++
}
if (!/slug: 'services'/.test(src)) fail('no services page in the profile kits')
if (!/case 'services': return '~\/services'/.test(src)) fail('routeHref does not route services')
if (!/new Set\(\[[^\]]*'services'/.test(src)) fail('pageSet does not list services')
process.exit(bad ? 1 : 0)
