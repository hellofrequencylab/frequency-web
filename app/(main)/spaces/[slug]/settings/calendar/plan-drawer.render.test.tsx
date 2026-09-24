// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlanDrawer } from './plan-drawer'
import type { SpacePlan } from '@/lib/calendar/plans'

// LIVE-467, findings 5, 6 and 7, in the drawer:
//   5. the to-do inputs sat inside the Save Plan form, so Enter saved the Plan and closed the
//      drawer with the to-do never added;
//   6. `gaps` started as [] so Readiness read "Ready for the next step" before the check returned,
//      and for good when it failed, because the call had no catch;
//   7. Run it again, Ask Vera and Share had no pending guard and no result line, so a double tap on
//      Run it again made two Plans and a single tap reported nothing.

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => ({
  addPlanTodo: vi.fn(async () => ({ data: undefined })),
  saveSpacePlan: vi.fn(async () => ({ data: { id: 'plan-1' } })),
  runPlanAgain: vi.fn(async () => ({ data: { id: 'plan-2', title: 'Open house (again)' } })),
  planReadiness: vi.fn(async () => ({ gaps: [] as string[], href: null as string | null })),
  sharePlanWithSpace: vi.fn(async () => ({ data: undefined })),
}))

vi.mock('./plan-actions', () => ({
  addPlanTodo: mocks.addPlanTodo,
  saveSpacePlan: mocks.saveSpacePlan,
  runPlanAgain: mocks.runPlanAgain,
  planReadiness: mocks.planReadiness,
  sharePlanWithSpace: mocks.sharePlanWithSpace,
  listPlanTodos: async () => [],
  listPlanLinkableEvents: async () => [],
  archiveSpacePlan: async () => ({ data: undefined }),
  attachEventToPlan: async () => ({ data: undefined }),
  acceptVeraChecklist: async () => ({ data: undefined }),
  reanchorPlanTodos: async () => ({ data: { moved: 0, anchorDay: null } }),
  setPlanTodoDone: async () => ({ data: undefined }),
  veraPlanProposal: async () => null,
}))

const plan: SpacePlan = {
  id: 'plan-1',
  spaceId: 'space-1',
  title: 'Open house',
  stage: 'plan',
  notes: null,
  links: [],
  files: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mocks.addPlanTodo.mockClear()
  mocks.saveSpacePlan.mockClear()
  mocks.runPlanAgain.mockClear()
  mocks.sharePlanWithSpace.mockClear()
  mocks.planReadiness.mockReset()
  mocks.planReadiness.mockResolvedValue({ gaps: [], href: null })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
}

