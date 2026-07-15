'use client'

// RESONANCE CRM — MEMBER COMPOSER. A compact, drop-in composer that lives UNDER a member card so an
// operator can draft and send a member a system email without leaving the CRM. It is a lightweight
// 1:1 / small-set tool that REUSES the campaign pipeline, never a fork of it:
//   • the body is a normal Studio draft edited by the SAME block editor as the Beta Campaign
//     (EmailEditorPane — the embed EmailCanvasEditor / EmailStudioWorkspace also compose).
//   • the audience is a set of removable recipient chips. It defaults to just this member; the operator
//     can search-and-add more, and (when the member manages one) one-tap "everyone in a Circle" or
//     "everyone who RSVP'd an event."
//   • Send routes the composed body + resolved audience through the existing gated send path, so consent,
//     suppression, and the per-recipient send-gate all apply.
//
// CLIENT / SERVER BOUNDARY: this client module imports ONLY server-action stubs (member-composer-actions,
// the email-studio actions). It never imports a server-only module (the admin client, resolveSegment) into
// its graph. Semantic DAWN tokens only, no hex. Voice canon: no em dashes.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Mail, Plus, Search, Send, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { EmailEditorPane } from '@/components/admin/email-studio/editor-pane'
import {
  createEmailDraft,
  loadEmailCampaign,
  type LoadedEmailCampaign,
} from '@/app/(main)/admin/email-studio/actions'
import { isError } from '@/lib/action-result'
import {
  previewMemberAudienceAction,
  searchMemberRecipientsAction,
  sendMemberMessageAction,
  type RecipientOption,
} from './member-composer-actions'

/** One recipient in the composed audience. `key` is the SegmentKey the server resolves. */
interface Chip {
  key: string
  label: string
  /** The member's own chip, a search-added member, or a group (a Circle / event). */
  kind: 'member' | 'group'
}

export interface MemberComposerProps {
  /** The member this composer opens on. Their chip is the default (removable) recipient. */
  profileId: string
  /** The member's email — the chip label when no display name is given. */
  email: string
  /** The member's display name, preferred for the default chip label. */
  displayName?: string
  /** Groups this member manages, offered as one-tap "everyone in..." recipient chips. */
  manages?: {
    circles: { id: string; name: string }[]
    events: { id: string; title: string }[]
  }
  /** Resume an EXISTING draft (its campaign id) instead of minting a fresh one. The parent remembers
   *  the id via onDraftReady so reopening the popup for the same member picks up the saved draft. */
  initialCampaignId?: string
  /** Fired with the draft's campaign id once it is created or resumed, so the parent can remember it
   *  (and reopen into the same draft after a close). */
  onDraftReady?: (campaignId: string) => void
}

const inputClass =
  'w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none'

