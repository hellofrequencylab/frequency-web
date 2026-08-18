import { describe, it, expect } from 'vitest'
import {
  MIN_NAMED_STATES,
  MIN_UI_PRIMITIVES,
  STATE_VOCABULARY,
  coveredModules,
  evaluateUiStates,
  isStateTest,
  loadUiStateLedger,
  readUiDir,
  statesNamed,
  testTitles,
} from './check-elements.mjs'

// Locks the UI-primitive STATE-TEST ratchet — Lift 8d of docs/UX-MATURITY-PLAN.md, the gate
// docs/INTERACTION-STATES.md §6 describes. The classifier lives in scripts/check-elements.mjs
// (Lift 8d says "extend check:elements"); this file is its ENFORCEMENT, the way
// scripts/check-elements.test.ts is the enforcement for the embeddable-elements half. Vitest
// auto-discovers `*.test.ts`, so unlike a `check:*` array entry it cannot be forgotten.
//
// ⚠️ NON-VACUITY IS THE POINT OF THIS FILE. A ratchet whose failure path is never exercised is a
// ratchet nobody has ever seen fire. The three arms below drive the classifier over VIRTUAL
// directories — a Map of {filename → source}, no filesystem — so each failure mode is proven on
// every run rather than the day it first bites:
//   1. a NEW primitive with no state test          → `missing` fires
//   2. the same primitive once its test lands      → `missing` clears
//   3. a GRANDFATHERED primitive that gains a test → `graduated` fires (the ratchet only shrinks)

/** A state test that names five of the nine states in its titles — the shape of switch.test.tsx. */
const STATE_TEST = (mod: string) => `
import { Thing } from './${mod}'
describe('Thing rest + hover', () => {
  it('renders the variant tokens at rest and a hover step', () => {})
})
describe('Thing pressed', () => {
  it('carries .press, the one sanctioned pressed state', () => {})
})
describe('Thing disabled', () => {
  it('is a real disabled attribute, not a no-op handler', () => {})
})
describe('Thing loading', () => {
  it('marks itself aria-busy and blocks the double-fire', () => {})
})
`

/** A test that imports the primitive but names no states — a render/style test, not a state test. */
const RENDER_TEST = (mod: string) => `
import { Thing } from './${mod}'
describe('Thing', () => {
  it('paints no raw colour of its own', () => {})
  it('merges a caller className', () => {})
})
`

describe('the state vocabulary (INTERACTION-STATES §1)', () => {
  it('carries all nine named states and no tenth', () => {
    expect(Object.keys(STATE_VOCABULARY)).toEqual([
      'rest',
      'hover',
      'pressed',
      'focus-visible',
      'loading',
      'empty',
      'error',
      'disabled',
      'optimistic-pending',
    ])
  })

  it('reads titles, not assertions — a .press in a className check names nothing', () => {
    const src = "describe('Thing', () => { it('renders', () => { expect(c).toContain('press') }) })"
    expect(testTitles(src)).toEqual(['Thing', 'renders'])
    expect(statesNamed(src)).toEqual([])
  })

  it('reads a template-literal title too, so a parameterised suite still counts', () => {
    const src = 'describe(`Thing hover + disabled + loading`, () => {})'
    expect(statesNamed(src).sort()).toEqual(['disabled', 'hover', 'loading'])
  })

  it('does not count `skeleton` as loading — that is a component name, not a state', () => {
    expect(statesNamed("it('renders the Skeleton shimmer', () => {})")).toEqual([])
  })

  it(`needs ${MIN_NAMED_STATES} distinct states, so two is not yet a state test`, () => {
    expect(isStateTest("it('rest and hover', () => {})")).toBe(false)
    expect(isStateTest("it('rest, hover and disabled', () => {})")).toBe(true)
  })

  it('maps every import form to the same module name', () => {
    const src =
      "import a from './field'\nimport b from '@/components/ui/switch.tsx'\nimport './checkbox'\n"
    expect(coveredModules(src).sort()).toEqual(['checkbox', 'field', 'switch'])
  })
})

describe('the ratchet fires — arm 1: a NEW primitive with no state test', () => {
  it('fails, naming the primitive', () => {
    const files = new Map([
      ['fixture-widget.tsx', 'export function FixtureWidget() { return null }\n'],
      ['switch.tsx', 'export function Switch() { return null }\n'],
      ['switch.test.tsx', STATE_TEST('switch')],
    ])
    const r = evaluateUiStates({ files, ledger: new Set(['components/ui/switch.tsx']) })
    expect(r.missing).toEqual(['components/ui/fixture-widget.tsx'])
  })

  it('a test that IMPORTS it but names no states does not save it', () => {
    const files = new Map([
      ['fixture-widget.tsx', 'export function FixtureWidget() { return null }\n'],
      ['fixture-widget.test.tsx', RENDER_TEST('fixture-widget')],
    ])
    expect(evaluateUiStates({ files, ledger: new Set() }).missing).toEqual([
      'components/ui/fixture-widget.tsx',
    ])
  })

  it('a state test that never IMPORTS it does not save it either', () => {
    const files = new Map([
      ['fixture-widget.tsx', 'export function FixtureWidget() { return null }\n'],
      ['other.test.tsx', STATE_TEST('somewhere-else')],
    ])
    expect(evaluateUiStates({ files, ledger: new Set() }).missing).toEqual([
      'components/ui/fixture-widget.tsx',
    ])
  })
})

