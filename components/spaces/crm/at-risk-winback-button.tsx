'use client'

// THE WIN-BACK HOOK (ADR-560). A manual trigger next to each at-risk contact in the cockpit: it runs
// the existing value-led win-back play (lib/playbooks/registry.ts `reengage_winback`) against that
// contact through the ALREADY-GOVERNED server action (runSpacePlaybookAction in
// app/(main)/spaces/[slug]/crm/playbook-actions.ts) — the same confirm-then-execute path, circuit
// breaker, autonomy gate, and run log every Space play uses. This is the MANUAL leg of the seam; when
// the automation work lands, an at-risk contact can enroll into the win-back SEQUENCE on its own with
// no change to this button (it already calls the reengage_winback play).
//
// SUGGEST-BY-DEFAULT stays intact: the play's outbound email drafts + send-gates, never auto-sends.
// The button only kicks off the governed run; it never sends on its own. Owner copy, CONTENT-VOICE:
// plain, no em or en dashes, never narrates the reader's feelings.

import { useState, useTransition } from 'react'
import { HeartHandshake } from 'lucide-react'
import { runSpacePlaybookAction } from '@/app/(main)/spaces/[slug]/crm/playbook-actions'
import { isError } from '@/lib/action-result'

/** The value-led win-back play (ADR-386 Phase 5). Kept in one place so the seam points at one id. */
const WINBACK_PLAYBOOK_ID = 'reengage_winback'

export function AtRiskWinBackButton({ slug, contactId }: { slug: string; contactId: string }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')

  function onClick() {
    setState('idle')
    startTransition(async () => {
      const res = await runSpacePlaybookAction({ slug, playbookId: WINBACK_PLAYBOOK_ID, contactId })
      setState(isError(res) ? 'error' : 'done')
    })
  }

  if (state === 'done') {
    return <span className="text-xs font-medium tabular-nums text-success">Win-back started</span>
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text shadow-sm transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
        {pending ? 'Starting' : 'Win back'}
      </button>
      {state === 'error' && (
        <span className="text-xs text-danger">That did not go through. Try again.</span>
      )}
    </div>
  )
}
