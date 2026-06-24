'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import type { AutonomyLevel } from '@/lib/spaces/entitlements'
import { setSpaceAutonomy } from './actions'

// The per-Space autonomy control (Resonance Engine Phase 3 · ADR-384). A small owner-facing dial on
// the Space CRM cockpit. Two settings, suggest-by-default:
//   • Suggest only  — Vera drafts every move; you approve before anything happens. The safe default.
//   • Run safe stuff — the in-product, reversible moves (like saving a streak) run on their own. Notes
//                      and emails to members still wait for your approval, always.
// Gated to owners/admins (the page only renders this when caps.canManageMembers); the setter
// re-checks server-side. Semantic tokens only (no hardcoded hex); copy in voice, no dashes.

const OPTIONS: { value: AutonomyLevel; label: string; help: string; icon: typeof ShieldCheck }[] = [
  {
    value: 'suggest_only',
    label: 'Suggest only',
    help: 'Vera drafts every move. You approve before anything happens.',
    icon: ShieldCheck,
  },
  {
    value: 'safe_auto',
    label: 'Run the safe stuff',
    help: 'In-product, reversible moves run on their own. Messages to members still wait for you.',
    icon: Sparkles,
  },
]

export function AutonomyControl({ slug, level }: { slug: string; level: AutonomyLevel }) {
  const [current, setCurrent] = useState<AutonomyLevel>(level)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const choose = (next: AutonomyLevel) => {
    if (next === current || pending) return
    const prev = current
    setCurrent(next)
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await setSpaceAutonomy(slug, next)
      if ('error' in res) {
        setCurrent(prev)
        setError(res.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
          <ShieldCheck className="h-3.5 w-3.5" /> How much Vera does on its own
        </p>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-hidden />}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const active = current === opt.value
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => choose(opt.value)}
              aria-pressed={active}
              className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                active
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                  : 'border-border bg-canvas hover:bg-surface-elevated'
              }`}
            >
              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
                <Icon className="h-4 w-4" /> {opt.label}
              </span>
              <span className="mt-1 block text-xs text-muted">{opt.help}</span>
            </button>
          )
        })}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