describe('the ratchet clears — arm 2: the same primitive once its state test lands', () => {
  it('passes, and counts the primitive as tested', () => {
    const files = new Map([
      ['fixture-widget.tsx', 'export function FixtureWidget() { return null }\n'],
      ['fixture-widget.test.tsx', STATE_TEST('fixture-widget')],
    ])
    const r = evaluateUiStates({ files, ledger: new Set() })
    expect(r.missing).toEqual([])
    expect(r.tested).toEqual(['components/ui/fixture-widget.tsx'])
  })

  it('one shared test file can cover several primitives it imports', () => {
    const files = new Map([
      ['select.tsx', 'export function Select() { return null }\n'],
      ['checkbox.tsx', 'export function Checkbox() { return null }\n'],
      [
        'select-checkbox.test.tsx',
        "import './select'\nimport './checkbox'\n" + STATE_TEST('select'),
      ],
    ])
    expect(evaluateUiStates({ files, ledger: new Set() }).missing).toEqual([])
  })
})

describe('the ratchet only shrinks — arm 3: a grandfathered primitive that GAINS a test', () => {
  it('fails until it is un-grandfathered', () => {
    const files = new Map([
      ['legacy-widget.tsx', 'export function LegacyWidget() { return null }\n'],
      ['legacy-widget.test.tsx', STATE_TEST('legacy-widget')],
    ])
    const ledger = new Set(['components/ui/legacy-widget.tsx'])
    const r = evaluateUiStates({ files, ledger })
    expect(r.graduated).toEqual(['components/ui/legacy-widget.tsx'])
    expect(r.missing).toEqual([])
  })

  it('clears once the entry leaves the ledger, and never re-enters silently', () => {
    const files = new Map([
      ['legacy-widget.tsx', 'export function LegacyWidget() { return null }\n'],
      ['legacy-widget.test.tsx', STATE_TEST('legacy-widget')],
    ])
    const r = evaluateUiStates({ files, ledger: new Set() })
    expect(r.graduated).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('a ledger entry whose file is gone fails too — a deleted primitive is not debt', () => {
    const r = evaluateUiStates({
      files: new Map([['switch.tsx', 'export function Switch() { return null }\n']]),
      ledger: new Set(['components/ui/switch.tsx', 'components/ui/deleted.tsx']),
    })
    expect(r.vanished).toEqual(['components/ui/deleted.tsx'])
  })
})

describe('check:elements · the live kit', () => {
  it('read a real kit, so silence means something (the non-triviality floor)', () => {
    expect(evaluateUiStates().primitives.length).toBeGreaterThanOrEqual(MIN_UI_PRIMITIVES)
  })

  it('every primitive either ships a state test or is on the frozen ledger', () => {
    const { missing } = evaluateUiStates()
    expect(missing, `\n  new primitive(s) with no state test:\n${missing.map((p: string) => `    - ${p}`).join('\n')}\n`).toEqual([])
  })

  it('no grandfathered primitive has quietly gained a state test (bank it: --update)', () => {
    const { graduated } = evaluateUiStates()
    expect(graduated, `\n  bank these:\n${graduated.map((p: string) => `    - ${p}`).join('\n')}\n`).toEqual([])
  })

  it('no ledger entry names a file that no longer exists', () => {
    const { vanished } = evaluateUiStates()
    expect(vanished, `\n  stale ledger entr(ies):\n${vanished.map((p: string) => `    - ${p}`).join('\n')}\n`).toEqual([])
  })

  it('the ledger is a strict subset of the kit, sorted and de-duplicated', () => {
    const ledger = [...loadUiStateLedger()]
    expect(ledger).toEqual([...new Set(ledger)])
    expect(ledger).toEqual([...ledger].sort())
    expect(ledger.length).toBeLessThan(evaluateUiStates().primitives.length)
  })

  it(`the ${MIN_NAMED_STATES}-state threshold is what excludes the known false positives`, () => {
    // avatar.test.tsx says "focus" about a focal POINT and ".dimmed" about a receded avatar. It
    // names exactly 2 under this vocabulary, which is why the floor is 3 and not 2. If this ever
    // fails because avatar gained a real state test, drop it from the ledger — do not lower the floor.
    const src = readUiDir().get('avatar.test.tsx') as string | undefined
    expect(src, 'components/ui/avatar.test.tsx moved; re-anchor this evidence').toBeTypeOf('string')
    expect(statesNamed(src!).length).toBeLessThan(MIN_NAMED_STATES)
  })
})
