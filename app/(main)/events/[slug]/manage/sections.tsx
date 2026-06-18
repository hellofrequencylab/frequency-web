import Link from 'next/link'
import { Check, Star, Clock, Users, Megaphone, Radio, MessageSquare, Zap } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  loadRoster,
  loadPendingApprovals,
  loadQuestionnaire,
  loadSentDispatches,
  type ManageGuest,
} from './load'
import { ApproveButton } from './approve-button'
import { CsvExportButton } from './csv-export-button'
import { QuestionEditor } from './question-editor'

// The Manage Dashboard's body sections (EVENTS-REWORK A2). Each is an async Server
// Component that fetches its own slice, so the page can stream them behind their
// own <Suspense> (PAGE-FRAMEWORK §5). The page already authorized the caller as
// host/cohost; these only read.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_CHIP: Record<
  ManageGuest['status'],
  { Icon: typeof Check; cls: string; label: string }
> = {
  going: { Icon: Check, cls: 'bg-success-bg text-success', label: 'Going' },
  maybe: { Icon: Star, cls: 'bg-primary-bg text-primary-strong', label: 'Interested' },
  waitlist: { Icon: Clock, cls: 'bg-surface-elevated text-muted', label: 'Waitlist' },
  not_going: { Icon: Users, cls: 'bg-surface-elevated text-subtle', label: 'Not going' },
}

function GuestName({ guest }: { guest: ManageGuest }) {
  return guest.handle ? (
    <Link href={`/people/${guest.handle}`} className="block truncate font-medium text-text hover:underline">
      {guest.displayName}
    </Link>
  ) : (
    <span className="block truncate font-medium text-text">{guest.displayName}</span>
  )
}

// ── Roster ──────────────────────────────────────────────────────────────────

function RosterGroup({ title, guests }: { title: string; guests: ManageGuest[] }) {
  if (guests.length === 0) return null
  return (
    <div>
      <SectionHeader title={title} count={guests.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {guests.map((g) => {
          const chip = STATUS_CHIP[g.status]
          return (
            <li key={g.profileId} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${chip.cls}`}
              >
                <chip.Icon className="h-3 w-3" />
                {chip.label}
              </span>
              <div className="min-w-0 flex-1">
                <GuestName guest={g} />
                {g.plusOnes > 0 && (
                  <span className="ml-2 text-xs text-subtle">
                    +{g.plusOnes} {g.plusOnes === 1 ? 'guest' : 'guests'}
                    {g.plusOneNames.length > 0 && ` (${g.plusOneNames.join(', ')})`}
                  </span>
                )}
              </div>
              {g.checkedIn && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-2xs font-semibold text-success">
                  <Zap className="h-3 w-3" />
                  Checked in
                </span>
              )}
              <span className="shrink-0 text-xs text-subtle">{fmtDate(g.createdAt)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export async function RosterSection({ eventId }: { eventId: string }) {
  const roster = await loadRoster(eventId)
  const going = roster.filter((g) => g.status === 'going')
  const maybe = roster.filter((g) => g.status === 'maybe')
  const waitlist = roster.filter((g) => g.status === 'waitlist')

  if (going.length === 0 && maybe.length === 0 && waitlist.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No RSVPs yet"
        description="When people respond, they show up here grouped by going, interested, and the waitlist."
      />
    )
  }

  return (
    <div className="space-y-6">
      <RosterGroup title="Going" guests={going} />
      <RosterGroup title="Interested" guests={maybe} />
      <RosterGroup title="Waitlist" guests={waitlist} />
    </div>
  )
}

// ── Approval queue ────────────────────────────────────────────────────────────

export async function ApprovalsSection({ eventId, slug }: { eventId: string; slug: string }) {
  const pending = await loadPendingApprovals(eventId)

  if (pending.length === 0) {
    return (
      <EmptyState
        variant="cleared"
        title="Nobody is waiting"
        description="Requests to join show up here. Approve one and the guest is in (a full event still sends them to the waitlist)."
      />
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {pending.map((p) => (
        <li key={p.profileId} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {p.handle ? (
              <Link href={`/people/${p.handle}`} className="block truncate font-medium text-text hover:underline">
                {p.displayName}
              </Link>
            ) : (
              <span className="block truncate font-medium text-text">{p.displayName}</span>
            )}
            <span className="text-xs text-subtle">requested {fmtDate(p.createdAt)}</span>
          </div>
          <ApproveButton eventId={eventId} slug={slug} guestProfileId={p.profileId} />
        </li>
      ))}
    </ul>
  )
}

// ── Questionnaire: authoring + responses + CSV ────────────────────────────────

export async function QuestionnaireSection({
  eventId,
  slug,
  eventTitle,
}: {
  eventId: string
  slug: string
  eventTitle: string
}) {
  const { questions, responses } = await loadQuestionnaire(eventId)

  const fileName = `${slug || 'event'}-responses.csv`
  const columns = questions.map((q) => ({ id: q.id, prompt: q.prompt }))

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="Questions" count={questions.length} />
        <QuestionEditor eventId={eventId} slug={slug} questions={questions} />
      </div>

      {questions.length > 0 && (
        <div>
          <SectionHeader
            title="Responses"
            count={responses.length}
            action={
              <CsvExportButton
                rows={responses.map((r) => ({
                  displayName: r.displayName,
                  handle: r.handle,
                  answers: r.answers,
                }))}
                columns={columns}
                fileName={fileName}
              />
            }
          />
          {responses.length === 0 ? (
            <EmptyState
              variant="first-use"
              title="No answers yet"
              description={`When guests answer the questions for ${eventTitle}, every response lands here, ready to export.`}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-xs font-semibold text-subtle">Guest</th>
                    {questions.map((q) => (
                      <th key={q.id} className="px-4 py-2.5 text-xs font-semibold text-subtle">
                        {q.prompt}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {responses.map((r) => (
                    <tr key={r.profileId} className="align-top">
                      <td className="px-4 py-2.5 font-medium text-text">
                        {r.handle ? (
                          <Link href={`/people/${r.handle}`} className="hover:underline">
                            {r.displayName}
                          </Link>
                        ) : (
                          r.displayName
                        )}
                      </td>
                      {questions.map((q) => (
                        <td key={q.id} className="px-4 py-2.5 text-muted">
                          {r.answers[q.id] || <span className="text-subtle">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sent Event Dispatches ─────────────────────────────────────────────────────

export async function DispatchesSection({ eventId }: { eventId: string }) {
  const dispatches = await loadSentDispatches(eventId)

  if (dispatches.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No updates sent yet"
        description="Post an update from the event page. It always lands on the page, and you can also send it as a Dispatch to reach guests."
      />
    )
  }

  return (
    <ul className="space-y-3">
      {dispatches.map((d) => (
        <li key={d.id} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {d.title && <p className="text-sm font-bold text-text">{d.title}</p>}
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{d.body}</p>
            </div>
            <span className="shrink-0 text-xs text-subtle">{fmtDate(d.createdAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-subtle">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              On the page
            </span>
            {d.toDispatch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-broadcast-bg px-2 py-0.5 text-broadcast-strong">
                <Radio className="h-3 w-3" />
                Sent as a Dispatch
              </span>
            )}
            {d.toSms && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5">
                <Megaphone className="h-3 w-3" />
                Texted the group
              </span>
            )}
            {d.authorName && <span>by {d.authorName}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
