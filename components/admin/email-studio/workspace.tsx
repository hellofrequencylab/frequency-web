'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { Loader2, Mail, Plus, Trash2 } from 'lucide-react'
import { EmailEditorPane } from './editor-pane'
import {
  createEmailDraft,
  deleteEmailDraft,
  listEmailCampaigns,
  loadEmailCampaign,
  saveEmailCampaign,
  sendTestEmail,
  type EmailCampaignCard,
  type LoadedEmailCampaign,
} from '@/app/(main)/admin/email-studio/actions'
import { isError, type ActionResult } from '@/lib/action-result'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { EmailColors } from '@/lib/email-studio/render'

// The read + write seams the workspace drives. Injectable so the SAME two-pane workspace serves the admin Email
// Studio (its default = the admin actions) AND a per-Space Marketing editor (space-scoped, brand-compiling
// actions bound to a spaceId on the client). We do not fork the engine — we point it at another data source.
export interface EmailWorkspaceActions {
  /** List the cards for the left rail. */
  list: () => Promise<EmailCampaignCard[]>
  /** Create a new draft; returns its id. */
  create: () => Promise<ActionResult<{ id: string }>>
  /** Delete a draft. */
  remove: (id: string) => Promise<ActionResult>
  /** Load one email into the editor. */
  load: (id: string) => Promise<LoadedEmailCampaign | null>
  /** Persist layout / subject / preheader (injected into the editor pane's store + fields). */
  save: (
    id: string,
    patch: { layout?: BuilderLayout | EntityLayout; subject?: string; preheader?: string },
  ) => Promise<{ error?: string }>
  /** Test-send to the operator (injected into the compose toolbar). */
  sendTest: (id: string) => Promise<ActionResult<{ to: string }>>
}

/** The default action bundle: the admin Email Studio's server actions (unchanged behavior). */
const ADMIN_ACTIONS: EmailWorkspaceActions = {
  list: listEmailCampaigns,
  create: createEmailDraft,
  remove: deleteEmailDraft,
  load: loadEmailCampaign,
  save: saveEmailCampaign,
  sendTest: sendTestEmail,
}

// EMAIL STUDIO WORKSPACE (Phase 2). The two-pane Campaign Workspace: a compact list of email cards on the
// LEFT, the selected email's block editor on the RIGHT. Selecting a card loads it into the reused arranger;
// "New email" spins up a draft from the basic email starter. Composes semantic DAWN tokens only (no hex),
// voice canon (no em dashes).
//
// SLOTS for later phases: templateGallery (Phase 3), sendPanel (Phase 4), analyticsPanel (Phase 6) render in
// the right pane's header / side and default to nothing, so those phases plug in WITHOUT editing this file.

