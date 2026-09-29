// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlanDrawer } from './plan-drawer'
import type { SpacePlan } from '@/lib/calendar/plans'
import type { PlanCommentView } from '@/lib/calendar/plan-comments'
import type { PlanActivityView } from '@/lib/calendar/plan-activity'
import type { CrmTask } from '@/lib/crm/tasks'

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
  sharePlanWithSpace: vi.fn(async () => ({ data: { id: 'share-1' } })),
  listPlanShares: vi.fn(async () => ({ data: { options: [{ value: 'space-guest', label: 'The Green Room' }], shares: [] as unknown[] } })),
  revokePlanShare: vi.fn(async () => ({ data: undefined })),
  listPlanTodos: vi.fn(async () => [] as unknown[]),
  listPlanComments: vi.fn(async () => ({ data: [] as unknown[] })),
  listPlanActivity: vi.fn(async () => ({ data: [] as unknown[] })),
  postPlanComment: vi.fn(async () => ({ data: { id: 'c-new' } })),
  removePlanComment: vi.fn(async () => ({ data: undefined })),
}))

vi.mock('./plan-actions', () => ({
  addPlanTodo: mocks.addPlanTodo,
  saveSpacePlan: mocks.saveSpacePlan,
  runPlanAgain: mocks.runPlanAgain,
  planReadiness: mocks.planReadiness,
  sharePlanWithSpace: mocks.sharePlanWithSpace,
  listPlanShares: mocks.listPlanShares,
  revokePlanShare: mocks.revokePlanShare,
  listPlanTodos: mocks.listPlanTodos,
  listPlanComments: mocks.listPlanComments,
  listPlanActivity: mocks.listPlanActivity,
  postPlanComment: mocks.postPlanComment,
  removePlanComment: mocks.removePlanComment,
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
  mocks.listPlanShares.mockClear()
  mocks.revokePlanShare.mockClear()
  mocks.listPlanTodos.mockReset()
  mocks.listPlanTodos.mockResolvedValue([])
  mocks.listPlanComments.mockReset()
  mocks.listPlanComments.mockResolvedValue({ data: [] })
  mocks.listPlanActivity.mockReset()
  mocks.listPlanActivity.mockResolvedValue({ data: [] })
  mocks.postPlanComment.mockClear()
  mocks.removePlanComment.mockClear()
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
    await flush()
    const share = document.querySelector('#plan-share') as HTMLSelectElement
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

  it('Share offers the accepted collaborators by name, stays off until one is picked, and reports the offer', async () => {
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    expect(mocks.listPlanShares).toHaveBeenCalledWith('lab', 'plan-1')
    expect(button('Share').disabled).toBe(true)
    const share = document.querySelector('#plan-share') as HTMLSelectElement
    // A picker, never a text field: the only values it can send are the collaborators' ids.
    expect(share.tagName).toBe('SELECT')
    expect([...share.options].map((o) => o.textContent)).toEqual(['Pick a Space', 'The Green Room'])
    await act(async () => {
      share.value = 'space-guest'
      share.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => button('Share').click())
    await flush()
    expect(mocks.sharePlanWithSpace).toHaveBeenCalledWith('lab', 'plan-1', 'space-guest')
    expect(document.querySelector('[data-plan-notice]')?.textContent).toContain('say yes from their own calendar')
  })

  it('lists every share with its state, and Take back only on an active one', async () => {
    mocks.listPlanShares.mockResolvedValue({
      data: {
        options: [],
        shares: [
          { id: 's1', planId: 'plan-1', guestSpaceId: 'space-guest', status: 'pending', guestName: 'The Green Room', createdAt: '2026-09-28T10:00:00Z', respondedAt: null },
          { id: 's2', planId: 'plan-1', guestSpaceId: 'space-x', status: 'declined', guestName: 'Annex', createdAt: '2026-09-27T10:00:00Z', respondedAt: '2026-09-27T11:00:00Z' },
        ],
      },
    } as never)
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    const rows = [...document.querySelectorAll('[data-plan-share]')]
    expect(rows.map((r) => r.getAttribute('data-plan-share'))).toEqual(['pending', 'declined'])
    expect(rows[0].textContent).toContain('The Green Room')
    expect(rows[0].textContent).toContain('Waiting for their answer')
    expect(rows[1].textContent).toContain('They passed')
    expect(rows[0].querySelector('button')?.textContent).toBe('Take back')
    expect(rows[1].querySelector('button')).toBeNull()
    // No collaborator is left to offer it to, and the text says why rather than showing an empty picker.
    expect(document.querySelector('#plan-share')).toBeNull()
    expect(document.querySelector('[data-plan-shares]')?.textContent).toContain('already has this Plan')
    await act(async () => rows[0].querySelector('button')!.click())
    await flush()
    expect(mocks.revokePlanShare).toHaveBeenCalledWith('lab', 's1')
  })
})

// SHARED WITH YOU, read only (PROG-CAL7, LIVE-541). A guest opens the same drawer and sees the
// record, and nothing in it writes: no Save, no Archive, no to-do composer, no share picker, and
// none of the host's loads are made on the guest's session.
describe('PlanDrawer: a Plan shared with this Space opens read only', () => {
  it('shows the fields disabled, names the host, and offers Close alone', async () => {
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} readOnly sharedFrom="The Green Room" />)
    await flush()
    expect(document.querySelector('[data-plan-shared-from]')?.textContent).toContain('Shared with you by The Green Room')
    expect(button('Save Plan')).toBeUndefined()
    expect(button('Archive Plan')).toBeUndefined()
    expect(button('Share')).toBeUndefined()
    expect(document.querySelector('[aria-label="New to-do"]')).toBeNull()
    expect(button('Run it again')).toBeUndefined()
    expect(button('Close')).toBeDefined()
    expect(document.querySelector('[data-plan-shares]')).toBeNull()
    const title = document.querySelector('#plan-title') as HTMLInputElement | null
    expect(title?.disabled).toBe(true)
    expect(mocks.listPlanShares).not.toHaveBeenCalled()
    expect(mocks.planReadiness).not.toHaveBeenCalled()
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

// THE THREAD (PROG-CAL7 Together, LIVE-542). The Plan thread renders under [data-plan-comments]
// for both sides, names who said it with the Space as the fallback, offers Take back on the
// caller's own comments only, and posts with a null task id; a to-do's thread is folded behind
// Notes (n) and posts with the to-do's id.

function setTextarea(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const comment = (over: Partial<PlanCommentView> = {}): PlanCommentView => ({
  id: 'c-1',
  planId: 'plan-1',
  taskId: null,
  spaceId: 'space-guest',
  authorProfileId: 'profile-2',
  authorName: null,
  spaceName: 'The Green Room',
  body: 'Seven works for us.',
  createdAt: '2026-09-28T10:00:00Z',
  removed: false,
  mine: false,
  ...over,
})

const task: CrmTask = {
  id: '11111111-2222-4333-8444-555555555555',
  spaceId: 'space-host',
  contactId: null,
  assigneeProfileId: null,
  title: 'Book the hall',
  notes: null,
  dueAt: null,
  status: 'open',
  createdBy: null,
  createdAt: '2026-09-28T00:00:00Z',
  updatedAt: '2026-09-28T00:00:00Z',
  planId: 'plan-1',
  dueOffsetDays: null,
}

describe('PlanDrawer: the thread under the Plan and under a to-do', () => {
  it('renders the Plan thread with who said it, Take back on mine only, and posts with no task id', async () => {
    mocks.listPlanComments.mockResolvedValue({
      data: [
        comment(),
        comment({ id: 'c-2', authorProfileId: 'profile-1', authorName: 'Mara', spaceName: 'Lab', mine: true, body: 'Doors at seven?' }),
        comment({ id: 'c-3', authorProfileId: 'profile-1', mine: true, removed: true, body: 'never mind' }),
      ],
    })
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    const thread = document.querySelector('[data-plan-comments]')!
    expect(thread).not.toBeNull()
    expect(thread.querySelectorAll('[data-plan-comment]').length).toBe(3)
    expect(thread.textContent).toContain('Someone at The Green Room')
    expect(thread.textContent).toContain('You')
    expect(thread.textContent).toContain('Taken back by the person who wrote it.')
    expect(thread.textContent).not.toContain('never mind')
    expect([...thread.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Take back').length).toBe(1)
    const box = thread.querySelector('textarea[aria-label="Write a comment"]') as HTMLTextAreaElement
    await act(async () => setTextarea(box, 'Can we push the doors to 7?'))
    await act(async () => button('Post').click())
    await flush()
    expect(mocks.postPlanComment).toHaveBeenCalledWith('lab', 'plan-1', null, 'Can we push the doors to 7?')
    expect(mocks.listPlanComments).toHaveBeenCalledTimes(2)
  })

  it('folds a to-do thread behind Notes (n), and a post from there carries the to-do id', async () => {
    mocks.listPlanTodos.mockResolvedValue([task])
    mocks.listPlanComments.mockResolvedValue({ data: [comment({ id: 'c-t', taskId: task.id, body: 'Deposit by Friday.' })] })
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    const notes = document.querySelector(`[data-plan-todo-notes="${task.id}"]`) as HTMLButtonElement
    expect(notes.textContent?.trim()).toBe('Notes (1)')
    expect(document.querySelector('[data-plan-todo-comments]')).toBeNull()
    expect(document.querySelector('[data-plan-comments]')!.textContent).not.toContain('Deposit by Friday.')
    await act(async () => notes.click())
    const fold = document.querySelector(`[data-plan-todo-comments="${task.id}"]`)!
    expect(fold.textContent).toContain('Deposit by Friday.')
    const box = fold.querySelector('textarea[aria-label="Write a note on this to-do"]') as HTMLTextAreaElement
    await act(async () => setTextarea(box, 'Paid it.'))
    await act(async () => [...fold.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Post')!.click())
    await flush()
    expect(mocks.postPlanComment).toHaveBeenCalledWith('lab', 'plan-1', task.id, 'Paid it.')
  })

  it('read only, the guest still reads the thread and can write on it', async () => {
    mocks.listPlanComments.mockResolvedValue({ data: [comment()] })
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} readOnly sharedFrom="The Green Room" />)
    await flush()
    const thread = document.querySelector('[data-plan-comments]')!
    expect(thread).not.toBeNull()
    expect(thread.textContent).toContain('Seven works for us.')
    const box = thread.querySelector('textarea[aria-label="Write a comment"]') as HTMLTextAreaElement
    expect(box.placeholder).toContain('The Green Room')
    expect(document.querySelector('[data-plan-todo-notes]')).toBeNull()
  })
})

// THE RECORD (PROG-CAL7 Together, LIVE-543). The drawer shows what anyone did to the Plan, newest
// first, under [data-plan-activity], for both sides, and nothing when there is nothing yet.
describe('PlanDrawer: the activity record', () => {
  const act1: PlanActivityView = {
    id: 'a-1',
    planId: 'plan-1',
    kind: 'stage',
    summary: 'Moved the Plan to Production.',
    createdAt: '2026-09-28T10:00:00Z',
    actorProfileId: 'profile-2',
    actorName: null,
    spaceName: 'The Green Room',
    mine: false,
  }

  it('renders the record with who did it, read only, for the guest too', async () => {
    mocks.listPlanActivity.mockResolvedValue({ data: [act1, { ...act1, id: 'a-2', kind: 'comment', summary: 'Commented on the Plan.', mine: true }] })
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} readOnly sharedFrom="The Green Room" />)
    await flush()
    const record = document.querySelector('[data-plan-activity]')!
    expect(record).not.toBeNull()
    expect(record.querySelectorAll('[data-plan-activity-row]').length).toBe(2)
    expect(record.textContent).toContain('Someone at The Green Room')
    expect(record.textContent).toContain('Moved the Plan to Production.')
    expect(record.textContent).toContain('You')
    expect(record.querySelector('button, textarea, input')).toBeNull()
  })

  it('shows no record section while nothing has happened', async () => {
    await mount(<PlanDrawer slug="lab" plan={plan} open onClose={() => {}} />)
    await flush()
    expect(mocks.listPlanActivity).toHaveBeenCalledWith('lab', 'plan-1')
    expect(document.querySelector('[data-plan-activity]')).toBeNull()
  })
})
