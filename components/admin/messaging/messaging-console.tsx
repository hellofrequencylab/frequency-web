'use client'

import { Fragment, forwardRef, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Activity, Trash2, ChevronRight } from 'lucide-react'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MESSAGING_STATUS_LEGEND,
  messagingStatusMeta,
  type MessagingStatus,
} from '@/lib/messaging/status'
import type { MessagingCampaignItem, MessagingFunnelItem } from '@/lib/messaging/console'

// The unified Messaging console body (EMAIL-CAMPAIGNS-FUNNELS-PLAN P1, ask #1/#4). ONE
// home for the two things an operator creates: Campaigns (one-time sends) and Funnels
// (triggered journeys). A shared status legend runs across the top, then two sub-tabs.
//
// Layout (2026-07): the Campaigns sub-tab is the PRIMARY two-pane view — the campaign
// table on the left, a rail of Funnel cards on the right. Clicking a funnel card SLIDES
// (no reload, no router push) to the Funnels sub-tab and deep-selects that funnel. The
// two sub-panes live in one horizontal track that translates on a CSS transform, so the
// switch is a slide, not a navigation. Respects prefers-reduced-motion. Client-only for
// the tab/selection state; the data is server-fetched by the page. No em dashes (voice).

type Tab = 'campaigns' | 'funnels'

