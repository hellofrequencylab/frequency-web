'use client'

// SEND TO SPECIFIC PEOPLE (SCAN-1221), the second half of the Space send panel. The audience picker above
// sends to a tag or segment; this one sends the SAME draft to a short list the owner picks by name, either as
// one email each or as 1:1 conversations that thread back into the Space's Conversations workspace. Both go
// through the existing gated Space senders (editor-gated, space-scoped, consent + suppression + cap), so this
// only adds the entry point. Nothing sends on its own: the owner picks the people, chooses the kind, and
// confirms twice, and there is no undo. Voice canon: no em dashes.

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Plus, Search, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Banner } from '@/components/admin/status'
import { sendSpaceEmailDraftToRecipients, sendSpaceEmailDraftAsConversations } from '@/lib/spaces/email-drafts'
import { searchSpaceMemberRecipientsAction, type SpaceRecipientOption } from '@/modules/crm/client'
import type { SpaceRecipient } from '@/lib/spaces/email'
import { isError } from '@/lib/action-result'

type Kind = 'email' | 'conversation'

export function SpaceSendToPeople({
  spaceId,
  slug,
  campaignId,
  disabled = false,
  onSent,
}: {
  spaceId: string
  slug: string
  campaignId: string
  disabled?: boolean
  onSent?: () => void
}) {
  const [kind, setKind] = useState<Kind>('email')
  const [people, setPeople] = useState<SpaceRecipientOption[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpaceRecipientOption[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Debounced search over THIS Space's own contacts (the action re-gates the editor and scopes by space).
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

  const keyOf = (p: SpaceRecipientOption) => p.email.trim().toLowerCase()
  const picked = new Set(people.map(keyOf))

  function send() {
    setError(null)
    setNote(null)
    if (people.length === 0) {
      setError('Add at least one person first.')
      return
    }
    const n = people.length
    const who = `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`
    const how = kind === 'conversation' ? 'as 1:1 conversations' : 'as an email'
    if (!window.confirm(`Send this now to ${who} ${how}? This cannot be undone.`)) return
    if (!window.confirm(`Really send to ${who} right now? There is no undo once it goes out.`)) return
    const recipients: SpaceRecipient[] = people.map((p) => ({ contactId: p.contactId, email: p.email }))
    start(async () => {
      const res =
        kind === 'conversation'
          ? await sendSpaceEmailDraftAsConversations(spaceId, campaignId, recipients)
          : await sendSpaceEmailDraftToRecipients(spaceId, campaignId, recipients)
      if (isError(res)) {
        setError(res.error)
        return
      }
      const sent = res.data.recipientCount
      setNote(`Sent to ${sent.toLocaleString()} ${sent === 1 ? 'person' : 'people'}.`)
      setPeople([])
      onSent?.()
    })
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-meta font-medium text-subtle">Or send to specific people</p>

      <SegmentedControl
        label="How to send"
        value={kind}
        onChange={setKind}
        segments={[
          { value: 'email', label: 'One email each' },
          { value: 'conversation', label: '1:1 conversations' },
        ]}
      />

      <div className="flex flex-wrap gap-1.5">
        {people.length === 0 && <span className="text-meta text-muted">No one picked yet.</span>}
        {people.map((p) => (
          <span
            key={keyOf(p)}
            className="inline-flex items-center gap-1 rounded-pill border border-border bg-canvas px-2.5 py-1 text-meta font-medium text-text"
          >
            {p.displayName}
            <button
              type="button"
              aria-label={`Remove ${p.displayName}`}
              disabled={disabled || pending}
              onClick={() => setPeople((prev) => prev.filter((x) => keyOf(x) !== keyOf(p)))}
              className="rounded-pill p-0.5 text-subtle transition-colors hover:text-danger"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add someone by name or email"
          aria-label="Search this space's contacts to add"
          surface="inset"
          className="pl-8"
          disabled={disabled || pending}
        />
        {(searching || results.length > 0) && query.trim().length >= 2 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-card border border-border bg-surface lift-1">
            {searching && results.length === 0 ? (
              <li className="flex items-center gap-2 px-3 py-2 text-meta text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching
              </li>
            ) : (
              results.map((r) => (
                <li key={keyOf(r)}>
                  <button
                    type="button"
                    disabled={picked.has(keyOf(r))}
                    onClick={() => {
                      setPeople((prev) => [...prev, r])
                      setQuery('')
                      setResults([])
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-meta transition-colors hover:bg-surface-elevated disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-text">{r.displayName}</span>
                      <span className="block truncate text-subtle">{r.email}</span>
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <Button
        className="w-full"
        variant="secondary"
        disabled={disabled || pending || people.length === 0}
        onClick={send}
      >
        <Send className="h-4 w-4" aria-hidden /> Send to {people.length || 'these'} {people.length === 1 ? 'person' : 'people'}
      </Button>

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
      {note && <Banner tone="info" title={note} />}
    </div>
  )
}
