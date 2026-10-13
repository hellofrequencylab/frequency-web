'use client'

import { useState, useTransition } from 'react'
import { reviewReport, warnMember, suspendMember, cancelEventFromReport } from '@/app/(main)/feed/report-actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'
import type { ReportWithPreview } from '@/components/widgets/admin/admin-moderation-queue'

// The Frequency report cards (templates/admin/Moderation.html `.panel.stack.rep`). The SAME server actions
// the DAWN queue calls (app/(main)/admin/moderation/moderation-queue.tsx): hide the content, warn or suspend
// a member, cancel an event, dismiss. Each action re-checks the moderator's scope server-side. A card leaves
// the list once its action succeeds.

const REASON: Record<string, { label: string; tone: 'bad' | 'warn' | 'n' }> = {
  harassment: { label: 'Harassment', tone: 'bad' },
  inappropriate: { label: 'Inappropriate', tone: 'bad' },
  spam: { label: 'Spam', tone: 'warn' },
  misinformation: { label: 'Misinformation', tone: 'warn' },
  other: { label: 'Other', tone: 'n' },
}

const TARGET: Record<string, string> = {
  post: 'Post',
  dispatch: 'Dispatch',
  comment: 'Comment',
  member: 'Member',
  event: 'Event',
  guestbook: 'Guestbook note',
}

const SUSPEND: { label: string; days: number | null }[] = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Indefinite', days: null },
]

export function ReportQueue({ reports }: { reports: ReportWithPreview[] }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [suspendFor, setSuspendFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run(reportId: string, action: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      const r = await action()
      if (isError(r)) {
        setError(r.error)
        return
      }
      setSuspendFor(null)
      setDone((prev) => new Set(prev).add(reportId))
    })
  }

  const open = reports.filter((r) => !done.has(r.id))

  return (
    <>
      <div className="tabs adp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="on">
          Open {open.length}
        </button>
      </div>

      {error && (
        <p role="alert" className="st bad">
          {error}
        </p>
      )}

      {open.length === 0 ? (
        <div className="panel stack adp-mid">
          <span className="h3">The queue is clear</span>
          <span className="t2">No reports are waiting. New member reports will appear here for review.</span>
        </div>
      ) : (
        <div className="stack adp-list">
          {open.map((r) => {
            const reason = REASON[r.reason] ?? REASON.other
            const target = TARGET[r.target_type] ?? r.target_type
            const hideable = ['post', 'comment', 'dispatch', 'guestbook'].includes(r.target_type)
            const prior = r.target_type === 'member' && (r.priorReports ?? 0) > 1 ? r.priorReports : null
            return (
              <div key={r.id} className="panel stack rep adp-mid">
                <div className="row wrap">
                  <span className={`st ${reason.tone}`}>{reason.label}</span>
                  <span className="t2">
                    {relativeTime(r.created_at)} · {target}
                    {prior ? ` · ${prior} prior reports` : ''}
                  </span>
                </div>
                <p className="body adp-rep">
                  {r.details ? <>&ldquo;{r.details}&rdquo; </> : null}
                  Reported by {r.reporter.display_name}
                  {r.target_type === 'member' ? ` about ${r.preview}.` : '.'}
                </p>
                {r.target_type !== 'member' && r.preview && <p className="t2">{r.preview}</p>}
                <div className="row wrap">
                  {hideable && (
                    <button
                      type="button"
                      className="btn sm ink"
                      disabled={isPending}
                      onClick={() => run(r.id, () => reviewReport(r.id, 'actioned'))}
                    >
                      Hide {target.toLowerCase()}
                    </button>
                  )}
                  {r.target_type === 'member' && (
                    <>
                      <button
                        type="button"
                        className="btn sm ink"
                        disabled={isPending}
                        onClick={() => setSuspendFor(suspendFor === r.id ? null : r.id)}
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={isPending}
                        onClick={() => run(r.id, () => warnMember(r.id, r.target_id, r.reason))}
                      >
                        Warn
                      </button>
                    </>
                  )}
                  {r.target_type === 'event' && (
                    <button
                      type="button"
                      className="btn sm ink"
                      disabled={isPending}
                      onClick={() => run(r.id, () => cancelEventFromReport(r.id, r.target_id))}
                    >
                      Cancel event
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm txt"
                    disabled={isPending}
                    onClick={() => run(r.id, () => reviewReport(r.id, 'dismissed'))}
                  >
                    Dismiss
                  </button>
                </div>
                {suspendFor === r.id && (
                  <div className="stack adp-tight">
                    <span className="t2">Suspend posting for how long? Reading and messages stay open.</span>
                    <div className="chips">
                      {SUSPEND.map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          className="chip"
                          disabled={isPending}
                          onClick={() =>
                            run(r.id, () =>
                              suspendMember(r.id, r.target_id, { reason: r.reason, durationDays: o.days ?? undefined }),
                            )
                          }
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
