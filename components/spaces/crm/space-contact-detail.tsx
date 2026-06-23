import Link from 'next/link'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Clock,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  User,
} from 'lucide-react'
import { getSpaceContactDetail } from '@/lib/crm/space-contact-detail'
import { formatMoney } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientNotesPanel } from './client-notes-panel'
import type { TimelineEntry } from '@/lib/crm/timeline'

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
            {identity.createdAt && (
              <p className="mt-0.5 text-xs text-subtle">Added {whenFmt.format(new Date(identity.createdAt))}</p>
            )}
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
  const Icon = entry.origin === 'note' ? StickyNote : entry.origin === 'scan' ? MapPin : Clock
  const when = entry.at ? sinceFmt.format(new Date(entry.at)) : ''
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold text-text">{entry.title}</p>
          {when && <p className="shrink-0 text-xs text-subtle">{when}</p>}
        </div>
        {entry.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{entry.detail}</p>}
      </div>
    </li>
  )
}
