'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { updateOwnProfile } from './actions'

// The profile identity block — name · @handle · badges · bio · meta. For the
// owner it's inline-editable (name + bio) right on the profile, autosaving via
// updateOwnProfile; everyone else sees it static. Photos/handle still live on
// /settings/profile.
export function EditableIdentity({
  isOwner,
  displayName,
  handle,
  bio,
  badges,
  meta,
}: {
  isOwner: boolean
  displayName: string
  handle: string
  bio: string
  /** Role + rank chips (server-rendered). */
  badges?: React.ReactNode
  /** Region · joined · circles row (server-rendered). */
  meta?: React.ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(displayName)
  const [bioVal, setBioVal] = useState(bio)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      setError(null)
      const res = await updateOwnProfile({ displayName: name, bio: bioVal })
      if (!res.ok) { setError(res.error ?? 'Could not save.'); return }
      setEditing(false)
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-2xl font-bold text-text focus:border-primary focus:outline-none"
          autoFocus
        />
        <p className="text-sm text-muted">@{handle}</p>
        {badges}
        <textarea
          value={bioVal}
          onChange={(e) => setBioVal(e.target.value)}
          placeholder="Add a short bio…"
          rows={3}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text leading-relaxed focus:border-primary focus:outline-none resize-y"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setName(displayName); setBioVal(bio); setError(null) }}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-elevated transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold leading-tight text-text">{displayName}</h1>
        {isOwner && (
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit name and bio"
            className="shrink-0 rounded-md p-1 text-subtle hover:text-primary-strong hover:bg-surface-elevated transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted">@{handle}</p>
      {badges && <div className="mt-2.5">{badges}</div>}
      {bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text">{bio}</p>}
      {meta}
    </div>
  )
}
