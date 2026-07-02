'use client'

import { useEffect, useState } from 'react'
import { AudioWaveform, X } from 'lucide-react'
import { acknowledgeAmplitudeAction } from '@/app/(main)/progress-actions'

// Amplitude level-up — the mid-tier celebration (Rewards Economy v2, brief §6).
// Mirrors StageCelebration: acknowledges itself on mount so it fires exactly
// once, then sits as a warm, dismissible banner. A milestone crossing
// (First Thousand / Five K) takes the gold treatment; the full-screen milestone
// moment ships with its art (GAMIFICATION-AUDIT.md follow-up).
export function AmplitudeCelebration({
  level,
  amplitude,
  milestoneLabel,
}: {
  level: number
  amplitude: number
  milestoneLabel: string | null
}) {
  const [show, setShow] = useState(true)

  useEffect(() => {
    void acknowledgeAmplitudeAction(level)
  }, [level])

  if (!show) return null

  const milestone = !!milestoneLabel
  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${
        milestone ? 'border-warning bg-warning-bg/50' : 'border-primary bg-primary-bg/40'
      }`}
    >
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
        <AudioWaveform className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text">
          {milestone
            ? `${milestoneLabel}. A permanent Award is in your Vault.`
            : `Amplitude Level ${level}`}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {amplitude.toLocaleString()} lifetime Amplitude. It never resets.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
