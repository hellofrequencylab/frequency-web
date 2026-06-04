'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Zap, X, Lock } from 'lucide-react'

// The upsell lightbox shown when a non-paying member tries to engage with a Quest
// surface they can browse but not act on. Plus `CrewGate`, a wrapper that mutes
// its children and intercepts clicks to open the lightbox — wrap any earn/spend
// action with it. (Server enforcement still gates the underlying actions; this is
// the UX layer.)

export function UpgradeLightbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-2xl">
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
        <h2 className="mt-4 text-xl font-bold text-text">Unlock the full game</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Crew members earn zaps and gems, climb the ranks, and spend in the store. Upgrade to start
          playing — you keep everything you have.
        </p>
        <Link
          href="/upgrade"
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Upgrade to Crew
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-5 py-2 text-sm font-medium text-subtle transition-colors hover:text-text"
        >
          Keep looking around
        </button>
      </div>
    </div>
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
  children,
}: {
  isCrew: boolean
  label: string
  buttonClassName?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (isCrew) return <>{children}</>
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
      <UpgradeLightbox open={open} onClose={() => setOpen(false)} />
    </>
  )
}
