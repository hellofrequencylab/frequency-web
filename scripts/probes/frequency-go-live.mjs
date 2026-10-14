// LIVE-922 (ADR-1737): production wears the Frequency design, switched by the one setting, while the
// committed tree stays DAWN so a rollback is unsetting a variable and redeploying.
//
// Two halves, both consequences:
//   1. THE TREE (holds before and after go-live). The committed per-design stubs are DAWN's, so a build
//      without the variable is DAWN; the switch reads one env setting and an unknown value is DAWN; the
//      go-live and rollback steps are written in docs/RUNBOOKS.md. Any of these failing is exit 1.
//   2. PRODUCTION (fails until the owner flips the switch). The live home page's <html> carries
//      data-design="frequency". A network failure is exit 79 (could not look), never a verdict.
import { readFileSync, readdirSync } from 'node:fs'

const fail = (m) => {
  console.error(`LIVE-922: ${m}`)
  process.exit(1)
}
const read = (f) => readFileSync(f, 'utf8')

// 1. The tree.
const stubs = readdirSync('app/themes/active').filter((f) => f.endsWith('.ts'))
if (stubs.length === 0) fail('app/themes/active holds no design stubs')
for (const f of stubs) {
  const code = read(`app/themes/active/${f}`).replace(/^\s*\/\/.*$/gm, '').trim()
  if (code !== 'export {}') fail(`app/themes/active/${f} is committed in a non-DAWN state (run pnpm design:use dawn)`)
}
if (!/export \{[^}]*\} from '\.\/dawn'/.test(read('lib/theme/design-fonts/active.ts')))
  fail('lib/theme/design-fonts/active.ts is committed pointing at another design')
const design = read('lib/theme/design.ts')
if (!/DEFAULT_DESIGN: DesignId = 'dawn'/.test(design)) fail('an unset or unknown switch no longer reads as DAWN')
if (!/resolveDesign\(process\.env\.NEXT_PUBLIC_SITE_DESIGN\)/.test(design)) fail('the design no longer comes from NEXT_PUBLIC_SITE_DESIGN')
const manifest = JSON.parse(read('public/manifest.json'))
if (manifest.theme_color !== '#FBFAF6') fail('public/manifest.json is committed with another design\'s chrome colour')
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
if (m[1] !== 'frequency') fail(`${url}/ still wears ${m[1]}; set NEXT_PUBLIC_SITE_DESIGN=frequency in Vercel Production and redeploy (docs/RUNBOOKS.md §8)`)
console.log(`ok: ${url}/ wears Frequency, and the committed tree is DAWN so a rollback is one variable and a redeploy`)
