'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Check, X, ArrowRight, ListChecks, PartyPopper, Gem, Rocket } from 'lucide-react'
import type { ProfileChores } from '@/lib/onboarding/profile-chores'
import type { OnboardingStep } from '@/lib/onboarding/status'
import { claimChoresReward } from '@/app/(main)/feed/chores-actions'
import { EdgePill } from '@/components/layout/edge-pill'

// Vera's coach — the bait-and-switch (BETA-ACTIVATION §2) plus the "what next" nudge
// (§5, build item 1.3 folded in here rather than a competing feed card). One Vera
// surface, three beats:
//   1. chores   — the stern matriarch full-stop: tidy your profile + first post.
//   2. reward   — she pays up once at 100% (welcome_member gem drop).
//   3. coach    — warmed back up, she points at the single next activation step
//                 (join a circle, log a practice) from the funnel, then retires.
// Dismissible throughout (ESC / ✕ / "later"): the screen-lock is a gag, not a trap.
// Paced so it nudges, never nags.

const COOLDOWN_MS = 60 * 60 * 1000 // 1 hour between unprompted full-stops
const SEEN_KEY = 'fq_chores_seen_at'
const SESSION_KEY = 'fq_chores_session'
const SNOOZE_KEY = 'fq_chores_snooze_until' // "Don't show till tomorrow"

