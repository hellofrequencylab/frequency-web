'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Calendar, CalendarDays, MapPin, Ticket, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { loadEventJoinState, type EventJoinState } from '@/app/(main)/events/join-state-actions'
import { eventCoverFocusStyle } from '@/lib/events/cover-focus'
import type { SpaceEventItem } from '@/lib/spaces/content-data'

// THE SPACE PAGE EVENT POPUP (Events block upgrade). Clicking an event in ANY of the block's views
// (list rows, index-style cards, the month calendar) opens ONE shared on-page dialog — never a
// navigation — with the cover, when/where, a short description, and the REAL join affordance:
//   • RSVP events mount the SAME RsvpControls the event page uses (ADR-826 mechanics untouched);
//     the viewer's own state loads on open through the lean loadEventJoinState read action.
//   • Tickets-mode events (buying is attending) show the price and a Get tickets link to the event
//     page — the checkout lives there, never faked here.
//   • Signed-out viewers get the event page's existing sign-in path (/sign-in?next=/events/[slug]).
// The server pre-formats every when-label (house style: no timezone lib on the client) and pre-gates
// the place line (ADR-825: city-level only when the host hides the address). Tokens only — no hex.

/** A block event with its server-formatted labels: what every view + the popup renders from. */
export type SpaceEventsViewItem = SpaceEventItem & {
  /** Full when-line, e.g. "Mon, Jul 20, 7:00 PM PDT", in the EVENT's own zone. */
  whenLabel: string
  /** Short chip time for the calendar, e.g. "7:00 PM". */
  timeLabel: string
  /** YYYY-MM-DD calendar day, or null when unresolvable (the calendar drops it). */
  dayKey: string | null
  /** Absolute ISO instant for the calendar's viewer-timezone toggle. */
  startInstantIso: string | null
}

const PopupContext = createContext<{ open: (eventId: string) => void } | null>(null)

function usePopup() {
  const ctx = useContext(PopupContext)
  if (!ctx) throw new Error('SpaceEventsPopup components must render inside SpaceEventsPopup')
  return ctx
}

/** Wrap a card (or any pre-rendered node) so clicking it opens the popup instead of navigating.
 *  Capture-phase preventDefault stops the inner card link; the link stays focusable, and a keyboard
 *  Enter fires the same click event, so the popup opens for keyboard users too. */
export function EventPopupTrigger({ eventId, children }: { eventId: string; children: ReactNode }) {
  const { open } = usePopup()
  return (
    <div
      className="cursor-pointer"
      onClickCapture={(e) => {
        e.preventDefault()
        open(eventId)
      }}
    >
      {children}
    </div>
  )
}

/** The LIST view (the block's default, restyled): the familiar date-square rows, now on the space
 *  theme's radius tokens and opening the popup instead of navigating. */
