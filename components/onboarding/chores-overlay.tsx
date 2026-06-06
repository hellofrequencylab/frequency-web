'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, Check, X, ArrowRight, ListChecks, PartyPopper, Gem } from 'lucide-react'
import type { ProfileChores } from '@/lib/onboarding/profile-chores'
import { claimChoresReward } from '@/app/(main)/feed/chores-actions'

// Vera's "chores" — the bait-and-switch (BETA-ACTIVATION §2). She's warm on the way
// in; here she hardens into a playful stern matriarch: "everything in its place."
// A full-stop overlay that periodically blocks the screen with the Founder's unfinished
// profile + first-post tasks. They signed the oath to *build*, so she holds them to it —
// in a fun way. Dismissible (ESC / X / "later"): the screen-lock is a gag, not a trap
// (accessibility first). Paced so it nudges, never nags; retires once everything's done.

// Min gap between unprompted full-stops, and a once-per-session auto-open guard.
const COOLDOWN_MS = 60 * 60 * 1000 // 1 hour
const SEEN_KEY = 'fq_chores_seen_at'
const SESSION_KEY = 'fq_chores_session'

export function ChoresOverlay({ chores }: { chores: ProfileChores }) {
  const [open, setOpen] = useState(false)
  const [claimed, setClaimed] = useState<{ amount: number } | null>(null)
  const [, startClaim] = useTransition()
  const cardRef = useRef<HTMLDivElement>(null)

  const celebrate = chores.complete && !chores.rewarded

  // Decide whether to auto-open. Celebrate state always opens (she pays up once);
  // the todo state opens on a pace (once per session, ≥1h since last seen).
  useEffect(() => {
    if (celebrate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
      return
    }
    if (chores.complete) return // done + already rewarded → nothing to do
    if (sessionStorage.getItem(SESSION_KEY)) return
    const last = Number(localStorage.getItem(SEEN_KEY) ?? 0)
    if (Date.now() - last > COOLDOWN_MS) {
      setOpen(true)
    }
  }, [celebrate, chores.complete])

  // On the celebrate pass, claim the one-time reward (idempotent server-side).
  useEffect(() => {
    if (!celebrate) return
    startClaim(async () => {
      const r = await claimChoresReward()
      if (r.awarded) setClaimed({ amount: r.amount })
    })
  }, [celebrate])

  const close = useCallback(() => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()))
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {}
  }, [])

  // ESC closes; focus moves into the card while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cardRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const left = chores.todo.length

  // ── The persistent entry: a slim pill so chores are reachable any time (bottom-
  //    LEFT, clear of the Vera launcher). Hidden once everything's done. ──────────
  const pill =
    !open && !chores.complete ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Vera’s chores — ${left} left`}
        className="fixed left-4 bottom-20 z-40 inline-flex items-center gap-2 rounded-full border border-broadcast-bg bg-broadcast-bg/80 px-3.5 py-2 text-sm font-semibold text-broadcast-strong shadow-pop backdrop-blur-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] md:bottom-6 dark:bg-broadcast-bg/40"
      >
        <ListChecks className="h-4 w-4" aria-hidden /> {left} {left === 1 ? 'chore' : 'chores'}
      </button>
    ) : null

  if (!open) return pill

  return (
    <>
      {pill}
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chores-title"
          tabIndex={-1}
          className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl outline-none motion-safe:animate-[slideUp_0.25s_ease-out]"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>

          {celebrate ? (
            /* ── She pays up ─────────────────────────────────────────────────── */
            <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                <PartyPopper className="h-6 w-6" aria-hidden />
              </span>
              <h2 id="chores-title" className="mt-4 text-2xl font-bold text-text">There. Lived-in.</h2>
              <p className="mt-2 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">
                Place looks like someone actually lives here now. Knew you had it in you. Off you go —
                go meet your people.
              </p>
              {claimed && (
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-signal-bg px-3 py-1.5 text-sm font-bold text-signal">
                  <Gem className="h-4 w-4" aria-hidden /> +{claimed.amount} gems
                </p>
              )}
              <button
                type="button"
                onClick={close}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Got it
              </button>
            </div>
          ) : (
            /* ── Chores first ────────────────────────────────────────────────── */
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border px-6 pb-4 pt-7">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-broadcast-strong">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Vera
                </span>
                <h2 id="chores-title" className="mt-3 text-xl font-bold leading-tight text-text">Chores first.</h2>
                <p className="mt-1 text-sm leading-snug text-muted">
                  You signed up to <em>build</em>, not to lurk. {left} {left === 1 ? 'thing' : 'things'} out of place —
                  let’s get your corner of this place in order. Won’t take a minute.
                </p>
                {/* progress */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-broadcast-bg">
                    <span className="block h-full rounded-full bg-broadcast transition-all duration-500" style={{ width: `${chores.pct}%` }} />
                  </span>
                  <span className="text-xs font-bold tabular-nums text-broadcast-strong">{chores.pct}%</span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
                {chores.chores.map((c) => (
                  c.done ? (
                    <div key={c.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-broadcast text-on-broadcast">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="flex-1 text-sm text-subtle line-through decoration-broadcast/40">{c.label}</span>
                    </div>
                  ) : (
                    <Link
                      key={c.key}
                      href={c.href}
                      onClick={close}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-broadcast hover:bg-broadcast-bg/30"
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-broadcast-bg text-broadcast-strong">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text">{c.label}</span>
                        <span className="block text-xs text-muted">{c.nudge}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-broadcast-strong" aria-hidden />
                    </Link>
                  )
                ))}
              </div>

              <div className="shrink-0 border-t border-border px-6 py-3 text-center">
                <button type="button" onClick={close} className="text-xs font-medium text-subtle transition-colors hover:text-muted">
                  Fine — in a minute.
                </button>
                <p className="mt-1 text-2xs text-subtle/70">
                  (I’ve “locked” your screen. Dramatic, I know — the ✕ still works. I’m not a monster.)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
