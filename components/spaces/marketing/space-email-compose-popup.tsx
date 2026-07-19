'use client'

// SPACE EMAIL COMPOSE POPUP — the "New email" broadcast composer for the space Marketing tab. The
// space-scoped twin of the admin CRM MarketingComposePopup: the SAME near-fullscreen popup shape, the SAME
// on-canvas WYSIWYG block editor (EmailEditorPane, arrangement="canvas"), and the SAME draft-first model
// (opening mints a draft, every edit autosaves, nothing sends until an explicit double-confirmed Send). The
// only difference is the wiring: it saves to THIS Space's own draft (saveSpaceEmailDraft, brand-compiled),
// test-sends as the Space (sendSpaceTestEmail), paints in the Space palette (spaceEmailColors), and its send
// rail resolves + sends over the Space's own contacts through the shared anti-spam seam (SpaceSendPanel).
//
// Mount-per-open (like the admin popup): the outer component renders nothing when closed and mounts a FRESH
// inner body each open, so the mint-draft effect runs once on mount and unmount discards a pristine draft.
// Voice canon: no em dashes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { EmailEditorPane } from '@/components/admin/email-studio/editor-pane'
import { SpaceSendPanel } from './space-send-panel'
import {
  createSpaceEmailDraft,
  discardSpaceEmailDraftIfEmpty,
  loadSpaceEmailDraft,
  saveSpaceEmailDraft,
  sendSpaceTestEmail,
} from '@/lib/spaces/email-drafts'
import type { LoadedEmailCampaign } from '@/app/(main)/admin/email-studio/actions'
import type { EmailColors } from '@/lib/email-studio/render'
import { isError } from '@/lib/action-result'

export function SpaceEmailComposePopup({
  open,
  onClose,
  spaceId,
  slug,
  colors,
  tags,
  segments,
  readOnly = false,
  campaignId,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  spaceId: string
  slug: string
  colors: EmailColors
  tags: string[]
  segments: { id: string; name: string }[]
  readOnly?: boolean
  /** Open an EXISTING draft for editing. Omit to start a NEW one. */
  campaignId?: string
  /** Fired after a send (or on close) so the parent list can refresh. */
  onChanged?: () => void
}) {
  if (!open) return null
  // Key by the draft being edited (or 'new') so switching which one you open remounts cleanly.
  return (
    <ComposeBody
      key={campaignId ?? 'new'}
      onClose={onClose}
      spaceId={spaceId}
      slug={slug}
      colors={colors}
      tags={tags}
      segments={segments}
      readOnly={readOnly}
      campaignId={campaignId}
      onChanged={onChanged}
    />
  )
}

function ComposeBody({
  onClose,
  spaceId,
  slug,
  colors,
  tags,
  segments,
  readOnly,
  campaignId,
  onChanged,
}: {
  onClose: () => void
  spaceId: string
  slug: string
  colors: EmailColors
  tags: string[]
  segments: { id: string; name: string }[]
  readOnly: boolean
  campaignId?: string
  onChanged?: () => void
}) {
  const [loaded, setLoaded] = useState<LoadedEmailCampaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draftIdRef = useRef<string | null>(null)

  // Load the draft into the editor. With a campaignId we open THAT existing draft; otherwise we mint a new
  // one and discard it on close if it is still pristine, so an abandoned "New email" never leaves a blank
  // behind. An existing draft is never discarded (draftIdRef stays null).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let id = campaignId
      if (!id) {
        const res = await createSpaceEmailDraft(spaceId)
        if (cancelled) return
        if (isError(res)) {
          setError(res.error)
          return
        }
        id = res.data.id
        draftIdRef.current = id
      }
      try {
        const data = await loadSpaceEmailDraft(spaceId, id)
        if (!cancelled) {
          if (data) setLoaded(data)
          else setError('That email could not be found.')
        }
      } catch {
        if (!cancelled) setError('Could not open the composer. Try again.')
      }
    })()
    return () => {
      cancelled = true
      const id = draftIdRef.current
      if (id) void discardSpaceEmailDraftIfEmpty(spaceId, id)
      onChanged?.()
    }
  }, [campaignId, spaceId, onChanged])

  // Space-scoped editor wiring: save to this Space's draft (drop the unused fromName the pane may pass; a
  // Space draft has no per-draft from-name), test-send as the Space, and paint in the Space palette.
  const saveCampaign = useCallback(
    (id: string, patch: { layout?: unknown; subject?: string; preheader?: string; fromName?: string }) =>
      saveSpaceEmailDraft(spaceId, id, {
        layout: patch.layout as never,
        subject: patch.subject,
        preheader: patch.preheader,
      }),
    [spaceId],
  )
  const sendTest = useCallback((id: string) => sendSpaceTestEmail(spaceId, id), [spaceId])

  return (
    <Dialog open onClose={onClose} ariaLabel="New email" className="max-w-7xl !mt-0">
      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Send className="h-4 w-4 text-primary" aria-hidden /> New email
            </h3>
            <p className="truncate text-2xs text-subtle">
              Saves automatically as a draft. Pick the audience and send it on the right.
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
            {/* CENTER — the on-canvas WYSIWYG editor, painted in the Space palette. */}
            <div className="min-w-0 flex-1 overflow-y-auto p-5">
              <EmailEditorPane
                campaign={loaded}
                arrangement="canvas"
                saveCampaign={saveCampaign}
                sendTest={sendTest}
                colors={colors}
              />
            </div>
            {/* RIGHT — audience + send, over the Space's own contacts. */}
            <aside className="shrink-0 overflow-y-auto border-t border-border p-5 lg:w-96 lg:border-l lg:border-t-0">
              <SpaceSendPanel
                spaceId={spaceId}
                slug={slug}
                campaignId={loaded.id}
                status={(loaded.context.status as string) ?? 'draft'}
                tags={tags}
                segments={segments}
                readOnly={readOnly}
                onSent={onChanged}
              />
            </aside>
          </div>
        )}
      </div>
    </Dialog>
  )
}
