'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { Zap, X, Lock } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { crewUpgradeSuffix } from '@/lib/core/beta-notices'
import { openUpgrade } from './upgrade-launcher'

// The upsell lightbox shown when a non-paying member reaches past their scope. Plus `CrewGate` and
// `CrewGateButton`, the two wrappers that raise it. (Server enforcement still gates the underlying
// actions; this is the UX layer.)
//
// 🔴 THE DIALOG IS NOT MOUNTED HERE ANY MORE. It is rendered once, app-wide, by `UpgradeLauncher`
// (./upgrade-launcher.tsx), and the gates below RAISE it with `openUpgrade(reason)`. Each gate used to
// own a private `useState` plus its own `<UpgradeLightbox>`, so the prompt existed nine times over and
// only a component that had already decided to render a gate could ever open it. Anything else that
// discovers a member is out of scope - a rejected server action, a meter at its cap, a nav item they
// cannot use - can now raise the same prompt with one call.

// Per-context copy for the gate. Default is the Quest upsell; pass a `reason` (via
// CrewGateButton) to tailor the headline + blurb to what the member just tried to do.
// 🔴 NO 'create-event' KEY. Creating an event is NOT a paid feature (ADR-913): the CrewGateButton that
// wrapped New Event was removed from components/marketplace/events-header-actions.tsx, and the server
// never gated creation. The wall now lives at the price field (lib/events/ticket-eligibility.ts). Do not
// reintroduce upgrade copy for the act of creating an event.
export const UPGRADE_COPY: Record<string, { title: string; blurb: string }> = {
  'create-circle': {
    title: 'Start a circle with Crew',
    blurb:
      'Crew members start the circles. Gather the people you want to see more of and give them a place to land. A circle is how a handful of regulars becomes a community.',
  },
  // 🔴 `create-journey` was here and is deliberately gone (ADR-920). Drafting a Journey joined
  // FIRST ONE FREE (ADR-908/838): any signed-in member builds; the free limit is the
  // journey_publish meter (1) at the publish gate. An upsell on the create door would be a lie.
  // Do not re-add it — if a surface needs to talk about publishing MORE Journeys, that is the
  // meter's upsell at the cap, not a lightbox on the door.
  // 🔴 `sell-tickets` was here and is deliberately gone (ADR-914). It read "Crew is what lets you
  // charge for a seat", which is no longer true: selling is free on every tier and the ladder is the
  // RATE, not the permission. It was also dead, like `create-event` before it, with no call site
  // anywhere. Do not re-add it. If a future surface needs to talk about the rate, that is an upsell
  // about a NUMBER going down, not a lightbox about a locked door.
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
  /** Optional tailored headline + blurb (e.g. for the create-circle gate). */
  title?: string
  blurb?: string
}) {
  return (
    <Dialog open={open} onClose={onClose} ariaLabel={title ?? DEFAULT_COPY.title} className="max-w-sm">
      <div className="relative w-full rounded-3xl border border-border bg-surface p-6 text-center lift-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-pill p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <Zap className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lead font-bold text-text">{title ?? DEFAULT_COPY.title}</h2>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">{blurb ?? DEFAULT_COPY.blurb}</p>
        {/* 🔴 ROUTED, NOT WRITTEN (docs/BETA-NOTICES.md §3 + §4.1). This line read "Crew is free during
            the beta. Upgrade in one tap, no card, and keep everything you have." as a literal, which is
            a claim with an expiry date sitting in a dialog that is about to appear on every gate in the
            app. `crewUpgradeSuffix()` swaps it for "Crew is a paid membership." the moment
            BETA_OPEN_ACCESS flips, with no edit here. */}
        <p className="mt-3 rounded-xl bg-primary-bg/60 px-3 py-2 text-meta font-semibold leading-relaxed text-primary-strong">
          {crewUpgradeSuffix()} You keep everything you have.
        </p>
        <Link
          href="/upgrade"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Upgrade to Crew
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-5 py-2 text-body-sm font-medium text-subtle transition-colors hover:text-text"
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
export function CrewGate({ locked, reason, children }: { locked: boolean; reason?: string; children: ReactNode }) {
  if (!locked) return <>{children}</>
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-60 saturate-[0.6]">{children}</div>
      <button
        type="button"
        aria-label="Upgrade to Crew to engage"
        onClick={() => openUpgrade(reason)}
        className="absolute inset-0 z-10 cursor-pointer rounded-[inherit]"
      />
    </div>
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
  /** Tailors the upgrade popup copy (key into UPGRADE_COPY, e.g. 'create-circle'). */
  reason?: string
  children?: ReactNode
}) {
  if (isCrew) return <>{children}</>
  return (
    <button
      type="button"
      onClick={() => openUpgrade(reason)}
      className={
        buttonClassName ??
        'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors'
      }
    >
      <Lock className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
