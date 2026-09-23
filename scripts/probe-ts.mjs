// LET A BACKLOG PROBE MEASURE BEHAVIOUR, NOT SPELLING (LIVE-475).
//
// WHY THIS EXISTS. An adversarial audit mutated shipped calendar code 30 ways and re-ran the closed
// rows' probes: 26 of the 30 behaviour-breaking mutations left every probe green. The probes were
// string greps over source, so they measured how the code was SPELLED. The suite caught 8 of the 9
// misses that were tested, which says the product was protected and the ledger's own gate was not.
//
// The obvious repair — point the probe at the vitest files that already measure the consequence —
// is closed to us, and deliberately: LIVE-034 is a closed row whose own probe FAILS the build if any
// `verify.cmd` spawns a test runner (ten probes used to, the guard cost 24s, and the fix was to
// measure the same consequence in-process). scripts/backlog-contract.test.ts then holds every probe
// under a 4.5s CPU ceiling, and one `vitest run` of the eight files LIVE-467 touches costs ~11.5s.
//
// So a probe imports the REAL module and runs it. Node can strip TypeScript types on its own
// (`--experimental-strip-types`); what it cannot do is resolve this repo's two module conventions:
// the `@/…` alias from tsconfig `paths`, and an extensionless relative import ('./workflow-board'),
// which is what a bundler resolves and a plain node import does not. This hook resolves both, and
// nothing else: it is a resolver, never a transform, so what a probe imports is the shipped file.
//
// Use it from a probe as:
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs -e "…"
// and `import('./lib/…​.ts')` inside. It costs ~60ms on top of node's own start.
//
// ⛔ NOT for .tsx. Type stripping does not handle JSX, so a React component cannot be imported this
// way. A consequence that is only visible once something is RENDERED belongs to the suite; the probe
// for such a row measures the pure decision the component reads (see `calendarChrome` in
// lib/events/calendar-grid.ts) and leaves the pixels to the render test that already pins them.
import { registerHooks } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
const pick = (base) => CANDIDATES.map((ext) => base + ext).find((f) => existsSync(f) && statSync(f).isFile())

registerHooks({
  resolve(spec, ctx, next) {
    let base = null
    if (spec.startsWith('@/')) base = resolve(process.cwd(), spec.slice(2))
    else if (spec.startsWith('.') && ctx.parentURL && ctx.parentURL.startsWith('file:')) {
      base = resolve(dirname(fileURLToPath(ctx.parentURL)), spec)
    }
    if (base) {
      const hit = pick(base)
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }
    }
    return next(spec, ctx)
  },
})
