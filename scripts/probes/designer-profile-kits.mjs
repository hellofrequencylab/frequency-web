// The Designer Theme Kit carries the design system's thirteen profile kits (pages of Designer blocks with the theme's
// photography) and the converted kit data. Fails on main before lib/sites/kits/designer-profile-variants.ts exists.
import { existsSync, readFileSync } from 'node:fs'

const need = ['lib/sites/kits/designer-profile-variants.ts', 'lib/themes/designer-kits.json']
const miss = need.filter((f) => !existsSync(f))
if (miss.length) {
  console.error(`designer: missing ${miss.join(', ')}`)
  process.exit(1)
}
const data = JSON.parse(readFileSync('lib/themes/designer-kits.json', 'utf8'))
const reg = readFileSync('lib/sites/kits/registry.ts', 'utf8')
const problems = []
if (!Array.isArray(data.kits) || data.kits.length !== 13) problems.push('designer-kits.json does not hold thirteen kits')
if (!reg.includes('designer-profile-')) problems.push('registry does not load designer-profile kits')
for (const k of data.kits ?? []) if (!/^#[0-9A-F]{6}$/i.test(k.accent?.base ?? '')) problems.push(`${k.id} has no accent`)
if (problems.length) console.error(`designer: ${problems.join('; ')}`)
process.exit(problems.length ? 1 : 0)
