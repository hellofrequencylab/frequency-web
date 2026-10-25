// LIVE-922: Frequency is the platform default and the public deployment must wear it.
// Tree failures exit 1; unavailable public evidence exits 79.
import { readFileSync, readdirSync } from 'node:fs'
import { renderStubs } from '../lib/design-styles.mjs'

const fail = (m) => {
  console.error(`LIVE-922: ${m}`)
  process.exit(1)
}
const read = (f) => readFileSync(f, 'utf8')

// 1. The tree.
const expectedStubs = renderStubs('frequency', ['dawn', 'frequency'])
const stubs = readdirSync('app/themes/active').filter((f) => f.endsWith('.ts')).sort()
if (JSON.stringify(stubs) !== JSON.stringify(Object.keys(expectedStubs).map((name) => `${name}.ts`).sort()))
  fail('active stylesheet coverage differs from the Frequency source files')
for (const [name, source] of Object.entries(expectedStubs)) {
  if (read(`app/themes/active/${name}.ts`) !== source) fail(`${name}: active stylesheet does not load Frequency`)
}
if (!/export \{[^}]*\} from '\.\/frequency'/.test(read('lib/theme/design-fonts/active.ts')))
  fail('active fonts do not load Frequency')
const design = read('lib/theme/design.ts')
if (!/DEFAULT_DESIGN: DesignId = 'frequency'/.test(design)) fail('the platform default is not Frequency')
if (!/resolveDesign\(process\.env\.NEXT_PUBLIC_SITE_DESIGN\)/.test(design)) fail('the design no longer uses the canonical resolver')
const manifest = JSON.parse(read('public/manifest.json'))
if (manifest.theme_color !== '#F4F6F7' || manifest.background_color !== '#F4F6F7')
  fail('manifest chrome does not match Frequency')
const runbook = read('docs/RUNBOOKS.md')
if (!/## 8\. Design switch/.test(runbook) || !/NEXT_PUBLIC_SITE_DESIGN/.test(runbook) || !/Roll back/.test(runbook))
  fail('docs/RUNBOOKS.md has no design switch section with go-live and roll-back steps')

// 2. Production.
const url = (process.env.LIVE_922_URL || 'https://frequencylocal.com').replace(/\/$/, '')
let html
try {
  const res = await fetch(`${url}/`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    console.error(`LIVE-922: ${url}/ answered ${res.status}; cannot tell which design it wears`)
    process.exit(79)
  }
  html = await res.text()
} catch (e) {
  console.error(`LIVE-922: could not reach ${url}/ (${e?.message ?? e}); cannot tell`)
  process.exit(79)
}
const m = /<html[^>]*\sdata-design="([a-z]+)"/.exec(html)
if (!m) {
  console.error(`LIVE-922: ${url}/ carries no data-design on <html>; cannot tell`)
  process.exit(79)
}
if (m[1] !== 'frequency') fail(`${url}/ still wears ${m[1]}; deploy the Frequency platform source (docs/RUNBOOKS.md §8)`)
console.log(`ok: ${url}/ wears Frequency, and the committed tree loads Frequency`)