export function SpaceEventsList({ items }: { items: SpaceEventsViewItem[] }) {
  const { open } = usePopup()
  return (
    <ul className="space-y-3">
      {items.map((e) => {
        const d = new Date(e.startsAt)
        const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
        const day = d.getDate()
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => open(e.id)}
              className="flex w-full items-center gap-4 rounded-card border border-border/60 bg-surface/60 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary-bg/20"
            >
              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-control bg-primary-bg">
                <span className="text-3xs font-bold leading-none text-primary-strong">{month}</span>
                <span className="text-base font-bold leading-tight text-primary-strong">{day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text">{e.title}</span>
                <span className="block truncate text-2xs text-subtle">{e.whenLabel}</span>
                {e.location && <span className="block truncate text-2xs text-subtle">{e.location}</span>}
              </span>
              <Calendar className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The CALENDAR view: the shared month grid (Events EC2), with event clicks routed into this popup
 *  instead of the grid's built-in truncated one. */
export function SpaceEventsCalendarView({
  events,
  idBySlug,
  initialYear,
  initialMonth1,
}: {
  events: CalendarEvent[]
  idBySlug: Record<string, string>
  initialYear: number
  initialMonth1: number
}) {
  const { open } = usePopup()
  return (
    <EventCalendar
      events={events}
      initialYear={initialYear}
      initialMonth1={initialMonth1}
      onSelectEvent={(ev) => {
        const id = idBySlug[ev.slug]
        if (id) open(id)
      }}
    />
  )
}

/** The provider + the dialog itself. Mount ONCE around the block's views; every trigger inside
 *  opens the same popup. */
export function SpaceEventsPopup({ items, children }: { items: SpaceEventsViewItem[]; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])
  const item = openId ? byId.get(openId) ?? null : null
  const ctx = useMemo(() => ({ open: (id: string) => setOpenId(id) }), [])
  return (
    <PopupContext.Provider value={ctx}>
      {children}
      <Dialog open={item !== null} onClose={() => setOpenId(null)} ariaLabel="Event details" className="max-w-md">
        {item && <EventPopupBody key={item.id} item={item} onClose={() => setOpenId(null)} />}
      </Dialog>
    </PopupContext.Provider>
  )
}

function EventPopupBody({ item, onClose }: { item: SpaceEventsViewItem; onClose: () => void }) {
  // The viewer's own join state loads on open (lean read action). Tickets mode never needs it —
  // the ticket is the way in, and its checkout lives on the event page.
  const [join, setJoin] = useState<EventJoinState | null>(null)
  useEffect(() => {
    if (item.ticketsMode) return
    let active = true
    loadEventJoinState(item.id).then((s) => {
      if (active) setJoin(s)
    })
    return () => {
      active = false
    }
  }, [item.id, item.ticketsMode])

  const eventHref = `/events/${item.slug}`
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
      {item.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- external public bucket URL, not a local asset
        <img
          src={item.coverUrl}
          alt=""
          className="h-32 w-full object-cover"
          style={eventCoverFocusStyle(item.coverFocus)}
          loading="lazy"
        />
      )}
      <div className="p-6">
        <h3 className="text-xl font-bold leading-tight text-text">{item.title}</h3>

        <div className="mt-3 space-y-1.5 text-sm text-muted">
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{item.whenLabel}</span>
          </div>
          {item.location && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {item.location}
                {item.addressHidden && (
                  <span className="block text-xs text-subtle">Exact address shared after you RSVP</span>
                )}
              </span>
            </div>
          )}
          {item.priceLabel && (
            <div className="flex items-start gap-2">
              <Ticket className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="font-semibold text-text">{item.priceLabel}</span>
            </div>
          )}
          {(item.going ?? 0) > 0 && (
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold tabular-nums text-text">{item.going}</span> going
              </span>
            </div>
          )}
        </div>

        {item.description && (
          <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-muted">
            {item.description}
          </p>
        )}

        {/* The join affordance — the real mechanics, never a fork (ADR-826). */}
        <div className="mt-5">
          {item.ticketsMode ? (
            <div className="space-y-2">
              <Link href={eventHref} className={buttonClasses('primary', 'sm')}>
                Get tickets
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="text-xs text-muted">Your ticket is your spot. Checkout is on the event page.</p>
            </div>
          ) : join === null ? (
            <div className="h-16 w-full max-w-sm animate-pulse rounded-xl bg-surface-elevated" aria-hidden />
          ) : !join.signedIn ? (
            <div className="space-y-2">
              <Link
                href={`/sign-in?next=${eventHref}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Sign in to RSVP
              </Link>
              {item.priceLabel === 'Free' && (
                <p className="text-xs text-muted">Free to join. Sign in and you&rsquo;re on the list.</p>
              )}
            </div>
          ) : (
            <RsvpControls
              eventId={item.id}
              slug={item.slug}
              status={join.status}
              plusOnes={join.plusOnes}
              isFull={join.isFull}
              onRecorded={(next) =>
                setJoin((j) =>
                  j ? { ...j, status: next.status, plusOnes: next.plusOnes ?? j.plusOnes } : j,
                )
              }
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClasses('secondary', 'sm')}>
            Close
          </button>
          <Link href={eventHref} className={buttonClasses(item.ticketsMode ? 'secondary' : 'primary', 'sm')}>
            View full event
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
