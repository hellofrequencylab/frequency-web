'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Compass, Check, Sparkles, ArrowRight, ChevronDown, Route } from 'lucide-react'
import type { OnboardingStatus } from '@/lib/onboarding/status'
import { forceOnboardingStep } from '@/app/(main)/feed/onboarding-actions'
import { SpotlightTour } from '@/components/onboarding/spotlight-tour'
import { SPOTLIGHT_STOPS } from '@/lib/onboarding/spotlight'

// Where the spotlight tour parks its progress so "Take the tour" knows whether to
// offer a fresh walk or a Resume, and which stop to pick back up from. Mirrors the
// durable copy in profiles.meta.tour.spotlight (set server-side).
const TOUR_KEY = 'fq_spotlight_tour'
type TourLocal = { status: 'completed' | 'paused' | 'skipped'; atStop: number }

// The persistent activation guide at the top of the feed. It can be MINIMIZED to a
// slim bar but never dismissed — the only ways out are completing the steps or the
// obscured per-step force-complete (a deliberately low-prominence escape hatch).
// Azure `broadcast` shades (the cool "getting set up" accent). When every step is
// done it returns null and the feed page graduates it into the JourneyBoard tracker.

const MIN_KEY = 'fq_onboarding_min'

export function FeedOnboardingGuide({ status }: { status: OnboardingStatus }) {
  const [minimized, setMinimized] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tour, setTour] = useState<TourLocal | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinimized(localStorage.getItem(MIN_KEY) === '1')
    try {
      const raw = localStorage.getItem(TOUR_KEY)
      if (raw) setTour(JSON.parse(raw) as TourLocal)
    } catch {}
  }, [])

  function toggle() {
    setMinimized((m) => {
      const next = !m
      try { localStorage.setItem(MIN_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  function persistTour(next: TourLocal) {
    setTour(next)
    try { localStorage.setItem(TOUR_KEY, JSON.stringify(next)) } catch {}
  }

  function onTourExit(completed: boolean) {
    setTourOpen(false)
    persistTour({ status: completed ? 'completed' : 'paused', atStop: completed ? SPOTLIGHT_STOPS.length - 1 : (tour?.atStop ?? 0) })
  }

  // Resume from where they paused; a completed tour starts fresh if replayed.
  const resumeStop = tour?.status === 'paused' ? tour.atStop : 0
  const tourLabel = tour?.status === 'paused' ? 'Resume tour' : tour?.status === 'completed' ? 'Replay tour' : 'Take the tour'

  const current = status.current
  if (!current) return null // complete — the JourneyBoard tracker takes over

  const tourEl = tourOpen ? (
    <SpotlightTour stops={SPOTLIGHT_STOPS} startStop={resumeStop} onExit={onTourExit} />
  ) : null

  // ── Minimized: a slim, un-removable blue bar ──────────────────────────────
  if (minimized) {
    return (
      <>
        {tourEl}
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand getting-started"
          className="mb-6 flex w-full items-center gap-3 rounded-xl border border-broadcast-bg bg-broadcast-bg/50 px-4 py-2.5 text-left transition-colors hover:bg-broadcast-bg/70 dark:bg-broadcast-bg/30"
        >
          <Compass className="h-4 w-4 shrink-0 text-broadcast-strong" />
          <span className="text-sm font-semibold text-text">Getting set up</span>
          <span className="text-xs font-bold tabular-nums text-broadcast-strong">{status.pct}%</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-broadcast-bg">
            <span className="block h-full rounded-full bg-broadcast transition-all" style={{ width: `${status.pct}%` }} />
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-broadcast-strong" />
        </button>
      </>
    )
  }

  // ── Expanded ──────────────────────────────────────────────────────────────
  const C = 2 * Math.PI * 16 // ring circumference (r=16)

  return (
    <>
    {tourEl}
    <div className="mb-6 rounded-2xl border border-broadcast-bg bg-broadcast-bg/40 p-4 dark:bg-broadcast-bg/20">
      {/* Header: progress ring + the current step's invitation + minimize */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0" aria-hidden>
          <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
            <circle cx="22" cy="22" r="16" fill="none" stroke="var(--color-broadcast-bg)" strokeWidth="4" />
            <circle
              cx="22" cy="22" r="16" fill="none" stroke="var(--color-broadcast)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - status.pct / 100)}
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-broadcast-strong">
            {status.pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold leading-tight text-text">{current.headline}</h2>
          <p className="mt-0.5 text-sm leading-snug text-muted">{current.blurb}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label="Minimize"
          className="shrink-0 rounded-md p-1 text-broadcast-strong/70 transition-colors hover:bg-broadcast-bg/60 hover:text-broadcast-strong"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Segmented stepper — at-a-glance "where am I". */}
      <div className="mt-3 flex gap-1.5">
        {status.steps.map((s) => (
          <span
            key={s.key}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              s.done ? 'bg-broadcast' : s.key === current.key ? 'bg-broadcast/40' : 'bg-broadcast-bg'
            }`}
          />
        ))}
      </div>

      {/* Step list — done ticks off; the current step is emphasized + actionable. */}
      <div className="mt-3 space-y-0.5">
        {status.steps.map((step) => {
          const isCurrent = step.key === current.key
          return (
            <div key={step.key} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? 'bg-broadcast text-on-broadcast'
                    : isCurrent
                      ? 'bg-broadcast/15 text-broadcast-strong ring-2 ring-broadcast'
                      : 'border border-broadcast-bg text-subtle'
                }`}
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              {step.done ? (
                <span className="flex-1 text-sm text-subtle line-through decoration-broadcast/40">{step.label}</span>
              ) : (
                <Link
                  href={step.href}
                  className={`flex-1 text-sm ${isCurrent ? 'font-semibold text-text' : 'text-muted hover:text-text'}`}
                >
                  {step.label}
                </Link>
              )}
              {/* Obscured force-complete — only on the current step, easy to miss. */}
              {isCurrent && (
                <form action={forceOnboardingStep}>
                  <input type="hidden" name="step" value={step.key} />
                  <button
                    type="submit"
                    aria-label="Mark this step complete"
                    title="Mark complete"
                    className="rounded p-0.5 text-subtle opacity-0 transition-opacity hover:text-broadcast-strong focus:opacity-60 group-hover:opacity-30"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </div>
          )
        })}
      </div>

      {/* CTAs — Vera's guided tour leads, then the current step's action + Ask Vera. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTourOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-broadcast px-4 py-2 text-sm font-semibold text-on-broadcast transition-colors hover:opacity-90"
        >
          <Route className="h-3.5 w-3.5" /> {tourLabel}
        </button>
        <Link
          href={current.href}
          className="inline-flex items-center gap-1.5 rounded-xl border border-broadcast-bg px-4 py-2 text-sm font-medium text-broadcast-strong transition-colors hover:bg-broadcast-bg/50"
        >
          {current.cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/feed?welcome=vera&v=chat"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-broadcast-strong transition-colors hover:bg-broadcast-bg/50"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask Vera
        </Link>
      </div>
    </div>
    </>
  )
}
