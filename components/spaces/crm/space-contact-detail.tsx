import { Suspense } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Clock,
  HeartPulse,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  User,
} from 'lucide-react'
import { getSpaceContactDetail, type SpaceContactInsight } from '@/lib/crm/space-contact-detail'
import { formatMoney } from '@/lib/crm/pipeline'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { tierLabel, healthTone } from '@/lib/dashboard/verdict'
import { ClientNotesPanel } from './client-notes-panel'
import { SpaceContactResonance } from './space-contact-resonance'
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

  const { identity, timeline, deals, notes, insight } = detail
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

      {/* Where this person is (Altitude 3): the one-line standing + the shared scores, with the plain
          "why" so a bare score is never shown. Fail-safe: a lead with no member profile reads the
          calm "not scored yet" line and no score row. */}
      <InsightBand insight={insight} />

      {/* About: the member's confirmed facts (interests, goals, neighborhood). Renders only when any
          are known, so a contact with no memory shows nothing rather than an empty shell. */}
      <AboutPanel insight={insight} />

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

      {/* Resonance matches (Altitude 3 · ADR-385): the people this member would gain from meeting,
          consent-first and reciprocal. Member-only; a lead shows the calm "not a member yet" state.
          Its own Suspense so the edge read never blocks the rest of the detail. */}
      <Suspense fallback={null}>
        <SpaceContactResonance profileId={insight.profileId} />
      </Suspense>

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

// The "where this person is" band + the shared score row (Altitude 3). The score row renders only
// when the matview has scored this member; otherwise the context line carries the calm "not scored
// yet" message. A bare score is never shown: every score row ships its top-signals + confidence.
function InsightBand({ insight }: { insight: SpaceContactInsight }) {
  const { scores, hasScores, contextLine, readout } = insight
  const confidenceLabel =
    readout.confidence === 'high' ? 'High confidence' : readout.confidence === 'medium' ? 'Worth a look' : 'Early read'
  const confidenceClass =
    readout.confidence === 'high'
      ? 'bg-success/10 text-success'
      : readout.confidence === 'medium'
        ? 'bg-primary/10 text-primary-strong'
        : 'bg-surface-elevated text-subtle'

  return (
    <section>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Where this person is
        </p>
        <p className="mt-1.5 text-sm text-text">{contextLine}</p>
        {hasScores && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${confidenceClass}`}>{confidenceLabel}</span>
            <span>
              <span className="font-medium">Top signals:</span> {readout.signals.join(' · ')}
            </span>
          </p>
        )}
      </div>

      {hasScores && (
        <div className="mt-3 grid grid-cols-2 gap-3 @md:grid-cols-3">
          <StatCard
            label={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    scores.resonanceHealth == null
                      ? 'bg-subtle'
                      : healthTone(scores.resonanceHealth) === 'success'
                        ? 'bg-success'
                        : healthTone(scores.resonanceHealth) === 'warning'
                          ? 'bg-warning'
                          : 'bg-danger'
                  }`}
                  aria-hidden
                />
                Resonance Health
              </span>
            }
            value={scores.resonanceHealth == null ? '–' : Math.round(scores.resonanceHealth)}
            icon={HeartPulse}
            detail={scores.resonanceTier ? tierLabel(scores.resonanceTier) : undefined}
          />
          <StatCard
            label="Churn risk"
            value={scores.churnRisk ? scores.churnRisk[0].toUpperCase() + scores.churnRisk.slice(1) : '–'}
            icon={Activity}
          />
          <StatCard
            label="Activation propensity"
            value={scores.activationPropensity == null ? '–' : Math.round(scores.activationPropensity)}
            icon={TrendingUp}
          />
        </div>
      )}
    </section>
  )
}

// The About panel (Altitude 3): the member's confirmed facts from Vera's memory. Renders nothing when
// no facts are known, so a contact with no memory shows no empty shell.
function AboutPanel({ insight }: { insight: SpaceContactInsight }) {
  const facts = insight.facts
  if (!facts) return null
  const interests = facts.interests ?? []
  const goals = facts.goals ?? []
  const neighborhood = facts.neighborhood?.trim() || null

  return (
    <section>
      <SectionHeader title="About" />
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {neighborhood && (
          <p className="flex items-center gap-2 text-sm text-text">
            <MapPin className="h-4 w-4 shrink-0 text-subtle" aria-hidden /> {neighborhood}
          </p>
        )}
        {interests.length > 0 && <FactRow icon={Sparkles} label="Interests" items={interests} />}
        {goals.length > 0 && <FactRow icon={Target} label="Goals" items={goals} />}
      </div>
      <p className="mt-2 text-xs text-subtle">What this member has told us, kept by Vera. They can see and clear it.</p>
    </section>
  )
}

function FactRow({ icon: Icon, label, items }: { icon: typeof Mail; label: string; items: string[] }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden /> {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
            {item}
          </span>
        ))}
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