export function MemberComposer({
  profileId,
  email,
  displayName,
  manages,
  initialCampaignId,
  onDraftReady,
}: MemberComposerProps) {
  // The Studio draft this composer edits. Created once on open, then edited in place by EmailEditorPane.
  const [campaign, setCampaign] = useState<LoadedEmailCampaign | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const initStarted = useRef(false)
  // Bumped by the retry button to re-run the init effect after a failure (a transient action fault).
  const [initNonce, setInitNonce] = useState(0)

  // The composed audience. Defaults to just this member (removable).
  const [chips, setChips] = useState<Chip[]>(() => [
    { key: `profile:${profileId}`, label: displayName?.trim() || email, kind: 'member' },
  ])

  // Search-to-add recipients (debounced).
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipientOption[]>([])
  const [searching, setSearching] = useState(false)

  // Audience size preview + send state.
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)
  const [pending, start] = useTransition()

  const addChip = useCallback((chip: Chip) => {
    setChips((prev) => (prev.some((c) => c.key === chip.key) ? prev : [...prev, chip]))
    setCount(null)
  }, [])
  const removeChip = useCallback((key: string) => {
    setChips((prev) => prev.filter((c) => c.key !== key))
    setCount(null)
  }, [])
  // Re-arm the draft init after a failure: clear the error, drop any half-state, and bump the nonce so
  // the effect runs again (a fresh createEmailDraft). Turns a dead editor into a one-tap retry.
  const retryInit = useCallback(() => {
    initStarted.current = false
    setInitError(null)
    setCampaign(null)
    setInitNonce((n) => n + 1)
  }, [])

  // Create the draft once on open (re-run on a retry via initNonce). A THROWN action — an auth
  // redirect, a transport/deploy-skew fault, an unexpected server error — must NOT leave the editor
  // spinning forever with no signal: the try/catch surfaces a retryable error instead of a dead spinner.
  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    void (async () => {
      try {
        // Resume the parent's remembered draft when there is one (reopening the popup for the same member
        // after a close); otherwise mint a fresh 'message' draft (the lean content-box starter; the branded
        // Frequency header + CAN-SPAM footer come from the email shell). Everything the operator types then
        // AUTOSAVES to this campaign row, so closing the popup never loses the draft.
        let campaignId = initialCampaignId ?? null
        if (!campaignId) {
          const created = await createEmailDraft('message')
          if (isError(created)) {
            setInitError(created.error)
            return
          }
          campaignId = created.data.id
        }
        const loaded = await loadEmailCampaign(campaignId)
        if (!loaded) {
          setInitError('Could not open a new message. Try again.')
          return
        }
        setCampaign(loaded)
        onDraftReady?.(loaded.id)
      } catch {
        setInitError('The message editor could not load. Check your connection and try again.')
      }
    })()
  }, [initNonce, initialCampaignId, onDraftReady])

  // Debounced member search. All state updates happen inside the async timer (never synchronously in the
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
        const found = await searchMemberRecipientsAction(q)
        if (live) setResults(found)
      } finally {
        if (live) setSearching(false)
      }
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  const keys = chips.map((c) => c.key)

  function preview() {
    setError(null)
    start(async () => {
      const res = await previewMemberAudienceAction(keys)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setCount(res.data.count)
    })
  }

  function send() {
    if (!campaign) return
    if (!chips.length) {
      setError('Add at least one recipient.')
      return
    }
    setError(null)
    start(async () => {
      // Resolve the live audience, then confirm before the real send (mirrors the campaign send-panel).
      const pre = await previewMemberAudienceAction(keys)
      if (isError(pre)) {
        setError(pre.error)
        return
      }
      setCount(pre.data.count)
      if (pre.data.count === 0) {
        setError('This message has no one to send to. Everyone in the audience has opted out or has no account.')
        return
      }
      const people = pre.data.count === 1 ? '1 person' : `${pre.data.count.toLocaleString()} people`
      if (!window.confirm(`Send this message now to ${people}? This cannot be undone.`)) return

      const res = await sendMemberMessageAction(campaign.id, keys)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSentTo(res.data.recipientCount)
    })
  }

  const managedCircles = manages?.circles ?? []
  const managedEvents = manages?.events ?? []
  const chipKeys = new Set(keys)

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
        <Banner
          tone="info"
          title={sentTo === 1 ? 'Message sent to 1 person.' : `Message sent to ${sentTo.toLocaleString()} people.`}
        >
          It is on its way through the usual consent and suppression checks.
        </Banner>
      </div>
    )
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-bold text-text">Send a message</h3>
      </div>

      {/* AUDIENCE — chips + search + one-tap group chips. */}
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
              {chip.kind === 'group' && <Users className="h-3 w-3 text-subtle" aria-hidden />}
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

        {/* One-tap group chips (only when this member manages something, and it is not already added). */}
        {(managedCircles.length > 0 || managedEvents.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {managedCircles
              .filter((c) => !chipKeys.has(`circle:${c.id}`))
              .map((c) => (
                <button
                  key={`circle:${c.id}`}
                  type="button"
                  onClick={() => addChip({ key: `circle:${c.id}`, label: `Everyone in ${c.name}`, kind: 'group' })}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                >
                  <Plus className="h-3 w-3" aria-hidden /> Everyone in {c.name}
                </button>
              ))}
            {managedEvents
              .filter((e) => !chipKeys.has(`event:${e.id}`))
              .map((e) => (
                <button
                  key={`event:${e.id}`}
                  type="button"
                  onClick={() => addChip({ key: `event:${e.id}`, label: `Everyone who RSVP'd ${e.title}`, kind: 'group' })}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                >
                  <Plus className="h-3 w-3" aria-hidden /> Everyone who RSVP&apos;d {e.title}
                </button>
              ))}
          </div>
        )}

        {/* SEARCH to add more members. */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add someone by name or email"
            aria-label="Search members to add"
            className={`${inputClass} pl-8`}
          />
          {(searching || results.length > 0) && query.trim().length >= 2 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-md">
              {searching && results.length === 0 ? (
                <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching
                </li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">No matches.</li>
              ) : (
                results.map((r) => {
                  const already = chipKeys.has(r.segmentKey)
                  return (
                    <li key={r.segmentKey}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => {
                          addChip({ key: r.segmentKey, label: r.displayName, kind: 'member' })
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

      {/* BODY — the SAME on-canvas WYSIWYG editor the Beta Campaign tab uses (arrangement="canvas"),
          not the old stacked arrangement, so composing a member message is the identical polished editor. */}
      {campaign ? (
        <EmailEditorPane campaign={campaign} arrangement="canvas" />
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
        <Button size="sm" variant="secondary" disabled={pending || chips.length === 0} onClick={preview}>
          <Users className="h-3.5 w-3.5" /> Preview size
          {count != null && `: ${count.toLocaleString()}`}
        </Button>
        {count != null && (
          <span className="text-xs text-muted">
            {count.toLocaleString()} in this audience before the consent and suppression gate.
          </span>
        )}
      </div>

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
    </section>
  )
}
