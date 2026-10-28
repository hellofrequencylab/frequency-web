// The Designer kit's accent-soft tokens carry the design's literal values, not var() chains the test cannot resolve.
import { readFileSync } from 'node:fs'

const css = readFileSync('lib/theme/designer-kit-tokens.ts', 'utf8')
const need = ['--color-accent-soft:#F2DCB8;', '--th-accent-bg:#F8ECD8;', '--th-accent-soft:#F2DCB8;']
const miss = need.filter((n) => !css.includes(n))
if (miss.length) console.error(`designer: kit tokens still chained: ${miss.join(' ')}`)
process.exit(miss.length ? 1 : 0)