const flush = () => act(async () => { await Promise.resolve() })
const readiness = () => document.querySelector('[data-plan-readiness]')
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PlanDrawer: Enter in a to-do input adds the to-do, never saves and closes', () => {
  it('Enter in "New to-do" calls addPlanTodo and leaves saveSpacePlan and onClose untouched', async () => {
    const onClose = vi.fn()
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={onClose} />)
    const input = document.querySelector('input[aria-label="New to-do"]') as HTMLInputElement
    await act(async () => setInput(input, 'Book the room'))
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await flush()
    expect(mocks.addPlanTodo).toHaveBeenCalledWith('lab', 'plan-1', 'Book the room', null, null)
    expect(mocks.saveSpacePlan).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Enter in the share field does nothing rather than saving the Plan', async () => {
    const onClose = vi.fn()
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={onClose} />)
    const share = document.querySelector('#plan-share') as HTMLInputElement
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => {
      share.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(mocks.saveSpacePlan).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('PlanDrawer: Readiness is honest before the check returns and when it fails', () => {
  it('reads Checking until planReadiness resolves, then the real answer', async () => {
    const pending = deferred<{ gaps: string[]; href: string | null }>()
    mocks.planReadiness.mockReturnValue(pending.promise)
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    expect(readiness()?.textContent).toBe('Checking')
    expect(readiness()?.textContent).not.toContain('Ready')
    await act(async () => {
      pending.resolve({ gaps: ['A location'], href: null })
      await pending.promise
    })
    expect(readiness()?.textContent).toBe('1 item still needed')
  })

  it('says it could not be checked when the call fails, instead of Ready', async () => {
    mocks.planReadiness.mockRejectedValue(new Error('offline'))
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    expect(readiness()?.textContent).toBe('Could not be checked')
    expect(document.body.textContent).toContain('Readiness could not be checked')
  })
})

describe('PlanDrawer: Run it again and Share wait for their round trip and say what they did', () => {
  it('Run it again is disabled while pending, so a second tap cannot make a second Plan', async () => {
    const pending = deferred<{ data: { id: string; title: string } }>()
    mocks.runPlanAgain.mockReturnValue(pending.promise as never)
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    const again = button('Run it again')
    expect(again.disabled).toBe(false)
    await act(async () => again.click())
    expect(again.disabled).toBe(true)
    await act(async () => again.click())
    expect(mocks.runPlanAgain).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve({ data: { id: 'plan-2', title: 'Open house (again)' } })
      await pending.promise
    })
    expect(document.querySelector('[data-plan-notice]')?.textContent).toContain('"Open house (again)"')
    expect(button('Run it again').disabled).toBe(false)
  })

  it('Share reports success and stays off until a Space id is typed', async () => {
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    expect(button('Share').disabled).toBe(true)
    const share = document.querySelector('#plan-share') as HTMLInputElement
    await act(async () => setInput(share, 'guest-space'))
    await act(async () => button('Share').click())
    await flush()
    expect(mocks.sharePlanWithSpace).toHaveBeenCalledWith('lab', 'plan-1', 'guest-space')
    expect(document.querySelector('[data-plan-notice]')?.textContent).toContain('Shared')
  })
})

// PROG-CAL14: A PLAN HOLDS IMAGES, and the drawer gained the whole collection because the MANIFEST
// declares it. Nothing in plan-drawer.tsx names an image, a picker or an upload; what is asserted
// here is that an owner can see what is attached and that saving carries it.
describe('PlanDrawer: the Images group comes from the manifest, through the Loom picker', () => {
  const IMAGE = { assetId: 'aaaaaaaa-0000-4000-a000-00000000000a', url: 'https://cdn.test/flyer.jpg' }
  const withImage: SpacePlan = { ...plan, files: [IMAGE] }

  it('shows the group, the attached picture, and the one door to the Loom', async () => {
    await mount(<PlanDrawer slug="lab" plan={withImage} open onClose={() => {}} />)
    // The heading is the manifest's label (the owner ruling: Images, not Files).
    expect([...document.querySelectorAll('p')].some((p) => p.textContent === 'Images')).toBe(true)
    // The cached url paints the thumbnail with no lookup, which is why the ref keeps one.
    expect(document.querySelector(`img[src="${IMAGE.url}"]`)).not.toBeNull()
    // One door, and it is the Loom: the slot offers Change for the picture it holds. A file input
    // here would be the new upload path the owner ruling forbids.
    expect(button('Change')).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('saves the reference, not the url, so the Loom can still find the Plan', async () => {
    await mount(<PlanDrawer slug="lab" plan={withImage} open onClose={() => {}} />)
    await act(async () => button('Save Plan').click())
    await flush()
    expect(mocks.saveSpacePlan).toHaveBeenCalledWith('lab', 'plan-1', expect.objectContaining({ files: [IMAGE] }))
  })

  it('carries the links and the images apart, rather than one collection into both groups', async () => {
    // The drawer used to hand the links rows to every repeat it mapped over. With two groups that
    // is not a cosmetic bug: the Images group would have edited the links and saved nothing.
    const both: SpacePlan = { ...withImage, links: [{ url: 'https://example.com/venue', label: 'Venue' }] }
    await mount(<PlanDrawer slug="lab" plan={both} open onClose={() => {}} />)
    await act(async () => button('Save Plan').click())
    await flush()
    expect(mocks.saveSpacePlan).toHaveBeenCalledWith(
      'lab',
      'plan-1',
      expect.objectContaining({ links: [{ url: 'https://example.com/venue', label: 'Venue' }], files: [IMAGE] }),
    )
  })
})
