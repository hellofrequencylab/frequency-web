// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkspace } from './calendar-workspace'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'
import { calendarViewBlurb } from '@/lib/calendar/admin-views'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

const actions = vi.hoisted(() => ({ saveCalendarEntry: vi.fn(async (..._args: unknown[]) => ({ data: undefined })) }))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  loadStaffCalendarMonth: async () => [],
  saveCalendarEntry: actions.saveCalendarEntry,
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-actions', () => ({
  listPlanTodos: async () => [],
  planReadiness: async () => ({ gaps: [], href: '/events/new?plan=plan-1' }),
  saveSpacePlan: async () => ({ data: undefined }),
  archiveSpacePlan: async () => ({ data: undefined }),
  transitionPlanStage: async () => ({}),
  // The repair door (PROG-CAL3): the drawer lists the Space's events on open so a broken
  // events.plan_id can be re-attached in the app. Empty here; the render is what this pins.
  listPlanLinkableEvents: async () => [],
  attachEventToPlan: async () => ({ data: undefined }),
}))

// Ask Vera (PROG-CAL10). The box calls nothing on mount: both doors run only on Send and Accept,
// so the mock lists the two actions and nothing needs to resolve for the render.
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions', () => ({
  veraCalendarCommand: async () => ({ error: 'not in this test' }),
  applyVeraChanges: async () => ({ data: { results: [] } }),
  undoVeraChanges: async () => ({ error: 'not in this test' }),
  listVeraChangeLog: async () => ({ data: { entries: [] } }),
}))

vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function keydown(key: string, target: EventTarget = document.body) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** jsdom queues a history traversal (history.back) as a task, and not always the very next one:
 *  wait for the URL to say the traversal landed, so a queued Back can never leak into the next test. */
