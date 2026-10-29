// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdaptedCalendar, SuitePlan } from '@/lib/calendar/planner/adapters'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { CohostBlock, InviteAnswerButtons, SharedRollup } from './suite-cohost'
import type { SuiteContext } from './suite-types'
import { CohostProvider, useSuiteCohost, type CohostActions } from './use-suite-cohost'

// CO-HOSTING, PRESSED. The real block, the real Needs you buttons and the real hook, with the three
// server doors replaced by recorders. An invite answered yes shows as co-hosting at once; answered no,
// only that Space's view of the Plan goes and the only write is the one answer (the Plan is never
// deleted); a refused write puts the calendar back and says why; a person who can only read has no
// buttons.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OWN = 's-own'
const HOST = 's-host'
const VINE = 's-vine'

const invited: SuitePlan = {
  id: 'p1',
  title: 'Beach clean',
  stage: 'planning',
  target: 'Event',
  targetLabel: 'Event',
  owner: null,
  team: [],
  hold: null,
  spaces: [
    { id: HOST, role: 'Host', status: 'accepted' },
    { id: OWN, role: 'Co-host', status: 'pending', shareId: 'share-1' },
  ],
  notes: null,
}
const hosted: SuitePlan = {
  ...invited,
  id: 'p2',
  title: 'Supper club',
  spaces: [{ id: OWN, role: 'Host', status: 'accepted' }],
}

const BASE: AdaptedCalendar = { items: [], tasks: [], plans: [invited, hosted], spaceNames: { [HOST]: 'Swami' } }

function recorder(over: Partial<CohostActions> = {}) {
  const calls: unknown[][] = []
  const actions: CohostActions = {
    respond: async (...a) => (calls.push(['respond', ...a]), { data: undefined }),
    invite: async (...a) => (calls.push(['invite', ...a]), { data: { id: 'share-new' } }),
    revoke: async (...a) => (calls.push(['revoke', ...a]), { data: undefined }),
    ...over,
  }
  return { calls, actions }
}

function Host({ actions, canEdit = true, select }: { actions: CohostActions; canEdit?: boolean; select: string }) {
  const cohost = useSuiteCohost({
    truth: BASE,
    base: BASE,
    ownSpaceId: OWN,
    actions,
    canEdit,
    collaborators: [
      { id: VINE, name: 'Vine' },
      { id: HOST, name: 'Swami' },
    ],
    collaboratorsHref: '/spaces/ocean/settings/collaborators',
    networkNoun: null,
  })
  const ctx: SuiteContext = {
    ownSpaceId: OWN,
    ownName: 'Ocean House',
    today: '2026-10-21',
    spaceNames: cohost.data.spaceNames,
    clashes: new Set(),
    teamById: new Map(),
    planById: new Map(cohost.data.plans.map((p) => [p.id, p])),
    itemById: new Map(),
    taskById: new Map(),
  }
  const plan = cohost.data.plans.find((p) => p.id === select)
  const data: PlannerData = { items: cohost.data.items, tasks: [], plans: cohost.data.plans }
  return (
    <CohostProvider api={cohost.api}>
      <p data-plans>{cohost.data.plans.map((p) => p.id).join(',')}</p>
      {plan ? <CohostBlock plan={plan} ctx={ctx} /> : null}
      <InviteAnswerButtons planId="p1" />
      <SharedRollup data={data} ctx={ctx} ym="2026-10" hidden={false} />
      {cohost.layer}
    </CohostProvider>
  )
}

let root: Root | null = null
let box: HTMLElement | null = null
async function mount(el: React.ReactElement) {
  box = document.createElement('div')
  document.body.appendChild(box)
  root = createRoot(box)
  await act(async () => root?.render(el))
  return box
}
afterEach(() => {
  act(() => root?.unmount())
  box?.remove()
  root = null
  box = null
})

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')]
const press = async (el: HTMLElement, label: string, nth = 0) => {
  const b = buttons(el).filter((x) => x.textContent === label)[nth]
  if (!b) throw new Error(`no button "${label}" in: ${buttons(el).map((x) => x.textContent).join(' | ')}`)
  await act(async () => b.click())
}

describe('an invite waiting on this Space', () => {
  it('says who wants to co-host and what a yes does', async () => {
    const el = await mount(<Host actions={recorder().actions} select="p1" />)
    expect(el.textContent).toContain('Swami wants to co-host')
    expect(el.textContent).toContain('Say yes and it lands on your calendar, and both teams can edit it.')
    expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['SwamiHost', 'Ocean HouseInvited'])
  })

  it('co-host it: one write naming the share, and the calendar shows it at once', async () => {
    const { calls, actions } = recorder()
    const el = await mount(<Host actions={actions} select="p1" />)
    await press(el, 'Co-host it')
    expect(calls).toEqual([['respond', 'share-1', 'accepted']])
    expect(el.textContent).not.toContain('wants to co-host')
    expect(el.textContent).toContain('Ocean HouseCo-host')
    expect(el.textContent).toContain('You are co-hosting. It is on your calendar now.')
  })

  it('not this time: only the answer is written, only this Space loses the Plan', async () => {
    const { calls, actions } = recorder()
    const el = await mount(<Host actions={actions} select="p1" />)
    await press(el, 'Not this time')
    expect(calls).toEqual([['respond', 'share-1', 'declined']])
    // The Plan this Space hosts is still there; the one it declined is gone from its calendar.
    expect(el.querySelector('[data-plans]')?.textContent).toBe('p2')
    expect(el.textContent).toContain('Declined. We let them know.')
  })

  it('puts the calendar back when the server refuses, and says why', async () => {
    const { actions } = recorder({ respond: async () => ({ error: 'That offer is not waiting on you.' }) })
    const el = await mount(<Host actions={actions} select="p1" />)
    await press(el, 'Co-host it')
    expect(el.querySelector('[data-plans]')?.textContent).toBe('p1,p2')
    expect(el.textContent).toContain('wants to co-host')
    expect(el.textContent).toContain('Nothing changed. That offer is not waiting on you.')
  })

  it('answers from Needs you with the same write', async () => {
    const { calls, actions } = recorder()
    const el = await mount(<Host actions={actions} select="p2" />)
    await press(el, 'Accept')
    expect(calls).toEqual([['respond', 'share-1', 'accepted']])
  })

  it('has no buttons for someone who can only read', async () => {
    const el = await mount(<Host actions={recorder().actions} canEdit={false} select="p1" />)
    expect(el.textContent).toContain('Swami wants to co-host')
    expect(buttons(el)).toHaveLength(0)
  })
})

describe('the Space that hosts', () => {
  it('invites a collaborator that is not on the Plan yet, then can take the invite back', async () => {
    const { calls, actions } = recorder()
    const el = await mount(<Host actions={actions} select="p2" />)
    const select = el.querySelector('select') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['Pick a Space', 'Swami', 'Vine'])
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      set?.call(select, VINE)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await press(el, 'Invite')
    expect(calls).toEqual([['invite', 'p2', VINE]])
    expect(el.textContent).toContain('VineInvited')
    expect(el.textContent).toContain('Invite sent to Vine.')
    await press(el, 'Take back')
    expect(calls.at(-1)).toEqual(['revoke', 'share-new'])
    expect(el.textContent).not.toContain('VineInvited')
  })
})
