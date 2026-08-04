'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { finalizePendingInduction, uploadPendingAvatar } from '../actions'

// Deferred induction, final step (now authed). Uploads the avatar the signed-out
// flow parked in localStorage (server-side, so it can't fail as an unauthenticated
// `anon` storage write), then writes the profile from the stashed answers and drops
// the new Founder into the feed with Vera's lightbox. Best-effort on the avatar: if
// it's missing or won't upload, we finish without it (they add one later from their
// profile). Runs exactly once.
const PENDING_AVATAR_KEY = 'fq_pending_avatar'

export function BetaCompleteFinalizer() {
  const router = useRouter()
  const [mode, setMode] = useState<'working' | 'error'>('working')
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    ;(async () => {
      let avatarUrl: string | null = null

      // Upload the parked avatar, if any (best-effort). Only present when they
      // actually picked one, so a merge never disturbs an existing photo. The
      // upload runs server-side so it can't fail as an unauthenticated write.
      try {
        const dataUrl = localStorage.getItem(PENDING_AVATAR_KEY)
        if (dataUrl) {
          avatarUrl = await uploadPendingAvatar(dataUrl)
        }
        localStorage.removeItem(PENDING_AVATAR_KEY)
      } catch {
        // Ignore — finish without the photo.
      }

      // A NICHE funnel carries its post-completion destination here as `?to=` (set on the
      // deferred sign-in `next`). Read it client-side; the server action re-validates it as a
      // safe in-app path before returning the landing target, so this raw value is never
      // trusted for the redirect on its own.
      const to = new URLSearchParams(window.location.search).get('to') ?? undefined
      const res = await finalizePendingInduction(avatarUrl, to)
      if (res.ok) {
        // Where to land: the funnel destination the action validated (target), else the
        // default — a returning member (merged) → the bare feed; a brand-new Founder →
        // the feed with Vera's welcome.
        router.replace(res.target ?? (res.merged ? '/feed' : '/feed?welcome=vera'))
      } else {
        // No stash (e.g. expired / direct nav) — send them back to start the run.
        setMode('error')
        setError(res.error ?? 'Something went wrong.')
        setTimeout(() => router.replace('/onboarding/beta'), 1600)
      }
    })()
  }, [router])

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="relative z-10 max-w-sm text-center">
        <span className="brandmark mx-auto block h-10 aspect-[963/170]" aria-hidden />
        {mode === 'error' ? (
          <p className="mt-6 text-sm text-muted">{error} Taking you back…</p>
        ) : (
          <>
            <div className="mx-auto mt-8 h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="mt-5 text-lg font-semibold text-text">Stepping you in…</p>
            <p className="mt-1 text-sm text-muted">Saving your spot, Founder.</p>
          </>
        )}
      </div>
    </main>
  )
}
