'use client'

// Journeys — the LAUNCH surface's review list (ADR-840). Where a publisher lands right after
// publishing: the four-send best-practice series, pre-drafted from the Journey's own window
// (lib/journeys/launch-campaigns.ts), laid out for review, edit, and scheduling in one pass.
//
// THE CONTRACT, mirroring journey-guide.tsx: this component collects INTENT only. The drafts
// arrive from the server, every write goes back through a server action that re-checks the author
// gate and the tier subset, and a blocked action comes back as the server's own plain message with
// a See plans link. Nothing about who may schedule what is decided here.
//
// Copy is member-facing: plain, warm, no em dashes (docs/CONTENT-VOICE.md).

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  Check,
  ChevronDown,
  Loader2,
  Megaphone,
  Network,
  PenLine,
  Send,
} from 'lucide-react'
import { isError } from '@/lib/action-result'
import { LAUNCH_NEEDS_SPACE_MESSAGE } from '@/lib/journeys/launch-surface'
import {
  scheduleLaunchSendAction,
  scheduleLaunchSeriesAction,
  buildLaunchFunnelAction,
  type LaunchSendInput,
} from '@/app/(main)/journeys/[slug]/launch/actions'

/** One pre-drafted send as the server hands it over (the LaunchCampaignDraft shape, serialized). */
export interface LaunchDraftView {
  key: string
  name: string
  purpose: string
  subject: string
  body: string
  sendAt: string
}

/** What the surface may do, resolved server-side (resolveJourneyAccess + the Space context). */
export interface LaunchAccessView {
  /** The full scheduled series, or just the free subset? Drives the upsell line only; the action
   *  re-checks. */
  seriesAllowed: boolean
  /** Is there a Space (and therefore a contact list) behind this Journey to send to? */
  hasSpace: boolean
  /** May this viewer build a Growth OS funnel (the marketing capability)? */
  canBuildFunnel: boolean
  /** The one quiet upsell sentence, when something is held back. */
  upsell: string | null
}

const FIELD =
  'w-full rounded-card border border-border bg-surface px-3 py-2.5 text-body-sm text-text outline-none transition-colors focus:border-primary placeholder:text-subtle'

