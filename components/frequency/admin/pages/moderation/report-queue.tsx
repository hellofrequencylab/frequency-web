'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { reviewReport, warnMember, suspendMember, cancelEventFromReport } from '@/app/(main)/feed/report-actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'
import type { ReportWithPreview } from '@/components/widgets/admin/admin-moderation-queue'
import type { BlockedMember, ResolvedReport } from './moderation-reads'
import { FqIcon } from '@/components/frequency/icon'
import { Av, EMPTY } from '../shared'

// HOME_TZ from lib/time/zone.ts, written out: that module carries tz-lookup, too heavy for a client bundle.
const HOME_TZ = 'America/Los_Angeles'

// The Frequency report cards (templates/admin/Moderation.html `.panel.stack.rep`). The SAME server actions
// the DAWN queue calls (app/(main)/admin/moderation/moderation-queue.tsx): hide the content, warn or suspend
// a member, cancel an event, dismiss. Each action re-checks the moderator's scope server-side. A card leaves
// the list once its action succeeds. The design's four tabs: Open (the queue), Resolved (the latest reviewed
// reports), Blocked (members whose posting is suspended) and Rules (the community guidelines), all read on
// the server (moderation-reads.ts) and switched here without a fetch.
//
// CONFIRMATION. Every action that changes something a member sees (hide the content, warn, suspend, cancel
// an event) asks once, inline on its card, before it runs: the card names the consequence and offers the
// action again beside Keep. Dismiss only closes the report, so it runs straight away.

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

type ModTab = 'open' | 'resolved' | 'blocked' | 'rules'

const STATUS: Record<string, { label: string; tone: 'ok' | 'n' }> = {
  actioned: { label: 'Actioned', tone: 'ok' },
  reviewed: { label: 'Reviewed', tone: 'ok' },
  dismissed: { label: 'Dismissed', tone: 'n' },
}

// The home zone, so the server (UTC) and the browser print the same day.
const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: HOME_TZ, month: 'short', day: 'numeric' })

/** The House rules panel (design: the soft row under the queue). The platform's rules are the community
 *  guidelines page; there is no per-Space rules editor, so the action opens the guidelines. */
export function HouseRules({ children }: { children?: ReactNode }) {
  return (
    <div className="soft row wrap sec adp-rules">
      <span className="stack adp-tight">
        <span className="h3">House rules</span>
        <span className="t2">{children ?? 'The community guidelines, the rules every report here is judged against.'}</span>
      </span>
      <Link className="btn sm" href="/guidelines">
        <FqIcon name="shield" />
        Read the guidelines
      </Link>
    </div>
  )
}

