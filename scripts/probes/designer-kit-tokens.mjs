// The Designer Theme Kit declares the design system's own token vocabulary (gray, amber, space, text ramps and the
// rest) under the scoped Designer block. Fails on main before lib/theme/designer-kit-tokens.ts exists.
import { existsSync, readFileSync } from 'node:fs'

const f = 'lib/theme/designer-kit-tokens.ts'
if (!existsSync(f)) {
  console.error(`designer: ${f} is missing`)
  process.exit(1)
}
const css = readFileSync(f, 'utf8')
const need = ['--gray-50:', '--amber-700:', '--card-sheen:', '--space-24:']
const miss = need.filter((n) => !css.includes(n))
if (miss.length) console.error(`designer: kit tokens missing ${miss.join(', ')}`)
process.exit(miss.length ? 1 : 0)
