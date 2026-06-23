import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  User, UserCheck, Mail, QrCode, Activity, MapPin, Building2,
  Tag, StickyNote, Briefcase, Clock, ScanLine, Sparkles, Users,
  MessageSquare, Phone, CalendarDays,
} from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { resolvePerson } from '@/lib/crm/person'
import { listInteractionsForPerson, type InteractionChannel } from '@/lib/crm/interactions'
import { buildTimeline } from '@/lib/crm/timeline'
import { buildJourney, groupByPhase, type JourneyKind } from '@/lib/crm/journey'
import { InviteButton } from './invite-button'
import { ConsentToggle, AddNote, EditContactFields } from './contact-actions'

export const dynamic = 'force-dynamic'

const CONSENT_TONE: Record<string, StatusTone> = {
  subscribed: 'success',
  unsubscribed: 'danger',
  unknown: 'neutral',
}

const KIND_ICON: Record<JourneyKind, typeof User> = {
  first_touch: Sparkles,
  captured: ScanLine,
  crm_lead: Mail,
  invited: Mail,
  joined: UserCheck,
  scan: QrCode,
  engagement: Activity,
  activity: StickyNote,
  deal: Briefcase,
}

const CHANNEL_ICON: Record<InteractionChannel, typeof User> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  in_person: Users,
  event: CalendarDays,
  note: StickyNote,
  system: Activity,
}

function fmtDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
      {children}
    </span>
  )
}