export function ReportQueue({ reports, resolved, blocked }: { reports: ReportWithPreview[]; resolved: ResolvedReport[]; blocked: BlockedMember[] }) {
  const [tab, setTab] = useState<ModTab>('open')
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [suspendFor, setSuspendFor] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ reportId: string; ask: string; yes: string; action: () => Promise<ActionResult> } | null>(
    null,
  )
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
      setConfirm(null)
      setDone((prev) => new Set(prev).add(reportId))
    })
  }

  const open = reports.filter((r) => !done.has(r.id))

  return (
    <>
      <div className="tabs adp-tabs" role="tablist" aria-label="Moderation">
        {(
          [
            ['open', `Open ${open.length}`],
            ['resolved', 'Resolved'],
            ['blocked', 'Blocked'],
            ['rules', 'Rules'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : undefined} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'resolved' && <ResolvedList reports={resolved} />}
      {tab === 'blocked' && <BlockedList members={blocked} />}
      {tab === 'rules' && <HouseRules>Every report in this queue is judged against the community guidelines. Read them before you act.</HouseRules>}
      {tab === 'open' && (
      <>

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
                      onClick={() =>
                        setConfirm({
                          reportId: r.id,
                          ask: `Hide this ${target.toLowerCase()}? Members stop seeing it straight away.`,
                          yes: `Hide ${target.toLowerCase()}`,
                          action: () => reviewReport(r.id, 'actioned'),
                        })
                      }
                    >
                      <FqIcon name="close" />
                      Hide {target.toLowerCase()}
                    </button>
                  )}
                  {r.target_type === 'member' && (
                    <>
                      <button
                        type="button"
                        className="btn sm ink"
                        disabled={isPending}
                        aria-expanded={suspendFor === r.id}
                        onClick={() => {
                          setConfirm(null)
                          setSuspendFor(suspendFor === r.id ? null : r.id)
                        }}
                      >
                        <FqIcon name="shield" />
                        Suspend
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={isPending}
                        onClick={() =>
                          setConfirm({
                            reportId: r.id,
                            ask: `Send ${r.preview || 'this member'} a warning? Vera sends them a direct message.`,
                            yes: 'Send warning',
                            action: () => warnMember(r.id, r.target_id, r.reason),
                          })
                        }
                      >
                        <FqIcon name="flag" />
                        Warn
                      </button>
                    </>
                  )}
                  {r.target_type === 'event' && (
                    <button
                      type="button"
                      className="btn sm ink"
                      disabled={isPending}
                      onClick={() =>
                        setConfirm({
                          reportId: r.id,
                          ask: 'Cancel this event? It is marked cancelled for everyone who sees it.',
                          yes: 'Cancel event',
                          action: () => cancelEventFromReport(r.id, r.target_id),
                        })
                      }
                    >
                      <FqIcon name="event" />
                      Cancel event
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm txt"
                    disabled={isPending}
                    onClick={() => run(r.id, () => reviewReport(r.id, 'dismissed'))}
                  >
                    <FqIcon name="check" />
                    Dismiss
                  </button>
                </div>
                {confirm?.reportId === r.id && (
                  <div className="soft stack adp-tight" role="alertdialog" aria-label="Confirm moderation action">
                    <span className="t1">{confirm.ask}</span>
                    <div className="row wrap">
                      <button type="button" className="btn sm ink" disabled={isPending} onClick={() => run(r.id, confirm.action)}>
                        {isPending ? 'Working' : confirm.yes}
                      </button>
                      <button type="button" className="btn sm txt" disabled={isPending} onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </div>
                  </div>
                )}
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
                            setConfirm({
                              reportId: r.id,
                              ask: `Suspend posting ${o.days === null ? 'until you lift it' : `for ${o.label}`}? Reading and messages stay open.`,
                              yes: o.days === null ? 'Suspend until lifted' : `Suspend for ${o.label}`,
                              action: () => suspendMember(r.id, r.target_id, { reason: r.reason, durationDays: o.days ?? undefined }),
                            })
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
      )}
      {tab !== 'rules' && <HouseRules />}
    </>
  )
}

function ResolvedList({ reports }: { reports: ResolvedReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="panel stack adp-mid">
        <span className="h3">Nothing resolved yet</span>
        <span className="t2">Reports you act on or dismiss show here, newest first.</span>
      </div>
    )
  }
  return (
    <div className="panel tbl-wrap" tabIndex={0} role="region" aria-label="Resolved reports">
      <table className="tbl">
        <thead>
          <tr>
            <th>Reason</th>
            <th>About</th>
            <th>Reported by</th>
            <th>Reported</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => {
            const reason = REASON[r.reason] ?? REASON.other
            const status = STATUS[r.status] ?? { label: r.status, tone: 'n' as const }
            return (
              <tr key={r.id}>
                <td>
                  <span className={`st ${reason.tone}`}>{reason.label}</span>
                </td>
                <td className="t1">{TARGET[r.targetType] ?? r.targetType}</td>
                <td>{r.reporterName}</td>
                <td>{dateFmt.format(new Date(r.createdAt))}</td>
                <td>
                  <span className={`st ${status.tone}`}>{status.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BlockedList({ members }: { members: BlockedMember[] }) {
  if (members.length === 0) {
    return (
      <div className="panel stack adp-mid">
        <span className="h3">No one is blocked</span>
        <span className="t2">Members you suspend from the queue show here until their suspension ends.</span>
      </div>
    )
  }
  return (
    <div className="panel tbl-wrap" tabIndex={0} role="region" aria-label="Blocked members">
      <table className="tbl">
        <thead>
          <tr>
            <th>Member</th>
            <th>Since</th>
            <th>Until</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>
                <span className="row">
                  <Av url={m.avatarUrl} />
                  <Link className="t1" href={`/people/${m.handle}`}>
                    {m.name}
                  </Link>
                </span>
              </td>
              <td>{dateFmt.format(new Date(m.since))}</td>
              <td>{m.until ? dateFmt.format(new Date(m.until)) : 'Until lifted'}</td>
              <td>{m.reason ? (REASON[m.reason]?.label ?? m.reason) : EMPTY}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
