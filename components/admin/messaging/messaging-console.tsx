'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Megaphone, Activity, Mail, Trash2 } from 'lucide-react'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import {
  MESSAGING_STATUS_LEGEND,
  messagingStatusMeta,
} from '@/lib/messaging/status'
import type { MessagingCampaignItem, MessagingFunnelItem } from '@/lib/messaging/console'

// The unified Messaging console body (EMAIL-CAMPAIGNS-FUNNELS-PLAN P1, ask #1/#4). ONE
// home for the two things an operator creates: Campaigns (one-time sends) and Funnels
// (triggered journeys). A shared status legend runs across the top, then a tab switches
// between the two lists. Every row links out to the WORKING editor it already had (the
// composer, the flow view), so this is the listing/console layer over them, not a
// rebuild. Client-only for the tab state; the data is server-fetched by the page. No em
// dashes (voice).

type Tab = 'campaigns' | 'funnels'

export function MessagingConsole({
  campaigns,
  funnels,
  onDeleteCampaign,
  deletingId,
  onOpenCampaign,
  onNewCampaign,
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
}) {
  const [tab, setTab] = useState<Tab>(campaigns.length === 0 && funnels.length > 0 ? 'funnels' : 'campaigns')

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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')} label="Campaigns" count={campaigns.length} />
        <TabButton active={tab === 'funnels'} onClick={() => setTab('funnels')} label="Funnels" count={funnels.length} />
      </div>

      {tab === 'campaigns' ? (
        <CampaignsPanel
          campaigns={campaigns}
          onDeleteCampaign={onDeleteCampaign}
          deletingId={deletingId}
          onOpenCampaign={onOpenCampaign}
          onNewCampaign={onNewCampaign}
        />
      ) : (
        <FunnelsPanel funnels={funnels} />
      )}
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
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
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
}: {
  campaigns: MessagingCampaignItem[]
  onDeleteCampaign?: (id: string) => void
  deletingId?: string | null
  onOpenCampaign?: (id: string) => void
  onNewCampaign?: () => void
}) {
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
    <div className="overflow-hidden rounded-2xl border border-border">
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
          {campaigns.map((c) => {
            const meta = messagingStatusMeta(c.status)
            return (
              <tr key={c.id} className="bg-surface hover:bg-surface-elevated/50">
                <td className="px-4 py-2.5 font-medium text-text">{c.name}</td>
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
                        onClick={() => onOpenCampaign(c.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
                      >
                        Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      <Link
                        href={c.href}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
                      >
                        Open <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    )}
                    {onDeleteCampaign && c.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onDeleteCampaign(c.id)}
                        disabled={deletingId === c.id}
                        aria-label={`Delete ${c.name.trim() || 'untitled'} draft`}
                        className="rounded p-1 text-subtle transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FunnelsPanel({ funnels }: { funnels: MessagingFunnelItem[] }) {
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
      {funnels.map((f) => {
        const meta = messagingStatusMeta(f.status)
        return (
          <Link
            key={f.id}
            href={f.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
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
            {/* Mini flow preview: one dot per step. */}
            <div className="flex items-center gap-1.5">
              {f.stageKinds.map((k, i) => (
                <span key={i} className="flex items-center gap-1.5" aria-hidden>
                  <span className="h-2 w-2 rounded-full bg-primary/50" />
                  {i < f.stageKinds.length - 1 && <span className="h-px w-3 bg-border" />}
                </span>
              ))}
              <span className="ml-1 text-2xs text-subtle">
                {f.stageCount} step{f.stageCount === 1 ? '' : 's'}
                {f.linkCount > 0 && ` · ${f.linkCount} wired`}
              </span>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-strong">
              Open flow <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// Small helper: the two "start here" links the header shows next to New.
export function MessagingQuickLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/admin/marketing/campaigns"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
      >
        <Megaphone className="h-3.5 w-3.5" aria-hidden /> Composer
      </Link>
      <Link
        href="/admin/marketing/nurture"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden /> Nurture
      </Link>
    </div>
  )
}