export function MessagingConsole({
  campaigns,
  funnels,
  onDeleteCampaign,
  deletingId,
  onOpenCampaign,
  onNewCampaign,
  renderExpansion,
}: {
  campaigns: MessagingCampaignItem[]
  funnels: MessagingFunnelItem[]
  /** When provided, draft campaign rows gain a delete (trash) affordance that calls this. */
  onDeleteCampaign?: (id: string) => void
  /** The id currently being deleted (its row shows a spinner / disabled state). */
  deletingId?: string | null
  /** When provided, a campaign row's "Open" opens it IN PLACE (the CRM popup) instead of linking out
   *  to the legacy composer. Omit to keep the legacy `href` link (the old messaging surface). */
  onOpenCampaign?: (id: string) => void
  /** When provided, the empty-state "start one" opens the in-place composer instead of the legacy wizard. */
  onNewCampaign?: () => void
  /** When provided, a SENT campaign row becomes expandable: clicking it folds open a detail panel
   *  rendered by this callback (the Marketing tab passes per-campaign analytics + Vera). Omit to keep
   *  rows flat (the per-Space messaging surface). */
  renderExpansion?: (campaignId: string) => React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>(campaigns.length === 0 && funnels.length > 0 ? 'funnels' : 'campaigns')

  const onCampaigns = tab === 'campaigns'

  // The two panes sit side by side in one flex track (for the slide), so the track would otherwise reserve
  // the height of the TALLER pane — leaving dead space below a short Campaigns list when the empty Funnels
  // pane is taller. Measure the ACTIVE pane and clamp the viewport to it, animating the height on tab change.
  const campaignsPaneRef = useRef<HTMLElement>(null)
  const funnelsPaneRef = useRef<HTMLElement>(null)
  const [paneHeight, setPaneHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = onCampaigns ? campaignsPaneRef.current : funnelsPaneRef.current
    if (!el) return
    // ResizeObserver's first callback fires async with the current size, so we never call setState
    // synchronously in the effect body (keeps the follow height correct as the pane's content grows/shrinks).
    const ro = new ResizeObserver(() => setPaneHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onCampaigns])

  return (
    <div className="space-y-5">
      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-surface px-4 py-3">
        <span className="text-2xs font-bold uppercase tracking-wide text-subtle">Status</span>
        {MESSAGING_STATUS_LEGEND.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted" title={s.hint}>
            <span aria-hidden>{s.glyph}</span>
            {s.label}
          </span>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={onCampaigns} onClick={() => setTab('campaigns')} label="Campaigns" count={campaigns.length} />
        <TabButton active={!onCampaigns} onClick={() => setTab('funnels')} label="Funnels" count={funnels.length} />
      </div>

      {/* Sliding sub-pane track. The viewport clips; the track holds both panes side by side and
          translates between them. overflow-hidden here is the carousel clip, never a page scroll. */}
      <div
        className="overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
        style={{ height: paneHeight }}
      >
        {/* items-start so each pane keeps its NATURAL height (not stretched to the taller sibling), which is
            what the viewport height above follows. */}
        <div
          className="flex w-full items-start transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: onCampaigns ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          {/* Pane 1 — Campaigns, FULL WIDTH (owner directive: no side rail; the email list runs the
              whole width). Funnels are reached by the sub-tab above, which slides this track over. */}
          <section
            ref={campaignsPaneRef}
            aria-label="Campaigns"
            aria-hidden={!onCampaigns}
            inert={!onCampaigns || undefined}
            className="w-full shrink-0"
          >
            <CampaignsPanel
              campaigns={campaigns}
              onDeleteCampaign={onDeleteCampaign}
              deletingId={deletingId}
              onOpenCampaign={onOpenCampaign}
              onNewCampaign={onNewCampaign}
              renderExpansion={renderExpansion}
            />
          </section>

          {/* Pane 2 — Funnels (full grid). The sub-tab slides here; no deep-select rail anymore. */}
          <section
            ref={funnelsPaneRef}
            aria-label="Funnels"
            aria-hidden={onCampaigns}
            inert={onCampaigns || undefined}
            className="w-full shrink-0"
          >
            <FunnelsPanel funnels={funnels} selectedId={null} />
          </section>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${
        active
          ? 'border-primary-strong text-text'
          : 'border-transparent text-muted hover:border-border-strong hover:text-text'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums ${
          active ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function CampaignsPanel({
  campaigns,
  onDeleteCampaign,
  deletingId,
  onOpenCampaign,
  onNewCampaign,
  renderExpansion,
}: {
  campaigns: MessagingCampaignItem[]
  onDeleteCampaign?: (id: string) => void
  deletingId?: string | null
  onOpenCampaign?: (id: string) => void
  onNewCampaign?: () => void
  renderExpansion?: (campaignId: string) => React.ReactNode
}) {
  // Campaigns-column status filter (client-only). Sits above the table beside the shared search.
  const [statusFilter, setStatusFilter] = useState<MessagingStatus | 'all'>('all')
  // Which SENT row is folded open to show its analytics (only one at a time). Opt-in via renderExpansion.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // The statuses actually present, in legend order, so the filter never offers an empty bucket.
  const availableStatuses = useMemo(() => {
    const present = new Set(campaigns.map((c) => c.status))
    return MESSAGING_STATUS_LEGEND.map((m) => m.key).filter((k) => present.has(k))
  }, [campaigns])

  const shown = useMemo(
    () => (statusFilter === 'all' ? campaigns : campaigns.filter((c) => c.status === statusFilter)),
    [campaigns, statusFilter],
  )

  if (campaigns.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No campaigns yet."
        description="A campaign is one email sent to an audience, now or scheduled. Start one from New email."
        action={
          onNewCampaign ? (
            <button type="button" onClick={onNewCampaign} className={buttonClasses('primary', 'sm')}>
              New email
            </button>
          ) : (
            <Link href="/admin/marketing/messaging/new" className={buttonClasses('primary', 'sm')}>
              New message
            </Link>
          )
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Status filter bar (campaigns column) */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter campaigns by status">
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All
        </FilterChip>
        {availableStatuses.map((k) => {
          const m = messagingStatusMeta(k)
          return (
            <FilterChip key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)}>
              <span aria-hidden>{m.glyph}</span> {m.label}
            </FilterChip>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No campaigns match."
          description="No campaign has that status yet. Clear the filter to see them all."
          action={
            <button type="button" onClick={() => setStatusFilter('all')} className={buttonClasses('secondary', 'sm')}>
              Show all
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-elevated text-2xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Subject</th>
                <th className="px-4 py-2.5 font-semibold">Audience</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Sent</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((c) => {
                const meta = messagingStatusMeta(c.status)
                // A sent row is expandable when the parent supplies a detail renderer (Marketing tab).
                const expandable = !!renderExpansion && c.status === 'sent'
                const expanded = expandable && expandedId === c.id
                const toggle = () => setExpandedId((cur) => (cur === c.id ? null : c.id))
                return (
                  <Fragment key={c.id}>
                    <tr
                      className={cn(
                        'bg-surface hover:bg-surface-elevated/50',
                        expandable && 'cursor-pointer',
                        expanded && 'bg-surface-elevated/50',
                      )}
                      onClick={expandable ? toggle : undefined}
                      aria-expanded={expandable ? expanded : undefined}
                    >
                      <td className="px-4 py-2.5 font-medium text-text">
                        <span className="inline-flex items-center gap-1.5">
                          {expandable && (
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 text-subtle transition-transform motion-reduce:transition-none',
                                expanded && 'rotate-90',
                              )}
                              aria-hidden
                            />
                          )}
                          {c.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{c.segment}</td>
                      <td className="px-4 py-2.5">
                        <StatusChip tone={meta.tone} size="sm">
                          {meta.glyph} {meta.label}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">{c.recipientCount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-3">
                          {onOpenCampaign ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onOpenCampaign(c.id)
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
                            >
                              Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : (
                            <Link
                              href={c.href}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
                            >
                              Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          )}
                          {onDeleteCampaign && c.status === 'draft' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteCampaign(c.id)
                              }}
                              disabled={deletingId === c.id}
                              aria-label={`Delete ${c.name.trim() || 'untitled'} draft`}
                              className="rounded p-1 text-subtle transition-colors hover:text-danger disabled:opacity-50 motion-reduce:transition-none"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-surface">
                        <td colSpan={5} className="p-0">
                          {renderExpansion!(c.id)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors motion-reduce:transition-none',
        active
          ? 'border-primary-strong bg-primary-bg text-primary-strong'
          : 'border-border bg-surface text-muted hover:border-border-strong hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function FunnelsPanel({ funnels, selectedId }: { funnels: MessagingFunnelItem[]; selectedId: string | null }) {
  const selectedRef = useRef<HTMLElement | null>(null)

  // When a funnel is deep-selected (via a rail click), bring it into view. Honor reduced motion.
  useEffect(() => {
    if (!selectedId || !selectedRef.current) return
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    selectedRef.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  }, [selectedId])

  if (funnels.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No funnels yet."
        description="A funnel is a series of emails that fires from a trigger, like joining. Build one from a best-practice template in New."
        action={
          <Link href="/admin/marketing/messaging/new" className={buttonClasses('primary', 'sm')}>
            New message
          </Link>
        }
      />
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {funnels.map((f) => (
        <FunnelCard
          key={f.id}
          funnel={f}
          selected={f.id === selectedId}
          ref={f.id === selectedId ? selectedRef : undefined}
        />
      ))}
    </div>
  )
}

// One funnel card, shared by the rail and the Funnels grid. With `onActivate` it renders as a
// button (deep-select, no navigation); without it, a link to the flow builder (`funnel.href`).
export const FunnelCard = forwardRef<HTMLElement, {
  funnel: MessagingFunnelItem
  /** Deep-select handler. When set the card is a button (slide + highlight), not a builder link. */
  onActivate?: () => void
  /** Highlighted (the currently deep-selected funnel). */
  selected?: boolean
  /** Denser layout for the rail (drops the step-dot preview for a one-line stat). */
  compact?: boolean
}>(function FunnelCard({ funnel: f, onActivate, selected, compact }, ref) {
  const meta = messagingStatusMeta(f.status)
  const stepLine = `${f.stageCount} step${f.stageCount === 1 ? '' : 's'}${f.linkCount > 0 ? ` · ${f.linkCount} wired` : ''}`

  const cls = cn(
    'group flex h-full flex-col gap-3 rounded-2xl border bg-surface p-4 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
    selected ? 'border-primary-strong ring-2 ring-primary/30' : 'border-border hover:border-border-strong',
  )

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Activity className="h-4 w-4" aria-hidden />
        </span>
        <StatusChip tone={meta.tone} size="sm">
          {meta.glyph} {meta.label}
        </StatusChip>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{f.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          Converts on {f.goalEvent}
          {f.persona ? ` · ${f.persona}` : ''}
        </p>
      </div>
      {compact ? (
        <span className="text-2xs text-subtle">{stepLine}</span>
      ) : (
        <div className="flex items-center gap-1.5">
          {f.stageKinds.map((_, i) => (
            <span key={i} className="flex items-center gap-1.5" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-primary/50" />
              {i < f.stageKinds.length - 1 && <span className="h-px w-3 bg-border" />}
            </span>
          ))}
          <span className="ml-1 text-2xs text-subtle">{stepLine}</span>
        </div>
      )}
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-strong">
        {onActivate ? 'Review' : 'Open flow'}
        <ArrowUpRight
          className={
            onActivate
              ? 'h-3.5 w-3.5'
              : 'h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none'
          }
          aria-hidden
        />
      </span>
    </>
  )

  if (onActivate) {
    return (
      <button ref={ref as Ref<HTMLButtonElement>} type="button" onClick={onActivate} aria-pressed={selected} className={cls}>
        {body}
      </button>
    )
  }
  return (
    <Link ref={ref as Ref<HTMLAnchorElement>} href={f.href} className={cls}>
      {body}
    </Link>
  )
})
