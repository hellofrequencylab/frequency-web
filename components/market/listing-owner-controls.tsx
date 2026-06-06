'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, X, Trash2, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setListingStatusAction, deleteListingAction } from '@/app/(main)/market/actions'
import type { ListingStatus } from '@/lib/marketplace'

const BTN = 'inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50'

export function ListingOwnerControls({ id, status }: { id: string; status: ListingStatus }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
      else router.push('/market')
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
    </div>
  )
}
