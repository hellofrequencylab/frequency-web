'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, Check, Globe, EyeOff } from 'lucide-react'
import { setSpotlightPublished } from '@/app/(main)/settings/profile/actions'

// The publish control, right on the builder — so a member can take their page live (or
// preview it) from where they build it, instead of hunting for the toggle back in profile
// settings. An unpublished page 404s at its public URL, which is the #1 "why is my page
// blank" confusion; surfacing Publish here is the fix.
export function SpotlightPublishBar({ handle, initialPublished }: { handle: string; initialPublished: boolean }) {
  const [published, setPublished] = useState(initialPublished)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const url = handle ? `/spotlight/${handle}` : ''

  function toggle() {
    const next = !published
    setError('')
    start(async () => {
      try { await setSpotlightPublished(next); setPublished(next) }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not update your Spotlight.') }
    })
  }

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-sm backdrop-blur">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
          published ? 'bg-success-bg/50 text-success' : 'bg-warning-bg/50 text-warning'
        }`}
      >
        {published ? <Globe className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {published ? 'Live' : 'Draft. Only you can see it'}
      </span>

      <div className="flex-1" />

      {published && url && (
        <Link href={url} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> View live
        </Link>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
          published
            ? 'border border-border-strong text-text hover:bg-surface-elevated'
            : 'bg-primary text-on-primary hover:bg-primary-hover'
        }`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : published ? null : <Check className="h-4 w-4" />}
        {pending ? 'Saving…' : published ? 'Unpublish' : 'Publish'}
      </button>

      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  )
}
