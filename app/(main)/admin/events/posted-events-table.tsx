'use client'

// The Posted events oversight table (/admin/events). Each row is one event that
// came in through the Poster Events engine, with its claim state and the actions
// that manage the handshake:
//   • Copy claim link  — resend the invitation through any channel (all viewers
//     of this page; the page itself is gated host+ / community staff).
//   • New claim link   — janitor; mints a fresh token, the old link dies.
//   • Assign host      — janitor; hand the event to an organizer who arrived
//     through another channel. Search by name or handle, two-step confirm.
//   • Remove           — janitor; two-step confirm with a REQUIRED reason. The
//     clawback + poster notification fire in the lib.
// All mutations re-verify janitor on the server; `canManage` only hides chrome.

import { buttonClasses } from '@/components/ui/button'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, RefreshCw, Trash2, UserPlus, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { Input } from '@/components/ui/field'
import { DangerModal } from '@/components/admin/danger-modal'
import { BandChip } from './band-chip'
import type { PostedEventRow } from './load-posted'
import {
  assignEventHost,
  regenerateClaimLink,
  removePostedEvent,
  searchMembersToAssign,
  type MemberSearchHit,
} from './posted-actions'

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-subtle'
const tdCls = 'px-3 py-2.5 align-top text-sm'
const actionBtn =
  'inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50'

