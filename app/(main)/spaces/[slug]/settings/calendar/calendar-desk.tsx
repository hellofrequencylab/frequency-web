import type { ComponentProps } from 'react'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { EventShareApprovals } from '@/components/events/event-share-approvals'
import { SpaceTodosPanel } from './space-todos-panel'
import { SharedPlansPanel } from './shared-plans-panel'
import { CalendarPlansPanel } from './calendar-plans-panel'
import { SpaceEventsManager } from './space-events-manager'

// THE DESK UNDER THE CALENDAR (SCAN-1341, clarity audit 2026-11-25). The Calendar console used to stack
// To-dos, Shared with you, Plans, Playbooks, Private team feed and Manage events down one page: 6,387px
// tall at 1440 on prod, and on a phone the Agenda showed two items before the To-dos panel took over.
// Now one tab strip sits under the calendar and ONE panel shows at a time. Each tab is a `?desk=` link,
// so the server renders only that panel and a link can land on any of them. A co-host request still
// shows above the strip whatever the tab, because it waits on an answer.

export const CALENDAR_DESKS = ['todos', 'plans', 'shared', 'events'] as const
export type CalendarDesk = (typeof CALENDAR_DESKS)[number]

/** The tab a request opens on. A `?plan=` deep link (Console Work, a notice) needs the Plans tab, where
 *  the Plan drawer lives; otherwise To-dos, the panel a team opens this page for most. */
export function resolveCalendarDesk(asked: string | undefined, hasPlanLink: boolean): CalendarDesk {
  if ((CALENDAR_DESKS as readonly string[]).includes(asked ?? '')) return asked as CalendarDesk
  return hasPlanLink ? 'plans' : 'todos'
}

export function CalendarDeskPanels({
  teamTools,
  desk,
  slug,
  spaceId,
  query,
  todos,
  shared,
  plans,
  events,
}: {
  /** False for staff looking in without manage rights: no Plans or to-dos, only requests and events. */
  teamTools: boolean
  desk: CalendarDesk
  slug: string
  spaceId: string
  /** The page's other query params (month, view), kept on every tab link. */
  query: Record<string, string>
  todos: ComponentProps<typeof SpaceTodosPanel>
  shared: ComponentProps<typeof SharedPlansPanel>
  plans: ComponentProps<typeof CalendarPlansPanel>
  events: ComponentProps<typeof SpaceEventsManager>['events']
}) {
  if (!teamTools) {
    return (
      <section id="calendar-desk" className="space-y-3">
        <EventShareApprovals spaceId={spaceId} />
        {events.length > 0 && <SpaceEventsManager events={events} />}
      </section>
    )
  }
  const base = `/spaces/${slug}/settings/calendar`
  const href = (d: CalendarDesk) => {
    const p = new URLSearchParams({ ...query, desk: d })
    return `${base}?${p.toString()}#calendar-desk`
  }
  const openTodos = todos.tasks.filter((t) => t.status === 'open').length
  const sharedCount = shared.incoming.length + shared.sharedPlans.length
  const tabs = [
    { href: href('todos'), label: 'To-dos', count: openTodos || undefined },
    { href: href('plans'), label: 'Plans', count: plans.plans.length || undefined },
    // Only shown when there is something shared, or the link asked for it.
    ...(sharedCount || desk === 'shared' ? [{ href: href('shared'), label: 'Shared with you', count: sharedCount || undefined }] : []),
    ...(events.length || desk === 'events' ? [{ href: href('events'), label: 'Manage events', count: events.length || undefined }] : []),
  ]

  return (
    <section id="calendar-desk" className="space-y-3" data-calendar-desk={desk}>
      <EventShareApprovals spaceId={spaceId} />
      <UnderlineTabs tabs={tabs} activeHref={href(desk)} label="Calendar desk" />
      {desk === 'todos' ? (
        <div id="calendar-todos">
          <SpaceTodosPanel {...todos} />
        </div>
      ) : desk === 'plans' ? (
        <div id="calendar-plans">
          <CalendarPlansPanel {...plans} />
        </div>
      ) : desk === 'shared' ? (
        <div id="calendar-shared-plans">
          <SharedPlansPanel {...shared} />
        </div>
      ) : (
        <div id="calendar-manage-events">
          <SpaceEventsManager events={events} />
        </div>
      )}
    </section>
  )
}