export function ChoresOverlay({
  chores,
  nextAction = null,
}: {
  chores: ProfileChores
  /** The next activation step once chores are done — drives the coach beat. */
  nextAction?: OnboardingStep | null
}) {
  // Admin pages drop the Next Steps tab (owner call) — the profile card owns that
  // corner there. Member pages keep it.
  const onAdmin = usePathname().startsWith('/admin')
  const [open, setOpen] = useState(false)
  const [claimed, setClaimed] = useState<{ amount: number } | null>(null)
  // "Don't show till tomorrow" snooze — hides BOTH the overlay and the Next Steps
  // tab until the snooze expires. A plain boolean (computed in an effect / the
  // snooze handler, never in render) so we don't read the clock during render.
  const [snoozed, setSnoozed] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const reward = chores.complete && !chores.rewarded
  const coach = chores.complete && chores.rewarded && !!nextAction

  // Hydrate the snooze from storage once on mount (client-only; the clock read
  // stays out of render).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnoozed(Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0))
  }, [])

  // Auto-open: the reward beat always fires (she pays up once); the chores and
  // coach beats nudge on a pace (once per session, ≥1h since last seen).
  useEffect(() => {
    if (reward) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
      return
    }
    if (!(!chores.complete || coach)) return
    if (sessionStorage.getItem(SESSION_KEY)) return
    if (Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0)) return // snoozed
    const last = Number(localStorage.getItem(SEEN_KEY) ?? 0)
    if (Date.now() - last > COOLDOWN_MS) setOpen(true)
  }, [reward, coach, chores.complete])

  // On the reward beat, claim the one-time gem drop (idempotent server-side).
  useEffect(() => {
    if (!reward) return
    let live = true
    claimChoresReward().then((r) => {
      if (live && r.awarded) setClaimed({ amount: r.amount })
    })
    return () => {
      live = false
    }
  }, [reward])

  const snoozeTomorrow = useCallback(() => {
    setOpen(false)
    setSnoozed(true) // hide the Next Steps tab immediately, until tomorrow
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {}
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    // Keep the pill visible (don't re-tuck) so the reminder persists until done.
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()))
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {}
  }, [])

  // ESC closes; focus moves into the card; body scroll locks while open.
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

  // ── Persistent entry: a slim pill (bottom-LEFT, clear of the Vera launcher) so
  //    the current nudge is reachable any time. Hidden on the reward beat (it
  //    auto-opens) and once everything's done. ─────────────────────────────────
  // Next Steps — left-edge pill: present ONLY while there's real work to do —
  //   • chores still outstanding (chores not complete AND at least one left), or
  //   • the coach beat (a remaining "next move").
  // When the Next Steps are complete (no chores left, no coach step), it renders
  // nothing — the tab disappears. Collapsed until hover (web) / tap (mobile), then a
  // click opens the overlay; an occasional wiggle signals it's waiting.
  const hasChoresLeft = !chores.complete && left > 0
  // Hidden while snoozed ("Don't show till tomorrow") — the tab disappears until
  // then — and always hidden on /admin.
  const showPill = !open && !snoozed && !onAdmin && (hasChoresLeft || coach)
  const pill = showPill ? (
    <EdgePill
      side="left"
      glow="blue"
      glowMobile={false}
      label={coach ? 'Next move' : `${left} ${left === 1 ? 'chore' : 'chores'}`}
      icon={coach ? <Sparkles className="h-5 w-5" aria-hidden /> : <ListChecks className="h-5 w-5" aria-hidden />}
      waiting
      onOpen={() => setOpen(true)}
      ariaLabel={coach ? 'Vera, your next move (earn Gems)' : `Vera’s chores (${left} left, earn Gems)`}
    />
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

          {reward ? (
            /* ── Beat 2: she pays up ─────────────────────────────────────────── */
            <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                <PartyPopper className="h-6 w-6" aria-hidden />
              </span>
              <h2 id="chores-title" className="mt-4 text-2xl font-bold text-text">There. Lived-in.</h2>
              <p className="mt-2 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">
                Place looks like someone actually lives here now. Knew you had it in you.
                {nextAction ? ' One more nudge and I’ll leave you be.' : ' Off you go. Go meet your people.'}
              </p>
              {claimed && (
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-signal-bg px-3 py-1.5 text-sm font-bold text-signal">
                  <Gem className="h-4 w-4" aria-hidden /> +{claimed.amount} Gems
                </p>
              )}
              {nextAction ? (
                <Link
                  href={nextAction.href}
                  onClick={close}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  {nextAction.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Got it
                </button>
              )}
            </div>
          ) : coach ? (
            /* ── Beat 3: the coach — one next move, warmly ───────────────────── */
            <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-broadcast-strong">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Vera
              </span>
              <span className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-broadcast-bg text-broadcast-strong">
                <Rocket className="h-7 w-7" aria-hidden />
              </span>
              <h2 id="chores-title" className="mt-4 text-2xl font-bold leading-tight text-text">{nextAction!.headline}</h2>
              <p className="mt-2 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{nextAction!.blurb}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-signal-bg px-3 py-1.5 text-xs font-semibold text-signal">
                <Gem className="h-3.5 w-3.5" aria-hidden /> Every step earns Gems and brings your people closer
              </p>
              <Link
                href={nextAction!.href}
                onClick={close}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                {nextAction!.cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                onClick={snoozeTomorrow}
                className="mt-4 text-xs font-medium text-subtle transition-colors hover:text-muted"
              >
                Don’t show till tomorrow
              </button>
              <p className="mt-1.5 text-2xs text-subtle/70">Finish all your tasks and I’ll see myself out.</p>
            </div>
          ) : (
            /* ── Beat 1: chores first ────────────────────────────────────────── */
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border px-6 pb-4 pt-7">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-broadcast-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-broadcast-strong">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Vera
                </span>
                <h2 id="chores-title" className="mt-3 text-xl font-bold leading-tight text-text">Chores first.</h2>
                <p className="mt-1 text-sm leading-snug text-muted">
                  You signed up to <em>build</em>, not to lurk. {left} {left === 1 ? 'thing' : 'things'} out of place.
                  Let’s get your corner of this place in order. Won’t take a minute.
                </p>
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
                  Fine, in a minute.
                </button>
                <p className="mt-1 text-2xs text-subtle/70">
                  (I’ve “locked” your screen. Dramatic, I know. The ✕ still works. I’m not a monster.)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
