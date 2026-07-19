'use client'

// SPACE MARKETING WORKSPACE — the client body of the space Marketing tab's "Everything you send" section.
// The space-scoped twin of the admin CRM MarketingWorkspace: the SAME search bar + "New email" button + the
// SAME MessagingConsole table (Subject / Audience / Status / Sent, status legend, filter chips), colored by
// status. Composing, editing, and sending all happen in the in-place SpaceEmailComposePopup. Funnels are an
// admin-only concept, so the Funnels sub-tab is empty here (a Space sends campaigns, not funnels). Voice
// canon: no em dashes.

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Send } from 'lucide-react'
import { MessagingConsole } from '@/components/admin/messaging/messaging-console'
import { SpaceEmailComposePopup } from './space-email-compose-popup'
import { deleteSpaceEmailDraft } from '@/lib/spaces/email-drafts'
import { isError } from '@/lib/action-result'
import type { MessagingCampaignItem } from '@/lib/messaging/console'
import type { EmailColors } from '@/lib/email-studio/render'

export function SpaceMarketingWorkspace({
  spaceId,
  slug,
  colors,
  tags,
  segments,
  campaigns: initialCampaigns,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  colors: EmailColors
  tags: string[]
  segments: { id: string; name: string }[]
  campaigns: MessagingCampaignItem[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeId, setComposeId] = useState<string | undefined>(undefined)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Adopt fresh server data whenever a refresh lands new props (adjust-state-during-render).
  const [lastInitial, setLastInitial] = useState(initialCampaigns)
  if (initialCampaigns !== lastInitial) {
    setLastInitial(initialCampaigns)
    setCampaigns(initialCampaigns)
  }

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? campaigns.filter((c) => (c.name || 'untitled').toLowerCase().includes(q)) : campaigns),
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

  function handleDelete(id: string) {
    const target = campaigns.find((c) => c.id === id)
    const label = target?.name.trim() || 'this untitled draft'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteSpaceEmailDraft(spaceId, id)
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
            placeholder="Search your emails..."
            aria-label="Search your emails"
            className="w-full rounded-lg border border-border bg-canvas py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
          />
        </label>
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

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <MessagingConsole
        campaigns={filtered}
        funnels={[]}
        onOpenCampaign={openExisting}
        onNewCampaign={readOnly ? undefined : openNew}
        onDeleteCampaign={readOnly ? undefined : handleDelete}
        deletingId={deletingId}
      />

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
