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
        className={buttonClassName ?? 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors'}
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
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-xl border border-gray-100/80 dark:border-gray-800/60 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950 mx-auto mb-4">
              <Zap className="w-6 h-6 text-indigo-500" />
            </div>

            <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 text-center mb-1">
              Crew Access Required
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed mb-6">
              This feature is available to Crew members and above. Upgrade to unlock events, circles, crew tasks, and more.
            </p>

            <div className="flex flex-col gap-2">
              <Link
                href="/upgrade"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <Zap className="w-4 h-4" />
                Upgrade to Crew
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
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
