'use client'

import { useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, Check, Clock, Loader2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, Input, Textarea, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import {
  createBooking,
  createGuestBookingAction,
  rescheduleBooking,
  startServiceDeposit,
} from '@/lib/spaces/booking-actions'
import type { OpenSlot, BookingQuestion } from '@/lib/spaces/booking'
import { groupSlotsByDay, sessionLengthLabel, timezoneLabel } from '@/lib/spaces/booking-format'
import { cn } from '@/lib/utils'

// MEMBER BOOKING PICKER (client). The interactive half of the Practitioner Book tab: a member taps a
// time, optionally adds a note, and confirms via the createBooking server action. The server
// re-validates the slot, so the picker is convenience, not the gate. On success it shows a calm
// confirmation and refreshes the surface so the booked time drops out of the open list.
//
// P2 INVITEE TIMEZONE (ADR-605): times are shown in the VIEWER's own browser timezone, with the Space
// timezone still labeled ("shown in your time"). The stored instant is absolute UTC, unchanged. To
// avoid a hydration mismatch, the server + first client render use the Space timezone (useViewerTimezone's
// server snapshot), then the browser timezone takes over. No narrated feelings, no em/en dashes.
//
// GUEST MODE (LIVE-835). On a Space website's Book page the picker takes `guest` (the Space slug): the visitor
// has no account, so it asks for a name and an email, offers a "Keep me posted" box and carries a hidden
// honeypot, then books through createGuestBookingAction. No reschedule, no deposit, no "your bookings": the
// confirmation email is the visitor's record. Without `guest` the member flow is unchanged.

const NO_OP_SUBSCRIBE = () => () => {}

/** The viewer's own IANA timezone (P2 invitee tz), read via useSyncExternalStore so the server + first
 *  client render both use `fallback` (the Space tz, no hydration mismatch) before the browser tz takes
 *  over. Returns a stable string, so React never loops. */
function useViewerTimezone(fallback: string): string {
  return useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
      } catch {
        return fallback
      }
    },
    () => fallback,
  )
}

