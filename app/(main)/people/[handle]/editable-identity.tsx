'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { updateOwnProfile } from './actions'

// The profile bio block — inline-editable for the owner (name + bio autosave via
// updateOwnProfile); everyone else just sees the bio. The name · @handle · badges
// now live in the page's Detail header band (ADR-173), so this renders bio-only in
// its resting state and only surfaces the name field while the owner is editing.
// Photos/handle still live on /settings/profile.
export function EditableIdentity({
  isOwner,
  displayName,
  handle,
  bio,
}: {
  isOwner: boolean
  displayName: string
  handle: string
  bio: string
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
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-2xl font-bold text-text focus:border-border-strong focus:outline-none"
          autoFocus
        />
        <p className="text-sm text-muted">@{handle}</p>
        <textarea
          value={bioVal}
          onChange={(e) => setBioVal(e.target.value)}
          placeholder="Add a short bio…"
          rows={3}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text leading-relaxed focus:border-border-strong focus:outline-none resize-y"
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

  // Resting state: bio only — the name/@handle/badges are in the Detail band above.
  return (
    <div>
      {bio ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{bio}</p>
      ) : isOwner ? (
        <p className="text-sm italic text-subtle">Add a short bio so people know who you are.</p>
      ) : null}
      {isOwner && (
        <button
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-subtle transition-colors hover:bg-surface-elevated hover:text-primary-strong"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit name &amp; bio
        </button>
      )}
    </div>
  )
}
