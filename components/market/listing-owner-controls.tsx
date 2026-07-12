'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, X, Trash2, Loader2, Link2, Send } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setListingStatusAction, deleteListingAction } from '@/app/(main)/classifieds/actions'
import type { ListingStatus } from '@/lib/marketplace'

const BTN = 'inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50'

export function ListingOwnerControls({
  id,
  status,
  claimShareUrl,
}: {
  id: string
  status: ListingStatus
  /** For a SEEDED, still-unclaimed listing shown to an operator (admin/janitor): the shareable claim
   *  link to send the real poster. Absent (undefined) once claimed or for a non-seeded listing, so the
   *  row simply disappears. The absolute URL is built client-side from this path. */
  claimShareUrl?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyClaim = () => {
    if (!claimShareUrl) return
    const full = typeof window !== 'undefined' ? new URL(claimShareUrl, window.location.origin).toString() : claimShareUrl
    navigator.clipboard?.writeText(full).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const setStatus = (s: ListingStatus) =>
    start(async () => {
      setError(null)
      const res = await setListingStatusAction(id, s)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })

  const remove = () =>
    start(async () => {
      setError(null)
      const res = await deleteListingAction(id)
      if (isError(res)) setError(res.error)
      else router.push('/classifieds')
    })

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Manage your listing</p>
      <div className="flex flex-wrap items-center gap-2">
        {status === 'active' ? (
          <>
            <button type="button" disabled={pending} onClick={() => setStatus('claimed')} className={BTN}><Check className="h-4 w-4" /> Mark claimed</button>
            <button type="button" disabled={pending} onClick={() => setStatus('closed')} className={BTN}><X className="h-4 w-4" /> Close</button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => setStatus('active')} className={BTN}><RotateCcw className="h-4 w-4" /> Reopen</button>
        )}
        {confirmDelete ? (
          <button type="button" disabled={pending} onClick={remove} className="inline-flex items-center gap-1.5 rounded-xl bg-danger px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Confirm delete
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className={`${BTN} hover:text-danger`}><Trash2 className="h-4 w-4" /> Delete</button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {claimShareUrl && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Send className="h-3.5 w-3.5" aria-hidden /> Claim Listing link
          </p>
          <p className="mb-2 text-xs text-muted">Send this to the poster. Opening it lets them claim the listing in place of contacting the seller.</p>
          <button
            type="button"
            onClick={copyClaim}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy claim link'}
          </button>
        </div>
      )}
    </div>
  )
}
