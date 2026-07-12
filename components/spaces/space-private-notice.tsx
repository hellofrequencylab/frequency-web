'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, Globe, Loader2 } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { updateSpaceProfile } from '@/lib/spaces/profile-settings'
import { isError } from '@/lib/action-result'

// OWNER GUARDRAIL — the "this page is private" notice. Shown ONLY to a manager (owner / admin / editor)
// viewing their OWN Space while its visibility is `private`, so a business page is never silently
// unreachable: a private Space is hidden from Business Spaces, from search, and from anyone the owner
// shares the link with (they would hit "That space isn't here"). One click flips it to `network`
// (discoverable) via the same gated write the settings form uses; the server re-checks canEditProfile, so
// this button is only an assist, never the authority. Semantic DAWN tokens only, no hex; voice canon.

export function SpacePrivateNotice({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function makePublic() {
    setError(null)
    startTransition(async () => {
      const res = await updateSpaceProfile(spaceId, { visibility: 'network' })
      if (isError(res)) {
        setError(res.error)
        return
      }
      // The write revalidates the profile + directory server-side; refresh so the notice clears in place.
      router.refresh()
    })
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <EyeOff className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">This page is private</p>
          <p className="text-xs leading-relaxed text-muted">
            Only you and members can see it. It will not show up in Business Spaces, in search, or for anyone
            you share the link with. Make it public when you are ready for people to find it.
          </p>
          {error && (
            <p className="mt-1 text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={makePublic}
        disabled={pending}
        className={`${buttonClasses('primary', 'sm')} shrink-0 disabled:opacity-60`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
        Make public
      </button>
    </div>
  )
}
