import { describe, it, expect } from 'vitest'
import {
  SUBTREE_WINDOW,
  findNestedRadiusDefects,
  candidateFiles,
  openingTagIndent,
  childLines,
  childComponentNames,
  resolveLocalComponent,
} from './check-nested-radius.mjs'

// THE ENFORCING HALF of check:nested-radius. The .mjs owns the CLI and the file walk; this file is
// where the guard is proven to FIRE, because the first version of it did not.
//
// That is not a hypothetical. The detector was written, run against the tree, and printed a clean
// ✓ — and then a mutation sweep that reintroduced the defect at each of the fifteen sites it had
// just been used to fix showed EIGHT of them walking past it. The cause was a one-line assumption
// about where a JSX container ends (a multi-line tag closes its own `>` at the same indent as its
// `<`, so the subtree window terminated before it had seen a single child). A guard nobody has
// watched go red is not evidence of anything, and this file is the standing version of that sweep.

const FIXTURE_TSX = 'fixture.tsx'
const f = (source: string) => findNestedRadiusDefects([[FIXTURE_TSX, source]])

describe('the defect it exists to catch', () => {
  it('flags a bare rounded-control inside a rounded-card p-1 container', () => {
    expect(
      f(`      <div className="flex gap-1 rounded-card bg-surface p-1">
        <button className="rounded-control px-3 py-1.5">One</button>
      </div>`),
    ).toEqual([`${FIXTURE_TSX}:1`])
  })

  it('passes once the child uses the nested token', () => {
    expect(
      f(`      <div className="flex gap-1 rounded-card bg-surface p-1">
        <button className="rounded-control-nested px-3 py-1.5">One</button>
      </div>`),
    ).toEqual([])
  })

  // The regression that made this file necessary. The container's class string is on a
  // continuation line and the tag's own `>` sits at the opening tag's indent — a naive window
  // stops there and reports nothing.
  it('sees past a MULTI-LINE opening tag to the children below it', () => {
    expect(
      f(`        <div
          className="flex gap-1 rounded-card bg-surface-elevated/60 p-1"
          role="tablist"
          aria-label="Leaderboard scope"
        >
          {SCOPES.map(({ key }) => (
            <Link key={key} className="rounded-control px-3 py-1.5">
              {key}
            </Link>
          ))}
        </div>`),
    ).toEqual([`${FIXTURE_TSX}:2`])
  })

  // Arm B. The class lives in a helper the container renders by tag, four hundred lines away.
  it('follows a capitalised child into a component defined in the same file', () => {
    expect(
      f(`      <div className="flex gap-1 rounded-card border border-border bg-surface p-1">
        <TabBtn active label="Scan a card" />
        <TabBtn active={false} label="Manual entry" />
      </div>

function TabBtn({ active, label }: { active: boolean; label: string }) {
  return <button className="rounded-control px-3 py-2">{label}</button>
}`),
    ).toEqual([`${FIXTURE_TSX}:1`])
  })
})

describe('what it must NOT flag', () => {
  // A control that is a SIBLING of a card is correct at 14px. These outnumber the nested ones, and
  // a guard that fires on them is a guard that gets an allowlist and then gets ignored.
  it('ignores a rounded-control below the container it is a sibling of', () => {
    expect(
      f(`      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex gap-1 rounded-card bg-surface-elevated/60 p-1"
          role="tablist"
        >
          <Link className="rounded-control-nested px-3 py-1.5">Scope</Link>
        </div>

        <button className="ml-auto rounded-control px-3 py-1.5">Hide me</button>
      </div>`),
    ).toEqual([])
  })

  it('ignores a rounded-card without the p-1 inset', () => {
    expect(
      f(`      <div className="rounded-card bg-surface p-4">
        <button className="rounded-control px-3 py-1.5">One</button>
      </div>`),
    ).toEqual([])
  })

  it('does not read p-10 or sm:p-1.5 as the one-step inset', () => {
    for (const pad of ['p-10', 'sm:p-1.5', 'p-1.5']) {
      expect(
        f(`      <div className="rounded-card bg-surface ${pad}">
        <button className="rounded-control px-3 py-1.5">One</button>
      </div>`),
        `${pad} must not read as p-1`,
      ).toEqual([])
    }
  })

  it('does not mistake rounded-control-nested for the bare token', () => {
    expect(
      f(`      <div className="rounded-card p-1">
        <button className="rounded-control-nested px-3">One</button>
      </div>`),
    ).toEqual([])
  })

  it('reports a container ONCE however many offending children it has', () => {
    expect(
      f(`      <div className="rounded-card p-1">
        <button className="rounded-control px-3">One</button>
        <button className="rounded-control px-3">Two</button>
        <button className="rounded-control px-3">Three</button>
      </div>`),
    ).toEqual([`${FIXTURE_TSX}:1`])
  })
})

describe('the parts that do the approximating', () => {
  it('takes the indent from the opening tag, not the class-string line', () => {
    const lines = ['        <div', '          className="rounded-card p-1"', '        >']
    expect(openingTagIndent(lines, 1)).toBe(8)
  })

  it('gives up when no tag is in sight, rather than guessing', () => {
    expect(openingTagIndent(['const cls = "rounded-card p-1"'], 0)).toBeNull()
  })

  it('treats a self-closing container as having no children', () => {
    expect(childLines(['  <Foo className="rounded-card p-1" />', '  <Bar className="rounded-control" />'], 0, 2)).toEqual([])
  })

  it('names only capitalised child tags as helper candidates', () => {
    expect(childComponentNames(['<div><TabBtn /><span /><Icon /></div>']).sort()).toEqual(['Icon', 'TabBtn'])
  })

  it('resolves a same-file component and stops at the next top-level declaration', () => {
    const lines = [
      'function TabBtn() {',
      '  return <button className="rounded-control" />',
      '}',
      '',
      'function Other() {',
      '  return <button className="rounded-xl" />',
      '}',
    ]
    const body = resolveLocalComponent(lines, 'TabBtn')
    expect(body).toContain('rounded-control')
    expect(body).not.toContain('rounded-xl')
  })

  it('returns null for a component this file does not define — the declared blind spot', () => {
    expect(resolveLocalComponent(['import { Chip } from "@/components/ui/chip"'], 'Chip')).toBeNull()
  })
})

describe('the real tree', () => {
  it('reads enough files to be measuring something', () => {
    // A walk that finds nothing passes vacuously. The tree carried 8 real defects when this guard
    // was written; the floor is on the DENOMINATOR so an empty glob cannot read as compliance.
    expect(candidateFiles().length).toBeGreaterThan(50)
  })

  it('has no 14px corner nested inside a 24px p-1 container', () => {
    expect(findNestedRadiusDefects(candidateFiles())).toEqual([])
  })

  it('keeps the line cap a backstop, not the mechanism', () => {
    expect(SUBTREE_WINDOW).toBeGreaterThanOrEqual(30)
  })
})
