'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Loader2, ArrowUpRight } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { schedulePhaseEventAction } from '@/app/(main)/journeys/run-actions'

// The Run Host's per-week scheduling panel (ADR-307 follow-up). For each week (Phase), put the
// mid-week Circle Meetup and the weekend Gathering on the calendar as real, dated Events. The date
// is derived from the week's drip window; the Host refines the specifics on the Event's own page.
// Host-only: the learn page renders it only when the viewer is the Run host.

interface SchedEvent {
  slug: string
  title: string
  startsAt: string
}
interface SchedPhase {
  id: string
  label: string
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function HostSchedule({
  slug,
  runId,
  phases,
  scheduled,
}: {
  slug: string
  runId: string
  phases: SchedPhase[]
  scheduled: Record<string, { meetup: SchedEvent | null; gathering: SchedEvent | null }>
}) {
  if (!phases.length) return null
  return (
    <details className="mb-4 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-text">
        Host tools: schedule this Run&rsquo;s meetups
      </summary>
      <div className="space-y-2 border-t border-border px-4 py-3">
        <p className="text-xs text-muted">
          Put each week&rsquo;s Circle Meetup and Weekend Gathering on the calendar. We pick a sensible
          time from the drip schedule; refine it on the event page.
        </p>
        {phases.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-surface-elevated/30 p-2.5">
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">{p.label}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <Slot slug={slug} runId={runId} phaseId={p.id} kind="meetup" label="Circle Meetup" event={scheduled[p.id]?.meetup ?? null} />
              <Slot slug={slug} runId={runId} phaseId={p.id} kind="gathering" label="Weekend Gathering" event={scheduled[p.id]?.gathering ?? null} />
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

function Slot({
  slug,
  runId,
  phaseId,
  kind,
  label,
  event,
}: {
  slug: string
  runId: string
  phaseId: string
  kind: 'meetup' | 'gathering'
  label: string
  event: SchedEvent | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const schedule = () =>
    start(async () => {
      setError(null)
      const res = await schedulePhaseEventAction({ slug, runId, phaseId, kind })
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.refresh()
    })

  if (event) {
    return (
      <Link
        href={`/events/${event.slug}`}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:border-primary"
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-text">{label}</span>
          <span className="block text-2xs text-muted">{whenLabel(event.startsAt)}</span>
        </span>
        <ArrowUpRight className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
      </Link>
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={schedule}
        disabled={pending}
        className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        Schedule {label}
      </button>
      {error && <p className="mt-1 text-2xs text-danger">{error}</p>}
    </div>
  )
}
