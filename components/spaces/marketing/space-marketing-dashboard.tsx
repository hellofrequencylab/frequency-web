'use client'

// SPACE MARKETING DASHBOARD — the "Email" panel of the space Marketing tab: the space-scoped twin of the
// admin CRM Marketing page. Same shape, exactly: an email-performance strip on top, then "Everything you
// send" (search + the list of everything, click a row to open it), and one "New email" button that opens the
// draft-first canvas composer popup. Every email is composed, edited, and sent from the SAME popup
// (SpaceEmailComposePopup), wired to this Space's own drafts + the shared anti-spam send seam.
//
// Prop-derived list state (like the admin MarketingWorkspace): the server resolves the list; a compose /
// send router.refresh() lands fresh props, which we adopt so a draft made in the popup joins the list without
// a hard reload. Voice canon: no em dashes.

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Mail, Search, Send, ShieldAlert, TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { ToneStat } from '@/app/(main)/admin/crm/tone-stat'
import { SpaceEmailComposePopup } from './space-email-compose-popup'
import { EmailEnableCard } from '@/components/spaces/email/email-enable-card'
import type { EmailCampaignCard } from '@/app/(main)/admin/email-studio/actions'
import type { SpaceEmailStats } from '@/lib/spaces/email-analytics'
import type { EmailColors } from '@/lib/email-studio/render'

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction > 0 && fraction < 0.01 ? 2 : 1)}%`
}

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'info',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
}

export function SpaceMarketingDashboard({
  spaceId,
  slug,
  colors,
  tags,
  segments,
  initialCampaigns,
  stats,
  emailEnabled,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  colors: EmailColors
  tags: string[]
  segments: { id: string; name: string }[]
  initialCampaigns: EmailCampaignCard[]
  stats: SpaceEmailStats
  /** The per-Space email kill-switch. When off, the enable card leads (nothing can send until it is on). */
  emailEnabled: boolean
  readOnly?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeId, setComposeId] = useState<string | undefined>(undefined)

  // Adopt fresh server data whenever a refresh lands new props (React's "adjust state during render").
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [lastInitial, setLastInitial] = useState(initialCampaigns)
  if (initialCampaigns !== lastInitial) {
    setLastInitial(initialCampaigns)
    setCampaigns(initialCampaigns)
  }

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? campaigns.filter((c) => (c.subject || 'untitled').toLowerCase().includes(q)) : campaigns),
    [campaigns, q],
  )

  function openNew() {
    setComposeId(undefined)
    setComposeOpen(true)
  }
  function openExisting(id: string) {
    setComposeId(id)
    setComposeOpen(true)
  }
  const closeCompose = useCallback(() => setComposeOpen(false), [])
  const refresh = useCallback(() => router.refresh(), [router])

  const nothingSent = stats.sent === 0 && stats.delivered === 0

  return (
    <div className="space-y-6">
      {/* Email is off for this space: the enable gate leads (with its anti-spam acknowledgment). The rest of
          the dashboard still shows so the owner can draft, but nothing sends until email is turned on. */}
      {!emailEnabled && !readOnly && <EmailEnableCard spaceId={spaceId} slug={slug} />}

      {/* Email performance — how everything you send is landing. */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-text">Email performance</h3>
          <p className="mt-0.5 text-sm text-muted">
            How everything you send is landing: delivered, bounced, and flagged, over your own contacts.
          </p>
        </div>
        {nothingSent ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            Nothing sent yet. Your first email will start filling this in.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Sent" value={stats.sent.toLocaleString()} icon={Send} detail="reached the provider" />
            <ToneStat
              label="Delivered"
              value={stats.delivered.toLocaleString()}
              icon={TrendingUp}
              tone="success"
              detail={`of ${stats.sent.toLocaleString()} sent`}
            />
            <ToneStat
              label="Bounce rate"
              value={pct(stats.bounceRate)}
              icon={Activity}
              tone={stats.bounceRate > 0.05 ? 'danger' : 'success'}
              detail={`${stats.bounced.toLocaleString()} bounced`}
            />
            <ToneStat
              label="Complaints"
              value={stats.complained.toLocaleString()}
              icon={ShieldAlert}
              tone={stats.complaintRate > 0.001 ? 'danger' : 'success'}
              detail={pct(stats.complaintRate)}
            />
          </div>
        )}
      </section>

      {/* Everything you send. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-text">Everything you send</h3>
            <p className="mt-0.5 text-sm text-muted">Drafts and sent emails in one place. Click one to open it.</p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={openNew}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <Send className="h-4 w-4" aria-hidden /> New email
            </button>
          )}
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your emails..."
            aria-label="Search your emails"
            className="w-full rounded-lg border border-border bg-canvas py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
          />
        </label>

        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            {campaigns.length === 0
              ? 'No emails yet. Write your first one with New email.'
              : 'Nothing matches that search.'}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openExisting(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
                    <Mail className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {c.subject.trim() || 'Untitled email'}
                    </span>
                  </span>
                  <StatusChip tone={STATUS_TONE[c.status] ?? 'neutral'} size="sm">
                    {c.status}
                  </StatusChip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SpaceEmailComposePopup
        open={composeOpen}
        onClose={closeCompose}
        spaceId={spaceId}
        slug={slug}
        colors={colors}
        tags={tags}
        segments={segments}
        readOnly={readOnly}
        campaignId={composeId}
        onChanged={refresh}
      />
    </div>
  )
}
