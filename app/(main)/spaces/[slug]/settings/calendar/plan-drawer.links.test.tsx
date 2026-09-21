// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import type { SpacePlan } from '@/lib/calendar/plans'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PROG-CAL2'S TWO REMAINING DELIVERABLES, AT THE DRAWER.
//
// `space_plans.links` was declared in the manifest, parsed by `parsePlanLinks`, and written `[]`
// forever, because no control in the product could type one. A control that renders is not the
// claim: the claim is that a link an operator types REACHES THE SAVE PATH, and that the fields
// around it are the manifest's rather than the drawer's own words.
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
  stage: 'plan',
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

beforeEach(() => saveSpacePlan.mockClear())

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  document.body.style.overflow = ''
})

async function mount(plan: SpacePlan = PLAN) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<PlanDrawer slug="temple" plan={plan} open onClose={() => {}} />)
  })
}

const byId = <T extends HTMLElement>(id: string) => document.body.querySelector<T>(`#${id}`)!
const form = () => document.body.querySelector('form')!

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** The repeat control names its Add by the group it adds to, so this cannot catch the to-do Add. */
const addLinkButton = () =>
  document.body.querySelector<HTMLButtonElement>(
    `button[aria-label="Add to ${SPACE_PLAN_MANIFEST.repeats![0].label}"]`,
  )!

async function submit() {
  await act(async () => {
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
  })
}

describe('the Plan drawer links field', () => {
  it('offers the manifest collection with its own name and its own row fields', async () => {
    await mount()
    const repeat = SPACE_PLAN_MANIFEST.repeats![0]
    expect(document.body.textContent).toContain(repeat.label)
    // The empty line is the manifest section's own description, not copy invented at the drawer.
    expect(document.body.textContent).toContain(
      SPACE_PLAN_MANIFEST.sections.find((s) => s.key === repeat.section)!.desc,
    )
  })

  it('shows a stored link in its controls, and carries it back out on Save', async () => {
    await mount({ ...PLAN, links: [{ url: 'https://example.com/deck', label: 'Deck' }] })
    expect(byId<HTMLInputElement>('links-0-url').value).toBe('https://example.com/deck')
    expect(byId<HTMLInputElement>('links-0-label').value).toBe('Deck')
    await submit()
    expect(saveSpacePlan.mock.calls[0]).toMatchObject([
      'temple',
      'p1',
      { links: [{ url: 'https://example.com/deck', label: 'Deck' }] },
    ])
  })

  it('lets an operator add one and reaches the save path with it', async () => {
    await mount()
    // Before the field existed this was unreachable: links could only ever save as [].
    await act(async () => addLinkButton().dispatchEvent(new MouseEvent('click', { bubbles: true })))
    type(byId<HTMLInputElement>('links-0-url'), 'https://example.com/run-of-show')
    type(byId<HTMLInputElement>('links-0-label'), 'Run of show')
    await submit()
    expect(saveSpacePlan.mock.calls[0]).toMatchObject([
      'temple',
      'p1',
      { links: [{ url: 'https://example.com/run-of-show', label: 'Run of show' }] },
    ])
  })

  it('says a row will not be saved before the server drops it in silence', async () => {
    await mount()
    await act(async () => addLinkButton().dispatchEvent(new MouseEvent('click', { bubbles: true })))
    type(byId<HTMLInputElement>('links-0-url'), 'example.com')
    expect(document.body.textContent).toContain('One link needs')
    type(byId<HTMLInputElement>('links-0-url'), 'https://example.com')
    expect(document.body.textContent).not.toContain('One link needs')
  })
})

describe('the Plan drawer fields', () => {
  it('are the manifest fields, by their declared paths and labels', async () => {
    await mount()
    for (const field of SPACE_PLAN_MANIFEST.fields) {
      if (field.path === 'stage') continue // the stepper stands in for it (ADR-1520)
      const control = document.body.querySelector(`#${field.path}`)
      expect(control, `no control for ${field.path}`).not.toBeNull()
      expect(document.body.querySelector(`label[for="${field.path}"]`)!.textContent).toBe(field.label)
    }
  })

  it('still carries every one of them through Save', async () => {
    await mount()
    type(byId<HTMLInputElement>('title'), 'Royal Temple Edit, second pass')
    type(byId<HTMLTextAreaElement>('notes'), 'Load in at four.')
    await submit()
    expect(saveSpacePlan.mock.calls[0]).toMatchObject([
      'temple',
      'p1',
      { title: 'Royal Temple Edit, second pass', notes: 'Load in at four.', stage: 'plan', targetKind: 'event' },
    ])
  })
})