async function settleUrl(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function operatorProps(overrides: Partial<Parameters<typeof CalendarWorkspace>[0]> = {}) {
  return {
    slug: 'lab',
    spaceId: 'space-1',
    brandName: 'Frequency Lab',
    adminAllowed: true,
    canManage: true,
    initialView: 'admin' as const,
    initialListItem: null,
    initialPlanId: null,
    initialYear: 2026,
    initialMonth1: 9,
    guestEvents: [sit],
    guestFirstUse: false,
    adminEvents: [sit],
    dayNotes: [],
    plans: [plan],
    subscribe: null,
    loadGuestMonth: async () => [],
    ...overrides,
  }
}

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

const sit: CalendarEvent = {
  slug: 'sit',
  title: 'New moon sit',
  dayKey: '2026-09-22',
  timeLabel: '7:00 PM',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  startInstantIso: '2026-09-22T19:00:00.000Z',
  location: null,
  goingCount: 4,
  coverUrl: null,
  isCancelled: false,
  eventId: 'evt-1',
  planId: 'plan-1',
}

const plan: SpacePlan = {
  id: 'plan-1',
  spaceId: 'space-1',
  title: 'New moon production',
  stage: 'plan',
  notes: null,
  links: [],
  files: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

describe('CalendarWorkspace', () => {
  it('lists Guest first and slides to List without a view Link', () => {
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="admin"
        initialListItem={null}
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[sit]}
        dayNotes={[]}
        plans={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    // ONE CONTROL (LIVE-490). The box names the SURFACE -- how the calendar is being looked at --
    // instead of the panel list, whose "List" meant the all-time index while a second control in
    // the same bar said "List" for this month's agenda.
    const labels = [...el.querySelectorAll('[aria-label="How to see the calendar"] button')].map((n) => n.textContent)
    expect(labels).toEqual(['Grid', 'List', 'Workflow'])
    expect(el.querySelector('[data-calendar-view="admin"]')).not.toBeNull()
    expect(el.querySelector('[data-calendar-admin-grid]')).not.toBeNull()
    expect(el.querySelector('[data-calendar-pm-console]')).toBeNull()
    // Ask Vera sits above the panels for the team, collapsed until opened; opening it shows the
    // mode Select, the ask input and Send, and no proposal until Vera answers.
    const box = el.querySelector('[data-vera-calendar-box]')
    expect(box).not.toBeNull()
    expect(box!.querySelector('#vera-ask')).toBeNull()
    act(() => {
      box!.querySelector('button[aria-expanded]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(box!.querySelector('#vera-ask')).not.toBeNull()
    expect([...box!.querySelectorAll<HTMLOptionElement>('#vera-mode option')].map((o) => o.textContent)).toEqual(['Pencil', 'Planning', 'Production'])
    expect(box!.querySelector('[data-vera-proposal]')).toBeNull()
    expect(box!.textContent).not.toContain('\u2014')
    expect(el.querySelector('a[href*="view=list"]')).toBeNull()
    act(() => {
      el.querySelectorAll('[aria-label="How to see the calendar"] button')[1]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    // List opens on THIS MONTH, which is what the header's month and paging are steering, and the
    // scope control appears beside it. The all-time index is one click further in, under All --
    // it is no longer a separate panel wearing the same word.
    expect(el.querySelector('[data-calendar-view="admin"]')).not.toBeNull()
    const scope = [...el.querySelectorAll('button')].map((b) => b.textContent)
    expect(scope).toContain('This month')
    expect(scope).toContain('All')
    act(() => {
      ;[...el.querySelectorAll('button')].find((b) => b.textContent === 'All')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(el.querySelector('[data-calendar-view="list"]')).not.toBeNull()
    expect(el.textContent).toContain('New moon sit')
    expect(el.textContent).toContain('Go to event')
    expect(el.textContent).not.toContain('—')
  })

  it('keeps unsigned visitors on Guest with no view control', () => {
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed={false}
        canManage={false}
        initialView="admin"
        initialListItem={null}
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[]}
        dayNotes={[]}
        plans={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    expect(el.querySelector('[data-calendar-view="guest"]')).not.toBeNull()
    expect(el.querySelector('[aria-label="How to see the calendar"]')).toBeNull()
    expect(el.querySelector('[data-vera-calendar-box]')).toBeNull()
    // The console is edit mode: a guest never sees its door or the F key.
    expect(el.querySelector('[data-calendar-console-open]')).toBeNull()
    act(() => keydown('f'))
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
  })

  it('opens the shared Plan drawer from List and synchronizes its URL state', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar?view=list')
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="list"
        initialListItem={null}
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[sit]}
        dayNotes={[]}
        plans={[plan]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    await act(async () => {
      ;[...el.querySelectorAll('button')].find((button) => button.textContent === 'Open Plan')?.click()
      await Promise.resolve()
    })
    expect(document.querySelector('[data-plan-production-summary]')?.textContent).toContain('New moon production')
    expect(document.querySelector('[data-plan-production-summary]')?.textContent).toContain('Readiness')
    expect(window.location.search).toContain('view=list')
    expect(window.location.search).toContain('plan=plan-1')
  })

  it('archives a Plan from its drawer and drops it, and its pencilled date, from every view (HYG-120)', async () => {
    const pencil: CalendarEvent = {
      ...sit,
      eventId: undefined,
      entryId: 'entry-1',
      layer: 'pencil',
      stage: 'pencil',
      sourceLabel: 'Pencil',
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="workflow"
        initialListItem={null}
        initialPlanId="plan-1"
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[]}
        guestFirstUse={false}
        adminEvents={[pencil]}
        dayNotes={[]}
        plans={[plan]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    expect(el.querySelector('[data-workflow-card="plan-1"]')).not.toBeNull()
    await act(async () => {
      ;[...document.querySelectorAll('button')].find((button) => button.textContent === 'Archive Plan')?.click()
      await Promise.resolve()
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-plan-production-summary]')).toBeNull()
    expect(el.querySelector('[data-workflow-card="plan-1"]')).toBeNull()
    expect(window.location.search).not.toContain('plan=')
    act(() => {
      el.querySelectorAll('[aria-label="How to see the calendar"] button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-calendar-panel="list"]')?.textContent ?? '').not.toContain('New moon production')
    confirm.mockRestore()
  })

  it('reconciles a Plan drawer stage save across Workflow and List immediately', async () => {
    const planningEntry: CalendarEvent = {
      ...sit,
      eventId: undefined,
      entryId: 'entry-1',
      layer: 'pencil',
      stage: 'planning',
      sourceLabel: 'Planning',
    }
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="admin"
        initialListItem={null}
        initialPlanId="plan-1"
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[]}
        guestFirstUse={false}
        adminEvents={[planningEntry]}
        dayNotes={[]}
        plans={[plan]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    await act(async () => {
      const stage = document.querySelector<HTMLSelectElement>('#plan-stage')!
      stage.value = 'production'
      stage.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector<HTMLFormElement>('[data-plan-production-summary]')!.closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    act(() => {
      el.querySelectorAll('[aria-label="How to see the calendar"] button')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-workflow-column="production"] [data-workflow-card="plan-1"]')).not.toBeNull()
    act(() => {
      el.querySelectorAll('[aria-label="How to see the calendar"] button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-calendar-list-viewer]')?.textContent).toContain('Production')
  })

  // THE CALENDAR CONSOLE (PROG-CAL12).
  it('opens the console from its control into the same panel set, with the month agenda by day', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const control = el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')
    expect(control).not.toBeNull()
    // OWNER RULING 2026-09-22: the control reads Fullscreen, so that word IS its accessible name.
    // No aria-label overrides it, which keeps the visible label and the name the same string and
    // clears the WCAG 2.5.3 mismatch a separate name would have left.
    expect(control!.getAttribute('aria-label')).toBeNull()
    expect(control!.textContent).toContain('Fullscreen')
    expect(control!.title).toContain('F')
    expect(control!.textContent).toContain('Fullscreen')
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
    // Never auto-enter: the title is a sentence, not a door.
    expect(document.querySelectorAll('[data-calendar-panel]').length).toBe(4)
    act(() => control!.click())
    const console_ = document.querySelector('[data-calendar-console]')
    expect(console_).not.toBeNull()
    expect(window.location.search).toContain('console=1')
    // ONE calendar: the four panels moved into the console, nothing was mounted twice.
    expect(document.querySelectorAll('[data-calendar-panel]').length).toBe(4)
    expect(console_!.querySelectorAll('[data-calendar-panel]').length).toBe(4)
    expect(document.querySelectorAll('[data-calendar-root]').length).toBe(2)
    expect(console_!.querySelector('[data-calendar-admin-grid]')).not.toBeNull()
    expect(el.querySelector('[data-calendar-admin-grid]')).toBeNull()
    // The header carries the view toggle, the month, Pencil it in, Ask Vera and the two controls.
    expect(console_!.querySelector('[aria-label="How to see the calendar"]')).not.toBeNull()
    expect(console_!.textContent).toContain('September 2026')
    expect([...console_!.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Pencil it in')).toBe(true)
    expect(console_!.querySelector('[data-vera-calendar-box]')).not.toBeNull()
    expect(console_!.querySelector('[aria-label="Close the console"]')).not.toBeNull()
    expect(console_!.querySelector('[aria-label="Keyboard shortcuts"]')).not.toBeNull()
    // The agenda: this month's items, grouped under a day heading, with Open Plan on a planned item.
    const agenda = console_!.querySelector('[data-calendar-agenda]')!
    expect(agenda.textContent).toContain('Tue, Sep 22')
    expect(agenda.textContent).toContain('New moon sit')
    expect([...agenda.querySelectorAll('button')].some((b) => b.textContent === 'Open Plan')).toBe(true)
    expect(console_!.textContent).not.toContain('\u2014')
    // The console's Open Plan opens the shared drawer on top.
    act(() => {
      ;[...agenda.querySelectorAll('button')].find((b) => b.textContent === 'Open Plan')!.click()
    })
    expect(document.querySelector('#plan-title')).not.toBeNull()
    expect(window.location.search).toContain('plan=plan-1')
    expect(window.location.search).toContain('console=1')
  })

  it('opens on F, pages the month with the arrow keys, and Esc closes it and returns focus to the control', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const control = el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!
    // F while typing is a letter, not a door.
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => keydown('f', input))
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
    input.remove()
    act(() => keydown('f'))
    const console_ = document.querySelector('[data-calendar-console]')
    expect(console_).not.toBeNull()
    act(() => keydown('ArrowRight'))
    expect(document.querySelector('[data-calendar-console]')!.textContent).toContain('October 2026')
    expect(document.querySelector('[data-calendar-agenda]')!.textContent).toContain('Nothing on the calendar in October 2026')
    act(() => keydown('t'))
    // Today's month in this environment, whichever it is, is not what the fixture shows unless it is.
    expect(document.querySelector('[data-calendar-console]')).not.toBeNull()
    act(() => keydown('?'))
    expect(document.querySelector('#calendar-console-keys')).not.toBeNull()
    act(() => keydown('Escape'))
    expect(document.querySelector('#calendar-console-keys')).toBeNull()
    expect(document.querySelector('[data-calendar-console]')).not.toBeNull()
    await act(async () => {
      keydown('Escape')
      await settleUrl(() => !window.location.search.includes('console='))
    })
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
    expect(document.activeElement).toBe(control)
    expect(window.location.search).not.toContain('console=')
    // The panels are back on the page, still one set.
    expect(el.querySelectorAll('[data-calendar-panel]').length).toBe(4)
    expect(el.querySelector('[data-calendar-admin-grid]')).not.toBeNull()
  })

  it('reopens from ?console=1 on the same view and drawer, and Esc closes the drawer before the console', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar?view=workflow&plan=plan-1&console=1')
    mount(<CalendarWorkspace {...operatorProps({ initialView: 'workflow', initialPlanId: 'plan-1', initialConsole: true })} />)
    const console_ = document.querySelector('[data-calendar-console]')
    expect(console_).not.toBeNull()
    expect(console_!.querySelector('[data-calendar-panel="workflow"]')?.getAttribute('aria-hidden')).toBe('false')
    expect(document.querySelector('#plan-title')).not.toBeNull()
    await act(async () => {
      keydown('Escape')
      await settleUrl(() => !window.location.search.includes('plan='))
    })
    expect(document.querySelector('#plan-title')).toBeNull()
    expect(document.querySelector('[data-calendar-console]')).not.toBeNull()
    // A pasted link has no console entry of its own on the stack, so this exit rewrites the URL in
    // place rather than going Back.
    await act(async () => {
      keydown('Escape')
      await settleUrl(() => !window.location.search.includes('console='))
    })
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
    expect(window.location.search).not.toContain('console=')
    expect(window.location.search).toContain('view=workflow')
  })

  // TWO LINES (owner ask 2026-09-22). The heading and its blurb are one line, every control is the
  // next, and the first-visit hint row is gone: its sentence lives on the Fullscreen control's own
  // title, which is where a person looking for the door would read it anyway.
  // THE PAGE CONTROL SECTION IS TWO ROWS (LIVE-494, owner ask 2026-09-24: "no more than two
  // rows"). It used to be five bands above the month -- the heading with its own control row, Ask
  // Vera, Pencil it in, the grid's month-and-paging strip and the grid's layer chips -- for the
  // same set the console has fitted on ONE line since LIVE-485. The heading is a heading again,
  // and every control is in one bar of exactly two rows, in the console's group order.
  it('draws the page controls as ONE bar of two rows, in the console group order', () => {
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    expect(el.querySelector('[data-calendar-console-hint]')).toBeNull()
    const control = el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!
    expect(control.textContent).toContain('Fullscreen')
    expect(control.title).toBe('Open the console (F)')
    // OWNER RULING 2026-09-22: the visible word Fullscreen is the control's accessible name, so no
    // aria-label overrides it. The title still carries the shortcut and what the control opens.
    expect(control.getAttribute('aria-label')).toBeNull()

    // The heading is ONE line now: the name of the page and the blurb, and no controls. The blurb
    // is the registry's, not a string copied here -- LIVE-468 rewrote this wording and a pinned
    // copy would have gone stale the moment it landed.
    const heading = el.querySelector('[data-calendar-workspace]')!.firstElementChild!
    expect(heading.querySelector('h2')?.textContent).toBe('Calendar')
    expect(heading.querySelector('p')?.textContent).toBe(calendarViewBlurb('admin', 'Frequency Lab'))
    expect(heading.querySelector('[data-calendar-console-open]')).toBeNull()
    expect(heading.querySelector('[aria-label="How to see the calendar"]')).toBeNull()

    // TWO ROWS, and exactly two: WHEN + HOW, then WHAT + ACTIONS. `head.children.length` used to
    // pin this on the heading; it pins it on the bar now, and counts only the control rows -- the
    // month-jump panel is a third child of the bar and is only in the tree while it is open.
    const bar = el.querySelector<HTMLElement>('[data-calendar-page-header]')!
    expect(bar.querySelector('[role="dialog"]')).toBeNull()
    expect(bar.children.length).toBe(2)
    const [row1, row2] = [bar.children[0]!, bar.children[1]!]

    // Row one is WHEN then HOW.
    expect(row1.querySelector('[data-calendar-page-month]')).not.toBeNull()
    expect(row1.querySelector('[data-calendar-page-paging]')).not.toBeNull()
    expect(row1.querySelector('[aria-label="How to see the calendar"]')).not.toBeNull()
    // Row two is WHAT then ACTIONS.
    expect(row2.querySelector('[aria-label="Show on the calendar"]')).not.toBeNull()
    expect(row2.contains(control)).toBe(true)
    expect([...row2.querySelectorAll('button')].some((b) => b.textContent?.includes('Pencil it in'))).toBe(true)

    // Never auto-enter, and nothing about the header opens it.
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
  })

  // A VISITOR GETS THE BAR TOO. The grid runs with `hostChrome` on the page for everyone, so
  // without this a signed-out visitor would be looking at a month grid with no way to leave the
  // month it opened on. What they do not get is the groups that would be empty for them.
  it('gives a visitor the month and its paging, and none of the operator groups', () => {
    const el = mount(<CalendarWorkspace {...operatorProps()} adminAllowed={false} canManage={false} />)
    const bar = el.querySelector<HTMLElement>('[data-calendar-page-header]')!
    expect(bar.querySelector('[data-calendar-page-month] button [aria-live="polite"]')?.textContent).toBe('September 2026')
    expect(bar.querySelector('[aria-label="Previous month"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="Next month"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="How to see the calendar"]')).toBeNull()
    expect(bar.querySelector('[aria-label="Show on the calendar"]')).toBeNull()
    expect(bar.querySelector('[data-calendar-console-open]')).toBeNull()
    // And the grid it steers draws none of them itself, so there is exactly one of each.
    expect(el.querySelectorAll('[aria-label="Previous month"]').length).toBe(1)
  })

  // 🔴 THE BLINK (owner report 2026-09-22). Opening and closing the console used to move the panel
  // set between two React parents, which is an unmount and a remount, not a move: both grids, the
  // Vera box and the open entry form were destroyed and rebuilt on every toggle. The stage now
  // lives at one position in the tree and only its DOM home moves, so the SAME nodes travel.
  it('moves the live panel set into the console and back without remounting it (regression)', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const grid = el.querySelector('[data-calendar-root]')
    const vera = el.querySelector('[data-vera-calendar-box]')
    const panels = [...el.querySelectorAll('[data-calendar-panel]')]
    expect(grid).not.toBeNull()
    expect(panels.length).toBe(4)
    const control = el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!
    act(() => control.click())
    const console_ = document.querySelector('[data-calendar-console]')!
    // Same nodes, new home.
    expect(document.querySelector('[data-calendar-root]')).toBe(grid)
    expect(document.querySelector('[data-vera-calendar-box]')).toBe(vera)
    expect([...console_.querySelectorAll('[data-calendar-panel]')]).toEqual(panels)
    expect(console_.contains(grid)).toBe(true)
    expect(el.contains(grid)).toBe(false)
    // And back again on the way out.
    await act(async () => {
      keydown('Escape')
      await settleUrl(() => !window.location.search.includes('console='))
    })
    expect(document.querySelector('[data-calendar-console]')).toBeNull()
    expect(el.querySelector('[data-calendar-root]')).toBe(grid)
    expect(el.querySelector('[data-vera-calendar-box]')).toBe(vera)
    expect([...el.querySelectorAll('[data-calendar-panel]')]).toEqual(panels)
  })

  it('never hands Next its own history state back, so a synced URL survives (regression, PROG-CAL12)', async () => {
    // Next patches history.replaceState and RETURNS EARLY when the state it is given already carries
    // __NA, without telling the router the URL moved; the router then restores its stale canonical
    // URL and a freshly written ?plan= disappears. This pins the shape: every state we pass is our
    // own marker or null, never the object Next left on the entry.
    const seen: unknown[] = []
    const original = window.history.replaceState.bind(window.history)
    window.history.replaceState = ((data: unknown, unused: string, url?: string) => {
      seen.push(data)
      return original(data as never, unused, url)
    }) as typeof window.history.replaceState
    // What Next leaves on an entry it owns.
    original({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['x'] } as never, '', window.location.href)
    try {
      const el = mount(<CalendarWorkspace {...operatorProps({ initialView: 'admin' })} />)
      const list = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'List')!
      await act(async () => {
        list.click()
        await Promise.resolve()
      })
      expect(seen.length).toBeGreaterThan(0)
      for (const data of seen) {
        expect(data == null || !(data as Record<string, unknown>).__NA).toBe(true)
      }
    } finally {
      window.history.replaceState = original
    }
  })

  // ONE HEADER BAR (LIVE-485, owner ask 2026-09-23: "condense all sorting and controls into an
  // intuitive header bar"). Everything that steers the calendar is in the console's own header now:
  // the month (which opens the month-and-year jump), Prev / Today / Next, the layer chips, the grid
  // / list switcher, and the actions. The grid inside draws none of it. The page grid keeps all of
  // it, because nothing else draws it there.
  //
  // 🔴 A HOST MAY ONLY TAKE A CONTROL IT DRAWS (LIVE-475). Taking the switcher and the jump off the
  // grid while nothing replaced them shipped a reachable dead end, so every control this test says
  // the grid gives up is checked to be present in the header, exactly once, by the name it had.
  it('folds every grid control into ONE console header bar, each drawn exactly once', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const pageGrid = el.querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root]')!
    const pageBar = el.querySelector<HTMLElement>('[data-calendar-page-header]')!
    // THE PAGE IS A HOST NOW TOO (LIVE-494). It used to be the one place the grid still drew its
    // own month, paging, jump and chips, because nothing above it did; the page control bar draws
    // all four, so the grid draws none of them HERE either. The rule is the same one the console
    // obeys and the reason is the same: a host may only take a control it actually draws, so each
    // group below is checked to be in the bar, once, before the grid is checked not to have it.
    for (const [what, selector] of [
      ['the month', '[data-calendar-page-month]'],
      ['the month jump', '[data-calendar-page-month-jump]'],
      ['Prev', '[aria-label="Previous month"]'],
      ['Next', '[aria-label="Next month"]'],
      ['the layer chips', '[aria-label="Show on the calendar"]'],
      ['the surface control', '[aria-label="How to see the calendar"]'],
    ] as const) {
      expect(el.querySelectorAll(selector).length, what).toBe(1)
      expect(pageBar.querySelector(selector), what).not.toBeNull()
      expect(pageGrid.querySelector(selector), what).toBeNull()
    }
    // And the grid never draws the ⊞/☰ switcher on the page (LIVE-490): the bar carries ONE
    // surface control, and the grid drawing its own beside it put "List" in the bar twice, over
    // two different sets.
    expect(pageGrid.querySelector('[aria-label="Calendar view"]')).toBeNull()
    expect([...pageGrid.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(false)
    expect([...pageBar.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(true)

    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    const header = console_.querySelector<HTMLElement>('[data-calendar-console-header]')!
    const shownGrid = console_.querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root]')!

    // ONE BAR: every one of these is in the header, and none of them is anywhere else.
    for (const [what, selector] of [
      ['the month', '#calendar-console-title'],
      ['the month jump', '[data-calendar-console-month-jump]'],
      ['Prev', '[aria-label="Previous month"]'],
      ['Next', '[aria-label="Next month"]'],
      ['the layer chips', '[aria-label="Show on the calendar"]'],
      // ONE control where there were two, and it is drawn exactly once like everything else here.
      ['the surface control', '[aria-label="How to see the calendar"]'],
      ['the shortcut sheet', '[aria-label="Keyboard shortcuts"]'],
      ['Close', '[aria-label="Close the console"]'],
    ] as const) {
      expect(console_.querySelectorAll(selector).length, what).toBe(1)
      expect(header.querySelector(selector), what).not.toBeNull()
    }
    expect([...header.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Pencil it in')).toBe(true)

    // And the grid inside draws none of them: no second month, no second switcher, no second band
    // of chips. That is the four rows of furniture the month was losing its height to.
    expect(shownGrid.querySelector('[aria-label="Calendar view"]')).toBeNull()
    expect(shownGrid.querySelector('[aria-label="Show on the calendar"]')).toBeNull()
    expect(shownGrid.querySelector('[aria-label="Previous month"]')).toBeNull()
    expect([...shownGrid.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(false)

    // The month still fits the row it was given rather than its own content, and the row it is
    // given has a DEFINITE height, which is what makes `self-stretch` under it mean anything.
    expect(shownGrid.className).toContain('flex-1')
    expect(shownGrid.className).toContain('min-h-0')
    const slider = console_.querySelector('[data-calendar-panel]')!.parentElement!
    expect(slider.className).toContain('h-full')
    expect(slider.className).not.toContain('min-h-full')
    // VERTICAL IS THE ONLY AXIS: nothing in the stage scrolls sideways.
    expect(console_.querySelector('[data-calendar-console-stage]')!.className).toContain('overflow-x-hidden')
  })

  // The console header's controls are LIVE, not decoration: each one moves the grid that is showing.
  it('drives the grid from the header bar: the month jump, the switcher and the layer chips', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = () => document.querySelector<HTMLElement>('[data-calendar-console]')!
    const grid = () => console_().querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root]')!
    const title = () => console_().querySelector('#calendar-console-title')!.textContent

    // MORE THAN ONE MONTH AT A TIME. The jump opens from the month itself and lands on the month
    // pressed, which is the control the grid gave up.
    expect(console_().querySelector('[role="dialog"][aria-label="Jump to a month"]')).toBeNull()
    act(() => console_().querySelector<HTMLButtonElement>('[data-calendar-console-month-jump]')!.click())
    const jump = console_().querySelector<HTMLElement>('[role="dialog"][aria-label="Jump to a month"]')!
    expect(jump).not.toBeNull()
    act(() => {
      ;[...jump.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith('Dec'))!.click()
    })
    expect(title()).toContain('December 2026')
    expect(console_().querySelector('[role="dialog"][aria-label="Jump to a month"]')).toBeNull()

    // THE LAYER CHIPS. Pressing one hides that layer in the grid below; the grid draws no chips.
    const chip = (label: string) =>
      [...console_().querySelectorAll<HTMLButtonElement>('[aria-label="Show on the calendar"] button')].find(
        (b) => b.textContent?.trim() === label,
      )!
    act(() => console_().querySelector<HTMLButtonElement>('[aria-label="Previous month"]')!.click())
    expect(chip('Events').getAttribute('aria-pressed')).toBe('true')
    act(() => chip('Events').click())
    expect(chip('Events').getAttribute('aria-pressed')).toBe('false')
    act(() => chip('Events').click())
    expect(chip('Events').getAttribute('aria-pressed')).toBe('true')

    // THE SURFACE CONTROL, from the header (LIVE-490): the one control that used to be two.
    const surfaceBtn = (label: string) =>
      [...console_().querySelectorAll<HTMLButtonElement>('[aria-label="How to see the calendar"] button')].find(
        (b) => b.textContent?.trim() === label,
      )!
    act(() => surfaceBtn('List').click())
    expect(grid().querySelector('[data-calendar-list]')).not.toBeNull()
    act(() => surfaceBtn('Grid').click())
    expect(grid().querySelector('[data-calendar-list]')).toBeNull()
  })

  // A panel with no month has no month controls to offer: the switcher and the chips are not drawn
  // dead, they are not drawn at all.
  it('drops the grid switcher and the chips on a panel that is not a calendar', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps({ initialView: 'workflow' })} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    expect(console_.querySelector('[aria-label="Calendar view"]')).toBeNull()
    expect(console_.querySelector('[aria-label="Show on the calendar"]')).toBeNull()
    // AND THE MONTH GOES TOO (LIVE-490). Workflow has no month, so the label, its jump and
    // Prev / Today / Next are not drawn dead beside it -- the owner was reading a bar that said
    // "September 2026" over a board that ignores it.
    expect(console_.querySelector('[data-calendar-console-month-jump]')).toBeNull()
    expect(console_.querySelector('[data-calendar-console-paging]')).toBeNull()
    expect(console_.querySelector('[aria-label="Previous month"]')).toBeNull()
    // The heading still EXISTS -- it is the dialog's accessible name -- and now says what is being
    // read instead of a month that means nothing here.
    const title = console_.querySelector('#calendar-console-title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toContain('Workflow')
    // The ways out are both still there: the surface control and Close.
    expect(console_.querySelector('[aria-label="How to see the calendar"]')).not.toBeNull()
    expect(console_.querySelector('[aria-label="Close the console"]')).not.toBeNull()
  })

  // HYG-105's consequence, in the DOM rather than in an import path. Both calendar switchers are
  // the kit's segmented box, so each renders the primitive's own `data-segmented` marker. Keeping
  // the import and hand-rolling the buttons again renders no marker and fails here.
  it('renders both calendar switchers as the kit segmented control', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const views = el.querySelector('[data-segmented][aria-label="How to see the calendar"]')
    expect(views).not.toBeNull()
    expect(views!.getAttribute('data-segmented')).toBe('buttons')
    expect([...views!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Grid', 'List', 'Workflow'])
    // The List rail's own row switcher, in the panel that is mounted beside the grid.
    const railBoxes = [...el.querySelectorAll('[data-calendar-panel="list"] [data-segmented]')]
    expect(railBoxes.length).toBeGreaterThan(0)
  })

  // 🔴 THE STATE THE OWNER PHOTOGRAPHED (LIVE-490, screenshot of ?view=list): the all-time index
  // with the header still saying "September 2026" and offering Prev / Today / Next over a list that
  // runs into October. One word, "List", named this AND the month agenda, from two different
  // controls. This pins the fix: one control, the scope is a choice inside it, and the month is not
  // drawn where it steers nothing -- without stranding the reader, which is the LIVE-475 rule.
  it('drops the dead month on the all-time List, and still offers a way back', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps({ initialView: 'list' })} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    const header = console_.querySelector<HTMLElement>('[data-calendar-console-header]')!

    // Exactly ONE control in the bar offers "List"; there is no second one meaning something else.
    const listButtons = [...header.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'List')
    expect(listButtons.length).toBe(1)
    expect(console_.querySelector('[aria-label="Calendar view"]')).toBeNull()

    // The month is gone, because it steered nothing here.
    expect(header.querySelector('[data-calendar-console-month-jump]')).toBeNull()
    expect(header.querySelector('[data-calendar-console-paging]')).toBeNull()
    // The heading still names the dialog, and says what is being read.
    expect(console_.querySelector('#calendar-console-title')!.textContent).toContain('Gatherings')

    // The scope is a choice INSIDE the List surface, and it is showing everything.
    const scopeBtn = (label: string) =>
      [...header.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!
    expect(scopeBtn('All').getAttribute('aria-pressed')).toBe('true')
    expect(scopeBtn('This month')).toBeTruthy()

    // NOT A DEAD END: narrowing to the month brings the month controls back with it.
    act(() => scopeBtn('This month').click())
    const header2 = document.querySelector<HTMLElement>('[data-calendar-console-header]')!
    expect(header2.querySelector('[data-calendar-console-month-jump]')).not.toBeNull()
    expect(header2.querySelector('[data-calendar-console-paging]')).not.toBeNull()
  })

  // 🔴 THE DEAD END LIVE-475 CLOSED, RE-PINNED ON ITS NEW HOME (LIVE-485). Switch the page grid to
  // its List, press Fullscreen, and before LIVE-475 there was no control anywhere that came back to
  // the month: the console header's view controls are the workspace's four panels, not the grid's
  // two views, and closing the console was the only exit. LIVE-475 answered it by keeping the
  // switcher inside the grid; LIVE-485 moved it into the console's header, where it is one of the
  // four groups. Either way this is the test that says list mode inside the console has a way out,
  // and a way to move more than one month.
  it('comes back to the month from the grid list, inside the console, and moves more than one month', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const pageGrid = el.querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root]')!
    // Into list mode from the ONE surface control the workspace draws (LIVE-490). The grid no
    // longer carries a switcher of its own, so this is now the only way in -- which is the point.
    const pageSurface = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('[aria-label="How to see the calendar"] button')].find(
        (b) => b.textContent?.trim() === label,
      )!
    act(() => pageSurface('List').click())
    expect(pageGrid.querySelector('[data-calendar-list]')).not.toBeNull()

    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    const inConsole = console_.querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root]')!
    // The list travelled in with the panel set, and the way out is in the header that took it over.
    expect(inConsole.querySelector('[data-calendar-list]')).not.toBeNull()
    const header = console_.querySelector<HTMLElement>('[data-calendar-console-header]')!
    const back = [...header.querySelectorAll<HTMLButtonElement>('[aria-label="How to see the calendar"] button')].find(
      (b) => b.textContent?.trim() === 'Grid',
    )
    expect(back).not.toBeNull()
    // And the month jump, the other half of the dead end: more than one month, from in here. The
    // month-scoped List is a surface that HAS a month, so the WHEN group is still drawn for it.
    expect(header.querySelector('[data-calendar-console-month-jump]')).not.toBeNull()
    expect(header.querySelector('[data-calendar-console-paging]')).not.toBeNull()
    act(() => back!.click())
    expect(inConsole.querySelector('[data-calendar-list]')).toBeNull()
    expect(inConsole.querySelector('[data-calendar-stack], .group')).not.toBeNull()
  })

  // PROG-CAL12, owner ruling 2026-09-22: BUTTONS ONLY on the page (no wheel, no swipe), and the
  // wheel only inside the console. Nothing in the suite held that ruling, so `wheelPaging={consoleOpen}`
  // could be flattened to a bare `wheelPaging` and every calendar test stayed green.
  it('never pages the month on a vertical wheel over the PAGE staff grid, and does inside the console', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const surface = (root: ParentNode) =>
      root.querySelector<HTMLElement>('[data-calendar-admin-grid] [data-calendar-root] .touch-pan-y')!
    const wheel = (el: HTMLElement) =>
      act(() => {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, deltaMode: 0, bubbles: true, cancelable: true }))
      })
    // NAME THE MONTH, not "the first polite live region in the grid". The grid gained a second one
    // when a date became movable (PROG-CAL15, the line a move leaves), and it is rendered FIRST, so
    // a loose selector that used to mean the month title started reading an empty region instead.
    //
    // IT IS READ OFF THE PAGE BAR NOW (LIVE-494). The page draws the month in its own two-row
    // control header and both page grids run with `hostChrome`, so the grid holds no month to
    // read. What this test asserts is unchanged, and is the whole point of LIVE-489: a vertical
    // wheel over the PAGE grid must not page the month, and the same wheel inside the console must.
    const pageMonth = () =>
      el.querySelector<HTMLElement>('[data-calendar-page-month] button [aria-live="polite"]')!.textContent

    expect(pageMonth()).toBe('September 2026')
    wheel(surface(el))
    expect(pageMonth()).toBe('September 2026')

    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    const title = () => console_.querySelector('#calendar-console-title')!.textContent
    expect(title()).toBe('September 2026')
    wheel(surface(console_))
    expect(title()).toBe('October 2026')
  })

  // Ask Vera left the full-width band above the grid for the foot of the side bar (owner ask
  // 2026-09-23). It is MOVED, never rewritten into a second place: same node, agenda above it, and
  // the agenda is the part that scrolls.
  it('parks Ask Vera at the foot of the side bar, as the same box the page had', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps()} />)
    const vera = el.querySelector('[data-vera-calendar-box]')
    expect(vera).not.toBeNull()
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    const foot = console_.querySelector<HTMLElement>('[data-calendar-console-vera]')!
    expect(foot.contains(vera!)).toBe(true)
    expect(document.querySelectorAll('[data-vera-calendar-box]').length).toBe(1)
    // It is not on the stage any more, and it is not above the grid.
    expect(console_.querySelector('[data-calendar-console-stage]')!.contains(vera!)).toBe(false)
    const sidebar = console_.querySelector<HTMLElement>('[data-calendar-sidebar]')!
    const agenda = sidebar.querySelector<HTMLElement>('[data-calendar-agenda]')!
    expect(agenda.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The agenda takes the height and scrolls; Vera holds the foot and never takes the column, so a
    // long proposal scrolls in its own box rather than pushing the agenda off screen.
    expect(agenda.className).toContain('overflow-y-auto')
    expect(agenda.className).toContain('flex-1')
    expect(foot.className).toContain('shrink-0')
    expect(foot.className).toContain('max-h-')
    expect(foot.className).toContain('overflow-y-auto')
  })

  // A viewer who can see the calendar but not edit it gets the agenda alone, with no empty footer.
  it('leaves the side bar as the agenda alone when the viewer cannot edit', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps({ canManage: false })} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector<HTMLElement>('[data-calendar-console]')!
    expect(console_.querySelector('[data-calendar-console-vera]')).toBeNull()
    expect(console_.querySelector('[data-calendar-agenda]')).not.toBeNull()
  })

  // MONTHS RUN UP AND DOWN (owner ask 2026-09-23). Down is the next month, Up the one before, the
  // same direction the wheel already paged them; Left and Right keep working exactly as they did.
  it('pages the month on Up and Down, and leaves the arrows to anything that is scrolling', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    mount(<CalendarWorkspace {...operatorProps()} />)
    act(() => keydown('f'))
    const title = () => document.querySelector('#calendar-console-title')!.textContent
    expect(title()).toContain('September 2026')
    act(() => keydown('ArrowDown'))
    expect(title()).toContain('October 2026')
    act(() => keydown('ArrowUp'))
    expect(title()).toContain('September 2026')
    act(() => keydown('ArrowUp'))
    expect(title()).toContain('August 2026')
    act(() => keydown('ArrowRight'))
    expect(title()).toContain('September 2026')
    // An arrow typed into a field is a caret move, not a month.
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => keydown('ArrowDown', input))
    expect(title()).toContain('September 2026')
    input.remove()
    // An arrow aimed at something that can still scroll that way belongs to the scroll. The agenda
    // and a busy day's own cell are read with these keys, so the month must not move under them.
    const agenda = document.querySelector<HTMLElement>('[data-calendar-agenda]')!
    agenda.style.overflowY = 'auto'
    Object.defineProperty(agenda, 'scrollHeight', { value: 900, configurable: true })
    Object.defineProperty(agenda, 'clientHeight', { value: 200, configurable: true })
    act(() => keydown('ArrowDown', agenda.querySelector('button')!))
    expect(title()).toContain('September 2026')
    // Scrolled to the bottom, the agenda has no room left and the month takes the key back.
    agenda.scrollTop = 700
    act(() => keydown('ArrowDown', agenda.querySelector('button')!))
    expect(title()).toContain('October 2026')
    act(() => keydown('ArrowUp'))
    // And the shortcut sheet says so, on the row that already named the month keys.
    act(() => keydown('?'))
    const keys = document.querySelector('#calendar-console-keys')!.closest('[role="dialog"]')!
    expect(keys.textContent).toContain('Up')
    expect(keys.textContent).toContain('Down')
    act(() => keydown('Escape'))
  })

  it('gives only the showing panel a height, so a short view never scrolls into blank space (LIVE-469)', () => {
    const el = mount(<CalendarWorkspace {...operatorProps({ initialView: 'admin' })} />)
    const row = el.querySelector('[data-calendar-panel]')!.parentElement!
    // The four sit in one flex row. Without items-start the row stretches every panel to the
    // tallest, which is how a long List index left the Calendar scrolling past its own grid.
    expect(row.className).toContain('items-start')
    for (const panel of Array.from(el.querySelectorAll<HTMLElement>('[data-calendar-panel]'))) {
      const showing = panel.getAttribute('aria-hidden') === 'false'
      expect(panel.className.includes('h-0'), `${panel.dataset.calendarPanel} height`).toBe(!showing)
    }
  })
})

