'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail,
  Phone,
  ExternalLink,
  ChevronDown,
  HeartPulse,
  Activity,
  TrendingUp,
  Send,
  MailOpen,
  MousePointerClick,
  Reply,
  Users,
  CalendarDays,
  Building2,
  StickyNote,
  Sparkles,
  UserCheck,
  Route as RouteIcon,
} from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { getInitials, cn } from '@/lib/utils'
// Type-only import: never pull the server-only network reader into the client bundle.
import type { MemberNetwork, NetworkItem } from '@/lib/crm/member-network'
import { MemberComposer } from '@/components/admin/crm/member-composer'
import type { CrmMemberDetail } from './types'
import type { MemberRole } from '@/lib/people/member-viewer'

/** True when the member neither manages nor belongs to anything. Inlined (the pure lib twin lives
 *  server-side; this keeps the client bundle free of the server-only reader). */
function networkIsEmpty(n: MemberNetwork): boolean {
  return n.circlesHosted.length === 0 && n.eventsHosted.length === 0 && n.spacesOwned.length === 0 && n.memberOf.length === 0
}

// THE CRM MASTER-DETAIL RIGHT PANE (Resonance CRM home · ADR-459). Everything about one member on ONE
// page, so no separate member page is ever needed:
//   (a) a compact profile card  — identity + ALL contact info (email / phone / links) + role chips.
//   (b) the <MemberComposer>     — the sibling compose surface (reach out in-line).
//   (c) an expandable dropdown   — the FULL profile, ported + condensed from the retired contact page:
//        identity + notes · scores + the engagement rollup (4-across) · what they MANAGE + are PART OF
//        · a "Path" rail of MAJOR milestones only.
// Presentation-neutral: it renders only the fields the server sourced (all optional, fail-safe). Semantic
// DAWN tokens only, no hex; copy is plain, no em dashes (docs/CONTENT-VOICE.md).

function roleToneClass(tone: MemberRole['tone']): string {
  switch (tone) {
    case 'primary':
      return 'border-primary/30 bg-primary-bg text-primary-strong'
    case 'success':
      return 'border-success/30 bg-success-bg text-success'
    case 'warning':
      return 'border-warning/30 bg-warning-bg text-warning'
    case 'danger':
      return 'border-danger/30 bg-danger-bg text-danger'
    default:
      return 'border-border bg-surface-elevated text-muted'
  }
}

