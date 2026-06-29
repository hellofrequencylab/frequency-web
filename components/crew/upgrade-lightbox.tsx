'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Zap, X, Lock } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

// The upsell lightbox shown when a non-paying member tries to engage with a Quest
// surface they can browse but not act on. Plus `CrewGate`, a wrapper that mutes
// its children and intercepts clicks to open the lightbox — wrap any earn/spend
// action with it. (Server enforcement still gates the underlying actions; this is
// the UX layer.)

// Per-context copy for the gate. Default is the Quest upsell; pass a `reason` (via
// CrewGateButton) to tailor the headline + blurb to what the member just tried to do.
export const UPGRADE_COPY: Record<string, { title: string; blurb: string }> = {
  'create-event': {
    title: 'Create events with Crew',
    blurb:
      'Crew members host the gatherings. Post an event, gather your people, and be the reason something happens near you. It is the heart of Frequency, and it is yours to start.',
  },
  'create-circle': {
    title: 'Start a circle with Crew',
    blurb:
      'Crew members start the circles. Gather the people you want to see more of and give them a place to land. A circle is how a handful of regulars becomes a community.',
  },
  'create-journey': {
    title: 'Build journeys with Crew',
    blurb:
      'Crew members design the journeys. Lay out a path others can walk, day by day, and turn what you know into something people finish together.',
  },
  'create-practice': {
    title: 'Share practices with Crew',
    blurb:
      'Crew members publish the practices. Turn the thing you do every day into one others can pick up, and watch it ripple out across the community.',
  },
}

const DEFAULT_COPY = {
  title: 'Play the full Quest',
  blurb:
    'Crew members earn Zaps and Gems, climb the ranks, and spend in the Vault Store. Upgrade to start playing. You keep everything you have.',
}

export function UpgradeLightbox({
  open,
  onClose,
  title,
  blurb,
}: {
  open: boolean
  onClose: () => void
  /** Optional tailored headline + blurb (e.g. for the create-event gate). */
  title?: string
  blurb?: string
}) {
  return (
    <Dialog open={open} onClose={onClose} ariaLabel={title ?? DEFAULT_COPY.title} className="max-w-sm">
      <div className="relative w-full rounded-3xl border border-border bg-surface p-6 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Zap className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-text">{title ?? DEFAULT_COPY.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{blurb ?? DEFAULT_COPY.blurb}</p>
        {/* The reassurance: Crew costs nothing during the beta — a one-tap, no-card upgrade. */}
        <p className="mt-3 rounded-xl bg-primary-bg/60 px-3 py-2 text-xs font-semibold leading-relaxed text-primary-strong">
          Crew is free during the beta. Upgrade in one tap, no card, and keep everything you have.
        </p>
        <Link
          href="/upgrade"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Upgrade to Crew, free
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-5 py-2 text-sm font-medium text-subtle transition-colors hover:text-text"
        >
          Maybe later
        </button>
      </div>
    </Dialog>
  )
}

/** Wrap an earn/spend action. When `locked`, the children render muted and
 *  non-interactive, and a click opens the upgrade lightbox. Use this to keep a
 *  block (a store card, a journey) visible-but-previewable. */
export function CrewGate({ locked, children }: { locked: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!locked) return <>{children}</>
  return (
    <>
      <div className="relative">
        <div className="pointer-events-none opacity-60 saturate-[0.6]">{children}</div>
        <button
          type="button"
          aria-label="Upgrade to Crew to engage"
          onClick={() => setOpen(true)}
          className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]"
        />
      </div>
      <UpgradeLightbox open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Inline variant: render the real action for Crew, otherwise a locked button
 *  that opens the same UpgradeLightbox. Use this when the gated thing IS a single
 *  action (join an event, complete a task) rather than a previewable block. */
export function CrewGateButton({
  isCrew,
  label,
  buttonClassName,
  reason,
  children,
}: {
  isCrew: boolean
  label: string
  buttonClassName?: string
  /** Tailors the upgrade popup copy (key into UPGRADE_COPY, e.g. 'create-event'). */
  reason?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (isCrew) return <>{children}</>
  const copy = reason ? UPGRADE_COPY[reason] : undefined
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors'
        }
      >
        <Lock className="h-3.5 w-3.5" />
        {label}
      </button>
      <UpgradeLightbox open={open} onClose={() => setOpen(false)} title={copy?.title} blurb={copy?.blurb} />
    </>
  )
}
