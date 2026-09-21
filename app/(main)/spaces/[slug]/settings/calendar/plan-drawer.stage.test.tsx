// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PLAN_STAGE_DEFS, type SpacePlan } from '@/lib/calendar/plans'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PLAN DRAWER'S STAGE CONTROL (ADR-1520).
//
// A stepper that RENDERS is not proof of anything: the select rendered too. What had to survive
// the swap is the SAVE SEMANTICS — a step writes the same form state the select wrote, so every
// typed field is still there afterwards and nothing reaches the server until Save. So these
// assertions are about what an operator would lose if the conversion were done the easy way (a
// step that calls the save action on click, which is what an auto-saving stepper would be).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const saveSpacePlan = vi.fn(async () => ({ data: { id: 'p1' } }))

vi.mock('./plan-actions', () => ({
  saveSpacePlan: (...args: unknown[]) => saveSpacePlan(...(args as [])),
  listPlanTodos: async () => [],
  listPlanLinkableEvents: async () => [],
  planReadiness: async () => ({ gaps: [], href: null }),
  addPlanTodo: async () => ({ data: null }),
  setPlanTodoDone: async () => ({ data: null }),
  reanchorPlanTodos: async () => ({ data: null }),
  attachEventToPlan: async () => ({ data: null }),
  runPlanAgain: async () => ({ data: null }),
  sharePlanWithSpace: async () => ({ data: null }),
  acceptVeraChecklist: async () => ({ data: null }),
  veraPlanProposal: async () => null,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { PlanDrawer } = await import('./plan-drawer')

const PLAN: SpacePlan = {
  id: 'p1',
  spaceId: 's1',
  title: 'Royal Temple Edit',
  stage: 'pencil',
  notes: null,
  links: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-09-21T00:00:00Z',
  updatedAt: '2026-09-21T00:00:00Z',
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  saveSpacePlan.mockClear()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<PlanDrawer slug="temple" plan={PLAN} open onClose={() => {}} />)
  })
  return document.body
}

const stageGroup = () => document.body.querySelector('[role="group"][aria-label="Stage"]')!
const stageButtons = () => Array.from(stageGroup().querySelectorAll('button'))
// The fields are the manifest's now (ADR-1521), so a control is id'd by its manifest PATH.
const titleInput = () => document.body.querySelector<HTMLInputElement>('#title')!

/** React owns the input's value, so a typed character has to go in the way the browser sends it. */
function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('the Plan drawer stage control', () => {
  it('is the shared stepper, named by the registry, with no Stage dropdown left behind', async () => {
    await mount()
    expect(document.body.querySelector('#plan-stage')).toBeNull()
    // Each step carries its own number glyph beside its word; only a walked step trades it for a check.
    expect(stageButtons().map((b) => b.textContent)).toEqual(PLAN_STAGE_DEFS.map((d, i) => `${i + 1}${d.label}`))
    expect(stageButtons().map((b) => b.getAttribute('aria-current'))).toEqual(['step', null, null])
  })

  it('says what the current stage means, in the words the registry carries', async () => {
    await mount()
    const hint = document.body.querySelector('#plan-stage-hint')!
    expect(hint.textContent).toBe(PLAN_STAGE_DEFS.find((d) => d.stage === 'pencil')!.hint)
  })

  it('moves the stage in form state on click, and saves nothing', async () => {
    await mount()
    await act(async () => stageButtons()[2].click())
    expect(stageButtons().map((b) => b.getAttribute('aria-current'))).toEqual([null, null, 'step'])
    expect(saveSpacePlan).not.toHaveBeenCalled()
  })

  it('keeps every typed field through the click, and carries them all on Save', async () => {
    await mount()
    type(titleInput(), 'Royal Temple Edit, second pass')
    await act(async () => stageButtons()[1].click())
    // The whole point of writing the shared form state: the title the person typed is still there.
    expect(titleInput().value).toBe('Royal Temple Edit, second pass')
    expect(saveSpacePlan).not.toHaveBeenCalled()

    const form = document.body.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(saveSpacePlan).toHaveBeenCalledTimes(1)
    expect(saveSpacePlan.mock.calls[0]).toMatchObject([
      'temple',
      'p1',
      { title: 'Royal Temple Edit, second pass', stage: 'plan' },
    ])
  })
})
