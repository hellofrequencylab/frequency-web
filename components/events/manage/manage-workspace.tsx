'use client'

import { useState, useTransition } from 'react'
import { Download, UserCheck, ArrowUpCircle, Megaphone } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { hostCheckInGuest } from '@/app/(main)/events/actions'
import { promoteNextWaitlister, promoteWaitlister } from '@/app/(main)/events/[slug]/manage/manage-actions'
import { BlastComposer } from './blast-composer'

export type ManageGuest = {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  status: 'going' | 'waitlist' | 'maybe' | 'not_going'
  plusOnes: number
  muted: boolean
  rsvpedAt: string
  checkedIn: boolean
  paidCents: number
  ticketCount: number
  refundedCount: number
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatWhen(iso: string): string {
  return new Date(iso)
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(',', '')
}

// One field for a CSV row — quoted + internal quotes doubled (RFC 4180).
function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

const panel = 'rounded-2xl border border-border bg-surface p-5'

export function ManageWorkspace({
  eventId,
  slug,
  isPaid,
  isCancelled,
  eventStarted,
  capacityFull,
  guests,
}: {
  eventId: string
  slug: string
  /** Accepted for parity with the page; the Dashboard header renders the title. */
  eventTitle?: string
  isPaid: boolean
  isCancelled: boolean
  eventStarted: boolean
  capacityFull: boolean
  guests: ManageGuest[]
}) {
  const going = guests.filter((g) => g.status === 'going')
  const waitlist = guests.filter((g) => g.status === 'waitlist')
  const maybe = guests.filter((g) => g.status === 'maybe')

  function exportCsv() {
    const header = [
      'Name',
      'Handle',
      'Status',
      'Bringing',
      'Checked in',
      'Muted',
      'RSVP at',
      ...(isPaid ? ['Tickets', 'Paid', 'Refunded'] : []),
    ]
    const rows = guests.map((g) => [
      g.displayName,
      `@${g.handle}`,
      g.status,
      g.plusOnes,
      g.checkedIn ? 'yes' : 'no',
      g.muted ? 'yes' : 'no',
      formatWhen(g.rsvpedAt),
      ...(isPaid ? [g.ticketCount, dollars(g.paidCents), g.refundedCount] : []),
    ])
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-guests.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* ── Blast composer ─────────────────────────────────────────────────── */}
      <section className={panel}>
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-subtle" />
          <SectionHeader title="Message your guests" />
        </div>
        <BlastComposer eventId={eventId} slug={slug} />
      </section>

      {/* ── Waitlist controls ──────────────────────────────────────────────── */}
      {waitlist.length > 0 && (
        <section className={panel}>
          <SectionHeader
            title="Waitlist"
            count={waitlist.length}
            action={
              <PromoteNextButton eventId={eventId} slug={slug} disabled={capacityFull || isCancelled} />
            }
          />
          {capacityFull && !isCancelled && (
            <p className="mb-3 text-xs text-muted">This event is full. Free a seat (or raise capacity) to move someone in.</p>
          )}
          <div className="space-y-2">
            {waitlist.map((g, i) => (
              <div key={g.profileId} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-subtle">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{g.displayName}</p>
                    <p className="truncate text-xs text-subtle">@{g.handle} · joined {formatWhen(g.rsvpedAt)}</p>
                  </div>
                </div>
                <PromoteOneButton eventId={eventId} slug={slug} profileId={g.profileId} disabled={isCancelled} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Roster (RSVP + orders) ─────────────────────────────────────────── */}
      <section className={panel}>
        <SectionHeader
          title="Guests"
          count={going.length}
          action={
            <button
              type="button"
              onClick={exportCsv}
              disabled={guests.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          }
        />

        {going.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No confirmed guests yet"
            description="When people RSVP they'll show up here. Send a blast to nudge your circle."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-subtle">
                  <th className="py-2 pr-3 font-medium">Guest</th>
                  <th className="py-2 pr-3 font-medium">Bringing</th>
                  {isPaid && <th className="py-2 pr-3 font-medium">Order</th>}
                  <th className="py-2 pr-3 font-medium">RSVP&apos;d</th>
                  <th className="py-2 pl-3 text-right font-medium">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {going.map((g) => (
                  <tr key={g.profileId} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-text">{g.displayName}</p>
                      <p className="text-xs text-subtle">@{g.handle}{g.muted ? ' · muted' : ''}</p>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{g.plusOnes > 0 ? `+${g.plusOnes}` : '-'}</td>
                    {isPaid && (
                      <td className="py-2.5 pr-3 text-muted">
                        {g.ticketCount > 0 ? (
                          <span className="tabular-nums">{g.ticketCount} · {dollars(g.paidCents)}</span>
                        ) : g.refundedCount > 0 ? (
                          <span className="text-subtle">refunded</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    )}
                    <td className="py-2.5 pr-3 text-xs text-subtle">{formatWhen(g.rsvpedAt)}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <CheckInCell
                        eventId={eventId}
                        profileId={g.profileId}
                        checkedIn={g.checkedIn}
                        canCheckIn={eventStarted && !isCancelled}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {maybe.length > 0 && (
          <p className="mt-4 text-xs text-subtle">
            {maybe.length} {maybe.length === 1 ? 'person is' : 'people are'} marked maybe. They&apos;re in the CSV and hear your blasts.
          </p>
        )}
      </section>
    </div>
  )
}

function CheckInCell({
  eventId,
  profileId,
  checkedIn,
  canCheckIn,
}: {
  eventId: string
  profileId: string
  checkedIn: boolean
  canCheckIn: boolean
}) {
  const [done, setDone] = useState(checkedIn)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
        <UserCheck className="h-3.5 w-3.5" /> Here
      </span>
    )
  }
  if (!canCheckIn) {
    return <span className="text-xs text-subtle">Not started</span>
  }

  return (
    <button
      type="button"
      onClick={() => {
        setError(false)
        startTransition(async () => {
          const res = await hostCheckInGuest(eventId, profileId)
          if (res.ok) setDone(true)
          else setError(true)
        })
      }}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
    >
      {pending ? '…' : error ? 'Try again' : 'Mark here'}
    </button>
  )
}

function PromoteNextButton({ eventId, slug, disabled }: { eventId: string; slug: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await promoteNextWaitlister(eventId, slug)
            if (isError(res)) setError(res.error)
          })
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-40"
      >
        <ArrowUpCircle className="h-3.5 w-3.5" /> {pending ? 'Moving…' : 'Move next in'}
      </button>
    </div>
  )
}

function PromoteOneButton({
  eventId,
  slug,
  profileId,
  disabled,
}: {
  eventId: string
  slug: string
  profileId: string
  disabled: boolean
}) {
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        setError(false)
        startTransition(async () => {
          const res = await promoteWaitlister(eventId, slug, profileId)
          if (isError(res)) setError(true)
        })
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
    >
      {pending ? '…' : error ? 'Try again' : 'Move in'}
    </button>
  )
}
