'use client'

// SPACE MEMBER COMPOSER — the space-scoped twin of the Resonance CRM MemberComposer (components/admin/crm/
// member-composer.tsx). It lets a Space editor draft and send a member an email from the space Community
// Resonance viewer WITHOUT any crossover to the platform CRM:
//   • the body is a per-Space block-email DRAFT, edited by the SAME on-canvas WYSIWYG editor the space
//     Marketing tab uses (EmailEditorPane, arrangement="canvas"), painted in the Space's OWN brand palette
//     (spaceEmailColors) and autosaved to this Space's `campaigns` row (saveSpaceEmailDraft).
//   • the audience is a set of removable recipient chips. It defaults to just this member; the editor can
//     search-and-add more, searching ONLY this Space's own contacts (searchSpaceMemberRecipientsAction).
//   • Send routes the composed body + resolved recipients through the SPACE email seam (sendSpaceCampaign via
//     sendSpaceMemberMessageAction), so the Space kill-switch, daily cap, consent + suppression, per-recipient
//     unsubscribe, and outreach_sends ledger all apply. No platform contacts, no resolveSegment, no admin send.
//
// CLIENT / SERVER BOUNDARY: this client module imports ONLY server-action stubs (the space email-drafts
// actions + the space member-composer actions). It never imports a server-only module into its graph.
// Semantic DAWN tokens only, no hex. Voice canon: no em dashes.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Mail, Plus, Search, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { EmailEditorPane } from '@/components/admin/email-studio/editor-pane'
import {
  createSpaceEmailDraft,
  loadSpaceEmailDraft,
  saveSpaceEmailDraft,
  sendSpaceTestEmail,
} from '@/lib/spaces/email-drafts'
import type { LoadedEmailCampaign } from '@/app/(main)/admin/email-studio/actions'
import type { EmailColors } from '@/lib/email-studio/render'
import { isError } from '@/lib/action-result'
import {
  searchSpaceMemberRecipientsAction,
  sendSpaceMemberMessageAction,
  spaceMemberComposerColorsAction,
  type SpaceRecipientOption,
} from './space-member-composer-actions'

/** One recipient in the composed audience. `key` is the normalized email the server resolves. */
interface Chip {
  key: string
  label: string
  email: string
}

export interface SpaceMemberComposerProps {
  /** The Space this composer sends as (its drafts + contacts are scoped to it). */
  spaceId: string
  /** The Space slug — the authz + search/send actions re-derive the Space from this server-side. */
  slug: string
  /** The member this composer opens on. */
  profileId: string
  /** The member's email — the default (removable) recipient chip. */
  email: string
  /** The member's display name, preferred for the default chip label. */
  displayName?: string
  /** Resume an EXISTING draft (its campaign id) instead of minting a fresh one, so reopening the popup for
   *  the same member picks up the saved draft. */
  initialCampaignId?: string
  /** Fired with the draft's campaign id once it is created or resumed, so the parent can remember it. */
  onDraftReady?: (campaignId: string) => void
  /** Fired after a successful send, so the parent drops the remembered draft id and reopening starts fresh. */
  onSent?: () => void
}

const inputClass =
  'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none'

/** Normalize an email for the chip key + de-dupe (trim + lowercase). */
function normalize(email: string): string {
  return email.trim().toLowerCase()
}