export function BookingPicker({
  spaceId,
  slots,
  spaceTimezone,
  serviceTypeId = null,
  questions = [],
  rescheduleBookingId = null,
  depositProductId = null,
  guest = null,
}: {
  spaceId: string
  /** The open slots (absolute UTC instants), grouped by day in the viewer's timezone at render. */
  slots: OpenSlot[]
  /** The Space's configured IANA timezone (labeled so the member knows the practitioner's zone). */
  spaceTimezone: string
  /** P1: the chosen service, threaded into createBooking so the server validates against its duration. */
  serviceTypeId?: string | null
  /** P3: the chosen service's booking questions, captured at confirm. Empty when none. */
  questions?: BookingQuestion[]
  /** P3: when set, confirming RESCHEDULES this booking (atomic) instead of creating a new one. */
  rescheduleBookingId?: string | null
  /** P4 (dark): when set (deposits live + a paid service), confirming opens deposit checkout instead of
   *  the free confirm. Null keeps the free P0 path. Always null until payments are turned on. */
  depositProductId?: string | null
  /** LIVE-835: book as a guest on the Space's website (name + email, no account). Null keeps the member flow. */
  guest?: { slug: string } | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<OpenSlot | null>(null)
  const [note, setNote] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<string | null>(null)
  const [pending, startBooking] = useTransition()
  // Guest mode only: who is booking, their opt-in, and the honeypot.
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [company, setCompany] = useState('')
  const isGuest = !!guest
  const isReschedule = !isGuest && !!rescheduleBookingId

  // The viewer's own timezone (falls back to the Space tz on the server + first client render).
  const viewerTz = useViewerTimezone(spaceTimezone)

  const days = useMemo(() => groupSlotsByDay(slots, viewerTz), [slots, viewerTz])
  const sessionLabel = useMemo(() => sessionLengthLabel(slots), [slots])
  const viewerTzLabel = timezoneLabel(viewerTz)
  const spaceTzLabel = timezoneLabel(spaceTimezone)
  const sameZone = viewerTz === spaceTimezone

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: viewerTz,
    hour: 'numeric',
    minute: '2-digit',
  })
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: viewerTz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  function confirm() {
    if (!selected) return
    // Guard required questions client-side (the server re-validates too).
    for (const q of questions) {
      if (q.required && !(answers[q.id] ?? '').trim()) {
        setError('Answer the required questions to book.')
        return
      }
    }
    if (isGuest && (!guestName.trim() || !guestEmail.trim())) {
      setError('Add your name and email so we can send your confirmation.')
      return
    }
    setError(null)
    const target = selected
    startBooking(async () => {
      if (guest) {
        const result = await createGuestBookingAction({
          slug: guest.slug,
          startsAtISO: target.startsAt,
          name: guestName,
          email: guestEmail,
          note: note.trim() || null,
          serviceTypeId,
          answers,
          optIn,
          company,
        })
        if (isError(result)) {
          setError(result.error)
          return
        }
        // No refresh: the website page is cached, and the server re-checks the slot on every booking.
        setBooked(target.startsAt)
        setSelected(null)
        setNote('')
        setAnswers({})
        return
      }
      // P4 (dark): a paid service with deposits live opens deposit checkout (redirect on success);
      // otherwise the free confirm-only / reschedule path. depositProductId is null until payments are on.
      if (depositProductId && !isReschedule) {
        const dep = await startServiceDeposit(spaceId, serviceTypeId!, target.startsAt)
        if (dep.error || !dep.url) {
          setError(dep.error ?? 'Could not start checkout.')
          return
        }
        window.location.href = dep.url
        return
      }
      const result = isReschedule
        ? await rescheduleBooking(rescheduleBookingId!, target.startsAt, serviceTypeId)
        : await createBooking(spaceId, target.startsAt, note.trim() || undefined, serviceTypeId, answers)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setBooked(target.startsAt)
      setSelected(null)
      setNote('')
      setAnswers({})
      router.refresh()
    })
  }

  if (booked) {
    const when = new Intl.DateTimeFormat('en-US', {
      timeZone: viewerTz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(booked))
    return (
      <div className="rounded-card border border-success/30 bg-success-bg px-6 py-8 text-center">
        <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden />
        <p className="text-body-sm font-semibold text-text">
          {isReschedule ? 'You are rescheduled.' : 'You are booked.'}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-body-sm text-muted">
          {isGuest
            ? `${when} (${viewerTzLabel}). Your confirmation email is on its way.`
            : `${when} (${viewerTzLabel}). You can manage this from your bookings.`}
        </p>
        <button
          type="button"
          onClick={() => setBooked(null)}
          className="mt-4 text-meta font-semibold text-primary-strong hover:text-primary"
        >
          Book another time
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-body-sm text-muted">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {sessionLabel ? `${sessionLabel}. ` : ''}
        {sameZone
          ? `Times shown in ${spaceTzLabel}.`
          : `Times shown in your time (${viewerTzLabel}). This space runs on ${spaceTzLabel}.`}{' '}
        Pick a slot to book a 1:1 session.
      </p>

      <div className="space-y-5">
        {days.map((day) => (
          <div key={day.key}>
            <h3 className="mb-2 text-body-sm font-bold tracking-tight text-text">{day.label}</h3>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => {
                const active = selected?.startsAt === slot.startsAt
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => {
                      setSelected(active ? null : slot)
                      setError(null)
                    }}
                    aria-pressed={active}
                    className={cn(
                      'rounded-control border px-3 py-1.5 text-body-sm font-semibold tabular-nums transition-colors',
                      active
                        ? 'border-primary bg-primary-bg text-primary-strong'
                        : 'border-border text-text hover:border-border-strong hover:bg-surface-elevated',
                    )}
                  >
                    {timeFmt.format(new Date(slot.startsAt))}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 rounded-card border border-border bg-surface p-4 lift-1">
          <p className="text-body-sm font-semibold text-text">
            Confirm {timeFmt.format(new Date(selected.startsAt))} on{' '}
            {dayFmt.format(new Date(selected.startsAt))} ({viewerTzLabel})
          </p>
          <p className="flex items-center gap-1.5 text-meta text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {selected.slotMinutes} minute session
          </p>
          {!isReschedule && (
            <>
              {isGuest && (
                <>
                  <Field label="Your name">
                    <Input
                      className="w-full"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={120}
                      autoComplete="name"
                      required
                    />
                  </Field>
                  <Field label="Email" hint="Your confirmation goes here.">
                    <Input
                      className="w-full"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      maxLength={254}
                      autoComplete="email"
                      required
                    />
                  </Field>
                  {/* Honeypot. Hidden from sight and from assistive tech, so only a bot ever fills it. */}
                  <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                    <Field label="Company" labelClassName={labelClasses}>
                      <Input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </Field>
                  </div>
                </>
              )}
              {questions.map((q) => (
                <div key={q.id}>
                  <label htmlFor={`bq-${q.id}`} className="text-meta font-medium text-muted">
                    {q.label}
                    {q.required ? ' *' : ''}
                  </label>
                  {q.type === 'long' ? (
                    <Textarea
                      id={`bq-${q.id}`}
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      rows={2}
                      maxLength={2000}
                      className="mt-1"
                    />
                  ) : (
                    <Input
                      id={`bq-${q.id}`}
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      maxLength={2000}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
              <div>
                <label htmlFor="booking-note" className="text-meta font-medium text-muted">
                  Add a note (optional)
                </label>
                <Textarea
                  id="booking-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the practitioner should know before your session."
                  rows={3}
                  maxLength={500}
                  className="mt-1"
                />
              </div>
              {isGuest && (
                <Checkbox
                  checked={optIn}
                  onChange={(e) => setOptIn(e.target.checked)}
                  label="Keep me posted about news and new times."
                />
              )}
            </>
          )}
          {error && (
            <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{' '}
                  {isReschedule ? 'Rescheduling' : 'Booking'}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden />{' '}
                  {isReschedule ? 'Confirm reschedule' : 'Confirm booking'}
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setNote('')
                setError(null)
              }}
              disabled={pending}
              className={buttonClasses('ghost', 'md')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && !selected && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
