// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RowDef } from '@/lib/entity-blocks/layout'

// ── THE POSITION MUST NEVER CHANGE TYPE ──────────────────────────────────────────────────────
//
// `EntityLayoutMount` wraps the app shell's entire content row: the left rail, `#main`, and the
// right-rail column (components/layout/app-shell.tsx). React reconciles by component TYPE at a
// position, so a mount that returns `<SpaceLayoutProvider key={slug}>` on some routes and
// `<ProfileLayoutProvider>` on others unmounts and rebuilds EVERYTHING BENEATH IT whenever a
// member crosses that line — which is the owner's "the whole shell blinks", and the third time
// this repo has paid for the two-parents shape (LIVE-472 remounted the calendar, LIVE-474 replayed
// its slide animation because of a DOM move).
//
// This is the control-and-case pair that proves it, and it is written in NODE IDENTITY rather than
// in rendered output on purpose: byte-identical HTML is exactly what a remount produces. Only
// `===` on the DOM node can tell "React kept this" from "React built a new one that looks the
// same". The children below stand in for the shell's four measured nodes.
//
// Before this fix, cases 2 and 3 produced different nodes. The control (case 1) passed then and
// passes now, which is what makes it a control: it shows the harness can observe preservation.

// React 19's `act` needs this flag set before the renderer is imported.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const usePathname = vi.fn<() => string>()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }))

const saveMemberGridLayout = vi.fn(async (..._a: unknown[]) => undefined)
const saveSpaceGridLayout = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/app/(main)/settings/profile/spotlight-actions', () => ({
  saveMemberGridLayout: (...a: unknown[]) => saveMemberGridLayout(...a),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({
  saveSpaceGridLayout: (...a: unknown[]) => saveSpaceGridLayout(...a),
}))

const { EntityLayoutMount, useEntityLayout } = await import('./profile-layout-context')

/** One valid row — the store runs `deriveBench` over it on every render, so the shape must be real. */
const ROW: RowDef = { id: 'r1', columns: 1, cells: [[]] }

/** The shell's content row, in miniature: the three nodes the investigation measured. */
function ShellRow() {
  return (
    <div data-testid="row">
      <nav data-testid="left-nav" />
      <main data-testid="main" />
      <div data-testid="rail-column">
        <aside data-testid="rail-body" />
      </div>
    </div>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const NODES = ['row', 'left-nav', 'main', 'rail-column', 'rail-body'] as const

function snapshot(): Record<string, Element> {
  const out: Record<string, Element> = {}
  for (const id of NODES) {
    const el = container.querySelector(`[data-testid="${id}"]`)
    expect(el, `${id} is in the document`).toBeTruthy()
    out[id] = el as Element
  }
  return out
}

function renderAt(pathname: string) {
  usePathname.mockReturnValue(pathname)
  act(() => {
    root.render(
      <EntityLayoutMount>
        <ShellRow />
      </EntityLayoutMount>,
    )
  })
}

/** Render at `from`, navigate to `to`, and report which of the shell's nodes survived. */
function navigate(from: string, to: string) {
  renderAt(from)
  const before = snapshot()
  renderAt(to)
  const after = snapshot()
  return NODES.filter((id) => before[id] !== after[id])
}

describe('EntityLayoutMount keeps the shell mounted across every navigation', () => {
  it('control: a member route to another member route rebuilds nothing', () => {
    expect(navigate('/feed', '/channels')).toEqual([])
  })

  it('a member route to a Space builder root rebuilds nothing', () => {
    // THE CASE. This is the one that used to replace the rail column, the rail body, the left nav
    // and #main all at once, because the mount flipped from ProfileLayoutProvider to
    // SpaceLayoutProvider at the same position.
    expect(navigate('/feed', '/spaces/acme')).toEqual([])
  })

  it('a Space builder root to ANOTHER Space rebuilds nothing', () => {
    // The `key={`space:${slug}`}` case. The key was load-bearing (it stopped Space A's store
    // rendering on Space B) and it is replaced by the in-place reset, not dropped — see below.
    expect(navigate('/spaces/acme', '/spaces/beta')).toEqual([])
  })

  it('a Space builder root back out to a member route rebuilds nothing', () => {
    expect(navigate('/spaces/acme', '/feed')).toEqual([])
  })
})

// ── What the remount USED to buy, bought again ───────────────────────────────────────────────
//
// Deleting the key is only safe if the two things it guaranteed still hold: the store must start
// FRESH for the new subject (it is "first mounter wins", so a stale seed would render Space A's
// layout on Space B), and the outgoing subject's mid-debounce edit must be persisted through the
// action bound to IT (flushing it through the incoming one writes A's layout onto B — data loss).

function Probe({ onStore }: { onStore: (s: ReturnType<typeof useEntityLayout>) => void }) {
  const store = useEntityLayout()
  onStore(store)
  return null
}

describe('the store resets itself when the subject changes', () => {
  it('drops a seeded layout and re-arms the first-mounter seed', () => {
    let store: ReturnType<typeof useEntityLayout> = null
    const render = (pathname: string) => {
      usePathname.mockReturnValue(pathname)
      act(() => {
        root.render(
          <EntityLayoutMount>
            <Probe onStore={(s) => { store = s }} />
          </EntityLayoutMount>,
        )
      })
    }

    render('/spaces/acme')
    expect(store!.kind).toBe('space')
    act(() => store!.seed([{ ...ROW }], []))
    expect(store!.seeded).toBe(true)
    expect(store!.rows).toHaveLength(1)

    render('/spaces/beta')
    // Same component instance (no remount, proven above) and yet an empty, unseeded store — so the
    // next mounter on Space B seeds Space B, exactly as a fresh mount would have.
    expect(store!.seeded).toBe(false)
    expect(store!.rows).toEqual([])
    expect(store!.canUndo).toBe(false)
    expect(store!.dirty).toBe(false)
  })

  it('switching kind switches the store kind without remounting', () => {
    let store: ReturnType<typeof useEntityLayout> = null
    const render = (pathname: string) => {
      usePathname.mockReturnValue(pathname)
      act(() => {
        root.render(
          <EntityLayoutMount>
            <Probe onStore={(s) => { store = s }} />
          </EntityLayoutMount>,
        )
      })
    }
    render('/feed')
    expect(store!.kind).toBe('member')
    render('/spaces/acme')
    expect(store!.kind).toBe('space')
  })

  it('flushes the outgoing subject through the OUTGOING save, never the incoming one', async () => {
    let store: ReturnType<typeof useEntityLayout> = null
    const render = (pathname: string) => {
      usePathname.mockReturnValue(pathname)
      act(() => {
        root.render(
          <EntityLayoutMount>
            <Probe onStore={(s) => { store = s }} />
          </EntityLayoutMount>,
        )
      })
    }

    render('/spaces/acme')
    // An edit inside the debounce window: pending, not yet written.
    act(() => store!.apply({ rows: [{ ...ROW }], hidden: [], content: {}, style: {} }))
    expect(saveSpaceGridLayout).not.toHaveBeenCalled()

    // Navigate before the debounce fires. The pending payload must still be written, and it must be
    // written with slug 'acme' — the subject it was authored on.
    render('/spaces/beta')
    await act(async () => { await Promise.resolve() })

    expect(saveSpaceGridLayout).toHaveBeenCalledTimes(1)
    expect(saveSpaceGridLayout.mock.calls[0]?.[0]).toBe('acme')
    expect(saveMemberGridLayout).not.toHaveBeenCalled()
  })
})