/** "Tue, Aug 4 at 9:00 AM" in the reader's own zone. Falls back to the raw value if unparseable. */
function sendAtLabel(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** ISO -> the value a <input type="datetime-local"> wants, in LOCAL time. */
function toLocalInput(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The datetime-local value back to an ISO string (the action re-validates it is in the future). */
function fromLocalInput(value: string): string {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value
}

export function JourneyLaunch({
  planId,
  slug,
  title,
  drafts,
  access,
  children,
}: {
  planId: string
  slug: string
  title: string
  /** The sends this viewer's tier may review, already filtered server-side. */
  drafts: LaunchDraftView[]
  access: LaunchAccessView
  /** The "Message enrollees" composer, streamed in by the page behind its own Suspense. */
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // The edited copy, seeded from the drafts. The row stays the source of truth once scheduled;
  // until then this is the publisher's working text.
  const [edits, setEdits] = useState<Record<string, LaunchSendInput>>(() =>
    Object.fromEntries(
      drafts.map((d) => [d.key, { key: d.key, subject: d.subject, body: d.body, sendAt: d.sendAt }]),
    ),
  )
  // key -> the campaign id it became. A scheduled send is done: the card goes quiet.
  const [scheduled, setScheduled] = useState<Record<string, string>>({})
  const [funnelId, setFunnelId] = useState<string | null>(null)

  const scheduledIds = useMemo(
    () => drafts.map((d) => scheduled[d.key]).filter((id): id is string => !!id),
    [drafts, scheduled],
  )
  const remaining = drafts.filter((d) => !scheduled[d.key])
  const canSchedule = access.hasSpace

  const patch = (key: string, next: Partial<LaunchSendInput>) =>
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }))

  const scheduleOne = (key: string) => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await scheduleLaunchSendAction(planId, edits[key])
      if (isError(res)) {
        setError(res.error)
        return
      }
      setScheduled((prev) => ({ ...prev, [key]: res.data.campaignId }))
      setNote('Scheduled. You can still change it from the Space campaign list.')
      router.refresh()
    })
  }

  const scheduleAll = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await scheduleLaunchSeriesAction(
        planId,
        remaining.map((d) => edits[d.key]),
      )
      if (isError(res)) {
        setError(res.error)
        return
      }
      setScheduled((prev) => {
        const next = { ...prev }
        for (const s of res.data.scheduled) next[s.key] = s.campaignId
        return next
      })
      setNote(
        res.data.failed.length > 0
          ? `Scheduled ${res.data.scheduled.length}. ${res.data.failed.length} needs another look.`
          : 'The whole series is scheduled.',
      )
      router.refresh()
    })
  }

  const buildFunnel = () => {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await buildLaunchFunnelAction(planId, scheduledIds)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setFunnelId(res.data.funnelId)
      setNote('Funnel built. Each scheduled send is wired to a stage.')
    })
  }

  return (
    <div className="space-y-6">
      {/* ── The series ────────────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary-strong" aria-hidden />
          <h2 className="text-body-sm font-semibold text-text">The launch series</h2>
        </div>
        <p className="text-meta leading-relaxed text-muted">
          Four sends that carry {title} from announcement to day one. The dates come from your run
          window. Read each one, change anything, then set it going.
        </p>

        {drafts.map((d, i) => {
          const edit = edits[d.key]
          const done = !!scheduled[d.key]
          return (
            <details
              key={d.key}
              className="group rounded-card border border-border bg-surface"
              open={i === 0 && !done}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-2xs font-semibold text-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-body-sm font-semibold text-text">
                    {d.name}
                    {done && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-success-bg px-1.5 py-0.5 text-2xs font-semibold text-success">
                        <Check className="h-3 w-3" aria-hidden /> Scheduled
                      </span>
                    )}
                  </span>
                  <span className="block text-meta leading-snug text-muted">{d.purpose}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-2xs text-muted">
                    <CalendarClock className="h-3 w-3" aria-hidden /> {sendAtLabel(edit?.sendAt ?? d.sendAt)}
                  </span>
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>

              <div className="space-y-3 border-t border-border px-4 py-3">
                <label className="block">
                  <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">
                    Subject
                  </span>
                  <input
                    type="text"
                    value={edit?.subject ?? ''}
                    onChange={(e) => patch(d.key, { subject: e.target.value })}
                    disabled={done || pending}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">
                    Message
                  </span>
                  <textarea
                    rows={7}
                    value={edit?.body ?? ''}
                    onChange={(e) => patch(d.key, { body: e.target.value })}
                    disabled={done || pending}
                    className={`${FIELD} resize-y leading-relaxed`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">
                    Sends
                  </span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(edit?.sendAt ?? d.sendAt)}
                    onChange={(e) => patch(d.key, { sendAt: fromLocalInput(e.target.value) })}
                    disabled={done || pending}
                    className={`${FIELD} sm:w-64`}
                  />
                </label>

                {!done && (
                  <button
                    type="button"
                    onClick={() => scheduleOne(d.key)}
                    disabled={pending || !canSchedule}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Schedule this one
                  </button>
                )}
              </div>
            </details>
          )
        })}

        {!canSchedule && (
          <p className="rounded-card border border-border bg-canvas px-3 py-2.5 text-meta text-muted">
            {LAUNCH_NEEDS_SPACE_MESSAGE}
          </p>
        )}

        {access.upsell && (
          <p className="rounded-card border border-border bg-canvas px-3 py-2.5 text-meta text-muted">
            {access.upsell}{' '}
            <Link href="/upgrade" className="font-medium text-primary-strong underline-offset-4 hover:underline">
              See plans
            </Link>
          </p>
        )}
      </section>

      {/* ── Build the funnel ──────────────────────────────────────────────────── */}
      {access.canBuildFunnel && (
        <section className="rounded-card border border-border bg-surface px-4 py-3">
          <div className="flex items-start gap-3">
            <Network className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-text">Build the funnel</p>
              <p className="text-meta leading-snug text-muted">
                Wire the scheduled sends into a Growth OS funnel so you can watch what each one moves.
              </p>
              {funnelId ? (
                <Link
                  href={`/admin/growth/funnels/${funnelId}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-body-sm font-medium text-primary-strong underline-offset-4 hover:underline"
                >
                  <Check className="h-4 w-4" aria-hidden /> Open the funnel
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={buildFunnel}
                  disabled={pending || scheduledIds.length === 0}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
                  Build the funnel
                </button>
              )}
              {scheduledIds.length === 0 && !funnelId && (
                <p className="mt-1 text-2xs text-muted">Schedule a send first, then wire it up.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Message enrollees (the shared BroadcastComposer, streamed by the page) ── */}
      {children}

      {note && <p className="text-body-sm text-success">{note}</p>}
      {error && (
        <p className="text-body-sm text-danger">
          {error}{' '}
          <Link href="/upgrade" className="font-medium text-primary-strong underline-offset-4 hover:underline">
            See plans
          </Link>
        </p>
      )}

      {/* Footer — the whole series in one press, and the ways back. */}
      {remaining.length > 0 && canSchedule && (
        <button
          type="button"
          onClick={scheduleAll}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {remaining.length === drafts.length
            ? 'Schedule the whole series'
            : `Schedule the remaining ${remaining.length}`}
        </button>
      )}

      <p className="text-center text-meta text-subtle">
        <Link
          href={`/journeys/${slug}/learn`}
          className="underline-offset-4 transition-colors hover:text-muted hover:underline"
        >
          View the Journey
        </Link>
        <span className="px-1.5 text-border" aria-hidden>
          ·
        </span>
        <Link
          href={`/journeys/${slug}/edit`}
          className="inline-flex items-center gap-1 underline-offset-4 transition-colors hover:text-muted hover:underline"
        >
          <PenLine className="h-3 w-3" aria-hidden /> Keep editing
        </Link>
      </p>
    </div>
  )
}
