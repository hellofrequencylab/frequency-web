'use client'

// MARKETING COMPOSE POPUP — the "New email" broadcast composer for the CRM Marketing tab. Same
// near-fullscreen popup shape as "Message Member": the block editor fills the CENTER, and the RIGHT
// rail is the audience + schedule + send controls (SendPanel) instead of a member's comms history.
//
// Draft-first (owner directive): opening the popup mints a `campaigns` draft immediately and every
// edit autosaves to it, so an email ALWAYS exists as a draft — it never sends until an explicit,
// double-confirmed Send. The audience (all members / a saved segment / etc.) + scheduling + the
// gated send all ride the existing email-studio pipeline; this shell owns only open state. No new
// send path. Voice canon: no em dashes.
//
// Mount-per-open: the outer component renders nothing when closed and mounts a FRESH inner body each
// time it opens, so the mint-draft effect runs once on mount and unmount clears everything. That keeps
// the effect free of any reset-on-close setState (no cascading-render lint), and guarantees a clean
// draft every open.

import { useEffect, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { EmailEditorPane } from '@/components/admin/email-studio/editor-pane'
import { SendPanel, type CampaignStatus, type SegmentOption } from '@/components/admin/email-studio/send-panel'
import { createEmailDraft, loadEmailCampaign, type LoadedEmailCampaign } from '@/app/(main)/admin/email-studio/actions'
import { isError } from '@/lib/action-result'

export function MarketingComposePopup({
  open,
  onClose,
  segments,
}: {
  open: boolean
  onClose: () => void
  /** Audience options for the send rail (all members + saved segments), from listSegmentOptions(). */
  segments: SegmentOption[]
}) {
  if (!open) return null
  return <ComposeBody onClose={onClose} segments={segments} />
}

function ComposeBody({ onClose, segments }: { onClose: () => void; segments: SegmentOption[] }) {
  const [loaded, setLoaded] = useState<LoadedEmailCampaign | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mint a draft on mount (which happens once per open), then load it into the editor.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await createEmailDraft('campaign')
      if (cancelled) return
      if (isError(res)) {
        setError(res.error)
        return
      }
      try {
        const data = await loadEmailCampaign(res.data.id)
        if (!cancelled) setLoaded(data)
      } catch {
        if (!cancelled) setError('Could not open the composer. Try again.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Dialog open onClose={onClose} ariaLabel="New email" className="max-w-6xl !mt-0">
      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Send className="h-4 w-4 text-primary" aria-hidden /> New email
            </h3>
            <p className="truncate text-2xs text-subtle">
              Saves automatically as a draft. Pick the audience and send now or schedule, on the right.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {error ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>
          </div>
        ) : !loaded ? (
          <div className="flex flex-1 items-center justify-center p-6 text-subtle">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* CENTER — the block editor (autosaves to the draft). */}
            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              <EmailEditorPane campaign={loaded} arrangement="stacked" />
            </div>
            {/* RIGHT — audience + schedule + send. */}
            <aside className="shrink-0 overflow-y-auto border-t border-border p-5 lg:w-80 lg:border-l lg:border-t-0">
              <SendPanel
                campaignId={loaded.id}
                status={(loaded.context.status as CampaignStatus) ?? 'draft'}
                segments={segments}
              />
            </aside>
          </div>
        )}
      </div>
    </Dialog>
  )
}
