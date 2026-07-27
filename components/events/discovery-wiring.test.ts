import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// THE EVENTS DISCOVERY LAYER MUST STAY MOUNTED.
//
// Four pieces were built, documented in docs/EVENTS-SYSTEM.md as shipped, and never rendered:
// the map toggle, the "For You" ranking, the per-event AI blurb, and the connector suggestions.
// Nothing failed — the modules compiled, their tests passed, and `showForYou` / `mapPins` were
// computed on every /events request and then dropped on the floor. An orphan is invisible to tsc,
// eslint and the unit suite by construction, so the only thing that can catch it is a test that
// asserts the import graph reaches a real route.
//
// A plain "does anything import it" check is the right shape here: these are presentational
// compositions whose behaviour is covered by their own tests; what regressed was reachability.

const ROOTS = ['app', 'lib', 'components']
const EXT = /\.(ts|tsx)$/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (EXT.test(e.name) && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

const FILES = ROOTS.flatMap(walk).map((f) => ({ path: f, src: readFileSync(f, 'utf8') }))

/** Non-test files importing a module by its `@/` alias, excluding the module itself. */
function importersOf(mod: string): string[] {
  const needle = `from '@/${mod}'`
  return FILES.filter((f) => f.src.includes(needle) && !f.path.startsWith(mod)).map((f) => f.path)
}

const DISCOVERY_MODULES = [
  'components/events/events-map-client', // the list/map toggle
  'components/events/event-connectors', // "People to meet"
  'components/events/events-for-you', // the ranked lane
  'lib/events/matching', // the hybrid interest+social+context score
  'lib/ai/event-blurb', // the "why you'd vibe" blurb
  'lib/events/connectors', // the connector query behind EventConnectors
]

describe('the events discovery layer is reachable from a real route', () => {
  for (const mod of DISCOVERY_MODULES) {
    it(`${mod} has at least one non-test importer`, () => {
      expect(importersOf(mod), `${mod} is orphaned again`).not.toEqual([])
    })
  }

  it('the events surface mounts the map toggle and both personalized lanes', () => {
    const surface = readFileSync('components/marketplace/events-surface.tsx', 'utf8')
    expect(surface).toContain('<EventsMapToggle')
    expect(surface).toContain('<EventsForYou')
    expect(surface).toContain('<EventConnectors')
    // Both slow lanes must stream rather than block the shell (PAGE-FRAMEWORK §5).
    expect(surface).toContain('Suspense')
  })

  it('the index still computes the data those lanes consume', () => {
    const indexData = readFileSync('app/(main)/events/index-data.ts', 'utf8')
    // If these are ever dropped, the mounts above must go too — otherwise the page pays for a
    // computation nothing renders, which is exactly the state this test exists to prevent.
    expect(indexData).toContain('mapPins')
    expect(indexData).toContain('showForYou')
  })

  it('the walker actually found files (guards against a silently empty scan)', () => {
    expect(FILES.length).toBeGreaterThan(500)
  })
})
