'use client'

import { useState } from 'react'
import { Lock, X, Zap } from 'lucide-react'
import Link from 'next/link'

interface CrewGateButtonProps {
  isCrew: boolean
  label: string
  buttonClassName?: string
  children?: React.ReactNode
}

export function CrewGateButton({ isCrew, label, buttonClassName, children }: CrewGateButtonProps) {
  const [open, setOpen] = useState(false)

  if (isCrew) {
    return <>{children}</>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors'}
      >
        <Lock className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-surface shadow-xl border border-border/80 dark:border-border/60 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-subtle hover:text-muted hover:bg-surface-elevated transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-bg mx-auto mb-4">
              <Zap className="w-6 h-6 text-primary-strong" />
            </div>

            <h2 className="text-base font-bold text-text text-center mb-1">
              Crew Access Required
            </h2>
            <p className="text-sm text-muted text-center leading-relaxed mb-6">
              This feature is available to Crew members and above. Upgrade to unlock events, circles, crew tasks, and more.
            </p>

            <div className="flex flex-col gap-2">
              <Link
                href="/upgrade"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                <Zap className="w-4 h-4" />
                Upgrade to Crew
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:text-text hover:bg-surface transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
