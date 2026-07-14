import Link from 'next/link'
import { QrCode, UserCheck, UserPlus, Gift, CalendarDays, Handshake, Sparkles, CircleCheck, CircleDashed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import type { SpaceLead, LeadDoor } from '@/lib/crm/lead-capture'

// LEAD CAPTURE / ENTRY POINTS — the Space CRM surface for captured leads (CRM Phase 3). Presentational
// only: the gated route (app/(main)/spaces/[slug]/crm/leads) reads the data and hands it here. Always
// carries on-screen guidance (how to make a lead-grab code + what the doors do) and an EmptyState
// prompt, per the page-framework standard. Semantic tokens only, no hex. Voice per CONTENT-VOICE (plain,
// no em dashes).

const DOOR_META: Record<LeadDoor, { label: string; Icon: LucideIcon; blurb: string }> = {
  space_qr: {
    label: 'QR scan',
    Icon: QrCode,
    blurb: 'Someone scanned a lead-grab code. Members join your CRM on the spot; visitors join when they sign up.',
  },
  warm_intro: {
    label: 'Warm intro',
    Icon: Handshake,
    blurb: 'A member or partner vouched for someone. They become mailable only once they accept.',
  },
  event: {
    label: 'Event',
    Icon: CalendarDays,
    blurb: 'Captured at an event. Attendance is not consent, so they stay a lead until they opt in.',
  },
  lead_magnet: {
    label: 'Lead magnet',
    Icon: Gift,
    blurb: 'They unlocked something you offered. The download is the opt-in, so they are mailable.',
  },
  share_back: {
    label: 'Share back',
    Icon: Sparkles,
    blurb: 'A reciprocal exchange where both sides shared details.',
  },
}

function doorMeta(door: LeadDoor) {
  return DOOR_META[door] ?? DOOR_META.space_qr
}

/** The lead-grab guide — what the doors do and how an owner makes a lead-grab code. Always on screen. */
function LeadGrabGuide({ codesHref }: { codesHref: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface/50 p-5">
      <SectionHeader title="How lead-grabs work" />
      <p className="text-sm text-muted">
        A lead-grab turns a scan or a sign-up into a person in your CRM, with the door they came through kept
        forever. The door is set once and never changes, so you always know where a relationship started.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {(Object.keys(DOOR_META) as LeadDoor[]).map((door) => {
          const m = doorMeta(door)
          return (
            <li key={door} className="flex gap-3 rounded-xl border border-border/60 bg-surface p-3">
              <m.Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-text">{m.label}</p>
                <p className="mt-0.5 text-xs text-muted">{m.blurb}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 rounded-xl border border-dashed border-border bg-surface p-4">
        <p className="text-sm font-semibold text-text">Make a lead-grab QR code</p>
        <p className="mt-1 text-xs text-muted">
          Open your space codes, add a code pointed at your booking page, class, or offer, and turn on
          lead-grab. Print it or add it to a flyer. Every scan lands here. If the code unlocks an offer, turn
          on the offer switch so people who scan can hear from you.
        </p>
        <Link
          href={codesHref}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          <QrCode className="h-4 w-4" aria-hidden /> Manage your codes
        </Link>
      </div>
    </section>
  )
}

function ConsentBadge({ state }: { state: SpaceLead['consentState'] }) {
  if (state === 'subscribed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <UserCheck className="h-3 w-3" aria-hidden /> Mailable
      </span>
    )
  }
  if (state === 'unsubscribed') {
    return <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-subtle">Opted out</span>
  }
  return (
    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">Not mailable</span>
  )
}

function ClaimBadge({ claimed }: { claimed: boolean }) {
  return claimed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-strong">
      <CircleCheck className="h-3 w-3" aria-hidden /> Joined
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-subtle">
      <CircleDashed className="h-3 w-3" aria-hidden /> Lead
    </span>
  )
}

function LeadRow({ lead, boardHref }: { lead: SpaceLead; boardHref: string }) {
  const m = doorMeta(lead.door)
  const name = lead.displayName || lead.email || 'Someone you met'
  return (
    <li>
      <Link
        href={`${boardHref}?contact=${lead.contactId}`}
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3 transition-colors hover:border-primary/40"
      >
        <m.Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          <p className="truncate text-xs text-muted">
            {m.label}
            {lead.where ? ` · ${lead.where}` : ''}
            {lead.email && lead.displayName ? ` · ${lead.email}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConsentBadge state={lead.consentState} />
          <ClaimBadge claimed={lead.claimed} />
        </div>
      </Link>
    </li>
  )
}

export function LeadsView({
  leads,
  boardHref,
  codesHref,
}: {
  leads: SpaceLead[]
  /** The CRM board href (a lead row opens ?contact= on it). */
  boardHref: string
  /** Where the owner manages QR codes. */
  codesHref: string
}) {
  return (
    <div className="space-y-6">
      <LeadGrabGuide codesHref={codesHref} />

      <section>
        <SectionHeader title="Captured leads" count={leads.length} />
        {leads.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No leads captured yet"
            description="When someone scans a lead-grab code or comes through a door above, they show up here with where they started. Make a lead-grab code to begin."
            action={
              <Link
                href={codesHref}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <QrCode className="h-4 w-4" aria-hidden /> Make a lead-grab code
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {leads.map((lead) => (
              <LeadRow key={lead.contactId} lead={lead} boardHref={boardHref} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
