'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowUpRight,
  Mail,
  Phone,
  UserPlus,
  MessageCircle,
  ExternalLink,
  Route,
  GitBranch,
  Clock,
  type LucideIcon,
} from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { getInitials, cn } from '@/lib/utils'
import { profileHrefFor } from '@/lib/people/member-viewer'
import type { MemberAction, MemberDetail, MemberRole } from './types'
import type { DetailMode } from './types'

// The RIGHT PANE of the member-viewer block: one member, rendered from a presentation-neutral
// MemberDetail (ADR-017/018 — data + intent in, no IO). Two modes: `full` (the FULLY-FEATURED card:
// identity + role designators + contact + active funnels + pipeline + engagement stats + truncated
// interactions + a prominent View member button + actions) and `quick-stats` (a compact stat grid
// under a prominent Open Profile button). Every rich field is OPTIONAL; the card renders only what
// the host supplied, so a host never has to invent data. Semantic DAWN tokens only; copy is plain,
// no em dashes (docs/CONTENT-VOICE.md).

const ICONS: Record<string, LucideIcon> = {
  connect: UserPlus,
  message: MessageCircle,
  profile: ArrowUpRight,
  member: ArrowUpRight,
  mail: Mail,
  phone: Phone,
  link: ExternalLink,
}

/** The chip class for a role tone. Neutral default; semantic DAWN tokens only (no hex). */
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

/** How many interactions the full card renders before the "view all" affordance. */
const INTERACTION_CAP = 5

function actionVariantClass(variant: MemberAction['variant']): string {
  if (variant === 'secondary') return buttonClasses('secondary', 'sm')
  if (variant === 'ghost') return buttonClasses('ghost', 'sm')
  return buttonClasses('primary', 'sm')
}

function ActionButton({ action }: { action: MemberAction }) {
  const Icon = action.icon ? ICONS[action.icon] : undefined
  const inner = (
    <>
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {action.label}
    </>
  )
  const className = actionVariantClass(action.variant)
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={action.onSelect} className={className}>
      {inner}
    </button>
  )
}

function Avatar({ detail, size = 64 }: { detail: MemberDetail; size?: number }) {
  if (detail.avatarUrl) {
    return (
      <Image
        src={detail.avatarUrl}
        alt={detail.displayName}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary-bg font-semibold text-primary-strong select-none"
      style={{ width: size, height: size }}
    >
      {getInitials(detail.displayName)}
    </div>
  )
}

/** The default actions the viewer offers, merged ahead of the host's own. `full` leads with Connect
 *  + Message; `quick-stats` leads with a prominent Open Profile. The host's `detail.actions` follow. */
function resolveActions(detail: MemberDetail, mode: DetailMode): MemberAction[] {
  const profileHref = profileHrefFor(detail)
  const openProfile: MemberAction = {
    key: 'open-profile',
    label: 'Open profile',
    icon: 'profile',
    href: profileHref,
    variant: mode === 'quick-stats' ? 'primary' : 'secondary',
  }
  const host = detail.actions ?? []
  if (mode === 'quick-stats') {
    return [openProfile, ...host]
  }
  // full mode: a prominent View member button (to the full member page) leads when the host gave a
  // viewAllHref, then Connect + Message defaults (unless the host already supplies them).
  const defaults: MemberAction[] = []
  if (detail.viewAllHref && !host.some((a) => a.key === 'view-member')) {
    defaults.push({
      key: 'view-member',
      label: 'View member',
      icon: 'member',
      href: detail.viewAllHref,
      variant: 'primary',
    })
  }
  if (!host.some((a) => a.key === 'connect')) {
    defaults.push({
      key: 'connect',
      label: 'Connect',
      icon: 'connect',
      variant: detail.viewAllHref ? 'secondary' : 'primary',
    })
  }
  if (!host.some((a) => a.key === 'message')) {
    defaults.push({ key: 'message', label: 'Message', icon: 'message', variant: 'secondary' })
  }
  return [...defaults, ...host, openProfile]
}

function StatGrid({ stats }: { stats: NonNullable<MemberDetail['engagementStats']> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
          <dt className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</dt>
          <dd className="mt-0.5 text-lg font-bold text-text">{s.value}</dd>
          {s.hint && <p className="mt-0.5 text-2xs text-subtle">{s.hint}</p>}
        </div>
      ))}
    </dl>
  )
}