export function PostedEventsTable({ rows, canManage }: { rows: PostedEventRow[]; canManage: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={thCls}>Event</th>
            <th className={thCls}>Poster</th>
            <th className={thCls}>Published</th>
            <th className={thCls}>Status</th>
            <th className={`${thCls} text-right`}>RSVPs</th>
            <th className={`${thCls} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <PostedRow key={row.id} row={row} canManage={canManage} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusCell({ row }: { row: PostedEventRow }) {
  if (row.status === 'removed') {
    return (
      <div>
        <span className="inline-flex items-center rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">
          Removed
        </span>
        {row.removedReason && <p className="mt-1 max-w-[16rem] text-xs text-subtle">{row.removedReason}</p>}
      </div>
    )
  }
  if (row.status === 'claimed') {
    return (
      <span className="inline-flex items-center rounded-md bg-success-bg px-1.5 py-0.5 text-xs font-medium text-success">
        Claimed by {row.claimedBy ?? 'a member'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
      Unclaimed
    </span>
  )
}

function PostedRow({ row, canManage }: { row: PostedEventRow; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [panel, setPanel] = useState<'none' | 'assign' | 'remove'>('none')
  const [claimUrl, setClaimUrl] = useState(row.claimUrl)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmNewLink, setConfirmNewLink] = useState(false)

  const unclaimed = row.status === 'unclaimed'

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => setError('Could not copy. Select the link text instead.'),
    )
  }

  function handleNewLink() {
    setError(null)
    start(async () => {
      const res = await regenerateClaimLink(row.id)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setClaimUrl(res.data.claimUrl)
      setNotice('New claim link ready. The old one is dead.')
      setTimeout(() => setNotice(null), 4000)
    })
  }

  return (
    <>
      <tr>
        <td className={tdCls}>
          <Link
            href={`/events/${row.slug}`}
            className="font-semibold text-text hover:text-primary-strong"
          >
            {row.title}
          </Link>
        </td>
        <td className={tdCls}>
          {row.poster ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-text">{row.poster.name}</span>
              <BandChip band={row.poster.band} />
            </span>
          ) : (
            <span className="text-subtle">–</span>
          )}
        </td>
        <td className={`${tdCls} whitespace-nowrap text-muted`}>{formatDate(row.publishedAt)}</td>
        <td className={tdCls}>
          <StatusCell row={row} />
        </td>
        <td className={`${tdCls} text-right tabular-nums text-text`}>{row.rsvps}</td>
        <td className={`${tdCls} text-right`}>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {unclaimed && claimUrl && (
              <button type="button" onClick={() => copyLink(claimUrl)} className={actionBtn} title={claimUrl}>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy claim link'}
              </button>
            )}
            {canManage && unclaimed && (
              <>
                <button type="button" onClick={() => setConfirmNewLink(true)} disabled={pending} className={actionBtn}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  New claim link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setPanel(panel === 'assign' ? 'none' : 'assign')
                  }}
                  className={actionBtn}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign host
                </button>
              </>
            )}
            {canManage && row.status !== 'removed' && (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setPanel(panel === 'remove' ? 'none' : 'remove')
                }}
                className={buttonClasses('dangerOutline', 'sm')}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
          {notice && <p className="mt-1.5 text-right text-xs text-success">{notice}</p>}
          {error && panel === 'none' && <p className="mt-1.5 text-right text-xs text-danger">{error}</p>}
        </td>
      </tr>
      {panel === 'assign' && (
        <tr>
          <td colSpan={6} className="bg-surface-elevated/40 px-3 py-3">
            <AssignHostPanel
              eventId={row.id}
              onDone={() => {
                setPanel('none')
                router.refresh()
              }}
              onCancel={() => setPanel('none')}
            />
          </td>
        </tr>
      )}
      {panel === 'remove' && (
        <tr>
          <td colSpan={6} className="bg-surface-elevated/40 px-3 py-3">
            <RemovePanel
              eventId={row.id}
              title={row.title}
              onDone={() => {
                setPanel('none')
                router.refresh()
              }}
              onCancel={() => setPanel('none')}
            />
          </td>
        </tr>
      )}
      <DangerModal
        open={confirmNewLink}
        onClose={() => setConfirmNewLink(false)}
        title="Mint a new claim link?"
        body="The current claim link stops working immediately. Anyone holding the old link can no longer claim this event."
        confirmLabel="Mint new link"
        onConfirm={handleNewLink}
      />
    </>
  )
}

// ── Assign host: search a member, confirm, transfer ────────────────────────────

function AssignHostPanel({
  eventId,
  onDone,
  onCancel,
}: {
  eventId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MemberSearchHit[]>([])
  const [selected, setSelected] = useState<MemberSearchHit | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSearch(q: string) {
    setQuery(q)
    setSelected(null)
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    start(async () => {
      setHits(await searchMembersToAssign(q))
    })
  }

  function handleAssign() {
    if (!selected) return
    setError(null)
    start(async () => {
      const res = await assignEventHost(eventId, selected.id)
      if (isError(res)) {
        setError(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">
        Hand this event to the organizer. They become the host, the claim link dies, and the poster
        hears about it.
      </p>
      <div className="flex max-w-md items-center gap-2">
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search members by name or handle"
          aria-label="Search members by name or handle"
        />
        <button type="button" onClick={onCancel} className={actionBtn} aria-label="Close assign host">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {hits.length > 0 && !selected && (
        <ul className="max-w-md divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => setSelected(hit)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-elevated"
              >
                <span>{hit.displayName ?? 'Member'}</span>
                {hit.handle && <span className="text-xs text-subtle">@{hit.handle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && hits.length === 0 && !pending && !selected && (
        <p className="text-xs text-subtle">No members match that search.</p>
      )}
      {selected && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAssign}
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? 'Assigning…' : `Make ${selected.displayName ?? 'this member'} the host`}
          </button>
          <button type="button" onClick={() => setSelected(null)} className={actionBtn}>
            Pick someone else
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

// ── Remove: two-step confirm with a required reason ────────────────────────────

function RemovePanel({
  eventId,
  title,
  onDone,
  onCancel,
}: {
  eventId: string
  title: string
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleRemove() {
    if (!reason.trim()) return
    setError(null)
    start(async () => {
      const res = await removePostedEvent(eventId, reason)
      if (isError(res)) {
        setError(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">
        Remove “{title}”? Members stop seeing it, the posting Zaps are returned, and the poster is
        told why. A reason is required.
      </p>
      <div className="flex max-w-md items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason the poster will see"
          aria-label="Removal reason"
          maxLength={500}
        />
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending || !reason.trim()}
          className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Removing…' : 'Remove event'}
        </button>
        <button type="button" onClick={onCancel} className={actionBtn}>
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