function Avatar({ detail }: { detail: CrmMemberDetail }) {
  if (detail.avatarUrl) {
    return (
      <Image
        src={detail.avatarUrl}
        alt={detail.displayName}
        width={56}
        height={56}
        className="h-14 w-14 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-bg text-lg font-semibold text-primary-strong select-none">
      {getInitials(detail.displayName)}
    </div>
  )
}

/** One "manages / part of" group: a labeled list of Circles / Events / Spaces. Renders nothing when
 *  empty, so the caller can drop it in unconditionally. */
function NetworkGroup({ icon: Icon, label, items }: { icon: typeof Users; label: string; items: NetworkItem[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            {it.href ? (
              <Link href={it.href} className="truncate text-text hover:text-primary-strong">
                {it.label}
              </Link>
            ) : (
              <span className="truncate text-text">{it.label}</span>
            )}
            {it.meta && <span className="shrink-0 text-2xs text-subtle">{it.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The in-dropdown FULL profile (ported + condensed from the retired contact page). */
function FullProfile({ detail }: { detail: CrmMemberDetail }) {
  const { scores, engagement, network, milestones, notes } = detail
  const hasScores = scores && (scores.health != null || scores.tier || scores.churn || scores.activation != null || scores.lifecycle)
  const hasNetwork = network && !networkIsEmpty(network)

  return (
    <div className="mt-3 space-y-5 border-t border-border pt-4">
      {/* Notes */}
      {notes && notes.length > 0 && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Notes</h4>
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-sm text-muted">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                <span>{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Scores */}
      {hasScores && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Scores</h4>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Health" value={scores!.health == null ? '–' : Math.round(scores!.health)} icon={HeartPulse} detail={scores!.tier ?? undefined} />
            <StatCard label="Churn risk" value={scores!.churn ?? '–'} icon={Activity} />
            <StatCard label="Activation" value={scores!.activation == null ? '–' : Math.round(scores!.activation)} icon={TrendingUp} detail={scores!.lifecycle ?? undefined} />
          </div>
        </section>
      )}

      {/* Engagement rollup — the tiles kept, smaller, 4 across. */}
      {engagement && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Engagement</h4>
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Sent" value={engagement.sent} icon={Send} />
            <StatCard label="Opened" value={engagement.opened} icon={MailOpen} />
            <StatCard label="Clicked" value={engagement.clicked} icon={MousePointerClick} />
            <StatCard label="Replied" value={engagement.replied} icon={Reply} />
          </div>
          {engagement.lastTouch && (
            <p className="mt-1.5 text-2xs text-subtle">Last touch {engagement.lastTouch}</p>
          )}
        </section>
      )}

      {/* What they MANAGE + are PART OF */}
      {hasNetwork && (
        <section className="grid gap-4 @lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Manages</p>
            <NetworkGroup icon={Users} label="Circles hosted" items={network!.circlesHosted} />
            <NetworkGroup icon={CalendarDays} label="Events hosted" items={network!.eventsHosted} />
            <NetworkGroup icon={Building2} label="Spaces owned" items={network!.spacesOwned} />
            {network!.circlesHosted.length === 0 && network!.eventsHosted.length === 0 && network!.spacesOwned.length === 0 && (
              <p className="text-sm text-subtle">Not running anything yet.</p>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Part of</p>
            <NetworkGroup icon={UserCheck} label="Circles" items={network!.memberOf} />
            {network!.memberOf.length === 0 && <p className="text-sm text-subtle">No circle memberships yet.</p>}
          </div>
        </section>
      )}

      {/* The "Path" rail: MAJOR milestones only. */}
      {milestones && milestones.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <RouteIcon className="h-3.5 w-3.5" aria-hidden /> Path
          </h4>
          <ol className="relative space-y-3 border-l border-border pl-5">
            {milestones.map((m, i) => (
              <li key={`${m.kind}-${m.at}-${i}`} className="relative">
                <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-primary-strong">
                  <Sparkles className="h-3 w-3" aria-hidden />
                </span>
                <p className="text-sm font-medium text-text">{m.title}</p>
                {m.detail && <p className="text-2xs text-subtle">{m.detail}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

/** The CRM master-detail pane. `detail` carries the compact profile fields plus the rich CRM fields. */
export function CrmMemberDetailPane({ detail }: { detail: CrmMemberDetail }) {
  const [open, setOpen] = useState(false)
  const contact = detail.contact
  const hasContact = !!(contact && (contact.email || contact.phone || contact.links?.length))

  return (
    <div className="@container flex flex-col gap-4">
      {/* (a) Compact profile card: identity + ALL contact info + role chips. */}
      <div className="flex items-start gap-4">
        <Avatar detail={detail} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-text">{detail.displayName}</h2>
          <p className="truncate text-sm text-subtle">@{detail.handle}</p>
          {detail.roles && detail.roles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {detail.roles.map((r) => (
                <span
                  key={r.label}
                  className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold', roleToneClass(r.tone))}
                >
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasContact && (
        <ul className="space-y-1.5 text-sm">
          {contact!.email && (
            <li>
              <a href={`mailto:${contact!.email}`} className="inline-flex items-center gap-2 text-text hover:text-primary-strong">
                <Mail className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">{contact!.email}</span>
              </a>
            </li>
          )}
          {contact!.phone && (
            <li>
              <a href={`tel:${contact!.phone}`} className="inline-flex items-center gap-2 text-text hover:text-primary-strong">
                <Phone className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">{contact!.phone}</span>
              </a>
            </li>
          )}
          {contact!.links?.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-text hover:text-primary-strong">
                <ExternalLink className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">{l.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* (b) The compose surface (sibling component). Mounted when the member has a reachable email;
          the "manages" groups become one-tap "everyone in..." recipient chips. */}
      {detail.email && (
        <MemberComposer
          profileId={detail.profileId}
          email={detail.email}
          displayName={detail.displayName}
          manages={
            detail.network
              ? {
                  circles: detail.network.circlesHosted.map((c) => ({ id: c.id, name: c.label })),
                  events: detail.network.eventsHosted.map((e) => ({ id: e.id, title: e.label })),
                }
              : undefined
          }
        />
      )}

      {/* (c) The expandable FULL profile. */}
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          <span>Full profile</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && <FullProfile detail={detail} />}
      </div>
    </div>
  )
}