/** Render one member's right pane from a MemberDetail. Pure presentation; the host owns the data and
 *  the action intents. `mode` picks the rich `full` card or the compact `quick-stats` grid. */
export function MemberDetailCard({ detail, mode = 'full' }: { detail: MemberDetail; mode?: DetailMode }) {
  const actions = resolveActions(detail, mode)

  return (
    <div className="@container flex flex-col gap-5">
      {/* Identity + role designators (full mode only; quick-stats stays compact) */}
      <div className="flex items-start gap-4">
        <Avatar detail={detail} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-text">{detail.displayName}</h2>
          <p className="truncate text-sm text-subtle">@{detail.handle}</p>
          {mode === 'full' && detail.roles && detail.roles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {detail.roles.map((r) => (
                <span
                  key={r.label}
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold',
                    roleToneClass(r.tone),
                  )}
                >
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <ActionButton key={a.key} action={a} />
          ))}
        </div>
      )}

      {mode === 'quick-stats' ? (
        detail.engagementStats && detail.engagementStats.length > 0 ? (
          <StatGrid stats={detail.engagementStats} />
        ) : null
      ) : (
        <>
          {/* Contact */}
          {detail.contact && (detail.contact.email || detail.contact.phone || detail.contact.links?.length) && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Contact</h3>
              <ul className="space-y-1.5 text-sm">
                {detail.contact.email && (
                  <li>
                    <a
                      href={`mailto:${detail.contact.email}`}
                      className="inline-flex items-center gap-2 text-text hover:text-primary-strong"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate">{detail.contact.email}</span>
                    </a>
                  </li>
                )}
                {detail.contact.phone && (
                  <li>
                    <a
                      href={`tel:${detail.contact.phone}`}
                      className="inline-flex items-center gap-2 text-text hover:text-primary-strong"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate">{detail.contact.phone}</span>
                    </a>
                  </li>
                )}
                {detail.contact.links?.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-text hover:text-primary-strong"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate">{l.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Engagement stats */}
          {detail.engagementStats && detail.engagementStats.length > 0 && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Engagement</h3>
              <StatGrid stats={detail.engagementStats} />
            </section>
          )}

          {/* Pipeline (the member's CRM / contact pipeline stage) */}
          {detail.pipeline && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Pipeline</h3>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
                <GitBranch className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{detail.pipeline.label}</span>
                <span className="shrink-0 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
                  {detail.pipeline.stage}
                </span>
              </div>
            </section>
          )}

          {/* Active funnels (the funnels the member is active in) */}
          {detail.funnels && detail.funnels.length > 0 && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Active funnels</h3>
              <ul className="space-y-1.5">
                {detail.funnels.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5"
                  >
                    <Route className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{f.name}</span>
                    {f.stage && (
                      <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-muted">
                        {f.stage}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recent interactions (truncated to ~5, with a "view all" affordance) */}
          {detail.interactions && detail.interactions.length > 0 && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Recent interactions</h3>
              <ul className="space-y-2">
                {detail.interactions.slice(0, INTERACTION_CAP).map((it, i) => (
                  <li key={`${it.kind}-${i}`} className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm text-text">{it.summary}</span>
                        <span className="shrink-0 text-2xs text-subtle">{it.when}</span>
                      </div>
                      <p className="text-2xs text-subtle">{it.kind}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {detail.viewAllHref && detail.interactions.length > INTERACTION_CAP && (
                <Link
                  href={detail.viewAllHref}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
                >
                  View all {detail.interactions.length} interactions
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </section>
          )}

          {/* Latest activity */}
          {detail.latestActivity && detail.latestActivity.length > 0 && (
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Latest activity</h3>
              <ul className="space-y-2">
                {detail.latestActivity.map((a, i) => {
                  const row = (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn('min-w-0 flex-1 truncate text-sm text-text', a.href && 'group-hover:text-primary-strong')}>
                        {a.label}
                      </span>
                      <span className="shrink-0 text-2xs text-subtle">{a.when}</span>
                    </div>
                  )
                  return (
                    <li key={`${a.label}-${i}`}>
                      {a.href ? (
                        <Link href={a.href} className="group block rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-elevated/60">
                          {row}
                        </Link>
                      ) : (
                        <div className="px-1 py-0.5">{row}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
