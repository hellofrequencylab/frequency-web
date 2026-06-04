'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { finalizePendingInduction } from '../actions'

// Deferred induction, final step (now authed). Uploads the avatar the signed-out
// flow parked in localStorage, then writes the profile from the stashed answers
// and drops the new Founder into the feed with Vera's lightbox. Best-effort on the
// avatar: if it's missing or won't upload, we finish without it (they add one
// later from their profile). Runs exactly once.
const PENDING_AVATAR_KEY = 'fq_pending_avatar'

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = /^data:([^;,]+)[^,]*,(.*)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1] || 'image/jpeg'
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { blob: new Blob([bytes], { type: mime }), ext }
  } catch {
    return null
  }
}

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
      // actually picked one, so a merge never disturbs an existing photo.
      try {
        const dataUrl = localStorage.getItem(PENDING_AVATAR_KEY)
        if (dataUrl) {
          const parsed = dataUrlToBlob(dataUrl)
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (parsed && user) {
            const path = `${user.id}/avatar.${parsed.ext}`
            const { error: upErr } = await supabase.storage
              .from('avatars')
              .upload(path, parsed.blob, { upsert: true, contentType: parsed.blob.type })
            if (!upErr) {
              avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
            }
          }
        }
        localStorage.removeItem(PENDING_AVATAR_KEY)
      } catch {
        // Ignore — finish without the photo.
      }

      const res = await finalizePendingInduction(avatarUrl)
      if (res.ok) {
        // Returning member (merged into an existing profile) → straight to the
        // feed; a brand-new Founder → the feed with Vera's welcome.
        router.replace(res.merged ? '/feed' : '/feed?welcome=vera')
      } else {
        // No stash (e.g. expired / direct nav) — send them back to start the run.
        setMode('error')
        setError(res.error ?? 'Something went wrong.')
        setTimeout(() => router.replace('/onboarding/beta'), 1600)
      }
    })()
  }, [router])

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-marketing-canvas px-6">
      <div aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-[0.09] blur-[140px]" />
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
