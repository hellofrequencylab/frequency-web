'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { setScanInviteEnabled } from './actions'

// Operator switch for the one-time scan-intro email (default off). Mirrors the AI
// switch on /admin/ai; every flip is audited in platform_flag_events.
export function ScanInviteToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      await setScanInviteEnabled(!enabled)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <Mail className="h-4 w-4 shrink-0 text-primary-strong" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">Scan-intro emails</p>
        <p className="text-xs text-muted">
          One-time personal intro to people a steward scans into their CRM.{' '}
          {enabled ? 'On.' : 'Off — nothing sends.'} Needs <code>RESEND_API_KEY</code> set.
        </p>
      </div>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-subtle" />}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Scan-intro emails"
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          enabled ? 'bg-primary' : 'border border-border-strong bg-surface-elevated'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
