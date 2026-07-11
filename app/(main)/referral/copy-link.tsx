'use client'

import { useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'

// The "your link" card for the referral hub: shows the member's personal invite link
// and a one-tap copy. The link IS their existing personal code short link (the same
// one that credits them when a scan signs up), passed in from the server page.
export function ReferralLinkCard({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked; the link is still visible to copy by hand
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-text">
        <Link2 className="h-4 w-4 text-primary-strong" aria-hidden /> Your invite link
      </h2>
      <p className="mt-1 text-sm text-muted">
        Share this with people you want in Frequency. When someone you bring in takes their first
        real action, it counts toward the contest and earns you Zaps.
      </p>
      {url ? (
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-elevated/60 px-3 py-2 text-sm text-text">
            {url}
          </code>
          <button
            type="button"
            onClick={copy}
            className="press inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-on-primary shadow-pop transition-colors hover:bg-primary-hover motion-reduce:transition-none"
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-surface-elevated/60 px-3 py-2 text-sm text-muted">
          Finish setting up your profile to get your invite link.
        </p>
      )}
    </div>
  )
}
