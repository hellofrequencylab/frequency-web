'use client'

import { useState } from 'react'
import { Check, Link2, Send } from 'lucide-react'

// The shareable "Claim Listing" link, shown to platform staff on a SEEDED, still-unclaimed listing
// (Housing here; the Classifieds twin renders the same block inside ListingOwnerControls). Staff copy
// it and send it to the real poster; opening it lets them claim the listing in place of contacting
// the seller. The row disappears once claimed (the server passes no url). The absolute URL is built
// client-side from the given path. Voice (CONTENT-VOICE §10): plain, no em/en dashes; DAWN tokens only.
export function ListingClaimLink({ claimShareUrl }: { claimShareUrl: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    const full =
      typeof window !== 'undefined' ? new URL(claimShareUrl, window.location.origin).toString() : claimShareUrl
    navigator.clipboard?.writeText(full).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <Send className="h-3.5 w-3.5" aria-hidden /> Claim Listing link
      </p>
      <p className="mb-2 text-xs text-muted">
        Send this to the poster. Opening it lets them claim the listing in place of contacting the seller.
      </p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy claim link'}
      </button>
    </div>
  )
}