export default async function ContactStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const person = await resolvePerson(id)
  if (!person) notFound()

  const { contact, member, captures } = person
  const journey = buildJourney({
    contact: {
      source: contact.source,
      firstSeenAt: contact.firstSeenAt,
      createdAt: contact.createdAt,
      acquisition: member?.acquisition ?? contact.acquisition,
    },
    member: member ? { createdAt: member.createdAt, referred: member.referred } : null,
    captures: captures.map((c) => ({ source: c.source, ownerName: c.ownerName, invitedAt: c.invitedAt, createdAt: c.createdAt })),
    scans: person.scans.map((s) => ({ codeTitle: s.codeTitle, scannedAt: s.scannedAt })),
    events: person.events.map((e) => ({ eventType: e.eventType, source: e.source, createdAt: e.createdAt })),
    activities: person.activities.map((a) => ({ kind: a.kind, body: a.body, createdAt: a.createdAt })),
    deals: person.deals.map((d) => ({ title: d.title, status: d.status, createdAt: contact.createdAt ?? '' })),
  })
  const phases = groupByPhase(journey)

  // The raw chronological timeline across every identity row for this person (ADR-372): contact +
  // profile + capture subjects. Legacy capture notes + QR scans are folded in until the write adapters
  // backfill them into contact_interactions.
  const subjectIds = [contact.id, contact.profileId, ...captures.map((c) => c.id)]
  const timeline = buildTimeline({
    interactions: await listInteractionsForPerson(subjectIds),
    notes: captures.flatMap((c) => c.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt }))),
    scans: person.scans.map((s) => ({ id: s.id, codeTitle: s.codeTitle, scannedAt: s.scannedAt })),
  })

  const name = contact.displayName || member?.displayName || contact.email
  const channel = member?.acquisition?.channel ?? contact.acquisition?.channel ?? contact.source ?? '–'
  const interactions = person.scans.length + person.events.length

  return (
    <DetailTemplate
      back={{ href: '/admin/marketing/contacts', label: 'Contacts' }}
      title={name}
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> {contact.email}
        </span>
      }
      badges={
        <span className="flex items-center gap-1.5">
          {member ? (
            <StatusChip tone="info"><UserCheck className="h-3 w-3" /> Member</StatusChip>
          ) : (
            <StatusChip tone="neutral"><User className="h-3 w-3" /> Lead</StatusChip>
          )}
          <StatusChip tone={CONSENT_TONE[contact.consentState] ?? 'neutral'}>
            <span className="capitalize">{contact.consentState}</span>
          </StatusChip>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!member && <InviteButton contactId={contact.id} />}
          <ConsentToggle contactId={contact.id} state={contact.consentState} />
        </div>
      }
    >
      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Status" value={member ? 'Member' : 'Lead'} icon={member ? UserCheck : User} />
        <StatCard label="First touch" value={channel} icon={Sparkles} />
        <StatCard label="Engagement" value={Math.round(contact.engagementScore)} icon={Activity} />
        <StatCard label="Captures" value={captures.length} icon={ScanLine} />
        <StatCard label="Interactions" value={interactions} icon={QrCode} />
        <StatCard label="First seen" value={fmtDate(contact.firstSeenAt ?? contact.createdAt)} icon={Clock} />
      </div>

      {/* Grouped records — the "everything about this person, together" panel. */}
      <section className="mt-8">
        <SectionHeader title="Grouped records" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Member */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              <UserCheck className="h-3.5 w-3.5" /> Member profile
            </p>
            {member ? (
              <div className="mt-2">
                <Link href={`/people/${member.handle}`} className="font-semibold text-primary-strong hover:underline">
                  {member.displayName}
                </Link>
                <p className="text-sm text-muted">@{member.handle} · {member.communityRole}</p>
                {member.city && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-subtle"><MapPin className="h-3 w-3" /> {member.city}</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Not a member yet. They have no login or public profile, which is why search by username doesn’t find them.
                Use <span className="font-medium text-text">Invite to join</span> above.
              </p>
            )}
          </div>

          {/* CRM */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
              <Mail className="h-3.5 w-3.5" /> CRM contact
            </p>
            <p className="mt-2 text-sm text-text">{contact.email}</p>
            <p className="text-sm text-muted">Source: {contact.source ?? '–'} · Consent: {contact.consentState}</p>
            {contact.city && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-subtle"><MapPin className="h-3 w-3" /> {contact.city}</p>
            )}
            {person.deals.length > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-subtle">
                <Briefcase className="h-3 w-3" /> {person.deals.length} deal{person.deals.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Staff power action: edit the safe fields on the contact row (ADR-379). */}
        <div className="mt-3">
          <EditContactFields
            contactId={contact.id}
            email={contact.email}
            displayName={contact.displayName}
            city={contact.city}
            source={contact.source}
          />
        </div>

        {/* Private captures (steward scans) */}
        {captures.length > 0 && (
          <div className="mt-3 space-y-3">
            {captures.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                    <ScanLine className="h-3.5 w-3.5" /> Capture · {c.source}
                  </p>
                  <Chip>{c.visibility}</Chip>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  {c.ownerName && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> by {c.ownerName}</span>}
                  {c.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {c.company}</span>}
                  {c.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {c.city}</span>}
                </div>
                {c.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-subtle" />
                    {c.tags.map((t) => <Chip key={t}>{t}</Chip>)}
                  </div>
                )}
                {c.notes.map((n) => (
                  <p key={n.id} className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" /> {n.body}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Interaction timeline — the raw chronological record (ADR-372) + the staff note composer. */}
      <section className="mt-8">
        <SectionHeader title="Timeline" count={timeline.length} />
        <AddNote contactId={contact.id} />
        {timeline.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No interactions yet"
            description="Notes, emails, calls, and in-person touches will show here, newest first."
          />
        ) : (
          <ol className="relative mt-3 space-y-3 border-l border-border pl-5">
            {timeline.map((e) => {
              const Icon = CHANNEL_ICON[e.channel] ?? Activity
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-primary-strong">
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-text">{e.title}</span>
                    <Chip>{e.channel.replace('_', ' ')}</Chip>
                    <span className="text-xs text-subtle">{fmtDate(e.at)}</span>
                  </div>
                  {e.detail && <p className="mt-0.5 text-sm text-muted">{e.detail}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* The path through the system */}
      <section className="mt-8">
        <SectionHeader title="Path through the system" count={journey.length} />
        {phases.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" description="Their journey will appear here as they move through the system." />
        ) : (
          <div className="mt-3 space-y-6">
            {phases.map((group) => (
              <div key={group.phase}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{group.label}</p>
                <ol className="relative space-y-3 border-l border-border pl-5">
                  {group.events.map((e, i) => {
                    const Icon = KIND_ICON[e.kind]
                    return (
                      <li key={`${e.kind}-${e.at}-${i}`} className="relative">
                        <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-primary-strong">
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-text">{e.title}</span>
                          {e.channel && <Chip>{e.channel}</Chip>}
                          <span className="text-xs text-subtle">{fmtDate(e.at)}</span>
                        </div>
                        {e.detail && <p className="mt-0.5 text-sm text-muted">{e.detail}</p>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </DetailTemplate>
  )
}
