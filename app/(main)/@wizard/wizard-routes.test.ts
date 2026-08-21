import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ROUTING CONTRACT BEHIND THE SPARK MODAL (ADR-1017).
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
//   4. THE DESTINATION OPENS NO WINDOW OF ITS OWN. The modal already wraps the destination in a
//      `StudioWindow`. A destination that ALSO opens one mounts two overlays at once: two focus
//      traps fighting for Tab, two body-scroll locks, stacked headers, and two close buttons with
//      different behaviour. `/events/new` shipped exactly that (ADR-1099) — it wrapped itself in
//      `EventEditorWindow`, which was correct on its two EDIT routes, where nothing intercepts
//      above it. The component was right twice and wrong once, which is why nobody saw it.
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROPERTY 4: the destination must not open a second window (ADR-1099).
//
// The opener list is DISCOVERED, not hardcoded: any component that renders `<StudioWindow` is one,
// so a wrapper written next week is covered without editing this file. Two are excluded by name and
// for opposite reasons — `studio-window.tsx` IS the primitive, and `wizard-modal.tsx` is the thing
// whose whole job is to open it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Strip comments before matching: a comment explaining why a wrapper was REMOVED must not read as
 *  a call site. That mistake has its own ADR (ADR-1097) and cost this repo a red build. */
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function windowOpeners(): string[] {
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) {
        if (p.endsWith(join('studio', 'studio-window.tsx')) || p.endsWith(join('studio', 'wizard-modal.tsx'))) continue
        if (!stripComments(read(p)).includes('<StudioWindow')) continue
        for (const m of read(p).matchAll(/export function ([A-Z]\w*)/g)) found.add(m[1])
      }
    }
  }
  walk('components')
  return [...found]
}

describe('property 4 — a wizard destination opens no window of its own', () => {
  const openers = windowOpeners()

  it('finds the window-opening wrappers by scanning, so a new one is covered automatically', () => {
    // A sanity floor, not a snapshot: if this hits zero the scan broke and every assertion below
    // would pass vacuously, which is the failure mode this whole file exists to refuse.
    expect(openers.length).toBeGreaterThanOrEqual(3)
    expect(openers).toContain('EventEditorWindow')
  })

  for (const { url, destination } of intercepts()) {
    it(`${url} renders its Spark bare`, () => {
      const src = stripComments(read(destination))
      expect(src).not.toContain('<StudioWindow')
      for (const opener of openers) expect(src).not.toContain(`<${opener}`)
    })
  }
})

describe('the wrappers stay where they were always correct', () => {
  // The fix is not "delete EventEditorWindow". It is right on the two EDIT routes, which have no
  // interceptor above them — and deleting it there would be a second, opposite regression.
  for (const p of [join('app', '(main)', 'events', '[slug]', 'edit', 'page.tsx'), join('app', '(main)', 'admin', 'events', '[id]', 'page.tsx')]) {
    it(`${p} still opens the event window`, () => {
      expect(existsSync(p)).toBe(true)
      expect(stripComments(read(p))).toContain('<EventEditorWindow')
    })
  }
})