// MOVING A DATE IN THE CONSOLE (PROG-CAL15). The console is the only home the move lives in, and the
// line it leaves is in its header: one sentence, whichever way the date was picked up.
describe('CalendarWorkspace: the console moves a date and says what happened', () => {
  const pencilInput = {
    kind: 'pencil',
    title: 'Open house',
    holdExpiresOn: '',
    candidateDates: [],
    stage: 'pencil',
    description: '',
    notes: '',
    location: '',
    allDay: true,
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    startTime: '09:00',
    endTime: '10:00',
    timeZone: 'UTC',
    status: 'tentative',
    blocksTime: false,
    showPublicly: false,
    planId: 'plan-1',
    repeat: '',
    exceptionDates: [],
  }
  const pencil: CalendarEvent = {
    slug: 'entry-1',
    title: 'Open house',
    dayKey: '2026-09-20',
    timeLabel: 'All day',
    whenLabel: 'Sun, Sep 20, all day',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'pencil',
    stage: 'pencil',
    entryId: 'entry-1',
    entryInput: pencilInput,
    planId: 'plan-1',
  }

  it('carries Shift and an arrow to the entry seam and prints one result line in the header', async () => {
    actions.saveCalendarEntry.mockClear()
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const el = mount(<CalendarWorkspace {...operatorProps({ adminEvents: [pencil], guestEvents: [] })} />)
    // On the page the calendar stays click-to-open: no chip is draggable until the console is open.
    expect(document.querySelector('button[title="Open house"]')!.getAttribute('draggable')).toBeNull()
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const console_ = document.querySelector('[data-calendar-console]')!
    const line = console_.querySelector('[data-calendar-move-result]')!
    // Always mounted, and out of the way until there is something to say.
    expect(line.className).toContain('hidden')
    const chip = console_.querySelector<HTMLButtonElement>('button[title="Open house"]')!
    expect(chip.getAttribute('draggable')).toBe('true')
    await act(async () => {
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }))
    })
    expect(actions.saveCalendarEntry).toHaveBeenCalledTimes(1)
    expect(line.textContent).toBe('Moved Open house to Mon, Sep 21.')
    expect(line.className).not.toContain('hidden')
    expect(console_.textContent).not.toContain('\u2014')
    // The month did not page: the chip took the key, the console did not.
    expect(console_.textContent).toContain('September 2026')
  })
})

