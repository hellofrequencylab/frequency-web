'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail,
  Phone,
  ExternalLink,
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
  X,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { StatCard } from '@/components/ui/stat-card'
import { getInitials, cn } from '@/lib/utils'
// Type-only import: never pull the server-only network reader into the client bundle.
import type { MemberNetwork, NetworkItem } from '@/lib/crm/member-network'
import { MemberComposer } from '@/components/admin/crm/member-composer'
import { SpaceMemberComposer } from '@/components/spaces/crm/space-member-composer'
import { discardDraftIfEmpty } from '@/app/(main)/admin/email-studio/actions'
import { discardSpaceEmailDraftIfEmpty } from '@/lib/spaces/email-drafts'
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

/** The CRM master-detail pane. `detail` carries the compact profile fields plus the rich CRM fields.
 *  `messageScope` OPTIONALLY re-scopes the "Message Member" composer to a Space: when provided, the popup
 *  renders the space-scoped composer (sends via the Space email path, searches only the Space's contacts)
 *  instead of the platform admin composer. Undefined = the unchanged platform behavior. */
export function CrmMemberDetailPane({
  detail,
  messageScope,
}: {
  detail: CrmMemberDetail
  messageScope?: { spaceId: string; slug: string }
}) {
  const [composeOpen, setComposeOpen] = useState(false)
  // The draft the popup is editing. Remembered across a close so reopening for the SAME member resumes
  // the saved draft. It never needs a manual reset: the viewer keys this pane by profileId, so selecting
  // a different member remounts it and every piece of state (draftId, composeOpen) starts fresh.
  const [draftId, setDraftId] = useState<string | null>(null)
  // Close the compose popup, and discard the draft it minted IF it was never edited or sent — the popup
  // creates a draft on open, so abandoning it (open then close) would otherwise leak an empty campaign
  // into the sends list. The discard is a no-op for a resumable (edited) or sent draft. In a Space the
  // draft lives on the Space's own `campaigns` rows, so discard it through the space-scoped cleanup.
  const closeCompose = () => {
    setComposeOpen(false)
    const id = draftId
    if (!id) return
    if (messageScope) void discardSpaceEmailDraftIfEmpty(messageScope.spaceId, id)
    else void discardDraftIfEmpty(id)
  }
  const contact = detail.contact
  const hasContact = !!(contact && (contact.email || contact.phone || contact.links?.length))
  const composerManages = detail.network
    ? {
        circles: detail.network.circlesHosted.map((c) => ({ id: c.id, name: c.label })),
        events: detail.network.eventsHosted.map((e) => ({ id: e.id, title: e.label })),
      }
    : undefined

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

      {/* (b) Compose: a "Message Member" button opens the FULL email editor in a large popup, so the
          editor gets the room it needs (the detail pane never has to hold it). The draft is created only
          when the popup opens, so browsing members never mints a throwaway draft. */}
      {detail.email && (
        <>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Mail className="h-4 w-4" aria-hidden /> Message Member
          </button>
          <Dialog
            open={composeOpen}
            onClose={closeCompose}
            ariaLabel={`Message ${detail.displayName}`}
            className="max-w-6xl !mt-0"
          >
            {/* Near-fullscreen compose overlay: the email editor fills the CENTER at full size, with an
                editorial context rail (communication stats + threaded past communications) on the RIGHT. */}
            <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-text">Message {detail.displayName}</h3>
                  <p className="truncate text-2xs text-subtle">
                    Saves automatically as you type. Close anytime and pick up where you left off.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCompose}
                  aria-label="Close"
                  className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="flex min-h-0 flex-1">
                {/* CENTER — the full-size editor. In a Space this is the space-scoped composer (Space email
                    path, Space contacts only); on the platform it is the unchanged admin composer. */}
                <div className="min-w-0 flex-1 overflow-y-auto p-5">
                  {messageScope ? (
                    <SpaceMemberComposer
                      spaceId={messageScope.spaceId}
                      slug={messageScope.slug}
                      profileId={detail.profileId}
                      email={detail.email}
                      displayName={detail.displayName}
                      initialCampaignId={draftId ?? undefined}
                      onDraftReady={setDraftId}
                      onSent={() => setDraftId(null)}
                    />
                  ) : (
                    <MemberComposer
                      profileId={detail.profileId}
                      email={detail.email}
                      displayName={detail.displayName}
                      manages={composerManages}
                      initialCampaignId={draftId ?? undefined}
                      onDraftReady={setDraftId}
                      onSent={() => setDraftId(null)}
                    />
                  )}
                </div>
                {/* RIGHT — editorial stats + threaded communications. */}
                <ComposeContextRail detail={detail} />
              </div>
            </div>
          </Dialog>
        </>
      )}

      {/* (c) The FULL profile, always open. Selecting a member opens everything about them inline
          (scores, engagement, network, path) with no dropdown to expand. */}
      <FullProfile detail={detail} />
    </div>
  )
}

/** The compose-popup RIGHT rail: everything worth knowing before you write. A communication rollup
 *  (sent / opened / clicked / replied + last touch), the resonance chips, the THREADED past
 *  communications timeline, and steward notes. Renders only the fields the server sourced; on desktop
 *  only (the popup stacks to editor-only on narrow screens). */
function ComposeContextRail({ detail }: { detail: CrmMemberDetail }) {
  const { engagement, scores, interactions, notes, contact } = detail
  const hasHistory = !!engagement || (interactions?.length ?? 0) > 0

  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-canvas p-4 lg:flex">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Reaching</p>
        <p className="mt-1 truncate text-sm font-bold text-text">{detail.displayName}</p>
        {contact?.email && <p className="truncate text-xs text-subtle">{contact.email}</p>}
      </div>

      {/* Resonance chips — health / tier / lifecycle at a glance. */}
      {scores && (scores.health != null || scores.tier || scores.lifecycle) && (
        <div className="flex flex-wrap gap-1.5">
          {scores.health != null && (
            <span className="inline-flex items-center rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
              Health {Math.round(scores.health)}
            </span>
          )}
          {scores.tier && (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
              {scores.tier}
            </span>
          )}
          {scores.lifecycle && (
            <span className="inline-flex items-center rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
              {scores.lifecycle}
            </span>
          )}
        </div>
      )}

      {/* Communication rollup — reached vs. responded. */}
      {engagement && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Communication</h4>
          <div className="grid grid-cols-2 gap-2">
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

      {/* Threaded past communications. */}
      {interactions && interactions.length > 0 && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Past communication</h4>
          <ol className="space-y-3 border-l border-border pl-4">
            {interactions.map((it, i) => (
              <li key={`${it.kind}-${it.when}-${i}`} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                <p className="text-xs font-semibold text-text">
                  {it.kind} <span className="font-normal text-subtle">· {it.when}</span>
                </p>
                <p className="text-xs text-muted">{it.summary}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Steward notes. */}
      {notes && notes.length > 0 && (
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Notes</h4>
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-xs text-muted">
                <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-subtle" aria-hidden />
                <span>{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasHistory && (
        <p className="text-xs text-subtle">
          No communication history yet. This will be your first touch with {detail.displayName}.
        </p>
      )}
    </aside>
  )
}
