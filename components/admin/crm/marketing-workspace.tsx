'use client'

// MARKETING WORKSPACE — the client body of the CRM Marketing tab. It reuses the existing messaging
// console (Campaigns + Funnels, colored by status) and adds the two things the console lacked for a
// CRM home: a SEARCH box that filters both lists by name, and a "New email" button that opens the
// draft-first broadcast composer popup. Nothing about the console or the send pipeline is forked.
// Voice canon: no em dashes.

import { useMemo, useState } from 'react'
import { Search, Send } from 'lucide-react'
import { MessagingConsole, MessagingQuickLinks } from '@/components/admin/messaging/messaging-console'
import { MarketingComposePopup } from '@/components/admin/crm/marketing-compose-popup'
import type { MessagingCampaignItem, MessagingFunnelItem } from '@/lib/messaging/console'
import type { SegmentOption } from '@/components/admin/email-studio/send-panel'

export function MarketingWorkspace({
  campaigns,
  funnels,
  segments,
}: {
  campaigns: MessagingCampaignItem[]
  funnels: MessagingFunnelItem[]
  segments: SegmentOption[]
}) {
  const [query, setQuery] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const filteredCampaigns = useMemo(
    () => (q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns),
    [campaigns, q],
  )
  const filteredFunnels = useMemo(
    () => (q ? funnels.filter((f) => f.name.toLowerCase().includes(q)) : funnels),
    [funnels, q],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns and funnels..."
            aria-label="Search campaigns and funnels"
            className="w-full rounded-lg border border-border bg-canvas py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Send className="h-4 w-4" aria-hidden /> New email
        </button>
      </div>

      <div className="flex justify-end">
        <MessagingQuickLinks />
      </div>

      <MessagingConsole campaigns={filteredCampaigns} funnels={filteredFunnels} />

      <MarketingComposePopup open={composeOpen} onClose={() => setComposeOpen(false)} segments={segments} />
    </div>
  )
}
