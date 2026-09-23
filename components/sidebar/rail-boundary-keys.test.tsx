// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Fragment, Suspense, act, startTransition, use, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── A BOUNDARY KEY MUST NOT ENCODE THE ROUTE ─────────────────────────────────────────────────
//
// The right rail used to build its page panels as
//   `pageRailPanels(pathname).map(key => <Suspense key={key} fallback={<PanelSkeleton/>}>…)`
// so a different route meant a different KEY SET, which means a different set of BOUNDARIES. A
// boundary that already has content keeps showing it while its new children load, even inside a
// transition. A boundary that is BRAND NEW has no content to keep, so it paints its fallback —
// and the whole rail drops to grey cards.
//
// The part that makes it look random: a layout does not re-render on navigation, so the rail holds
// the panel set from wherever the layout last rendered. The next thing that re-renders the layout
// does so at the CURRENT path, the key set changes underneath, and the rail flashes with nobody
// touching anything. components/presence/heartbeat.tsx fires a `pingPresence` server action every
// 90 seconds while the tab is visible; a server action that lands on a Supabase token refresh
// writes cookies and re-renders the layout.
//
// Below: the two shapes, driven by REAL React Suspense and REAL pending promises, and then a
// source assertion that right-sidebar.tsx ships the shape that does not flash.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A panel that suspends until its promise settles — the async server panel, in miniature. */
function Panel({ name, promises }: { name: string; promises: Map<string, Promise<string>> }) {
  const label = use(promises.get(name)!)
  return <div data-panel={name}>{label}</div>
}

function Skeleton() {
  return <div data-skeleton className="h-32 rounded-card border border-border bg-surface" />
}

/** THE OLD SHAPE: one boundary per panel, keyed by the panel key the route resolved to. */
function KeyedBoundaries({ keys, promises }: { keys: string[]; promises: Map<string, Promise<string>> }) {
  return (
    <>
      {keys.map((k) => (
        <Suspense key={k} fallback={<Skeleton />}>
          <Panel name={k} promises={promises} />
        </Suspense>
      ))}
    </>
  )
}

/** THE SHIPPED SHAPE: one boundary whose identity never mentions the route; panels are plain children. */
function OneStableBoundary({ keys, promises }: { keys: string[]; promises: Map<string, Promise<string>> }) {
  return (
    <Suspense fallback={null}>
      {keys.map((k) => (
        <Fragment key={k}>
          <Panel name={k} promises={promises} />
        </Fragment>
      ))}
    </Suspense>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A promise map where the named keys are already settled and everything else stays pending. */
function promisesFor(settled: string[]): Map<string, Promise<string>> {
  const map = new Map<string, Promise<string>>()
  for (const k of settled) map.set(k, Promise.resolve(`${k} panel`))
  return map
}

function addPending(map: Map<string, Promise<string>>, keys: string[]) {
  for (const k of keys) if (!map.has(k)) map.set(k, new Promise<string>(() => {}))
}

const counts = () => ({
  panels: container.querySelectorAll('[data-panel]').length,
  skeletons: container.querySelectorAll('[data-skeleton]').length,
})

/**
 * Settle the rail on `/feed`'s panel set, then re-render — inside `startTransition`, which is what
 * a router refresh does — with `/events`'s panel set, whose data has not arrived.
 */
async function flashAfterKeySetChange(Shape: (p: { keys: string[]; promises: Map<string, Promise<string>> }) => ReactNode) {
  const feedKeys = ['activity', 'circles']
  const eventKeys = ['activity', 'upcoming', 'rsvps']
  const promises = promisesFor(feedKeys)

  await act(async () => {
    root.render(<Shape keys={feedKeys} promises={promises} />)
  })
  const settled = counts()

  addPending(promises, eventKeys)
  await act(async () => {
    startTransition(() => root.render(<Shape keys={eventKeys} promises={promises} />))
  })
  return { settled, after: counts() }
}

/** The CONTROL: the same key set, with new pending data. Nothing about the boundaries changes. */
async function flashWithSameKeySet(Shape: (p: { keys: string[]; promises: Map<string, Promise<string>> }) => ReactNode) {
  const feedKeys = ['activity', 'circles']
  const promises = promisesFor(feedKeys)
  await act(async () => {
    root.render(<Shape keys={feedKeys} promises={promises} />)
  })
  const settled = counts()
  const fresh = new Map(promises)
  fresh.set('activity', new Promise<string>(() => {}))
  await act(async () => {
    startTransition(() => root.render(<Shape keys={feedKeys} promises={fresh} />))
  })
  return { settled, after: counts() }
}

describe('a rail boundary keyed by the route flashes; a stable one does not', () => {
  it('control: the same key set with pending data keeps every panel and shows no skeleton', async () => {
    const { settled, after } = await flashWithSameKeySet(KeyedBoundaries)
    expect(settled).toEqual({ panels: 2, skeletons: 0 })
    // This is the whole argument in one line: a boundary that ALREADY HAS CONTENT does not paint
    // its fallback in a transition, however long its new children take.
    expect(after).toEqual({ panels: 2, skeletons: 0 })
  })

  it('the old shape: a new key set replaces every panel with a skeleton', async () => {
    const { settled, after } = await flashAfterKeySetChange(KeyedBoundaries)
    expect(settled).toEqual({ panels: 2, skeletons: 0 })
    // `activity` is in BOTH key sets, so its boundary survives and holds its panel. The two whose
    // keys the route changed are new boundaries, and new boundaries paint. That is the rail
    // dropping to grey cards under a member who did nothing — and it is precisely proportional to
    // how much of the panel set the route changed, which is why it looks intermittent.
    expect(after).toEqual({ panels: 1, skeletons: 2 })
  })

  it('the shipped shape: a new key set keeps the rail on screen', async () => {
    const { settled, after } = await flashAfterKeySetChange(OneStableBoundary)
    expect(settled).toEqual({ panels: 2, skeletons: 0 })
    // Same boundary, so the settled panels stay up until the new ones are ready. Nothing blinks.
    expect(after).toEqual({ panels: 2, skeletons: 0 })
  })
})

/** Strip `/* … *\/` blocks and `// …` lines, so the assertions below read CODE and not the prose
 *  that quotes the defect it fixed. (The comments in right-sidebar.tsx name `<Suspense key={key}>`
 *  on purpose; a guard that cannot tell those apart would forbid explaining the bug.) */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[\t ]*\/\/.*$/gm, '')
}

describe('right-sidebar.tsx ships the stable shape', () => {
  const SRC = codeOnly(readFileSync(join(process.cwd(), 'components/sidebar/right-sidebar.tsx'), 'utf8'))
  const pagePanels = SRC.slice(SRC.indexOf('async function PagePanels'), SRC.indexOf('export default async function RightSidebar'))

  it('finds PagePanels at all (guards against a silently-empty slice)', () => {
    expect(pagePanels).toContain('pageRailPanels(pathname)')
    expect(pagePanels.length).toBeGreaterThan(200)
  })

  it('opens no Suspense boundary inside the per-route panel map', () => {
    expect(pagePanels).not.toContain('<Suspense')
  })

  it('never keys a boundary off a route-derived value anywhere in the rail', () => {
    // `<Suspense key=…>` is the exact spelling that caused this. There is no legitimate use of it
    // in this file: the rail's boundaries are fixed positions, not a list.
    expect(SRC).not.toMatch(/<Suspense[^>]*\bkey=/)
  })
})
