'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { moderateUpdateProfile } from './actions'

// Inline moderator edit (janitor) for a profile the viewer doesn't own. Edits the
// moderation-relevant fields (display name + bio); the server re-checks the
// capability. Owners edit via /settings/profile instead.
export function ModerateProfileButton({
  profileId,
  initialName,
  initialBio,
}: {
  profileId: string
  initialName: string
  initialBio: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-signal-bg bg-signal-bg/40 px-3 py-1.5 text-sm font-medium text-signal-strong hover:bg-signal-bg transition-colors"
        title="Moderator edit"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit (mod)
      </button>
    )
  }

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-surface shadow-xl p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Moderator edit</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
      />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio"
        rows={3}
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none resize-y"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            start(async () => {
              setError(null)
              const res = await moderateUpdateProfile(profileId, { displayName: name, bio })
              if (res.ok) setOpen(false)
              else setError(res.error ?? 'Could not save.')
            })
          }
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold px-3 py-1.5 hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-muted hover:text-text px-2 py-1.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  )
}