const STATUS_TONE: Record<string, string> = {
  draft: 'text-muted',
  scheduled: 'text-primary-strong',
  sent: 'text-success',
}

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'text-muted'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function EmailStudioWorkspace({
  initialCampaigns,
  templateGallery,
  sendPanel,
  analyticsPanel,
  actions,
  arrangement = 'stacked',
  colors,
}: {
  initialCampaigns: EmailCampaignCard[]
  /** Phase 3: a starter-template gallery. Receives an `onUse(id)` that adds + selects the new draft. */
  templateGallery?: (onUse: (campaignId: string) => void) => ReactNode
  /** Phase 4: the send / schedule / approval panel for the selected campaign (id + current status). */
  sendPanel?: (campaignId: string, status: string) => ReactNode
  /** Phase 6: the per-campaign analytics panel for the selected campaign. */
  analyticsPanel?: (campaignId: string) => ReactNode
  /** The read + write seams. Defaults to the admin Email Studio's actions; a per-Space editor injects its
   *  own space-scoped, brand-compiling bundle. */
  actions?: EmailWorkspaceActions
  /** The editor arrangement (passed to EmailEditorPane). The Marketing editor uses 'canvas'. */
  arrangement?: 'stacked' | 'trio' | 'canvas'
  /** Brand palette for the canvas + live preview (spaceEmailColors for a Space; DAWN default otherwise). */
  colors?: EmailColors
}) {
  const act = actions ?? ADMIN_ACTIONS
  const [cards, setCards] = useState<EmailCampaignCard[]>(initialCampaigns)
  const [selectedId, setSelectedId] = useState<string | null>(initialCampaigns[0]?.id ?? null)
  const [loaded, setLoaded] = useState<LoadedEmailCampaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reqRef = useRef(0)

  // Load the selected campaign into the editor whenever the selection changes. The state updates live inside
  // the async `run` (not the effect body), so a newer selection's request always wins via the req guard.
  useEffect(() => {
    const req = ++reqRef.current
    async function run() {
      if (!selectedId) {
        setLoaded(null)
        return
      }
      setLoading(true)
      try {
        const data = await act.load(selectedId)
        if (req === reqRef.current) setLoaded(data)
      } catch {
        if (req === reqRef.current) setLoaded(null)
      } finally {
        if (req === reqRef.current) setLoading(false)
      }
    }
    void run()
  }, [selectedId, act])

  const refreshList = useCallback(async () => {
    const next = await act.list()
    setCards(next)
    return next
  }, [act])

  // A draft created outside the list (e.g. from the template gallery): refresh the rail and open it.
  const handleExternalSelect = useCallback(
    async (id: string) => {
      await refreshList()
      setSelectedId(id)
    },
    [refreshList],
  )

  function onNew() {
    setError(null)
    startTransition(async () => {
      const res = await act.create()
      if (isError(res)) {
        setError(res.error)
        return
      }
      await refreshList()
      setSelectedId(res.data.id)
    })
  }

  function onDelete(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await act.remove(id)
      if (isError(res)) {
        setError(res.error)
        return
      }
      const next = await refreshList()
      if (selectedId === id) setSelectedId(next[0]?.id ?? null)
    })
  }

  // Keep the left-rail card label in sync as the operator edits the subject.
  const onSubjectChange = useCallback((id: string, subject: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, subject } : c)))
  }, [])

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* LEFT: the email list */}
      <aside className="space-y-3">
        <button
          type="button"
          onClick={onNew}
          disabled={pending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          New email
        </button>

        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {cards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted">
            No emails yet. Start one above.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {cards.map((card) => {
              const active = card.id === selectedId
              return (
                <li key={card.id}>
                  <div
                    className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                      active ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(card.id)}
                      aria-current={active}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                          {card.subject.trim() || 'Untitled'}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-2 pl-5 text-3xs">
                        <span className={`font-semibold uppercase tracking-wide ${statusTone(card.status)}`}>
                          {card.status}
                        </span>
                        <span className="text-subtle">{formatWhen(card.updatedAt)}</span>
                      </span>
                    </button>
                    {card.status === 'draft' && (
                      <button
                        type="button"
                        aria-label={`Delete ${card.subject.trim() || 'Untitled'}`}
                        onClick={() => onDelete(card.id)}
                        disabled={pending}
                        className="shrink-0 rounded p-1 text-subtle opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </aside>

      {/* RIGHT: the selected email's editor + phase slots */}
      <section className="min-w-0">
        {selectedId == null ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border">
            <p className="text-sm text-muted">Select an email, or start a new one.</p>
          </div>
        ) : loading || !loaded ? (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-border">
            <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
          </div>
        ) : (
          <div className="space-y-4">
            {(sendPanel || analyticsPanel) && (
              <div className="flex flex-wrap items-start gap-3">
                {sendPanel?.(loaded.id, cards.find((c) => c.id === loaded.id)?.status ?? 'draft')}
                {analyticsPanel?.(loaded.id)}
              </div>
            )}
            {templateGallery?.(handleExternalSelect)}
            <EmailEditorPane
              key={loaded.id}
              campaign={loaded}
              onSubjectChange={onSubjectChange}
              arrangement={arrangement}
              colors={colors}
              saveCampaign={act.save}
              sendTest={act.sendTest}
            />
          </div>
        )}
      </section>
    </div>
  )
}
