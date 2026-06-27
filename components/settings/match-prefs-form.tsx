'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Heart, Check, ShieldCheck } from 'lucide-react'
import { saveMatchPrefsAction } from '@/app/(main)/settings/connections/match-actions'
import { isError } from '@/lib/action-result'
import { sunSign, SIGN_INFO } from '@/lib/astrology/signs'

// Match preferences (Resonance Feed Phase 5, ADR-419). Opt into the astrology signal
// (enter a birth date) and romance matching. Everything is OFF by default and saves on
// change. Romance is strictly opt-in and only ever pairs you with other people who also
// opted in; the meet-safely rules still apply. No swipe mechanics, ever.
export function MatchPrefsForm({
  initial,
}: {
  initial: { romanceMode: boolean; astrologyOptIn: boolean; birthDate: string }
}) {
  const [romance, setRomance] = useState(initial.romanceMode)
  const [astro, setAstro] = useState(initial.astrologyOptIn)
  const [birthDate, setBirthDate] = useState(initial.birthDate)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function persist(patch: Parameters<typeof saveMatchPrefsAction>[0]) {
    setSaved(false)
    setError(null)
    startTransition(async () => {
      const res = await saveMatchPrefsAction(patch)
      if (isError(res)) setError(res.error)
      else setSaved(true)
    })
  }

  const sign = sunSign(birthDate)

  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
      <h3 className="mb-1 text-sm font-bold text-text">Matching</h3>
      <p className="mb-4 text-xs text-muted">
        Optional signals that shape who we suggest. Both are off until you turn them on.
      </p>

      {/* Astrology */}
      <div className="flex items-start justify-between gap-3 border-t border-border py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text">
            <Sparkles className="h-4 w-4 text-primary-strong" /> Astrology signal
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Add a quiet &ldquo;your signs click&rdquo; note to suggestions, for people who also opted in.
          </p>
        </div>
        <Toggle
          on={astro}
          label="Astrology signal"
          onToggle={() => {
            const next = !astro
            setAstro(next)
            persist({ astrologyOptIn: next })
          }}
        />
      </div>

      {astro && (
        <div className="border-t border-border py-3">
          <label htmlFor="birthDate" className="text-xs font-medium text-text">
            Your birth date
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              max="2025-12-31"
              min="1900-01-01"
              onChange={(e) => setBirthDate(e.target.value)}
              onBlur={() => persist({ birthDate })}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text"
            />
            {sign && (
              <span className="text-sm text-muted">
                {SIGN_INFO[sign].symbol} {SIGN_INFO[sign].label}
              </span>
            )}
          </div>
          <p className="mt-1 text-2xs text-subtle">Only your sign is used. We never show your birth date.</p>
        </div>
      )}

      {/* Romance */}
      <div className="flex items-start justify-between gap-3 border-t border-border py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text">
            <Heart className="h-4 w-4 text-primary-strong" /> Open to romance
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Be matched with others who are also open to it. Only ever shown to people who opted in too.
          </p>
        </div>
        <Toggle
          on={romance}
          label="Open to romance"
          onToggle={() => {
            const next = !romance
            setRomance(next)
            persist({ romanceMode: next, connectIntent: next ? ['community', 'romance'] : ['community'] })
          }}
        />
      </div>

      {romance && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-2xs text-muted">
            The safe way to meet is still at a circle or a public event. You can turn this off anytime.
          </p>
        </div>
      )}

      <div className="mt-2 h-4 text-2xs">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : isPending ? (
          <span className="text-subtle">Saving&hellip;</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : null}
      </div>
    </section>
  )
}

function Toggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-surface-elevated border border-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
