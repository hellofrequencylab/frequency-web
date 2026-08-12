import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ROUTING CONTRACT BEHIND THE SPARK MODAL (ADR-1010).
//
// The owner wants a wizard that does not take you off the page. ADR-986 wants a create entry point
// that is a URL you can share, land on cold, and refresh. Intercepting + parallel routes satisfy
// both, but ONLY while three structural properties hold, and every one of them is the sort that
// breaks silently:
//
//   1. THE SLOT HAS A NULL DEFAULT. This is the entire ADR-986 half. A hard request for
//      /circles/new renders `children` (the real page) and `@wizard/default.tsx` (nothing). Delete
//      the default and Next 404s the slot instead; make it render the modal and a shared link
//      opens a dialog over an empty page.
//   2. THE MODAL RENDERS THE DESTINATION'S OWN PAGE MODULE. Not a copy, not a client twin. The
//      moment someone "simplifies" one of these into its own inlined wizard, the gate, the
//      redirect, the capability check and the autosave scope have two implementations, and the
//      shared-link path is the one nobody tests by hand.
//   3. THE LAYOUT ACCEPTS AND RENDERS THE SLOT. A parallel route that the layout never renders is
//      silently dead: no error, no warning, the modal simply never appears.
//
// These are file-shape assertions on purpose. The behaviour they protect cannot be exercised in
// jsdom (interception is a router mechanism, not a component one), so what is testable is the
// shape the router requires — which is exactly what a refactor breaks.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SLOT = join('app', '(main)', '@wizard')
const read = (p: string) => readFileSync(p, 'utf8')

/** Every intercepting route in the slot, as `{ dir, destination }`. Discovered, not hardcoded, so a
 *  seventh wizard added tomorrow is held to the same contract without editing this file. */
function intercepts(): { file: string; url: string; destination: string }[] {
  const out: { file: string; url: string; destination: string }[] = []
  const walk = (dir: string, trail: string[]) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(join(dir, e.name), [...trail, e.name])
      } else if (e.name === 'page.tsx' && trail.some((s) => /^\(\.{1,3}\)/.test(s))) {
        const url = '/' + trail.map((s) => s.replace(/^\(\.{1,3}\)/, '')).join('/')
        out.push({ file: join(dir, e.name), url, destination: join('app', '(main)', ...url.slice(1).split('/'), 'page.tsx') })
      }
    }
  }
  walk(SLOT, [])
  return out
}

describe('the @wizard slot', () => {
  it('exists and is wired into the layout it belongs to', () => {
    const layout = read(join('app', '(main)', 'layout.tsx'))
    // Accepted as a prop AND rendered. Accepting it without rendering is the silent-death case.
    expect(layout).toMatch(/wizard: React\.ReactNode/)
    expect(layout).toMatch(/\{wizard\}/)
  })

  // 🔴 THE ADR-986 HALF. If this file stops returning null, a shared link stops working.
  it('renders NOTHING by default, so a direct load or a refresh shows the wizard as a full page', () => {
    const file = join(SLOT, 'default.tsx')
    expect(existsSync(file)).toBe(true)
    expect(read(file)).toMatch(/return null/)
  })

  it('closes itself on a navigation that does not match, via a null catch-all', () => {
    const file = join(SLOT, '[...catchAll]', 'page.tsx')
    expect(existsSync(file)).toBe(true)
    expect(read(file)).toMatch(/return null/)
  })

  it('carries at least the six wizards this shipped with', () => {
    expect(intercepts().length).toBeGreaterThanOrEqual(6)
  })
})

describe('every intercepting route', () => {
  const routes = intercepts()

  it.each(routes)('$url intercepts a route that really exists', ({ destination }) => {
    expect(existsSync(destination)).toBe(true)
  })

  // 🔴 ONE ROUTE, TWO PRESENTATIONS, NO FORKED COMPONENT.
  it.each(routes)('$url renders the destination page module itself, not a copy of it', ({ file, url }) => {
    const src = read(file)
    // The import must name the destination page, through the repo's `@/` alias.
    expect(src).toContain(`from '@/app/(main)${url}/page'`)
    // And it must be wrapped in the modal rather than presented bare.
    expect(src).toContain("from '@/components/studio/wizard-modal'")
    expect(src).toMatch(/<WizardModal[\s>]/)
  })

  it.each(routes)('$url forwards searchParams when its destination reads them', ({ file, destination }) => {
    const dest = read(destination)
    if (!/export default async function \w+\(\{\s*\n?\s*searchParams/.test(dest)) return
    // A destination that branches on searchParams must not become a narrower door in the modal.
    expect(read(file)).toContain('searchParams={searchParams}')
  })
})

describe('the autosave scope is the same in both presentations', () => {
  // The draft key is derived from the PATHNAME plus the wizard's eyebrow (`draftScope`). Because
  // interception moves the URL to the wizard's own address, `usePathname()` returns the same string
  // whether the Spark is in the modal or on its own page — which is why a member can start in the
  // modal, refresh, and be offered their draft back on the full page. If the shell ever derives the
  // scope from something else, that equivalence quietly ends.
  it('SparkShell keys the draft on usePathname()', () => {
    const shell = read(join('components', 'studio', 'spark', 'spark-shell.tsx'))
    expect(shell).toMatch(/const pathname = usePathname\(\)/)
    expect(shell).toMatch(/draftScope\(\[pathname, eyebrow\]\)/)
  })

  it('SparkShell reports its draft up to the modal, so Discard can reach both copies', () => {
    const shell = read(join('components', 'studio', 'spark', 'spark-shell.tsx'))
    expect(shell).toMatch(/useReportWizardDraft\(\{/)
    expect(shell).toContain('discard: draft.discard')
  })
})
