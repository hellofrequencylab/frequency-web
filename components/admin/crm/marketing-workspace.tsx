'use client'

// MARKETING WORKSPACE — the client body of the CRM Marketing tab. It reuses the messaging console
// (Campaigns + Funnels, colored by status) and makes the tab SELF-CONTAINED: composing, editing,
// scheduling, sending, and deleting all happen here in the draft-first popup. Nothing links out to the
// legacy /admin/marketing/* composer — "New email" and a row's "Open" both open the in-place popup, and
// there are no quick-links back to the old system. Voice canon: no em dashes.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Search, Send } from 'lucide-react'
import { MessagingConsole } from '@/components/admin/messaging/messaging-console'
import { MarketingComposePopup } from '@/components/admin/crm/marketing-compose-popup'
import { deleteEmailDraft } from '@/app/(main)/admin/email-studio/actions'
import { isError } from '@/lib/action-result'
import type { MessagingCampaignItem, MessagingFunnelItem } from '@/lib/messaging/console'
import type { SegmentOption } from '@/components/admin/email-studio/send-panel'

export function MarketingWorkspace({
  campaigns: initialCampaigns,
  funnels,
  segments,
  openCampaignId,
}: {
  campaigns: MessagingCampaignItem[]
  funnels: MessagingFunnelItem[]
  segments: SegmentOption[]
  /** When present (the `?open=<id>` param), open that campaign straight into the composer on mount. The
   *  guided generator routes here after Vera drafts a single campaign, so the operator lands on their draft. */
  openCampaignId?: string
}) {
  const [query, setQuery] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  // undefined = compose a NEW email; a string = open THAT existing campaign in the popup.
  const [composeCampaignId, setComposeCampaignId] = useState<string | undefined>(undefined)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const q = query.trim().toLowerCase()
  const filteredCampaigns = useMemo(
    () => (q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns),
    [campaigns, q],
  )
  const filteredFunnels = useMemo(
    () => (q ? funnels.filter((f) => f.name.toLowerCase().includes(q)) : funnels),
    [funnels, q],
  )

  function openNew() {
    setComposeCampaignId(undefined)
    setComposeOpen(true)
  }

  function openExisting(id: string) {
    setComposeCampaignId(id)
    setComposeOpen(true)
  }

  // STABLE close identity: the popup's Dialog runs a focus-trap effect keyed on [open, onClose], so a fresh
  // onClose on every parent re-render would refire that effect and yank focus out of the field the operator is
  // typing in (and, once focus lands on the Close control, a typed space would activate it and shut the popup).
  // A useCallback keeps the identity fixed so the trap only ever sets up / tears down when the popup truly opens
  // or closes, never mid-compose.
  const closeCompose = useCallback(() => setComposeOpen(false), [])

  // Deep-link open (`?open=<id>`): open that campaign into the composer once, on the first mount that carries
  // the param. A ref guards against re-firing if the component re-renders with the same param still in the URL.
  const openedDeepLink = useRef(false)
  useEffect(() => {
    if (openCampaignId && !openedDeepLink.current) {
      openedDeepLink.current = true
      setComposeCampaignId(openCampaignId)
      setComposeOpen(true)
    }
  }, [openCampaignId])

  function handleDelete(id: string) {
    const target = campaigns.find((c) => c.id === id)
    const label = target?.name.trim() || 'this untitled draft'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteEmailDraft(id)
      setDeletingId(null)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    })
  }

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
          onClick={openNew}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Send className="h-4 w-4" aria-hidden /> New email
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <MessagingConsole
        campaigns={filteredCampaigns}
        funnels={filteredFunnels}
        onOpenCampaign={openExisting}
        onNewCampaign={openNew}
        onDeleteCampaign={handleDelete}
        deletingId={deletingId}
      />

      <MarketingComposePopup
        open={composeOpen}
        onClose={closeCompose}
        segments={segments}
        campaignId={composeCampaignId}
      />
    </div>
  )
}
