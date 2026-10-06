'use client'

// The one funnel next step on a completion screen (LIVE-801). Reads the first-touch campaign and
// the induction persona from their cookies on the client only (the server snapshot is null, so the server
// render and hydration match),
// asks lib/funnels/next-step.ts for the step, and renders one link. Nothing is tracked here.

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { decodeFirstTouch, FIRST_TOUCH_COOKIE } from '@/lib/attribution/first-touch'
import { funnelFrom, nextStepFor, type CompletionMoment, type LaunchFunnel } from '@/lib/funnels/next-step'

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : null
}

function campaignFromCookie(): string | null {
  const raw = readCookie(FIRST_TOUCH_COOKIE)
  if (!raw) return null
  // The proxy writes an encoded JSON value; some paths encode it twice. Try both.
  const touch = decodeFirstTouch(raw) ?? decodeFirstTouch(safeDecode(raw))
  return touch?.utm?.campaign ?? null
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

// The cookies do not change while a completion screen is open, so there is nothing to subscribe to.
const noSubscribe = () => () => {}

function readFunnel(): LaunchFunnel {
  const persona = readCookie('fq_persona')
  return funnelFrom({ campaign: campaignFromCookie(), persona: persona ? safeDecode(persona) : null })
}

export function FunnelNextStep({
  moment,
  circleHref,
  onNavigate,
  className,
}: {
  moment: CompletionMoment
  circleHref?: string
  /** Called on click, so an overlay (the Mindless reveal) can close itself. */
  onNavigate?: () => void
  className?: string
}) {
  const funnel = useSyncExternalStore(noSubscribe, readFunnel, () => null)
  if (!funnel) return null
  const step = nextStepFor(funnel, moment, { circleHref })

  return (
    <div className={className ?? 'rounded-card border border-border bg-surface px-4 py-3 text-left'}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Your next step</p>
      <Link
        href={step.href}
        onClick={() => onNavigate?.()}
        className="mt-1 inline-flex items-center gap-1 text-body-sm font-semibold text-primary-strong hover:underline"
      >
        {step.label} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <p className="text-meta text-muted">{step.body}</p>
    </div>
  )
}