// ── THE CONSOLE HEADER NAMES THE SPACE'S ZONE, IN PLAIN WORDS (LIVE-471) ────────────────────────
// PROG-CAL12 already showed a zone beside the month. It showed the VIEWER's, as an abbreviation
// ("PDT"), which is both the wrong zone for a travelling operator and the wrong words for anyone.

describe('the console header zone (LIVE-471)', () => {
  afterEach(() => vi.restoreAllMocks())

  /** Pin what this jsdom "browser" says its zone is. */
  function pinBrowserZone(timeZone: string) {
    const real = Intl.DateTimeFormat.prototype.resolvedOptions
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
      this: Intl.DateTimeFormat,
    ) {
      return { ...real.call(this), timeZone }
    })
  }

  it('shows the Space zone in words beside the month, not the operator zone and not an abbreviation', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    pinBrowserZone('Europe/Lisbon')
    const el = mount(<CalendarWorkspace {...operatorProps({ spaceTimeZone: 'America/Los_Angeles' })} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const header = document.querySelector('[data-calendar-console] header')!
    expect(header.textContent).toContain('September 2026')
    expect(header.textContent).toContain('Pacific Time')
    expect(header.textContent).not.toContain('PDT')
    expect(header.textContent).not.toContain('PST')
    expect(header.textContent).not.toContain('America/Los_Angeles')
    expect(header.textContent).not.toContain('Lisbon')
  })

  it('names the viewer zone, and says it is the viewer zone, when the Space has never said', () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    pinBrowserZone('Europe/Lisbon')
    const el = mount(<CalendarWorkspace {...operatorProps({ spaceTimeZone: null })} />)
    act(() => el.querySelector<HTMLButtonElement>('[data-calendar-console-open]')!.click())
    const header = document.querySelector('[data-calendar-console] header')!
    expect(header.textContent).toContain('Western European Time')
    const zone = [...header.querySelectorAll('span')].find((s) => s.textContent === 'Western European Time')
    expect(zone?.title).toContain('has not set a time zone')
  })
})
