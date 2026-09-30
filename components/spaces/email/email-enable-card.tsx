'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { isError } from '@/lib/action-result'
import { setSpaceEmailEnabled } from '@/lib/spaces/campaigns-actions'

// EMAIL ENABLE GATE (ENTITY-SPACES-BUILD §C Phase 3, "per-space kill-switch" + the acknowledgment).
// When email is OFF for a Space, the owner sees this card instead of the composer. Turning it on
// REQUIRES a plain-language anti-spam acknowledgment (not legal terms). The card links the live Space
// email policy (SPACE_EMAIL_POLICY_HREF, app/space-email-policy; LIVE-729, ADR-1673, owner ruling
// 2026-09-30 "Ship without counsel review" on OWN-085) so the owner can read the rules before turning
// email on. The checkbox is still the one thing the owner confirms: linking the policy adds no new
// consent step and records nothing new.
// The action is gated on canEditProfile server-side and flips the backbone kill-switch
// (setSpaceEmailEnabled, @/lib/spaces/email-toggle), then refreshes the surface to show the composer.
//
// Copy passes CONTENT-VOICE: plain, concrete, honest, no narrated feelings, no em/en dashes.

/** The live Space email acceptable-use policy (app/space-email-policy/page.tsx). */
const SPACE_EMAIL_POLICY_HREF = '/space-email-policy'

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
    <div className="space-y-4 rounded-card border border-border bg-surface p-6 lift-1">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-bg text-primary-strong">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-text">Turn on email</p>
          <p className="mt-0.5 text-body-sm text-muted">
            Email your own contacts from this space. Once it is on, you can write a campaign, pick who
            gets it, and send or schedule it.
          </p>
        </div>
      </div>

      <p className="text-body-sm text-muted">
        Read the{' '}
        <Link
          href={SPACE_EMAIL_POLICY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-strong hover:underline"
        >
          Space email policy
        </Link>{' '}
        before you turn it on. It covers who you can email, what you can send, and the daily limit.
      </p>

      <Checkbox
        checked={acknowledged}
        disabled={readOnly}
        onChange={(e) => setAcknowledged(e.target.checked)}
        label="I have permission to email these people and will follow anti-spam rules."
        wrapperClassName="flex rounded-card border border-border bg-surface-elevated/40 px-3 py-3"
      />

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
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
