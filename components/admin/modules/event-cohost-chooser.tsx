'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserPlus, Check, X } from 'lucide-react'
import {
  inviteCohost,
  listEventCohostsForEditor,
  removeCohost,
  type EditorCohostRow,
} from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'
import { Input, labelClasses } from '@/components/ui/field'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

type HandleHit = { id: string; handle: string; display_name: string; avatar_url: string | null }

// PERSONAL COHOSTS (relation A, ADR-834) — invite a MEMBER to help host, straight from the editor
// rail. A cohost gets management access on the event (isEventCohost in the action gates) and a quiet
// avatar credit on the event page. The OTHER relation is COLLABORATORS (relation B, the
// EventShareField below): a Business / Non Profit SPACE co-hosting the event on its calendar, with a
// featured credit and NO management access. Keep the two legible.
//
// Reuses the same handle-search + inviteCohost path as the public CohostManager's Add control (the
// /api/search-handles typeahead → the invite server action), so an invite from here is identical to
// one sent from the event page. Results render IN FLOW (not an absolute dropdown): the admin rail's
// `@container` wrapper sets container-type, which clips a `top-full` overlay (see cohost-manager /
// placement).
//
// Invite AND remove live here (owner directive): the list below the field shows every current
// cohost and pending invite with a remove control, so the host manages the whole relation from
// the editor without hunting for the event page's Cohosts box (which keeps its own removal too).
export function EventCohostChooser({ eventId, slug }: { eventId: string; slug: string }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HandleHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
  const [current, setCurrent] = useState<EditorCohostRow[]>([])
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = useCallback(() => {
    listEventCohostsForEditor(eventId).then(setCurrent).catch(() => {})
  }, [eventId])
  useEffect(reload, [reload])

  function remove(row: EditorCohostRow) {
    // A pending invite cancels quietly; removing a live cohost drops their management access,
    // so that one confirms first.
    if (
      row.status === 'accepted' &&
      !window.confirm(`Remove ${row.displayName} as a cohost? They lose access to manage this event.`)
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      await removeCohost(eventId, slug, row.profileId)
      reload()
    })
  }

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) {
        setHits([])
        return
      }
      try {
        const res = await fetch(`/api/search-handles?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        setHits(json.profiles ?? [])
      } catch {
        setHits([])
      }
    }, 150)
  }, [])

  function invite(handle: string) {
    setError(null)
    startTransition(async () => {
      const res = await inviteCohost(eventId, slug, handle)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setInvited(handle)
      setQuery('')
      setHits([])
      reload()
    })
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>
        Cohosts <span className="font-normal text-subtle">(invite someone to help host)</span>
      </span>

      <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5">
        <UserPlus className="h-4 w-4 shrink-0 text-subtle" />
        <Input
          variant="seamless"
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            setInvited(null)
            search(v)
          }}
          placeholder="Invite a cohost by name or @handle"
          disabled={pending}
          className="min-w-0 flex-1 text-body-sm text-text"
        />
      </div>

      {invited && (
        <p className="flex items-center gap-1.5 text-meta text-success">
          <Check className="h-3.5 w-3.5" /> Invite sent to @{invited}.
        </p>
      )}
      {error && <p className="text-meta text-danger">{error}</p>}

      {/* Current cohosts + pending invites, each removable (owner directive). Removal re-checks
          the host gate server-side; a pending invite cancels without a confirm. */}
      {current.length > 0 && (
        <ul className="space-y-1">
          {current.map((c) => (
            <li key={c.profileId} className="flex items-center gap-2 rounded-control bg-surface px-2 py-1.5">
              {c.avatarUrl ? (
                <Image
                  src={avatarSrc(c.avatarUrl)}
                  alt={c.displayName}
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 rounded-pill object-cover"
                  style={avatarFocusStyle(c.avatarUrl)}
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(c.displayName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta font-semibold text-text">{c.displayName}</p>
                {c.handle && <p className="truncate text-2xs text-muted">@{c.handle}</p>}
              </div>
              <span className="shrink-0 rounded-pill bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                {c.status === 'accepted' ? 'Cohost' : 'Invited'}
              </span>
              <button
                type="button"
                onClick={() => remove(c)}
                disabled={pending}
                aria-label={c.status === 'accepted' ? `Remove ${c.displayName}` : `Cancel invite to ${c.displayName}`}
                className="shrink-0 rounded-control p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-danger disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The one quiet upgrade pointer (ADR-834): a cohost is a personal credit; a business gets the
          featured Collaborator billing, which needs a Business Space. One line, one link, hosts only
          (this rail is already host-gated). */}
      <p className="text-2xs text-muted">
        Run a business?{' '}
        <Link href="/spaces/new" className="underline underline-offset-2 hover:text-text">
          Feature it on events as a Collaborator.
        </Link>
      </p>

      {/* In-flow results — never an absolute overlay (the rail's @container clips a top-full list). */}
      {hits.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border bg-surface py-1 lift-3">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => invite(p.handle)}
              disabled={pending}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              {p.avatar_url ? (
                <Image src={avatarSrc(p.avatar_url)} alt={p.display_name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-pill object-cover" style={avatarFocusStyle(p.avatar_url)} />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(p.display_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta font-semibold text-text">{p.display_name}</p>
                <p className="truncate text-2xs text-muted">@{p.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
