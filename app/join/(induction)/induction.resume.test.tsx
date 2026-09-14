// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE INDUCTION RESUMES. IT USED TO RESTART, EVERY TIME (2026-09-11).
//
// `initialBeat` existed and only the /pages/splash editor's preview ever passed it, so the real
// /join page always mounted the flow at beat 0. Nothing read a visitor's progress back. The copy
// under the Beat-0 email field promised "Your email saves your spot so you can finish later" and
// `step_reached` was written to the lead row and never read, so the promise was never kept.
//
// That alone is a bad funnel. Paired with the app-shell gate it is a LOCKOUT: a member whose
// profile carries no onboarding_completed flag is redirected to /join on every sign-in
// (app/(main)/layout.tsx), lands on beat 0, and has no way through but to finish all four beats
// in one unbroken sitting. Nine real accounts sat in that loop; eight signed in exactly once and
// never came back.
//
// These tests measure the CONSEQUENCE — that a parked run comes back with its answers, and that
// advancing parks one — rather than the presence of the code that does it. The last test is a
// source-shape guard on the PAGE, because the defect was never in the component: the component
// always accepted `initialBeat`, and the page simply never passed it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Typed to the one argument the action takes, so the assertions below read the parked run
 *  rather than an `unknown` tuple. */
const stash = vi.fn(async (_data: Record<string, unknown>) => ({}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/join',
}))
vi.mock('./actions', () => ({
  completeInduction: async () => ({}),
  stashPendingInduction: (data: Record<string, unknown>) => stash(data),
}))
vi.mock('./lead-actions', () => ({ captureLead: async () => ({}), updateLead: async () => ({}) }))
vi.mock('./persona-log', () => ({ logPersonaSelection: async () => ({}) }))
vi.mock('@/app/(main)/settings/profile/actions', () => ({ uploadProfileImageAction: async () => ({}) }))
vi.mock('@/app/sign-in/actions', () => ({ signInWithMagicLink: async () => ({}), signInWithGoogle: async () => ({}) }))

const { default: FunnelInduction } = await import('./induction')

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  stash.mockClear()
  // The handle-uniqueness probe is a courtesy call the component already swallows; stub it so a
  // resumed handle does not reach the network from a unit test.
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ available: true }) })))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  vi.unstubAllGlobals()
})

type ResumeProps = Parameters<typeof FunnelInduction>[0]

async function mount(props: ResumeProps) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<FunnelInduction {...props} />)
    await Promise.resolve()
  })
}

const field = (id: string) => container!.querySelector<HTMLInputElement>(`#${id}`)

/** The parked run of someone who got as far as the profile beat and stopped. */
const PARKED = {
  initialBeat: 2,
  initialDisplayName: 'Meghan Riley',
  initialLocation: 'Asheville, North Carolina',
  initialLat: 35.5951,
  initialLng: -82.5515,
  parkedHandle: 'meghanriley',
} as const

describe('the induction resumes a parked run', () => {
  it('reopens on the beat it was left on, not beat 0', async () => {
    await mount({ ...PARKED })
    // Beat 2 renders the profile fields; beat 0 renders the email capture. The fields are the
    // observable difference, and they are what a visitor sees.
    expect(field('induction-name')).not.toBeNull()
    expect(container!.querySelector('#induction-email')).toBeNull()
  })

  it('brings the answers back with it, so the restored beat is not a blank form', async () => {
    await mount({ ...PARKED })
    expect(field('induction-name')?.value).toBe('Meghan')
    expect(field('induction-last-name')?.value).toBe('Riley')
    expect(field('induction-city')?.value).toBe('Asheville, North Carolina')
  })

  it('keeps the handle they already settled on rather than re-deriving it from the name', async () => {
    await mount({ ...PARKED })
    expect(field('induction-handle')?.value).toBe('meghanriley')
  })

  it('splits a mononym without inventing a surname', async () => {
    await mount({ ...PARKED, initialDisplayName: 'Prince' })
    expect(field('induction-name')?.value).toBe('Prince')
    expect(field('induction-last-name')?.value).toBe('')
  })

  it('starts clean when nothing is parked', async () => {
    await mount({})
    expect(container!.querySelector('#induction-email')).not.toBeNull()
    expect(field('induction-name')).toBeNull()
  })
})

describe('advancing parks the run', () => {
  it('parks the beat and the answers on arrival at a beat', async () => {
    await mount({ ...PARKED })
    expect(stash).toHaveBeenCalled()
    const parked = stash.mock.calls[0]![0]
    expect(parked.beat).toBe(2)
    expect(parked.displayName).toBe('Meghan Riley')
    expect(parked.handle).toBe('meghanriley')
    expect(parked.location).toBe('Asheville, North Carolina')
  })

  it('parks nothing for a visitor who has only just landed', async () => {
    await mount({})
    expect(stash).not.toHaveBeenCalled()
  })

  it('never parks in preview, like every other cookie this flow writes', async () => {
    await mount({ ...PARKED, preview: true })
    expect(stash).not.toHaveBeenCalled()
  })
})

describe('the page wires the resume through (the defect was here, not in the component)', () => {
  const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

  it('reads the parked run', () => {
    expect(page).toMatch(/readPendingInduction\(\)/)
  })

  it('passes a beat to BOTH renders — signed-out and signed-in reach this flow', () => {
    expect(page).toMatch(/initialBeat:\s*parked\.beat/)
    // Spread into each of the two FunnelInduction renders.
    expect(page.match(/\{\.\.\.resume\}/g) ?? []).toHaveLength(2)
  })
})
