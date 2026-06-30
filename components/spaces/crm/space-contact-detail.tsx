import Link from 'next/link'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  StickyNote,
  User,
} from 'lucide-react'
import { getSpaceContactDetail } from '@/lib/crm/space-contact-detail'
import { formatMoney } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientNotesPanel } from './client-notes-panel'
import { relativeTime, summarizeTimeline, type TimelineEntry } from '@/lib/crm/timeline'

// Channel-aware icon element for a timeline row, so an owner reads the kind of touch at a glance
// instead of a row of identical clocks. Notes and QR scans keep their origin icon; everything else
// maps by channel. Returns a rendered element (not a component reference) to stay clear of the
// static-components rule.
function timelineIcon(entry: TimelineEntry) {
  const cls = 'h-3.5 w-3.5'
  if (entry.origin === 'note') return <StickyNote className={cls} aria-hidden />
  if (entry.origin === 'scan') return <MapPin className={cls} aria-hidden />
  switch (entry.channel) {
    case 'email':
      return <Mail className={cls} aria-hidden />
    case 'sms':
      return <MessageSquare className={cls} aria-hidden />
    case 'call':
      return <PhoneCall className={cls} aria-hidden />
    case 'in_person':
      return <User className={cls} aria-hidden />
    case 'event':
      return <CalendarDays className={cls} aria-hidden />
    default:
      return <Clock className={cls} aria-hidden />
  }
}

// PER-SPACE CONTACT DETAIL (server, CRM-STRATEGY §6). The real detail surface for one selected contact
// on the Space CRM board: identity + fields, the contact's timeline (interactions + the Space's private
// notes, folded by buildTimeline), the contact's deals in this Space, and a note composer (the existing
// ClientNotesPanel, which writes through the owner-gated notes path). All reads are owner-gated +
// space-scoped inside getSpaceContactDetail; a non-editor / wrong-space contact yields the calm prompt.
// Composes kit primitives only (SectionHeader, EmptyState). No em/en dashes (CONTENT-VOICE §10).

const whenFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const sinceFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export async function SpaceContactDetail({
  spaceId,
  contactId,
  readOnly = false,
  backHref,
}: {
  spaceId: string
  contactId: string
  readOnly?: boolean
  /** Where the "Back to contacts" link points (the board clears ?contact). */
  backHref: string
}) {
  const detail = await getSpaceContactDetail(spaceId, contactId)

  if (!detail) {
    return (
      <section>
        <SectionHeader title="Contact" />
        <EmptyState
          icon={User}
          title="Pick a contact."
          description="Choose someone from the list to see their history, deals, and notes."
        />
      </section>
    )
  }

  const { identity, timeline, deals, notes } = detail
  const name = identity.name || identity.email || 'Unnamed contact'

  // Derive an at-a-glance recency line from the existing timeline (newest-first out of buildTimeline):
  // how many touches there are and when the last one was, in plain relative voice.
  const { count: touchCount, lastTouchAt } = summarizeTimeline(timeline)
  const lastTouchAgo = relativeTime(lastTouchAt)

  return (
    <section className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to contacts
      </Link>

      {/* Identity + fields */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
            <User className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-text">{name}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
              {identity.createdAt && <span>Added {whenFmt.format(new Date(identity.createdAt))}</span>}
              {/* At-a-glance recency from the existing timeline: when you last reached this person. */}
              {lastTouchAgo ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Clock className="h-3 w-3" aria-hidden /> Last touch {lastTouchAgo.toLowerCase()}
                </span>
              ) : (
                touchCount === 0 && <span className="text-subtle">No touches yet</span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 @md:grid-cols-2">
          <Field icon={Mail} label="Email" value={identity.email || null} />
          <Field icon={Phone} label="Phone" value={identity.phone} />
          <Field icon={Building2} label="Company" value={identity.company} />
          <Field icon={MapPin} label="City" value={identity.city} />
        </dl>
      </div>

      {/* Deals in this Space */}
      <div>
        <SectionHeader title="Deals" count={deals.length} />
        {deals.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No deals yet."
            description="Deals you track for this person in this space show here."
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
            {deals.map((deal) => (
              <li key={deal.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{deal.title}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted">{deal.status}</p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-text">
                  {formatMoney(deal.value, deal.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeline (interactions + private notes, newest first) */}
      <div>
        <SectionHeader title="Timeline" count={timeline.length} />
        {timeline.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No history yet."
            description="Calls, emails, meetings, and notes about this person show here, newest first."
          />
        ) : (
          <ol className="space-y-2">
            {timeline.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </div>

      {/* Note composer (reuses the owner-gated notes path) */}
      <div>
        <SectionHeader title="Notes" count={notes.length} />
        <ClientNotesPanel
          spaceId={spaceId}
          contactId={contactId}
          contactName={name}
          notes={notes}
          readOnly={readOnly}
        />
        <p className="mt-2 text-xs text-subtle">Notes you add also show on the timeline above.</p>
      </div>
    </section>
  )
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="truncate text-sm text-text">{value || <span className="text-subtle">Not set</span>}</dd>
      </div>
    </div>
  )
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const when = entry.at ? sinceFmt.format(new Date(entry.at)) : ''
  const ago = relativeTime(entry.at)
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted">
        {timelineIcon(entry)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold text-text">{entry.title}</p>
          {/* Relative recency up front, with the exact date on hover, so the stream reads at a glance. */}
          {ago && (
            <p className="shrink-0 text-xs font-medium text-subtle" title={when}>
              {ago}
            </p>
          )}
        </div>
        {when && <p className="mt-0.5 text-xs text-subtle">{when}</p>}
        {entry.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{entry.detail}</p>}
      </div>
    </li>
  )
}
