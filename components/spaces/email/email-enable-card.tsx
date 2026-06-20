'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setSpaceEmailEnabled } from '@/lib/spaces/campaigns-actions'

// EMAIL ENABLE GATE (ENTITY-SPACES-BUILD §C Phase 3, "per-space kill-switch" + the acknowledgment).
// When email is OFF for a Space, the owner sees this card instead of the composer. Turning it on
// REQUIRES a plain-language anti-spam acknowledgment (not legal terms; counsel-gated AUP is deferred).
// The action is gated on canEditProfile server-side and flips the backbone kill-switch
// (setSpaceEmailEnabled, @/lib/spaces/email-toggle), then refreshes the surface to show the composer.
//
// Copy passes CONTENT-VOICE: plain, concrete, honest, no narrated feelings, no em/en dashes.

export function EmailEnableCard({
  spaceId,
  slug,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  readOnly?: boolean
}) {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function enable() {
    if (readOnly || pending || !acknowledged) return
    setError(null)
    start(async () => {
      const res = await setSpaceEmailEnabled(spaceId, slug, true, acknowledged)
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Turn on email</p>
          <p className="mt-0.5 text-sm text-muted">
            Email your own contacts from this space. Once it is on, you can write a campaign, pick who
            gets it, and send or schedule it.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated/40 px-3 py-3">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={readOnly}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-border-strong/30"
        />
        <span className="text-sm text-text">
          I have permission to email these people and will follow anti-spam rules.
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="button" onClick={enable} disabled={readOnly || pending || !acknowledged}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Turning on
          </>
        ) : (
          'Turn on email'
        )}
      </Button>
    </div>
  )
}
