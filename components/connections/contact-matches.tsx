'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, X, UserRoundCheck } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { mergeWithMember, dismissMatch } from '@/app/(main)/connections/actions'
import type { ContactMatchSuggestion } from '@/lib/connections/matching'

// The "this contact is already a member" alert (docs/NETWORK-CRM.md). Shown atop
// My Contacts when a logged contact hard-matches a member profile (same email or
// phone). Merging links the two so the member's live profile populates the card,
// while your original logged details + notes stay put; dismissing hides it.
export function ContactMatches({ suggestions }: { suggestions: ContactMatchSuggestion[] }) {
  const [items, setItems] = useState(suggestions)
  if (items.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary-bg/40 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-primary-strong" />
        <h2 className="text-sm font-bold text-text">
          {items.length === 1 ? 'A contact is on Frequency' : `${items.length} contacts are on Frequency`}
        </h2>
      </div>
      <p className="mb-3 text-sm text-muted">
        These look like the same person as a member. Merge to pull their live profile onto the card. Your notes stay private to you.
      </p>
      <ul className="space-y-2">
        {items.map((s) => (
          <MatchRow
            key={s.contact.id}
            suggestion={s}
            onResolve={() => setItems((prev) => prev.filter((p) => p.contact.id !== s.contact.id))}
          />
        ))}
      </ul>
    </div>
  )
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) {
    return <Image src={url} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
      {getInitials(name ?? '?')}
    </span>
  )
}

function MatchRow({
  suggestion,
  onResolve,
}: {
  suggestion: ContactMatchSuggestion
  onResolve: () => void
}) {
  const { contact, profile, matchOn } = suggestion
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function merge() {
    start(async () => {
      setError(null)
      const ok = await mergeWithMember(contact.id, profile.id)
      if (ok) onResolve()
      else setError('Could not merge. Try again.')
    })
  }
  function dismiss() {
    start(async () => {
      await dismissMatch(contact.id)
      onResolve()
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar url={contact.avatarUrl} name={contact.displayName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">
            {contact.displayName ?? 'Unnamed contact'}
          </p>
          <p className="truncate text-xs text-muted">
            Matches{' '}
            <Link href={profile.handle ? `/people/${profile.handle}` : '#'} className="font-medium text-primary-strong hover:underline">
              {profile.displayName ?? `@${profile.handle}`}
            </Link>{' '}
            by {matchOn}
          </p>
        </div>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={merge}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <UserRoundCheck className="h-3.5 w-3.5" /> Merge
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          aria-label="Dismiss"
          title="Not the same person"
          className="inline-flex items-center rounded-lg border border-border px-2 py-1.5 text-xs text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}
