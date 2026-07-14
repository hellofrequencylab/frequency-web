'use client'

import { useState, useTransition } from 'react'
import { Check, Sparkles, BarChart3, Megaphone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ConsentScope } from '@/lib/consent/scopes'
import { saveConsentScope } from '@/app/(main)/settings/notifications/actions'
import { isError } from '@/lib/action-result'

// The member-controllable consent scopes surfaced as toggles (Phase 6). These were
// ledger-only until now: recorded on grant/revoke elsewhere, with no member control.
// `email_lifecycle` is intentionally NOT here — it is governed by the per-category
// unsubscribe, not a standalone consent toggle.
export type ConsentScopeState = Record<ConsentScope, boolean>

const SCOPE_META: Partial<Record<ConsentScope, { Icon: LucideIcon; label: string; help: string }>> = {
  email_marketing: {
    Icon: Megaphone,
    label: 'Marketing email',
    help: 'Occasional news, offers, and early-access invites. Off unless you turn it on.',
  },
  ai_memory: {
    Icon: Sparkles,
    label: 'Vera’s memory',
    help: 'Let Vera remember what you share so she can pick up where you left off. Turn it off and she starts each chat fresh.',
  },
  analytics: {
    Icon: BarChart3,
    label: 'Product analytics',
    help: 'First-party usage data tied to your account, used to make the product better. Never sold, never shared.',
  },
}

const ORDER: ConsentScope[] = ['email_marketing', 'ai_memory', 'analytics']

export function ConsentScopesForm({ initial }: { initial: ConsentScopeState }) {
  const [state, setState] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  function toggle(scope: ConsentScope) {
    const next = !state[scope]
    const prev = state
    setState({ ...state, [scope]: next })
    setSaveError(null)
    startTransition(async () => {
      const res = await saveConsentScope(scope, next)
      if (isError(res)) {
        setState(prev)
        setSaveError(res.error || 'Could not save. Try again.')
      } else {
        setSavedAt(Date.now())
      }
    })
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold tracking-tight text-text">Privacy & consent</h2>
        <p className="mt-1 text-sm text-muted">
          These control how we may use your account. Each choice is logged with a timestamp, so
          there&apos;s always a clear record of what you agreed to.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border overflow-hidden">
        {ORDER.map((scope) => {
          const meta = SCOPE_META[scope]
          if (!meta) return null
          const { Icon, label, help } = meta
          const checked = state[scope] === true
          return (
            <div key={scope} className="flex items-start gap-3 px-4 py-3.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{label}</p>
                <p className="mt-0.5 text-xs text-muted">{help}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(scope)}
                role="switch"
                aria-checked={checked}
                aria-label={label}
                className={`
                  relative inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors shrink-0
                  ${checked ? 'bg-primary' : 'bg-border hover:bg-border-strong'}
                `}
              >
                <span
                  className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${checked ? 'translate-x-2' : '-translate-x-2'}`}
                />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted px-1">
        {isPending ? (
          <span>Saving…</span>
        ) : saveError ? (
          <span className="text-danger">{saveError}</span>
        ) : savedAt ? (
          <span className="flex items-center gap-1.5 text-success">
            <Check className="w-3 h-3" /> Saved
          </span>
        ) : (
          <span>Changes save instantly and are recorded to your consent history.</span>
        )}
      </div>
    </section>
  )
}
