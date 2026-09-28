// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SharedPlansPanel } from './shared-plans-panel'
import type { IncomingPlanShare, SharedPlanView } from '@/lib/calendar/plan-shares'
import type { SpacePlan } from '@/lib/calendar/plans'

// SHARED WITH YOU (PROG-CAL7, LIVE-541). An offer reads as who wants to work what with you, with
// the two answers side by side; answering calls the guest door with the share id and the verdict
// and takes the offer off the list; an accepted Plan is listed with its host and opens read only.

const mocks = vi.hoisted(() => ({
  respondToPlanShare: vi.fn(async () => ({ data: undefined })),
}))

vi.mock('./plan-actions', () => ({
  respondToPlanShare: mocks.respondToPlanShare,
  // The read-only drawer makes none of these calls; they exist so the module resolves.
  addPlanTodo: async () => ({ data: undefined }),
  saveSpacePlan: async () => ({ data: { id: 'plan-1' } }),
  runPlanAgain: async () => ({ data: { id: 'plan-2', title: 'x' } }),
  planReadiness: async () => ({ gaps: [], href: null }),
  sharePlanWithSpace: async () => ({ data: { id: 's' } }),
  listPlanShares: async () => ({ data: { options: [], shares: [] } }),
  revokePlanShare: async () => ({ data: undefined }),
  listPlanTodos: async () => [],
  listPlanLinkableEvents: async () => [],
  archiveSpacePlan: async () => ({ data: undefined }),
  attachEventToPlan: async () => ({ data: undefined }),
  acceptVeraChecklist: async () => ({ data: undefined }),
  reanchorPlanTodos: async () => ({ data: { moved: 0, anchorDay: null } }),
  setPlanTodoDone: async () => ({ data: undefined }),
  veraPlanProposal: async () => null,
}))

const offer: IncomingPlanShare = {
  id: '11111111-2222-4333-8444-555555555555',
  planId: 'plan-9',
  status: 'pending',
  planTitle: 'Autumn retreat',
  hostSpaceId: 'space-a',
  hostName: 'The Green Room',
  createdAt: '2026-09-28T10:00:00Z',
}

const plan: SpacePlan = {
  id: 'plan-7',
  spaceId: 'space-a',
  title: 'Winter market',
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
const shared: SharedPlanView = { plan, hostName: 'The Green Room' }

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mocks.respondToPlanShare.mockClear()
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

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement
const flush = () => act(async () => { await Promise.resolve() })

describe('SharedPlansPanel', () => {
  it('renders nothing at all when there is nothing shared', async () => {
    await mount(<SharedPlansPanel slug="lab" incoming={[]} sharedPlans={[]} />)
    expect(document.querySelector('[data-shared-plans]')).toBeNull()
  })

  it('reads an offer as who wants to work what, and answering yes calls the guest door and clears it', async () => {
    await mount(<SharedPlansPanel slug="lab" incoming={[offer]} sharedPlans={[]} />)
    const row = document.querySelector('[data-shared-plan-offer]')!
    expect(row.textContent).toContain('The Green Room wants to work "Autumn retreat" with you.')
    await act(async () => button('Yes, work it together').click())
    await flush()
    expect(mocks.respondToPlanShare).toHaveBeenCalledWith('lab', offer.id, 'accepted')
    expect(document.querySelector('[data-shared-plan-offer]')).toBeNull()
    expect(document.querySelector('[data-shared-plan-notice]')?.textContent).toContain('working "Autumn retreat" together')
  })

  it('answering no sends declined, and a refused answer keeps the offer and shows the reason', async () => {
    mocks.respondToPlanShare.mockResolvedValueOnce({ error: 'That share is not waiting for an answer.' } as never)
    await mount(<SharedPlansPanel slug="lab" incoming={[offer]} sharedPlans={[]} />)
    await act(async () => button('Not this one').click())
    await flush()
    expect(mocks.respondToPlanShare).toHaveBeenCalledWith('lab', offer.id, 'declined')
    expect(document.querySelector('[data-shared-plan-offer]')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('not waiting for an answer')
  })

  it('lists an accepted Plan with its host and opens it read only', async () => {
    await mount(<SharedPlansPanel slug="lab" incoming={[]} sharedPlans={[shared]} />)
    const row = document.querySelector('[data-shared-plan]')!
    expect(row.textContent).toContain('Winter market')
    expect(row.textContent).toContain('with The Green Room')
    await act(async () => button('Open').click())
    await flush()
    expect(document.querySelector('[data-plan-shared-from]')?.textContent).toContain('Shared with you by The Green Room')
    expect(button('Save Plan')).toBeUndefined()
    expect(button('Close')).toBeDefined()
  })
})