export function SpaceMemberComposer({
  spaceId,
  slug,
  email,
  displayName,
  initialCampaignId,
  onDraftReady,
  onSent,
}: SpaceMemberComposerProps) {
  // The Space draft this composer edits + the Space's brand palette (both resolved on open).
  const [campaign, setCampaign] = useState<LoadedEmailCampaign | null>(null)
  const [colors, setColors] = useState<EmailColors | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const initStarted = useRef(false)
  // Bumped by the retry button to re-run the init effect after a failure.
  const [initNonce, setInitNonce] = useState(0)

  // The composed audience. Defaults to just this member (removable).
  const [chips, setChips] = useState<Chip[]>(() => [
    { key: normalize(email), label: displayName?.trim() || email, email },
  ])

  // Search-to-add recipients (debounced), scoped to this Space's contacts.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpaceRecipientOption[]>([])
  const [searching, setSearching] = useState(false)

  // Send state.
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)
  const [pending, start] = useTransition()

  const addChip = useCallback((chip: Chip) => {
    setChips((prev) => (prev.some((c) => c.key === chip.key) ? prev : [...prev, chip]))
  }, [])
  const removeChip = useCallback((key: string) => {
    setChips((prev) => prev.filter((c) => c.key !== key))
  }, [])
  const retryInit = useCallback(() => {
    initStarted.current = false
    setInitError(null)
    setCampaign(null)
    setColors(null)
    setInitNonce((n) => n + 1)
  }, [])

  // Mint (or resume) the Space draft AND resolve the Space brand palette once on open (re-run on retry via
  // initNonce). A THROWN action must not leave the editor spinning: the try/catch surfaces a retryable error.
  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    void (async () => {
      try {
        let campaignId = initialCampaignId ?? null
        if (!campaignId) {
          const created = await createSpaceEmailDraft(spaceId)
          if (isError(created)) {
            setInitError(created.error)
            return
          }
          campaignId = created.data.id
        }
        const [loaded, palette] = await Promise.all([
          loadSpaceEmailDraft(spaceId, campaignId),
          spaceMemberComposerColorsAction(slug),
        ])
        if (!loaded) {
          setInitError('Could not open a new message. Try again.')
          return
        }
        setCampaign(loaded)
        setColors(palette)
        onDraftReady?.(loaded.id)
      } catch {
        setInitError('The message editor could not load. Check your connection and try again.')
      }
    })()
  }, [initNonce, initialCampaignId, spaceId, slug, onDraftReady])

  // Debounced Space-contact search. State updates happen inside the async timer (never synchronously in the
  // effect body), so typing does not trigger a cascading render per keystroke.
  useEffect(() => {
    const q = query.trim()
    let live = true
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        if (live) {
          setResults([])
          setSearching(false)
        }
        return
      }
      if (live) setSearching(true)
      try {
        const found = await searchSpaceMemberRecipientsAction(slug, q)
        if (live) setResults(found)
      } finally {
        if (live) setSearching(false)
      }
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, slug])

  // Space-scoped editor wiring (mirrors the space "New email" popup): save to THIS Space's draft (drop the
  // unused fromName the pane may pass; a Space draft has no per-draft from-name), and test-send as the Space.
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

  function send() {
    if (!campaign) return
    if (!chips.length) {
      setError('Add at least one recipient.')
      return
    }
    setError(null)
    const people = chips.length === 1 ? '1 person' : `${chips.length} people`
    if (!window.confirm(`Send this message now to ${people}? This cannot be undone.`)) return
    start(async () => {
      const res = await sendSpaceMemberMessageAction(slug, {
        campaignId: campaign.id,
        recipientKeys: chips.map((c) => c.email),
      })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSentTo(res.data.recipientCount)
      onSent?.()
    })
  }

  const chipKeys = new Set(chips.map((c) => c.key))

  if (initError) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <Banner tone="critical" title="Could not start a message">
          {initError}
        </Banner>
        <Button size="sm" variant="secondary" onClick={retryInit}>
          <Mail className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    )
  }

  if (sentTo != null) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        {sentTo > 0 ? (
          <Banner
            tone="info"
            title={sentTo === 1 ? 'Message sent to 1 person.' : `Message sent to ${sentTo.toLocaleString()} people.`}
          >
            It is on its way through this space&apos;s consent and suppression checks.
          </Banner>
        ) : (
          <Banner tone="warning" title="No one received this message.">
            Everyone you picked has opted out of this space&apos;s email, is suppressed, or has not opted in yet.
          </Banner>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-bold text-text">Send a message</h3>
      </div>

      {/* AUDIENCE — chips + search over THIS space's contacts. */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-subtle">To</span>
        <div className="flex flex-wrap gap-1.5">
          {chips.length === 0 && (
            <span className="text-xs text-muted">No recipients yet. Add someone below.</span>
          )}
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas px-2.5 py-1 text-xs font-medium text-text"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={() => removeChip(chip.key)}
                className="rounded-full p-0.5 text-subtle transition-colors hover:text-danger"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>

        {/* SEARCH to add more of this space's contacts. */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add someone by name or email"
            aria-label="Search this space's contacts to add"
            className={`${inputClass} pl-8`}
          />
          {(searching || results.length > 0) && query.trim().length >= 2 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-md">
              {searching && results.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching
                </li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">No matches in this space.</li>
              ) : (
                results.map((r) => {
                  const key = normalize(r.email)
                  const already = chipKeys.has(key)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => {
                          addChip({ key, label: r.displayName, email: r.email })
                          setQuery('')
                          setResults([])
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-elevated disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-text">{r.displayName}</span>
                          <span className="block truncate text-subtle">{r.email}</span>
                        </span>
                        {already ? (
                          <span className="shrink-0 text-3xs uppercase tracking-wide text-subtle">Added</span>
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          )}
        </div>
      </div>

      {/* BODY — the SAME on-canvas WYSIWYG editor the space Marketing tab uses, painted in the Space palette. */}
      {campaign && colors ? (
        <EmailEditorPane
          campaign={campaign}
          arrangement="canvas"
          saveCampaign={saveCampaign}
          sendTest={sendTest}
          colors={colors}
        />
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-border">
          <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
        </div>
      )}

      {/* SEND. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" disabled={pending || !campaign || chips.length === 0} onClick={send}>
          <Send className="h-3.5 w-3.5" /> Send now
        </Button>
        <span className="text-xs text-muted">
          {chips.length === 0
            ? 'Add at least one recipient.'
            : `${chips.length.toLocaleString()} recipient${chips.length === 1 ? '' : 's'} before this space's consent and suppression gate.`}
        </span>
      </div>

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
    </section>
  )
}
