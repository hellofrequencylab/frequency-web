'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Sparkles, Loader2, X } from 'lucide-react'
import { claimCircle } from '@/app/(main)/circles/[slug]/claim-actions'

type Practice = { id: string; title: string }

// Banner + short wizard shown on a demo circle to a signed-in real member:
// "make this real?" -> a few fun questions -> converts the circle in place and
// makes them the host (docs/DEMO-SYSTEM.md, ADR-091 Phase 2).
export function ClaimCircle({
  circleId,
  name,
  about,
  practices,
}: {
  circleId: string
  name: string
  about: string | null
  practices: Practice[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [theName, setTheName] = useState(name)
  const [theAbout, setTheAbout] = useState(about ?? '')
  const [practiceId, setPracticeId] = useState<string>(practices[0]?.id ?? '')

  function submit() {
    setError(null)
    start(async () => {
      try {
        await claimCircle(circleId, { name: theName, about: theAbout, practiceId: practiceId || null })
        setOpen(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not claim the circle.')
      }
    })
  }

  const field =
    'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none'

  return (
    <>
      {/* Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-bg/40 px-4 py-3">
        <div className="flex items-start gap-2">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 fill-warning text-warning" aria-hidden />
          <p className="text-sm text-text">
            <span className="font-semibold text-warning">This is a sample circle</span> we imagined for this
            area. Is it yours? Make it real and become the host.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Sparkles className="h-4 w-4" /> Claim this Circle
        </button>
      </div>

      {/* Modal wizard */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-text">Make it yours</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-subtle hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-text">If this were your circle, what would it be about?</span>
                <textarea
                  value={theAbout}
                  onChange={(e) => setTheAbout(e.target.value)}
                  rows={3}
                  className={`mt-1 ${field}`}
                  placeholder="The thing you actually do, and who it's for."
                />
              </label>

              {practices.length > 0 && (
                <label className="block">
                  <span className="text-sm font-medium text-text">Which practice would you start with?</span>
                  <select value={practiceId} onChange={(e) => setPracticeId(e.target.value)} className={`mt-1 ${field}`}>
                    <option value="">Decide later</option>
                    {practices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-sm font-medium text-text">What should we call it?</span>
                <input value={theName} onChange={(e) => setTheName(e.target.value)} className={`mt-1 ${field}`} />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-text">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !theName.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Make it real
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
