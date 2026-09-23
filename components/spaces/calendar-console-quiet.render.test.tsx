// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkspace } from './calendar-workspace'
import { DispatchTicker, type TickerItem } from '@/components/layout/dispatch-ticker'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'

// ── THE CONSOLE IS STILL (LIVE-482, the FOURTH blink report) ──────────────────────────────────
//
// "The glitch / blink is way better now but still happening every 8 seconds or so. It's more of a
// consistent blink than a glitch now." A cadence is a timer, and this file is how the timer was
// found: mount what the member actually has on screen at `/spaces/<slug>/calendar?console=1`, the
// ambient dispatch bar from the shell's centre column and the workspace with the console open, and
// then WATCH THE WHOLE DOCUMENT across thirty seconds of fake time.
//
// Before the fix this failed at 5000ms and again at every 5000ms after it, and the diff was never
// inside the console: the console's own markup and the month grid were byte-identical throughout,
// same nodes, which is what ruled out a remount (LIVE-472), a replayed animation (LIVE-474) and a
// shell re-render (LIVE-477) as the fourth cause. What moved was the dispatch ticker, rotating its
// headline behind a `bg-ink/60 backdrop-blur-sm` overlay that covers the viewport, where nobody can
// read it, nobody can hover it, nobody can Tab to it and nobody can press its arrows. The browser
// re-blurs the backdrop each time it changes; the member sees the console blink on the bar's clock.
//
// This assertion is deliberately the WHOLE document rather than the console, because the lesson of
// the first three reports is that the cause was somewhere nobody was looking. Anything at all that
// mutates on a timer while a modal owns the screen fails this, whatever file it lives in.

const STEP_MS = 1000
const WATCH_MS = 30_000

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={String(href)} {...rest}>{children}</a>
  ),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  loadStaffCalendarMonth: async () => [],
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-actions', () => ({
  listPlanTodos: async () => [],
  planReadiness: async () => ({ gaps: [], href: '/events/new?plan=plan-1' }),
  saveSpacePlan: async () => ({ data: undefined }),
  archiveSpacePlan: async () => ({ data: undefined }),
  transitionPlanStage: async () => ({}),
  listPlanLinkableEvents: async () => [],
  attachEventToPlan: async () => ({ data: undefined }),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions', () => ({
  veraCalendarCommand: async () => ({ error: 'not in this test' }),
  applyVeraChanges: async () => ({ data: { results: [] } }),
  undoVeraChanges: async () => ({ error: 'not in this test' }),
  listVeraChangeLog: async () => ({ data: { entries: [] } }),
}))
vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
}))

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
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

const dispatches: TickerItem[] = [
  { id: 'a', title: 'Short one', authorName: 'Ana', timeLabel: '2h ago', linked: false },
  { id: 'b', title: 'A considerably longer headline, of the kind that wraps', authorName: 'Bo', timeLabel: '3h ago', linked: true },
  { id: 'c', title: 'Third', authorName: null, timeLabel: '1d ago', linked: false },
]

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  document.body.style.overflow = ''
  vi.useRealTimers()
})

function stubMatchMedia() {
  ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as (q: string) => MediaQueryList
}

async function mountSurface(consoleOpen: boolean) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <>
        {/* The shell renders this above the page content in the centre column on every member page. */}
        <DispatchTicker items={dispatches} />
        <CalendarWorkspace
          slug="lab"
          spaceId="space-1"
          brandName="Frequency Lab"
          adminAllowed
          canManage
          initialView="admin"
          initialListItem={null}
          initialPlanId={null}
          initialConsole={consoleOpen}
          initialYear={2026}
          initialMonth1={9}
          guestEvents={[sit]}
          guestFirstUse={false}
          adminEvents={[sit]}
          dayNotes={[]}
          plans={[plan]}
          subscribe={null}
          loadGuestMonth={async () => []}
        />
      </>,
    )
  })
}

describe('the calendar console surface', () => {
  it('changes nothing anywhere in the document across thirty seconds', async () => {
    stubMatchMedia()
    vi.useFakeTimers()
    await mountSurface(true)

    // The console really is up, so a passing run cannot be a run that rendered nothing.
    expect(document.querySelector('[data-calendar-workspace][data-calendar-console-open]')).not.toBeNull()
    const grid = document.querySelector('[data-calendar-admin-grid]')
    expect(grid).not.toBeNull()

    const before = document.body.innerHTML
    for (let ms = STEP_MS; ms <= WATCH_MS; ms += STEP_MS) {
      await act(async () => { await vi.advanceTimersByTimeAsync(STEP_MS) })
      expect(document.body.innerHTML, `the document changed at ${ms}ms with the console open`).toBe(before)
    }
    expect(document.querySelector('[data-calendar-admin-grid]')).toBe(grid)
  })

  it('and the control: with the console closed the same clock does move the bar', async () => {
    // Without this, the assertion above would also pass on a ticker that had simply been deleted.
    stubMatchMedia()
    vi.useFakeTimers()
    await mountSurface(false)

    const before = document.body.innerHTML
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(document.body.innerHTML).not.toBe(before)
  })
})
