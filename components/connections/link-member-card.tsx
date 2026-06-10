'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, UserRoundCheck, Link2Off, ExternalLink } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { mergeWithMember, unmergeFromMember, searchMembersToLink } from '@/app/(main)/connections/actions'

interface MemberHit {
  id: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) return <Image src={url} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
      {getInitials(name ?? '?')}
    </span>
  )
}

// The MANUAL contact ↔ member link (docs/NETWORK-CRM.md). The auto detector only
// fires on a hard signal (same email or phone), so a contact whose card email
// differs from their signup email never matches — this card lets the owner search
// members and link the two by hand. Linking is the same owner-scoped merge the
// banner performs (live profile populates the card; your logged fields and notes
// stay yours), and it's reversible.
export function LinkMemberCard({
  contactId,
  contactName,
  linked,
}: {
  contactId: string
  contactName: string | null
  /** The member this contact is already linked to, or null. */
  linked: MemberHit | null
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<MemberHit[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQuery(value: string) {
    setQ(value)
    setError(null)
    if (debounce.current) clearTimeout(debounce.current)
    if (value.trim().length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    debounce.current = setTimeout(() => {
      searchMembersToLink(value).then((r) => {
        setHits(r)
        setSearched(true)
      })
    }, 250)
  }

  function link(profileId: string) {
    start(async () => {
      const ok = await mergeWithMember(contactId, profileId)
      if (ok) router.refresh()
      else setError('Could not link. Try again.')
    })
  }

  function unlink() {
    start(async () => {
      await unmergeFromMember(contactId)
      router.refresh()
    })
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
        <UserRoundCheck className="h-4 w-4 text-primary-strong" /> On Frequency
      </h2>

      {linked ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Avatar url={linked.avatarUrl} name={linked.displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{linked.displayName ?? 'Member'}</p>
            {linked.handle && <p className="truncate text-xs text-subtle">@{linked.handle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {linked.handle && (
              <Link
                href={`/people/${linked.handle}`}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View profile
              </Link>
            )}
            <button
              type="button"
              onClick={unlink}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              <Link2Off className="h-3.5 w-3.5" /> Unlink
            </button>
          </div>
          <p className="w-full text-2xs text-subtle">
            Linked to their member profile. Their live profile fills this card in; your logged details and notes stay yours.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">
            Is {contactName ?? 'this contact'} a member? Link the two and their live profile rides along with your notes.
            (The automatic match only fires when the email or phone is the same on both.)
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search members by name or @handle…"
              className="w-full rounded-lg border border-border bg-canvas py-2 pl-8 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          {hits.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {hits.map((h) => (
                <li key={h.id} className="flex items-center gap-2.5 bg-surface p-2.5">
                  <Avatar url={h.avatarUrl} name={h.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{h.displayName ?? 'Member'}</p>
                    {h.handle && <p className="truncate text-xs text-subtle">@{h.handle}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => link(h.id)}
                    disabled={pending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    <UserRoundCheck className="h-3.5 w-3.5" /> Link
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searched && hits.length === 0 && (
            <p className="text-xs text-subtle">No members match that search.</p>
          )}
        </div>
      )}
    </section>
  )
}
